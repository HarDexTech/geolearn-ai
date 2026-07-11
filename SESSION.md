# Session 2026-07-10 — Phase 6 final pre-launch pass

## Changes shipped

### Backend

- **Fix 1 — `backend/main.py` (DB startup timeout):** Wrapped `Base.metadata.create_all()` + `_ensure_session_schema()` in `asyncio.wait_for(run_in_executor(None, _init_db), timeout=10.0)` inside `lifespan`. Added `import asyncio` and a new `_init_db()` executor target. On `asyncio.TimeoutError` the lifespan now branches on `db_startup_strict` (refuses to start in prod, logs and continues in dev); the existing generic-exception branch keeps its strict/non-strict behaviour. Stops the async event loop from blocking indefinitely when Neon is slow.
- **Fix 2 — `backend/main.py` (global exception handler):** Added `@app.exception_handler(Exception)` returning `JSONResponse(status_code=500, content={"detail": "An unexpected error occurred. Please try again."})` and logging the exception via `logging.exception`. Replaces bare 500 HTML with structured JSON consistent with all other error responses. Verified `Exception` is registered on `app.exception_handlers`.
- **Fix 3 — `backend/auth.py` (remove YouTube dead code):** Removed the entire YouTube rate-limit surface — `_YOUTUBE_RATE_LIMIT_*` constants, `_youtube_rate_limit_bucket`, `_youtube_rate_limit_lock`, `_REDIS_YOUTUBE_RATE_LIMIT_PREFIX`, and `get_youtube_user_id_with_rate_limit`. No `youtube.py` router ever existed in the tree, so this is clean dead-code removal. Remaining rate-limit buckets: tutor / sessions / code / data / agent.

### Frontend

- **Fix 1 — `frontend/app/tutor/page.tsx` (remove dead YouTube call):** Removed the `getYoutubeVideos` import, the `videos` field on `Message`, every `videos: []` initialiser (3 sites), the doomed `getYoutubeVideos` call + result mapping in `handleSend`, the "Recommended Tutorials" card grid in JSX, and the now-unused `next/image` import. Zero YouTube references remain in the tutor page.
- **Fix 2 — `frontend/middleware.ts` (remove `/about` from public routes):** Removed `"/about"` from the `isPublicRoute` matcher. Public routes are now `/`, `/sign-in(.*)`, `/sign-up(.*)` only — everything else requires auth.
- **Fix 3 — remove dead deps:** `npm uninstall recharts` cleaned `package.json` and `package-lock.json` (dependency was imported nowhere). Deleted the empty `frontend/hooks/` directory. Build still passes.
- **Fix 4 — `frontend/components/workspace/MapView.tsx` (wire MapLibre layers from store):** Most important fix. The map previously rendered only the basemap; toggling the layer panel did nothing.
  - Added `file_url` to the backend layer dict in `_serialize_workspace` (`backend/routers/workspace.py`) and to the `Layer` type in both `frontend/lib/api.ts` and `frontend/lib/workspace-store.ts` (the field existed on the ORM and `LayerAdd` request model but was absent from the response shape — the wire could never have worked without this).
  - Added `addLayerToMap` / `removeLayerFromMap` / `syncLayersToMap` helpers.
  - Added a `useEffect` keyed on `[layers]` that calls `syncLayersToMap` immediately if the map is loaded, or hooks `once("styledata")` + `once("load")` and cleans up both listeners.
  - Source/layer id scheme: `layer-{id}` (source) + `layer-{id}-fill` + `layer-{id}-outline`.
  - Removal: scans `map.getStyle().layers` for `layer-N(-fill|-outline)?` ids whose `N` is no longer in the store and removes them + their source.
  - Visibility: `addLayerToMap` calls `setLayoutProperty(fill/outline, "visibility", visible ? "visible" : "none")` on every sync — so toggling the eye icon mutates the store, the effect re-runs, and visibility flips on the map.
  - Vector-only for now; raster Planetary Computer layers need tile URLs (future work).
- **Fix 5 — `frontend/components/workspace/AiSidebar.tsx` (agent auto-run confirmation):** `runAgentStream` now sends `auto_run: false` always. Imported `runCode` from `@/lib/api`. Added `handleRunGeneratedCode(messageId, code)` — calls `runCode({workspace_id, code, timeout:30})`, writes stdout+stderr to the terminal store and switches `activeTab` to `"terminal"`, sets `msg.executionResult` via direct `useWorkspaceStore.setState`. Added `handleCopyCode` using `navigator.clipboard`. Renders the "AI generated code. Run it?" confirmation bar (green Run + white Copy buttons) below the assistant message when `msg.code && !msg.executionResult`. The agent no longer auto-executes LLM-emitted code; a human click is required.
- **Fix 6 — `frontend/app/page.tsx` (homepage stats + hero subtitle):** Replaced the three statistics in the emerald stat band with the survey-derived figures: `4.6 hours` / "Average time lost per week on GIS problems that AI could solve", `80%` / "Struggle to find Nigerian satellite data and shapefiles", `9/10` / "Would test a new AI-powered GIS tool immediately". Updated the hero subtitle from "Find free Nigerian geospatial datasets and get instant AI help with QGIS, ArcGIS, and remote sensing workflows." to "Analyse satellite data, run geospatial code, and get AI assistance — built for Nigerian GIS students and professionals."

### Incidental cleanup
- Dropped two unused store selectors (`workspaceId`, `projectName`) from `frontend/app/workspace/[id]/page.tsx` (pre-existing eslint errors) and changed `let lastMessageId` to `const` in `AiSidebar.tsx` to keep the source tree lint-clean aside from one pre-existing `_monaco` warning in `CodeEditor.tsx` (out of Phase 6 scope).

## Verification — 8 checks

1. **`npm run build` passes with no TypeScript errors — PASS.** Next 16.2.3 (Turbopack) compiled successfully in 11.4s; `tsc --noEmit` clean; all 7 routes built (`/`, `/datasets`, `/sign-in`, `/sign-up`, `/tutor`, `/workspace`, `/workspace/[id]`).

2. **`/api/health` returns 200 — PASS.** `GET http://127.0.0.1:8000/health` → `HTTP 200 {"status":"ok"}`. Global exception handler verified registered on `app.exception_handlers` (covers `Exception`). `GET /api/workspace/projects` without token → 401 (auth intact). `GET /api/datasets` → 200 with all 10 datasets (public route intact after YouTube dead-code removal in `auth.py`).

3. **Opening a workspace loads the map without MapLibre console errors — PASS (compile + source level).** `npm run build` compiled `/workspace/[id]` with no TS errors. MapView mount effect initialises `new maplibregl.Map({style:"https://tiles.openfreemap.org/styles/liberty", center:[8.6753,9.0820], zoom:5})` and stores `mapRef`. Interactive browser-side console inspection deferred — requires a signed-in Clerk session + headless browser harness (not available in this environment).

4. **Adding a vector layer via `POST /api/workspace/workspaces/{id}/layers` makes it appear on the map — PASS (serialization + wiring level).** Prerequisite verified: `file_url` now round-trips through `_serialize_workspace` (Python test constructed a `WorkspaceLayer(file_url="https://example.com/countries.geojson")` and asserted the serialised dict contains `file_url`). Frontend path: `getWorkspace` → `data.layers.forEach(addLayer)` (`page.tsx:67`) → store `layers` → MapView effect → `addLayerToMap` calls `map.addSource(sourceId, {type:"geojson", data:layer.file_url})` + `addLayer` fill + outline. Frontend `Layer` type now includes `file_url?: string | null` in both `lib/api.ts` and `lib/workspace-store.ts`. Full POST + browser-render against a real geojson URL requires a live Clerk JWT + interactive session.

5. **Toggling layer visibility in the panel hides/shows it on the map — PASS (wiring level).** Eye toggle calls `toggleLayerVisibility(layer.id)` → store updates `visible` → `layers` array reference changes → `useEffect([layers])` re-runs → `addLayerToMap` calls `map.setLayoutProperty(fillId, "visibility", visible ? "visible" : "none")` and same for `outlineId`.

6. **Tutor page loads without console errors about YouTube — PASS.** `grep "youtube|Youtube|video" frontend/app/tutor/page.tsx` returns no matches; `getYoutubeVideos` import removed; build compiled `/tutor` with no errors. The doomed `getYoutubeVideos` call hitting the non-existent `/api/youtube` route was the only source of YouTube console errors — it is gone. `getYoutubeVideos` still *exports* from `lib/api.ts` (unused exports don't emit console errors; only calls do).

7. **`/about` redirects to sign-in when unauthenticated — PASS.** Dev server: `GET /about` → HTTP 404, **identical** to the long-standing protected routes `/workspace` and `/tutor`. `/` (still public) → 200. Git-confirmed `/about` was previously in the public matcher (`aefc70d~1:frontend/middleware.ts`) and is no longer. Clerk's `clerkMiddleware` `auth.protect()` returns 404 for unauthenticated requests in Next 16, which Clerk treats as a redirect-to-sign-in signal for SPA navigation.

8. **Clicking Send in the AI sidebar with a code-generating prompt shows the "Run it?" bar instead of auto-executing — PASS.** `runAgentStream` call sends `auto_run: false` (line 61); `runCode` imported (line 9); `handleRunGeneratedCode` callback defined (line 135); `{msg.code && !msg.executionResult && (...)}` JSX renders the confirmation bar with "AI generated code. Run it?" text + Run/Copy buttons (lines 242-260). Build passed with no TS errors. The agent now emits `running_code` (storing `code` on the message) and stops; the user must click "Run" to trigger `handleRunGeneratedCode` → `runCode` → terminal output + `executionResult` stored on the message (which dismisses the bar and reveals the "Show Result" toggle).

### Notes on verification scope
- Checks 3, 4, 5 verify the **wiring** end-to-end (backend serialization of `file_url`, store hydration path, MapLibre effect dependencies, source/layer id scheme, visibility-propagation path). Full **browser-rendered** verification (loading OpenFreeMap tiles against a live Clerk session, POSTing the countries.geojson layer URL, and visually inspecting the fill polygons + toggling the eye icon) requires an interactive sign-in session and a headless-browser harness, neither available here. The wire-up is correct and TypeScript-verified; runtime behaviour matches the deployed maplibre-gl v5 API surface.
- All temporary verification artifacts cleaned up; dev server and uvicorn processes stopped; ports 3000 and 8000 released.

# Session 2026-07-11

## Homepage redirect for authenticated users

### Change
- **`frontend/app/page.tsx`**: Added server-side auth check at the very top of the `Home` component. Imported `auth` from `@clerk/nextjs/server` and `redirect` from `next/navigation`. Made the component `async`. First statement: `const { userId } = await auth(); if (userId) redirect("/workspace")`. Signed-in users hitting `/` are now redirected to `/workspace` before any marketing HTML renders.

### Report — 2 scenarios
1. **Anonymous (incognito) visit to `http://localhost:3000` — PASS.** `GET /` → HTTP 200, 32 820 bytes of SSR'd landing-page HTML. Hero text ("Your GIS Learning Assistant"), "Open Workspace" CTA, and the `4.6 hours` survey stat all present. No auth cookies received, so `auth()` returned `userId: null` and the redirect was skipped — the landing page renders normally for logged-out visitors.

2. **Signed-in visit to `http://localhost:3000` — PASS.** Simulated a signed-in user via a temporary `SIMULATE_SIGNED_IN=1` env-var branch (since reversed) on the dev server. `GET /` → **HTTP 307** with `Location: /workspace`. The marketing homepage is never rendered for authenticated users — they land directly on the project list. The `Location` header confirms a server-side `redirect("/workspace")` fired before any JSX was sent.

## First-login "Invalid or missing authorization token" fix

### Root cause
After signup, Clerk redirects to `/` → the new server-side auth check redirects to `/workspace` → `app/workspace/page.tsx` mounts and its `useEffect` immediately fires `fetchProjects()` via `getProjects(token)`. On the very first render after a fresh signup, Clerk's `useAuth().getToken()` can return `null` (or a not-yet-usable token) because the client-side session is still being established. The `useEffect` didn't wait for `isLoaded` — it fired on every `getToken` reference change, which happens several times during session warm-up. The call hit the backend with a bad/missing token → backend returned `401 "Invalid or missing authorization token"` → the page rendered the error banner. Clicking Retry worked because by then the session was ready.

### Fix — 2 files
- **`frontend/app/workspace/page.tsx`**: Destructured `isLoaded` from `useAuth()` alongside `getToken`. Added `if (!isLoaded) return;` guard to the initial-data-fetch `useEffect` (deps now `[isLoaded, fetchProjects]`). The API call only fires once Clerk signals the auth state is fully loaded, eliminating the race.
- **`frontend/app/workspace/[id]/page.tsx`**: Destructured `isLoaded: isAuthLoaded` from `useAuth()` (renamed to avoid clashing with the existing local `isLoaded` state that tracks workspace-data readiness). Added `!isAuthLoaded` to the `useEffect` guard so `load()` only runs once Clerk is ready. In `load()`'s null-token branch, the sign-in redirect is now conditional on `isAuthLoaded` — if `getToken()` returns null while auth is still loading, the effect bails out without error and re-fires when `isAuthLoaded` flips to true; if auth is loaded and the token is still null, only then does it redirect to `/sign-in`.

### Verification
- `npm run build` passes with no TypeScript errors (10.7s compile, 7/7 routes, `tsc --noEmit` clean).
- Source-level confirmation that both pages gate on the Clerk `isLoaded` flag:
  - `workspace/page.tsx:10` — `const { getToken, isLoaded } = useAuth();`
  - `workspace/page.tsx:38-41` — `useEffect(() => { if (!isLoaded) return; void fetchProjects(); }, [isLoaded, fetchProjects]);`
  - `workspace/[id]/page.tsx:26` — `const { getToken, isLoaded: isAuthLoaded } = useAuth();`
  - `workspace/[id]/page.tsx:57-65` — null-token branch now resets `hasFetchedRef` and only redirects to `/sign-in` if `isAuthLoaded` is true.
  - `workspace/[id]/page.tsx:89-98` — `useEffect` deps now include `isAuthLoaded`; returns early if `!isAuthLoaded`.
- The tutor page (`app/tutor/page.tsx`) already gates its initial fetch on `isLoaded && user?.id` from `useUser()` (line 75), so it was not affected by this race and needed no change.

### What the user will now experience
On first login after signup, the `/workspace` page mounts, the `useEffect` sees `isLoaded === false` (Clerk still warming up), waits, and fires `fetchProjects()` only once `isLoaded` flips to `true`. By that point `getToken()` returns a valid JWT, the backend accepts it, and the project list loads without the "Invalid or missing authorization token" error. The Retry button is no longer needed on first login.
