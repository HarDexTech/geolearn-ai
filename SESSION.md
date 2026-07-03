# Session Report — 7 UX Fixes

## Fix 1 — Loading state on project open
**File:** `frontend/app/workspace/page.tsx`

Added `openingProjectId` state. Open buttons are now `<button>` not `<Link>` — when clicked, `openingProjectId` is set before `router.push`. All Open buttons and New Project button are disabled during navigation. The clicked button shows "Opening..." with `opacity-50`.

## Fix 2 — Don't redirect on network errors
**File:** `frontend/app/workspace/[id]/page.tsx`

The `catch` block now checks `err.message.includes("404")` — only redirects to `/workspace` on genuine 404. All other errors (timeout, connection refused) show an error banner at the top with Retry and "Back to Projects" buttons. The workspace layout remains visible behind the banner.

## Fix 3 — Prevent StrictMode double-fetch
**File:** `frontend/app/workspace/[id]/page.tsx`

Added `hasFetchedRef` (`useRef(false)`). The load effect checks `if (hasFetchedRef.current) return` and sets it `true` before the async call. Cleanup resets it to `false` so it works correctly when `workspaceIdNum` changes.

## Fix 4 — Optimistic project list update
**File:** `frontend/app/workspace/page.tsx`

After `createProject` resolves, the new project is prepended to local state via `setProjects(prev => [newProject, ...prev])`. If the user navigates back to `/workspace` quickly, the new project appears instantly without a refetch.

## Fix 5 — Back button in workspace header
**File:** `frontend/app/workspace/[id]/page.tsx`

The GeoLearn AI link now points to `/workspace` with a `←` chevron before the logo text. Breadcrumb reads: `← GeoLearn AI / Project Name`.

## Fix 6 — Map basemap
**File:** `frontend/components/workspace/MapView.tsx`

Changed from `demotiles.maplibre.org/style.json` (blank demo tiles) to `tiles.openfreemap.org/styles/liberty` (free, production-ready map with roads, labels, terrain — no API key required).

## Fix 7 — Collapsible AI sidebar + bottom panel
**File:** `frontend/app/workspace/[id]/page.tsx`

Added `sidebarOpen` and `bottomPanelOpen` state (both default `true`). Each panel has a close button (×). When closed:
- Sidebar collapses to an 32px-wide `‹` button strip
- Bottom panel collapses to a small "▲ Open Code Editor/Terminal" bar
- CSS `transition-all duration-200` on the bottom panel height

## Build

`npm run build` passes clean. No TypeScript errors.
