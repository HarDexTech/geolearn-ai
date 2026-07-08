# Session 2026-07-08

## Backend unresponsive fix

- **Root cause**: uvicorn started from wrong working directory (not `backend/`), worker crashed on `ModuleNotFoundError` but parent kept port 8000 LISTENING, creating an infinite crash-restart loop.
- **Fix**: Killed stuck processes, restarted from `backend/` directory without `--reload` flag (WatchFiles reloader was hanging on async lifespan startup).

## Frontend fixes

### Move tab switcher from CodeEditor.tsx to workspace page
- Removed Editor/Terminal tab buttons from `components/workspace/CodeEditor.tsx` — component now has only Monaco editor + Run button.
- Added tab switcher to bottom panel header in `app/workspace/[id]/page.tsx`.
- `setActiveTab` auto-switch on Run still works (stays in CodeEditor.tsx).

### Sidebar overflow fix
- Added `flex flex-col overflow-hidden` to `<aside>` in `app/workspace/[id]/page.tsx:212`.
- AiSidebar.tsx root already had `flex h-full flex-col` — no change needed.

### Save button loading state
- Added `isSaving` and `saveMessage` state.
- Button shows spinner + "Saving..." during updateWorkspace call, then "✓ Saved" for 2s.

### Delete dead files
- Deleted `frontend/app/about/page.tsx` and all nav references to `/about`.
- Deleted `frontend/app/dashboard/` (empty directory).
- Deleted `test_conversation_ordering.db` from repo root.

### Sidebar overflow fix (CSS)
- Added `min-w-0` to left content div, `overflow-hidden` to outer flex container.
- Removed `overflow-x: hidden` from `body` in globals.css.

### 404 UX
- Workspace load 404 now shows error banner "Workspace not found. Redirecting to your projects..." for 2.5s before router.push.

### BackButton component
- Created `components/BackButton.tsx` — animated green slide arrow button.
- Used via `<BackButton href="/workspace" label="Projects" />` in workspace header.
