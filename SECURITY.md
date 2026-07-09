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

### Rate limiting not fully wired
- Redis rate limiter is configured in `.env` (`REDIS_URL`, per-endpoint rate limit constants) but many endpoints (agent, code_runner, datasets) lack the `Depends(rate_limiter)` annotation. Only tutor and sessions likely have it.
- If Redis is down and `RATE_LIMIT_REDIS_STRICT=false`, rate limiting silently disables itself with no fallback (e.g. in-memory counter).

### Auth observations
- JWT verification via Clerk JWKS is sound — per-request validation, no caching of tokens beyond the configured JWKS TTL.
- Workspace ownership enforced via database JOIN on every workspace-scoped endpoint (`_get_workspace_or_404`). Returns 404 instead of 403 (good — doesn't confirm workspace existence).
- `get_current_user_id()` does not verify the user exists in the local `users` table — a valid Clerk JWT from any Clerk instance would pass. `_get_or_create_user()` creates a local row on first access, which is fine but means the local `users` table has no independent access control.
- Clerk middleware in `frontend/middleware.ts` protects `/workspace(.*)` and other protected routes before the page shell renders. Unauthenticated users never see the workspace UI.

### Infrastructure risks
- `channel_binding=require` in the DB connection string (`backend/.env`) can cause compatibility issues with some pgBouncer/connection-pooler setups.
- No secrets rotation strategy — Clerk secret key, DB password, and YouTube API key are all static.
- No CSP reporting endpoint — Content-Security-Policy is set (`frontend/middleware.ts:40-52`) but violations are silently dropped.
