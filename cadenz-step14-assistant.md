# Cadenz â€” Step 14: AI Assistant

## Overview

Step 14 builds `/assistant` â€” a full-page chat interface scoped strictly to the
user's own data. Not a general chatbot. A thinking partner who already knows
what the user has been studying, building, and writing.

The assistant in this step uses direct context retrieval (recent notes + activity
+ topic_nodes). pgvector similarity search is deferred to Phase 2 when note
embeddings exist. The assistant gracefully degrades when context is thin.

The BYOK AI adapter from Step 13 (`src/lib/ai/byok.ts`) is reused here â€” no
new AI abstraction layer needed.

```
Phase 14.1  â†’  DB schema (ai_conversations, ai_messages)         â¬œ
Phase 14.2  â†’  Types update (database.ts)                        â¬œ
Phase 14.3  â†’  Context retrieval (src/lib/assistant/retrieval.ts) â¬œ
Phase 14.4  â†’  API routes (conversations, messages, streaming)   â¬œ
Phase 14.5  â†’  Query hooks + streaming hook                      â¬œ
Phase 14.6  â†’  Assistant page + components                       â¬œ
Phase 14.7  â†’  Proxy protection + nav update                     â¬œ
```

---

## Architecture

```
/assistant (server component â€” auth check)
  â””â”€â”€ AssistantClient (client)
        â”œâ”€â”€ ConversationSidebar
        â”‚     â”œâ”€â”€ "New conversation" button
        â”‚     â””â”€â”€ ConversationList (title + date)
        â””â”€â”€ ChatArea
              â”œâ”€â”€ MessageThread
              â”‚     â””â”€â”€ MessageBubble (user | assistant)
              â”‚           â””â”€â”€ SourceCitation (collapsible, assistant only)
              â””â”€â”€ MessageInput
                    â”œâ”€â”€ Textarea (âŒ˜Enter to send)
                    â””â”€â”€ Send button
```

Data flow:
```
User sends message
  â†’ POST /api/assistant/conversations/[id]/messages
  â†’ Server: retrieval.buildContext(userId, message)
            â†’ get recent notes (last 30, text search for now)
            â†’ get topic_nodes (top 10 by last_activity_at)
            â†’ get unified_activity (last 30 days summary)
  â†’ Server: build system prompt with context
  â†’ Server: stream response from BYOK adapter
  â†’ Client: reads stream via ReadableStream, appends chunks to UI
  â†’ Server: on stream complete, save full message + sources to DB
```

---

## Phase 14.1 â€” DB Schema

File: `supabase/phase14_schema.sql`

```sql
-- Conversation container
create table if not exists ai_conversations (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  title      text not null default 'New conversation',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on ai_conversations (user_id, updated_at desc);

alter table ai_conversations enable row level security;
create policy "users manage own ai_conversations"
  on ai_conversations for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Messages
create table if not exists ai_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references ai_conversations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  role            text not null,       -- 'user' | 'assistant'
  content         text not null,
  sources         jsonb,
  -- sources: [{ type: 'note'|'activity'|'topic', id, title, excerpt }]
  created_at      timestamptz not null default now()
);

create index on ai_messages (conversation_id, created_at asc);
create index on ai_messages (user_id);

alter table ai_messages enable row level security;
create policy "users manage own ai_messages"
  on ai_messages for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

---

## Phase 14.2 â€” Types Update

Add `AiConversation` and `AiMessage` (with `sources` typed as `AiSource[]`) to
`src/types/database.ts`.

```typescript
export interface AiSource {
  type: 'note' | 'activity' | 'topic'
  id: string
  title: string
  excerpt?: string
}
```

---

## Phase 14.3 â€” Context Retrieval

File: `src/lib/assistant/retrieval.ts`

### Purpose

Builds the context block that goes into the assistant's system prompt.
Uses the admin Supabase client (server-side only). Always scoped to user_id.

### Interface

```typescript
export interface AssistantContext {
  notes: { id: string; title: string; body: string; tags: string[] }[]
  topics: { topic: string; session_count: number; note_count: number; last_activity_at: string }[]
  recentActivity: { activity_date: string; source: string; activity_count: number }[]
  sources: AiSource[]   // for citation display in the UI
}

export async function buildContext(
  userId: string,
  query: string
): Promise<AssistantContext>
```

### Implementation

**Notes retrieval (Phase 1 â€” text search)**
```sql
SELECT id, title, body, tags
FROM notes
WHERE user_id = $userId
  AND (
    title ILIKE '%' || $query || '%'
    OR body  ILIKE '%' || $query || '%'
  )
ORDER BY updated_at DESC
LIMIT 10
UNION ALL
-- Always include the 5 most recent notes regardless of match
SELECT id, title, body, tags
FROM notes
WHERE user_id = $userId
ORDER BY updated_at DESC
LIMIT 5
```

Deduplicate by id. Max 12 notes total in context.

**Phase 2 upgrade**: replace with `SELECT ... ORDER BY embedding <=> $queryEmbedding LIMIT 12`.

**Topics**
```sql
SELECT topic, session_count, note_count, last_activity_at
FROM topic_nodes
WHERE user_id = $userId
ORDER BY last_activity_at DESC
LIMIT 10
```

**Recent activity**
```sql
SELECT activity_date, source, activity_count
FROM unified_activity
WHERE user_id = $userId
  AND activity_date >= now() - interval '30 days'
ORDER BY activity_date DESC
```

### System prompt template

```
You are the AI assistant inside Cadenz. You help the user understand and
build on their own knowledge. You are scoped strictly to their data â€” you do
not answer general knowledge questions unless they relate to something the
user has been studying.

## User's recent notes (newest first)
{notes}

## User's active topics
{topics}

## Recent activity (last 30 days)
{recentActivity}

## Rules
- Answer only from the context above. If something is not in the user's data,
  say so clearly and redirect to what you do know.
- Always cite which note, topic, or activity informed your answer.
- Never auto-save, never take action on the user's behalf.
- Keep responses focused â€” the user can ask follow-up questions.
```

---

## Phase 14.4 â€” API Routes

### `GET /api/assistant/conversations`

- Auth: requireSession
- Returns: `AiConversation[]` ordered by updated_at desc, limit 20

### `POST /api/assistant/conversations`

- Auth: requireSession
- Body: `{ title?: string }` (defaults to "New conversation")
- Creates conversation row
- Returns: `AiConversation`

### `DELETE /api/assistant/conversations/[id]`

- Auth: requireSession, verify conversation belongs to user
- Cascades to messages
- Returns: 204

### `GET /api/assistant/conversations/[id]/messages`

- Auth: requireSession, verify conversation belongs to user
- Returns: `AiMessage[]` ordered by created_at asc

### `POST /api/assistant/conversations/[id]/messages` (streaming)

- Auth: requireSession, verify conversation belongs to user
- Body: `{ content: string }`
- Steps:
  1. Check BYOK adapter â€” if null, return 402 `{ error: 'no_api_key' }`
  2. Save user message to DB immediately
  3. Build context via `buildContext(userId, content)`
  4. Start streaming via adapter
  5. Return a `ReadableStream` response with `Content-Type: text/event-stream`
  6. Stream text chunks to client
  7. On stream end: save full assistant message + sources to DB
     Update conversation.updated_at
- Error mid-stream: send `data: [ERROR]\n\n`, close stream

#### Streaming response format (SSE)

```
data: {"type":"chunk","text":"Here is"}
data: {"type":"chunk","text":" what I found"}
data: {"type":"sources","sources":[...]}
data: {"type":"done"}
```

---

## Phase 14.5 â€” Query Hooks + Streaming Hook

File: `src/lib/queries/assistant.ts`

```typescript
useConversations()              // GET /api/assistant/conversations
useConversationMessages(convId) // GET /api/assistant/conversations/[id]/messages
useCreateConversation()         // POST /api/assistant/conversations (mutation)
useDeleteConversation()         // DELETE (mutation)
```

### Streaming hook: `useStreamMessage`

Not a standard TanStack Query hook â€” streaming requires managing a
`ReadableStream` with React state.

```typescript
interface UseStreamMessageReturn {
  sendMessage(conversationId: string, content: string): void
  streamingText: string     // accumulated text of in-flight response
  isStreaming: boolean
  sources: AiSource[]
  error: string | null
}
```

Implementation:
- Uses `fetch()` directly (not Axios â€” Axios does not support streaming)
- Reads `response.body` as a `ReadableStream`, decodes SSE events
- Appends `chunk` events to `streamingText`
- On `sources` event: sets `sources` state
- On `done` event: `invalidateQueries(['conversationMessages', conversationId])`
  to refetch the saved messages, clear `streamingText`
- On `error` event: set `error` state

---

## Phase 14.6 â€” Assistant Page + Components

### `src/app/(app)/assistant/page.tsx`

Server component. Auth check via `requireSession`. Renders `AssistantClient`.

### `src/components/assistant/AssistantClient.tsx`

Client component. Manages selected conversation ID in local state.
Renders `ConversationSidebar` + `ChatArea` in a split layout.
On mobile: sidebar hidden, accessible via a toggle button.

No-key state: if API key check returns 402, renders a full-page prompt:
"To use the AI assistant, add your API key in [Settings â†’ API Keys]."
Never an error message â€” always a clear next action.

### `src/components/assistant/ConversationSidebar.tsx`

- "New conversation" button at top â†’ `useCreateConversation()`, then select new ID
- `ConversationList`: renders each conversation as a button
  - Title (truncated to 1 line)
  - Relative date (e.g. "2 hours ago")
  - Active: highlighted
  - Long-press or hover â†’ delete icon â†’ `useDeleteConversation()` with confirm

### `src/components/assistant/MessageThread.tsx`

Props: `conversationId: string`
- Renders `useConversationMessages` results
- At bottom: renders the streaming `streamingText` as a live assistant bubble
  (only visible while `isStreaming`)
- Auto-scrolls to bottom on new message
- Empty state: "Ask me anything about what you've been learning."

### `src/components/assistant/MessageBubble.tsx`

Props: `message: AiMessage, isStreaming?: boolean`
- User bubble: right-aligned, accent background
- Assistant bubble: left-aligned, card background
- Streaming bubble: shows a blinking cursor at the end of text
- `SourceCitation` rendered below assistant bubbles (collapsed by default)

### `src/components/assistant/SourceCitation.tsx`

Props: `sources: AiSource[]`
- "Sources (N)" collapsible trigger
- Expands to show each source: type icon + title + excerpt
- Note sources: link to `/notes?id=[noteId]`
- Topic sources: no link (topic_nodes don't have a dedicated page yet)
- Activity sources: no link

### `src/components/assistant/MessageInput.tsx`

- Auto-growing textarea (max 4 lines before scroll)
- âŒ˜Enter (Mac) / Ctrl+Enter (Windows) to send
- Disabled while `isStreaming`
- Send button with `whileTap` scale

---

## Phase 14.7 â€” Proxy Protection + Nav

Add to `src/proxy.ts`:
```
/assistant               â†’ requireSession
/api/assistant(.*)       â†’ requireSession
```

The sidebar nav item for `/assistant` already exists in `nav-items.ts` from
the app shell. No nav change needed unless it was set as a placeholder â€” verify
it points to `/assistant`.

---

## Out of scope for Step 14 (Phase 2)

- pgvector similarity search (deferred â€” no note embeddings yet)
- Conversation title auto-generation from first message
- Message editing or regeneration
- Cmd+K shortcut to open assistant (deferred to command palette step)
- Export conversation as markdown

These belong in Phase 2 when note embeddings are live and the daily
intelligence pipeline is filling `topic_nodes` with real data.

---

## Key rules (carry into implementation)

- `user_id` filter is applied before every DB query in retrieval.ts â€”
  application layer checks first, RLS is the safety net.
- If adapter returns null (no API key): return HTTP 402 with
  `{ error: 'no_api_key' }` â€” never 500, never a generic error.
- Streaming: use native `fetch()` in the streaming hook, not Axios.
- Sources are always shown, never hidden. User must be able to see
  what data informed each response.
- The assistant never auto-saves anything. Suggestions only â€” user decides.
- Context is capped: max 12 notes + 10 topics + 30 days activity.
  Never retrieve more â€” cost and latency.
