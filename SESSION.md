# Session Report — Three Frontend Fixes

## Fix 1 — Preserve layer visibility state
**Files:** `frontend/app/workspace/[id]/page.tsx`

Changed `addLayer({ ...layer, visible: true })` → `addLayer(layer)`. The backend already returns the correct `visible` field per layer; overriding to `true` on every page load would reset any visibility toggles the user made.

## Fix 2 — Show project name in workspace header
**Files:** `backend/routers/workspace.py`, `frontend/lib/api.ts`, `frontend/app/workspace/[id]/page.tsx`

- Added `"project_name": workspace.project.name` to `_serialize_workspace()` in the backend
- Added `project_name: string` to the `WorkspaceData` type in api.ts
- Added `if (data.project_name) setProjectName(data.project_name)` after `setCode(...)` in the load effect

This makes the workspace header show the actual project name (e.g. "Verify Test") instead of just "Workspace" after a refresh.

## Fix 3 — Remove dead dashboard page
**File:** `frontend/app/dashboard/page.tsx` (deleted)

The dashboard used the old Groq/YouTube API wiring that no longer exists in the backend. It wasn't linked from any nav and was dead attack surface.

## Build

`npm run build` passes clean with 8 routes (dashboard removed from route table). No TypeScript errors.
