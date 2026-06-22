# GeoLearn AI — Known Vulnerabilities & Security Status

**Last updated:** 2026-06-22  
**Backend:** FastAPI/Python | **Frontend:** Next.js/TypeScript

---

## Build Phase Reference

| Phase | Status | Description |
|-------|--------|-------------|
| Phase 0 | ✅ Done | Backend foundation — models, ai_client, DeepSeek migration |
| Phase 1 | ✅ Done | Code execution sandbox |
| Phase 2 | ✅ Done | Data connector (Planetary Computer + GRID3) |
| Phase 3 | ✅ Done | AI agent (Tier 1 verified, Tier 2 pending DeepSeek funding) |
| Phase 4 | 🔄 In progress | Workspace router (CRUD for projects/workspaces/layers) |
| Phase 5 | ⏳ Pending | Frontend workspace (MapLibre, Monaco, AI sidebar) |
| Phase 6 | ⏳ Pending | Update existing pages, wire up new routes |

---

## 🔴 HIGH — Known, Deliberately Deferred

### H-1: Code Sandbox Bypassable via Python Introspection
**File:** `backend/sandbox.py`  
**Status:** Known, deferred to pre-launch hardening  
**Detail:** The AST-based blocklist can be bypassed via introspection:
```python
().__class__.__mro__[1].__subclasses__()
```
This can expose `os`, `subprocess`, and other dangerous capabilities despite the
blocklist. `_BLOCKED_ATTRS` blocks `__class__` etc. at the `ast.Attribute` level,
but `type()` and generator expressions can circumvent this.  
**Current mitigations in place:**
- Environment scrubbing (`_build_minimal_env` — no inherited secrets)
- `sys.executable -I` (isolated mode, ignores PYTHONPATH)
- Resource limits via `resource.setrlimit` (512MB RAM, CPU timeout, 10 procs, 64 files)
- `os` removed from preamble so bare `os.system()` fails with NameError
- AST name-node check rejects bare references to `_BLOCKED_MODULES` names  

**Proper fix:** Container-level isolation (Docker per execution, gVisor, Firecracker).  
**When to fix:** Before high-traffic public launch, not during current build phases.

### H-2: `isidentifier()` Allows Dunder Names in Preamble Injection
**File:** `backend/sandbox.py`, `backend/routers/code_runner.py`  
**Status:** Partially fixed — Phase 3 post-fix applied `startswith('__')` check  
**Detail:** `isidentifier()` returns True for names like `__import__`, `__class__`,
allowing them to shadow builtins in the generated preamble.  
**Fix applied (Phase 3 cleanup):** Both files now use:
```python
if not var_name.isidentifier() or var_name.startswith('__'):
    continue
```
**Residual risk:** Only exploitable if an attacker can write arbitrary values to
`workspace_layers.name` in the database (e.g. via SQL injection — which SQLAlchemy
ORM prevents — or via a compromised admin path that doesn't exist yet).

---

## 🟡 MEDIUM — Pending Fix (Scheduled)

### M-1: No Auth or Rate Limiting on `/api/datasets`
**File:** `backend/routers/datasets.py`  
**Status:** Known, not yet fixed  
**Detail:** The legacy static datasets endpoint has no `Depends(get_current_user_id)`
and no rate limiting. Returns dataset metadata including `download_url` to any
unauthenticated caller.  
**Fix:** Add `Depends(get_current_user_id)` and a rate limit dependency, or delete
the endpoint entirely when the new `/api/data/search` fully replaces it.  
**When to fix:** Phase 6 cleanup, or whenever `datasets.py` is deleted.

### M-2: Exception Leakage in `agent.py`
**File:** `backend/routers/agent.py`  
**Status:** Fixed in Phase 3 cleanup  
**Detail:** `except Exception as e: yield _event({"type": "error", "message": str(e)})`
— raw exception messages (including DB connection strings, API keys in error text)
returned to client.  
**Fix applied:** Replaced with `UNAVAILABLE_MESSAGE` constant, same pattern as
`tutor.py`. `str(e)` no longer reaches the client.

### M-3: Temp Output Directories Never Cleaned
**File:** `backend/sandbox.py`  
**Status:** Fixed in Phase 3 cleanup  
**Detail:** `/tmp/geo_output/{exec_id}/` created on every execution, never deleted.
On a free-tier Render instance with limited disk this will eventually fill up.  
**Fix applied:** `shutil.rmtree(output_dir, ignore_errors=True)` called after
`output_files` list is populated. `shutil` imported at top of file.

### M-4: CORS Origin Taken Directly From Env Var
**File:** `backend/main.py`  
**Status:** Low real-world risk, no fix planned  
**Detail:** `NEXT_PUBLIC_FRONTEND_URL` used directly in `allow_origins` without
additional validation. An attacker who controls this env var has already compromised
the server — CORS is irrelevant at that point.  
**Decision:** Not worth engineering time. Document and move on.

### M-5: Unverified JWT `iss` Extraction Used for SSRF
**File:** `backend/auth.py`  
**Status:** Theoretical, not exploitable in practice, no fix planned  
**Detail:** Server makes HTTP GET to URL derived from user-supplied JWT's `iss` field.
`_CLERK_ISS_RE` regex restricts to `*.clerk.accounts.dev` and `*.clerk.com` domains.
Registering a subdomain that passes this regex and also serves a valid JWKS endpoint
is not a realistic attack vector for this application.  
**Decision:** Acceptable risk for current threat model.

### M-6: Missing Security Headers on Backend Responses
**File:** `backend/main.py`  
**Status:** Deferred to deployment phase  
**Detail:** Backend responses missing `Strict-Transport-Security`, `Content-Security-Policy`,
`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`.  
**Note:** Frontend already has `X-Frame-Options`, `X-Content-Type-Options`, and
`Referrer-Policy` set in `frontend/next.config.ts`.  
**Fix:** Add FastAPI middleware in `main.py` to inject these headers. Schedule for
deployment phase before going live.

### M-7: Dead Groq/Gemini Keys in `.env`
**File:** `backend/.env` (local only, not in git)  
**Status:** Cleanup only — remove from local `.env`  
**Detail:** `GEMINI_API_KEY`, `GEMINI_API_KEY_2`, `GROQ_API_KEY`, `GROQ_API_KEY_2`
present in `.env.example` and possibly local `.env` from before the DeepSeek migration.
Never read by any Python file.  
**Fix:** Delete these lines from local `.env` and from `.env.example`. Revoke the
actual keys in Groq/Google dashboards if they were ever real values.

---

## 🔵 LOW — Minor Issues

### L-1: No Prompt Injection Guard
**File:** `backend/routers/tutor.py`, `backend/routers/agent.py`  
**Status:** Accepted for now  
**Detail:** User input goes directly into AI messages with only `\x00` removal
(tutor) or no sanitization at all (agent). A crafted message could attempt to
override the system prompt. Response is stored and re-served as conversation history.  
**Decision:** Prompt injection is a known LLM risk with no complete solution. The
system prompts are strong and the application doesn't have elevated-privilege AI
actions (no email sending, no external writes). Acceptable for current threat model.

### L-2: `session_id` / `workspace_id` No Range Validation
**File:** `backend/routers/tutor.py`, `backend/routers/agent.py`  
**Status:** Not a real vulnerability — not fixing  
**Detail:** `workspace_id: int` has no upper bound. A `workspace_id` of 999999999
that doesn't belong to this user correctly returns 404. Ownership checks are in place
on all relevant queries.  
**Decision:** Integer IDs don't need range validation when ownership is enforced.

### L-3: `__pycache__` Directories Present Locally
**File:** `backend/__pycache__/`, `backend/routers/__pycache__/`  
**Status:** Gitignored — no action needed  
**Detail:** `.pyc` files are Python bytecode cache artifacts. Added to `.gitignore`.
Not committed to the repository.

---

## ✅ Verified Clean

| Category | Status |
|----------|--------|
| SQL injection | ✅ All queries use SQLAlchemy ORM |
| Command injection | ✅ `subprocess.run` uses only `sys.executable -I` (fixed binary) |
| Path traversal | ✅ No user-controlled file paths in filesystem operations |
| Insecure deserialization | ✅ No pickle/marshal/yaml.load anywhere |
| eval/exec/compile with user input | ✅ Blocked in sandbox, absent elsewhere |
| File upload endpoints | ✅ None exist yet |
| Open redirect | ✅ No redirect responses |
| Server-side template injection | ✅ No template engine used |
| CRLF injection | ✅ All headers static, `json.dumps` used for SSE data |
| Hardcoded secrets in source | ✅ All secrets in `.env` files, gitignored |
| `.env` committed to git | ✅ Confirmed clean — `git ls-files \| grep .env` returns nothing |

---

## Rate Limiting Summary

| Endpoint | Dependency | Default Limit |
|----------|-----------|---------------|
| `POST /api/tutor` | `get_tutor_user_id_with_rate_limit` | 10 req / 60s |
| `POST /api/tutor/stream` | `get_tutor_user_id_with_rate_limit` | 10 req / 60s |
| `GET/POST /api/sessions*` | `get_sessions_user_id_with_rate_limit` | 60 req / 60s |
| `POST /api/code/run` | `get_code_user_id_with_rate_limit` | 5 req / 60s |
| `GET /api/data/search` | `get_data_user_id_with_rate_limit` | 20 req / 60s |
| `POST /api/agent/run` | `get_agent_user_id_with_rate_limit` | 8 req / 60s |
| `GET /api/datasets` | ❌ None | Unprotected |
| `GET /api/youtube` | `get_youtube_user_id_with_rate_limit` | 20 req / 60s (router present but unimported) |

All limits are configurable via environment variables. Redis used when `REDIS_URL`
is set; falls back to in-memory per-process buckets otherwise.

---

## Pre-Launch Checklist (Before Going Public)

- [ ] Replace sandbox AST blocking with container-level isolation (H-1)
- [ ] Add security headers middleware to `backend/main.py` (M-6)
- [ ] Delete or add auth to `/api/datasets` (M-1)
- [ ] Remove dead Groq/Gemini keys from `.env.example` and local `.env` (M-7)
- [ ] Revoke unused Groq/Gemini API keys in their dashboards
- [ ] Set `ENVIRONMENT=production` and `DB_STARTUP_STRICT=true` on Render
- [ ] Set `RATE_LIMIT_REDIS_STRICT=true` on Render (requires Redis add-on)
- [ ] Confirm `CLERK_JWT_AUDIENCE` is set and matches Clerk dashboard value
- [ ] Run `git log --all --full-history -- backend/.env` — confirm empty
- [ ] Run `git log --all --full-history -- frontend/.env.local` — confirm empty
- [ ] Fund DeepSeek API key and run Tier 2 agent test end-to-end
- [ ] Add `__pycache__/`, `*.pyc`, `*.pyo` to root `.gitignore`

---

## Decisions Log

**Why AST blocking instead of containers (H-1):**  
Container-per-execution is the correct long-term answer but requires Docker on the
host, adds significant cold-start latency per execution, and complicates the
Render free-tier deployment. AST blocking + environment scrubbing + resource limits
is an acceptable intermediate posture for a student platform with low traffic and
known-user access. Revisit before scaling.

**Why no prompt injection guard (L-1):**  
No complete solution exists. The application has no elevated-privilege AI actions.
Strong system prompts are in place. Acceptable for current threat model.

**Why `/api/datasets` is still unprotected (M-1):**  
Legacy endpoint from before the pivot. Scheduled for deletion or auth addition in
Phase 6. Data it returns is public information (download URLs to public datasets).
No secrets or user data exposed.
