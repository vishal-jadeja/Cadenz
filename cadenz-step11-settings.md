# Cadenz â€” Step 11: Settings Page

## Overview

Step 11 builds the `/settings` page â€” the first core app page after the dashboard.
All backend API routes were built in Step 8. This step is purely UI: adapting the
onboarding step components into a persistent settings management page.

```
Phase 11.1  â†’  Query hooks (useUserSettings, usePlatformInstructions)    âœ…
Phase 11.2  â†’  Settings page + SettingsClient (tab container)            âœ…
Phase 11.3  â†’  ConnectionsTab (all 5 platforms, flat list)               âœ…
Phase 11.4  â†’  PublishingTab (active platforms + AI instructions)         âœ…
Phase 11.5  â†’  ApiKeysTab (4 provider cards, show/delete existing keys)  âœ…
Phase 11.6  â†’  PrivacyTab (Phase 2 placeholder)                          âœ…
```

---

## Architecture

```
/settings (server component â€” auth check)
  â””â”€â”€ SettingsClient (client, manages tab state)
        â”œâ”€â”€ ConnectionsTab   â€” useConnections(), useDisconnect()
        â”œâ”€â”€ PublishingTab    â€” useUserSettings(), usePlatformInstructions(),
        â”‚                      useUpdateActivePlatforms(), useUpsertPlatformInstruction()
        â”œâ”€â”€ ApiKeysTab       â€” useApiKeys(), useSaveApiKey(), useDeleteApiKey()
        â””â”€â”€ PrivacyTab       â€” static placeholder
```

`ConnectionsTab` uses `useSearchParams()` and must be wrapped in `<Suspense>` at the
call site in `SettingsClient`. All data fetching happens client-side via TanStack Query.

---

## Phase 11.1 â€” Query additions to `src/lib/queries/settings.ts`

Two new queries added:

**`useUserSettings()`** â€” GET `/api/user/settings`
```ts
{ active_platforms: string[], timezone: string | null, theme: string | null, onboarding_completed: boolean }
```

**`usePlatformInstructions()`** â€” GET `/api/user/platform-instructions`
```ts
[{ platform: string, instruction_text: string | null, tone: string | null, format_rules: string | null }]
```

Also fixed two existing mutations that were missing `onSuccess` cache invalidation:
- `useUpdateActivePlatforms` â†’ invalidates `["user-settings"]`
- `useUpsertPlatformInstruction` â†’ invalidates `["platform-instructions"]`

---

## Phase 11.2 â€” Settings page

**`src/app/(app)/settings/page.tsx`** â€” server component
- Auth check via `auth()`, redirects to `/login` if unauthenticated
- `export const dynamic = "force-dynamic"` (no static caching)
- Renders `<SettingsClient />` inside a max-w-3xl container

**`src/components/settings/SettingsClient.tsx`** â€” client component
- 4 tabs: Connections | Publishing | AI Keys | Privacy
- Tab state: local `useState<Tab>` (ephemeral to this page, no Zustand)
- Active tab: gold background + gold text; inactive: muted text
- `<ConnectionsTab />` wrapped in `<Suspense>` (required for `useSearchParams`)

---

## Phase 11.3 â€” ConnectionsTab

File: `src/components/settings/ConnectionsTab.tsx`

Adapted from `PlatformConnectionsStep.tsx`. Key differences:
- All 5 platforms (GitHub, Gmail, LinkedIn, X, Medium) shown in a single flat list
- No collapsible "publishing platforms" accordion
- No `comingSoon` prop â€” all platforms are live in Settings
- Retains: all 5 SVG icons, `BackfillChip`, `useBackfillPoll`, `PlatformCard`
- Retains: error toast for `?error=connection_failed` URL param

---

## Phase 11.4 â€” PublishingTab

File: `src/components/settings/PublishingTab.tsx`

Adapted from `ActivePlatformsStep.tsx`. Key differences:
- Fetches existing `active_platforms` + `platform_instructions` to prefill form
- `initialized` flag prevents query refetches from overwriting in-progress edits
- Single "Save changes" button (no "Continue" or "Skip")
- `Promise.all` for parallel instruction upserts on save
- Success indicator inline next to the save button (not a page-level toast)

---

## Phase 11.5 â€” ApiKeysTab

File: `src/components/settings/ApiKeysTab.tsx`

Adapted from `ByokKeyStep.tsx`. Key differences:
- 4 vertically-stacked `ProviderCard` components (not tabs)
- Each `ProviderCard` manages its own local state independently
- If key exists: shows "âœ“ Key saved [date]" + Update + Delete buttons
- "Update" toggles `updateMode` to show the input again
- Two-step delete: first click â†’ "Confirm delete?" (3s timeout), second click â†’ deletes
- `useApiKeys()` called at tab level; matching key passed as `existingKey` prop per card

---

## Phase 11.6 â€” PrivacyTab

File: `src/components/settings/PrivacyTab.tsx`

Static placeholder. Three rows:
1. "View all tracked data by category"
2. "Export your data as JSON"
3. "Delete data by time period or source"

Each row has a "Phase 2" pill. Short note about data privacy principles at the bottom.

---

## Files created/modified

| File | Action |
|------|--------|
| `Cadenz-step11-settings.md` | New spec (this file) |
| `src/lib/queries/settings.ts` | Added 2 queries + fixed 2 mutations |
| `src/app/(app)/settings/page.tsx` | New |
| `src/components/settings/SettingsClient.tsx` | New |
| `src/components/settings/ConnectionsTab.tsx` | New |
| `src/components/settings/PublishingTab.tsx` | New |
| `src/components/settings/ApiKeysTab.tsx` | New |
| `src/components/settings/PrivacyTab.tsx` | New |
| `CLAUDE.md` | Updated â€” Step 11 status |
| `README.md` | Updated â€” current status |

---

## Verification

1. `/settings` loads with tab bar visible
2. **Connections** â€” connected platforms show profile info + disconnect button;
   unconnected platforms show "Connect [Platform]" â†’ OAuth redirect works
3. **Publishing** â€” checkboxes match what was set in onboarding; save â†’ reload â†’ same state
4. **AI Keys** â€” existing BYOK key shows "âœ“ Key saved [date]"; Update and Delete work
5. **Privacy** â€” placeholder rows with "Phase 2" pills visible
6. Connection error (`?error=connection_failed`) shows error toast on Connections tab
