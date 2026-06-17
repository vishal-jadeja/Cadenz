# Cadenz â€” Step 12: Notes Page

## Overview

Step 12 builds the `/notes` page â€” a lightweight markdown editor with folder
organisation and search. Notes feed the AI's understanding of the user.
Topic auto-extraction and pgvector embeddings are Phase 2; this step handles
the core CRUD and UI.

```
Phase 12.1  â†’  DB schema (folders + notes tables)              âœ…
Phase 12.2  â†’  Types (src/types/database.ts)                   âœ…
Phase 12.3  â†’  API routes (notes + folders CRUD)               âœ…
Phase 12.4  â†’  Query hooks (src/lib/queries/notes.ts)          âœ…
Phase 12.5  â†’  Page + components                               âœ…
Phase 12.6  â†’  Proxy protection                                âœ…
Phase 12.7  â†’  Markdown preview CSS                            âœ…
```

---

## Architecture

```
/notes (server component â€” auth check)
  â””â”€â”€ NotesClient (client, manages split-pane state)
        â”œâ”€â”€ NotesSidebar
        â”‚     â”œâ”€â”€ Search input
        â”‚     â”œâ”€â”€ "All Notes" shortcut
        â”‚     â”œâ”€â”€ Folder list (create / delete folders)
        â”‚     â””â”€â”€ Note list (filtered by folder + search)
        â””â”€â”€ NoteEditor (key={noteId} â†’ remounts on note switch)
              â”œâ”€â”€ Edit / Preview tab toggle
              â”œâ”€â”€ Title input
              â”œâ”€â”€ Textarea (edit mode) or MarkdownPreview (preview mode)
              â””â”€â”€ Toolbar: Save (âŒ˜S) Â· Delete (two-step)
```

---

## Phase 12.1 â€” DB Schema (`supabase/phase12_schema.sql`)

**`folders`**
```sql
id uuid PK, user_id FKâ†’users, name text (1â€“100 chars),
color text (nullable CSS color), created_at timestamptz
```

**`notes`**
```sql
id uuid PK, user_id FKâ†’users, folder_id FKâ†’folders ON DELETE SET NULL,
title text DEFAULT '', body text DEFAULT '',
tags text[] DEFAULT '{}', created_at timestamptz, updated_at timestamptz
```

RLS: full CRUD for authenticated owner. Service role bypasses RLS for
heatmap writes.

**Deferred to Phase 2:** `embedding vector(1536)`, `notion_page_id`,
`notion_synced_at`.

---

## Phase 12.3 â€” API Routes

| Route | Methods | Description |
|-------|---------|-------------|
| `/api/notes` | GET, POST | List (filter by folder_id, search) + create |
| `/api/notes/[id]` | GET, PATCH, DELETE | Single note operations |
| `/api/folders` | GET, POST | List (with note counts) + create |
| `/api/folders/[id]` | DELETE | Delete folder (notes unfiled via ON DELETE SET NULL) |

### Heatmap integration

On note create (`POST /api/notes`) and note save (`PATCH /api/notes/[id]`
when title or body changes): upsert `unified_activity` for `source='notes'`
with intensity thresholds: 0=0, 1=1-2, 2=3-5, 3=6-9, 4=10+.

---

## Phase 12.4 â€” Query Hooks (`src/lib/queries/notes.ts`)

| Hook | Purpose |
|------|---------|
| `useNotes(params?)` | List notes â€” optional `folder_id` + `search` filter |
| `useNote(id)` | Single note (full body) |
| `useFolders()` | Folder list with `note_count` |
| `useCreateNote()` | POST â€” returns created `Note`, invalidates `["notes"]` |
| `useUpdateNote()` | PATCH â€” invalidates `["notes"]`, updates `["note", id]` cache |
| `useDeleteNote()` | DELETE â€” invalidates `["notes"]`, removes `["note", id]` |
| `useCreateFolder()` | POST â€” invalidates `["folders"]` |
| `useDeleteFolder()` | DELETE â€” invalidates `["folders"]` + `["notes"]` |

---

## Phase 12.5 â€” Components

### `NotesClient`
- Split-pane layout: sidebar (w-64) + editor (flex-1)
- Mobile: sidebar slides in from left (overlay), hamburger in editor header
- State: `selectedFolderId`, `selectedNoteId`, `search`, `sidebarOpen`
- `handleNewNote()` â†’ `useCreateNote()` â†’ sets `selectedNoteId` to new note id

### `NotesSidebar`
- Search input (passed to `useNotes` as search param)
- "All Notes" shortcut (sets `selectedFolderId = null`)
- Folder list: color dot + name + note count + hover delete (two-step confirm)
- "New Folder" inline form: name + color picker (7 muted colors) + create
- Note list: title, body preview, date â€” selected note highlighted in gold
- "New Note" gold button at bottom

### `NoteEditor`
- `key={noteId}` â€” remounts when switching notes, avoids stale state
- Seeds `title` + `body` from `useNote(noteId)` when note loads
- `isDirty` = local state differs from fetched note
- Edit/Preview toggle â€” Preview uses `MarkdownPreview` (dynamic import of `marked`)
- Toolbar: Edit|Preview tabs Â· spacer Â· Save button Â· Saved chip Â· âŒ˜S hint Â· Delete
- Two-step delete: "Delete" â†’ "Confirm delete?" (3s timeout) â†’ deletes + calls `onNoteDeleted()`
- âŒ˜S / Ctrl+S keyboard shortcut to save
- Empty state when no note selected: illustration + "New Note" CTA

### `MarkdownPreview`
- Dynamically imports `marked` (`import("marked")`) to avoid SSR bundle impact
- Renders `dangerouslySetInnerHTML` â€” user's own content, no XSS risk between users
- Uses `.prose-notes` CSS class defined in `globals.css`

---

## Phase 12.7 â€” Markdown CSS (`.prose-notes`)

Added to `src/app/globals.css`:
- `h1`â€“`h4`: Sora font, `#e5e2e1`, margin top/bottom
- `p`: 0.75em margin-bottom
- `code`: JetBrains Mono, gold (`#e6c364`), subtle background
- `pre`: dark background, border, rounded
- `ul`, `ol`: indented list
- `a`: gold underlined
- `blockquote`: gold left border, muted italic
- `hr`: subtle border

---

## Files Created/Modified

| File | Action |
|------|--------|
| `Cadenz-step12-notes.md` | New spec (this file) |
| `supabase/phase12_schema.sql` | New DB migration |
| `src/types/database.ts` | Added `folders` + `notes` table types |
| `src/app/api/notes/route.ts` | New â€” GET list + POST create |
| `src/app/api/notes/[id]/route.ts` | New â€” GET + PATCH + DELETE |
| `src/app/api/folders/route.ts` | New â€” GET list + POST create |
| `src/app/api/folders/[id]/route.ts` | New â€” DELETE |
| `src/lib/queries/notes.ts` | New â€” all query hooks |
| `src/app/(app)/notes/page.tsx` | New â€” server component |
| `src/components/notes/NotesClient.tsx` | New |
| `src/components/notes/NotesSidebar.tsx` | New |
| `src/components/notes/NoteEditor.tsx` | New |
| `src/app/globals.css` | Added `.prose-notes` markdown styles |
| `src/proxy.ts` | Added `/notes`, `/api/notes`, `/api/folders`, `/api/activity` protection |
| `CLAUDE.md` | Step 12 status block added |
| `README.md` | Notes page marked `[x]` complete |
| `package.json` | Added `marked` dependency |

---

## Verification Checklist

1. `/notes` loads â€” sidebar visible, empty state in editor
2. **New Note** â†’ blank note created, editor opens, title focused
3. Type title + body â†’ toolbar shows unsaved state
4. **Save** (button or âŒ˜S) â†’ "Saved" chip appears, note appears in sidebar list
5. **Preview toggle** â†’ markdown rendered with correct styles (h1, bold, code, etc.)
6. **Create folder** â†’ color picker â†’ Create â†’ folder appears in sidebar
7. **Move note to folder** (via PATCH or future drag) â†’ note count updates
8. **Delete note** â†’ "Confirm delete?" â†’ deleted â†’ editor shows empty state
9. **Delete folder** â†’ notes in that folder unfiled (moved to All Notes)
10. **Search** â†’ filters note list in real time (server-side ilike)
11. **Heatmap** â†’ after saving a note, `unified_activity` row exists for today with `source='notes'`
12. **Mobile** â†’ hamburger opens sidebar overlay, tap outside closes it
