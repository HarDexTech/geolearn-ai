# Security & Technical Risks

## Rough edges

### Backend stability
- DB connection during async lifespan startup (`backend/main.py:13-25`) hangs indefinitely when Neon.tech is slow — the synchronous `create_all()` and `_ensure_session_schema()` block the async event loop. No timeout is set on the engine connection pool.
- No health-check retry loop — if the DB hiccups, the entire server is down until manually restarted.
- Uvicorn's WatchFiles reloader conflicts with the async lifespan handler, preventing `--reload` from working at all.

### Synchronous SQLAlchemy in async handlers
- Every DB call (`Session.add`, `db.commit`, `db.query`) runs synchronously inside async FastAPI route handlers, blocking the event loop for the duration of each query. Under concurrent requests this causes thread pool starvation and cascading timeouts.
- No `asyncpg` or `AsyncSession` — the entire backend is sync-on-async, which defeats FastAPI's async performance advantage.

### No tests
- Zero tests for frontend or backend.
- No CI pipeline, no type checking enforcement, no linting in CI.
- Any refactor risks silent regressions.

### Duplicated types between frontend and backend
- `Layer`, `WorkspaceData`, and other shapes are defined independently in `frontend/lib/api.ts` and `backend/routers/workspace.py`. A schema change on one side will not be caught until runtime.
- No OpenAPI codegen or shared type package.

### Auth observations
- JWT verification via Clerk JWKS is sound — per-request validation, no caching of tokens beyond the configured JWKS TTL.
- Workspace ownership enforced via database JOIN on every workspace-scoped endpoint (`_get_workspace_or_404`). Returns 404 instead of 403 (good — doesn't confirm workspace existence).
- `get_current_user_id()` does not verify the user exists in the local `users` table — a valid Clerk JWT from any Clerk instance would pass. `_get_or_create_user()` creates a local row on first access, which is fine but means the local `users` table has no independent access control.
- Clerk middleware in `frontend/middleware.ts` protects `/workspace(.*)` and other protected routes before the page shell renders. Unauthenticated users never see the workspace UI.

### Infrastructure risks
- `channel_binding=require` in the DB connection string (`backend/.env`) can cause compatibility issues with some pgBouncer/connection-pooler setups.
- No secrets rotation strategy — Clerk secret key, DB password, and YouTube API key are all static.
- No CSP reporting endpoint — Content-Security-Policy is set (`frontend/middleware.ts:40-52`) but violations are silently dropped.

## Verified posture (updated)

### Rate limiting
- Redis rate limiter is configured in `.env` (`REDIS_URL`, per-endpoint `MAX_REQUESTS`/`WINDOW_SECONDS` pairs) and enforced via an atomic Lua script (`auth.py:92`).
- Every LLM-backed endpoint **does** carry a `Depends(get_*_user_id_with_rate_limit)` dependency:
  - tutor (`auth.py:339`) — 10 req/60s
  - sessions (`auth.py:360`) — 60 req/60s
  - code (`auth.py:386`) — 5 req/60s (strictest)
  - data (`auth.py:412`) — 20 req/60s
  - agent (`auth.py:438`) — 8 req/60s
  - youtube (`auth.py:464`) — 20 req/60s (dependency exists, but the YouTube router is not registered in `main.py`)
- `RATE_LIMIT_REDIS_STRICT` invalidation (`auth.py:71-73`): in production, Redis-down returns 503; in development, falls back to an in-memory counter.
- An in-memory fallback (`_enforce_rate_limit_in_memory`, `auth.py:192`) **is** implemented — per-user timestamp list per bucket, guarded by a per-bucket `threading.Lock`. So the earlier note about "no fallback" was outdated and is corrected here.
- Endpoints without rate limiting (intentional): `datasets` (no auth at all) and `workspace` (auth required, no LLM cost).

### CORS
- Origins derived from `NEXT_PUBLIC_FRONTEND_URL`; in non-prod additionally `127.0.0.1:3000` and `localhost:3000` (`main.py:43-48`).
- `allow_credentials=True`; methods limited to `GET,POST,PATCH,DELETE,OPTIONS`; headers limited to `Authorization, Content-Type` (`main.py:50-56`).

### Clerk JWT
- Bearer token required for every protected route via `get_current_user_id` dependency (`auth.py:309`).
- RS256 verification against Clerk JWKS with `kid` matching; per-URL fetch locks + JWKS cache with TTL (`CLERK_JWKS_CACHE_TTL_SECONDS`, default 900s) and stale-while-revalidate window (default 60s) to avoid thundering-herd refreshes.
- Issuer regex validation via `_CLERK_ISS_RE` (`auth.py:23`).
- Audience verification is **conditional** on `CLERK_JWT_AUDIENCE` being set (`auth.py:319`). If blank (current dev config), `verify_aud` is disabled — should be set in production.
- `redis` import is wrapped in try/except so the app still boots without redis-py installed.

### Sandbox (`backend/sandbox.py`)
- AST static analysis via `_find_violation` (`sandbox.py:45`) runs before execution, blocking:
  - Modules (`sandbox.py:26`): `os, sys, subprocess, socket, requests, shutil, pathlib, urllib, http, ftplib, ssl, ctypes, multiprocessing, threading, pickle, marshal, pty, fcntl, signal, importlib, code`.
  - Builtins (`sandbox.py:33`): `eval, exec, compile, open, __import__, __builtins__, globals, vars, getattr, setattr, delattr, locals, breakpoint, input`.
  - Attributes (`sandbox.py:39`): `__globals__, __class__, __bases__, __subclasses__, __builtins__, __code__, __closure__, __dict__`.
- Subprocess runs with `python -I` (isolated mode) and a minimal env (`_build_minimal_env`, `sandbox.py:75` — `PATH` + locale only). Removed `HOME`, `PYTHONPATH`, secrets.
- Output dir `/tmp/geo_output/{uuid}` per execution, wiped after collection.
- Resource limits (POSIX only via `preexec_fn`): `RLIMIT_AS=512MiB`, `RLIMIT_CPU=timeout`, `RLIMIT_NPROC=10`, `RLIMIT_NOFILE=64`.
- Input size cap: `RunRequest.code` max 50 000 chars (`code_runner.py:15`); `timeout` bounded 1–60s.
- Output truncation: stdout 10 000 chars, stderr 5 000 chars (`sandbox.py`).
- `on TimeoutExpired` → `stderr="Execution timed out after N seconds."`.

## Critical / pending risks

### Agent auto-execution (HIGH)
- Agent runs LLM-emitted ```python fenced blocks in the sandbox with **no human-in-the-loop confirmation** (`routers/agent.py:21-24,65-173` defaults `auto_run=true`). Static analysis is purely lexical — metaclass escapes via chained intermediate attributes are not covered.

### Missing audience verification (MEDIUM)
- `CLERK_JWT_AUDIENCE=` is empty in the local dev `.env`, so audience verification is disabled (`auth.py:319`). Must be set before production.

### Sandbox hardening gaps
- Win32 host: `RLIMIT_*` is gated on `os.name == "posix"` — only AST + env minimization + timeout protect on Windows. Hard-coded `/tmp/geo_output/...` and `PATH=/usr/bin:/bin` mean output-file collection does **not** work on Windows.
- `open` builtin is blocked, but inputs are passed as **path strings** — in-sandbox code cannot use `open` for legitimate layer files. Library calls like `rasterio.open` are allowed because they are not the builtin name.
- `RestrictedPython==7.1` is in `requirements.txt` but never imported — current sandbox is hand-rolled on `ast`.
- Agent-extracted code is persisted to `Executions` and run with the workspace's visible layers as input files.

### Silent failure modes
- `_search_planetary_computer` (`data_connector.py:10-71`) swallows all exceptions and returns `[]` — failures are not surfaced to the frontend. Should be replaced with typed errors.
- No global exception handler (`@app.exception_handler`) — bare 500s on unhandled errors.
- The frontend calls `getYoutubeVideos` (`tutor/page.tsx:421`) which hits `GET /api/youtube?query=` — **this route does not exist on the backend** since the YouTube router was never registered. Silent failure on the page.

### Unused/dead code (security-relevant surface)
- `Bookmark` (`models.py:49`) and `SavedDataset` (`models.py:171`) ORM models defined with no CRUD routers exposing them.
- `get_youtube_user_id_with_rate_limit` (`auth.py:464`) defined; consuming router absent.
- `recharts@^3.9.0` (`frontend/package.json:20`) declared but not imported.
- `frontend/hooks/` directory exists at repo root but contains no files.
