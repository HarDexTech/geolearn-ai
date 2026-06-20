import os
import re
import threading
import time
from typing import Any

import httpx
import jwt
from fastapi import Depends, Header, HTTPException
from jwt import PyJWK, PyJWTError

try:
    import redis
except ImportError:  # pragma: no cover - fallback path for environments missing redis extras
    redis = None

CLERK_JWKS_URL = os.getenv(
    "CLERK_JWKS_URL",
    "https://api.clerk.com/v1/jwks",
)
CLERK_JWT_AUDIENCE = os.getenv("CLERK_JWT_AUDIENCE", "").strip()

_CLERK_ISS_RE = re.compile(
    r"^https://(?:[a-z0-9-]+\.)*[a-z0-9-]+\.clerk\.(?:accounts\.dev|com)/?$",
    re.IGNORECASE,
)

_jwks_cache: dict[str, dict[str, Any]] = {}
_jwks_cache_expiry: dict[str, float] = {}
_jwks_cache_lock = threading.Lock()
_jwks_fetch_locks: dict[str, threading.Lock] = {}
_jwks_fetch_locks_lock = threading.Lock()

_JWKS_CACHE_TTL_SECONDS = int(os.getenv("CLERK_JWKS_CACHE_TTL_SECONDS", "900"))
_JWKS_STALE_WHILE_REVALIDATE_SECONDS = int(
        os.getenv("CLERK_JWKS_STALE_WHILE_REVALIDATE_SECONDS", "60")
)
_TUTOR_RATE_LIMIT_MAX_REQUESTS = int(os.getenv("TUTOR_RATE_LIMIT_MAX_REQUESTS", "10"))
_TUTOR_RATE_LIMIT_WINDOW_SECONDS = int(os.getenv("TUTOR_RATE_LIMIT_WINDOW_SECONDS", "60"))
_TUTOR_RATE_LIMIT_MESSAGE = "Too many tutor requests. Please try again in a minute."
_SESSIONS_RATE_LIMIT_MAX_REQUESTS = int(os.getenv("SESSIONS_RATE_LIMIT_MAX_REQUESTS", "60"))
_SESSIONS_RATE_LIMIT_WINDOW_SECONDS = int(os.getenv("SESSIONS_RATE_LIMIT_WINDOW_SECONDS", "60"))
_SESSIONS_RATE_LIMIT_MESSAGE = "Too many session requests. Please try again in a minute."
_YOUTUBE_RATE_LIMIT_MAX_REQUESTS = int(os.getenv("YOUTUBE_RATE_LIMIT_MAX_REQUESTS", "20"))
_YOUTUBE_RATE_LIMIT_WINDOW_SECONDS = int(os.getenv("YOUTUBE_RATE_LIMIT_WINDOW_SECONDS", "60"))
_YOUTUBE_RATE_LIMIT_MESSAGE = "Too many video requests. Please try again in a minute."
_CODE_RATE_LIMIT_MAX_REQUESTS = int(os.getenv("CODE_RATE_LIMIT_MAX_REQUESTS", "5"))
_CODE_RATE_LIMIT_WINDOW_SECONDS = int(os.getenv("CODE_RATE_LIMIT_WINDOW_SECONDS", "60"))
_CODE_RATE_LIMIT_MESSAGE = "Too many code execution requests. Please try again in a minute."
_DATA_RATE_LIMIT_MAX_REQUESTS = int(os.getenv("DATA_RATE_LIMIT_MAX_REQUESTS", "20"))
_DATA_RATE_LIMIT_WINDOW_SECONDS = int(os.getenv("DATA_RATE_LIMIT_WINDOW_SECONDS", "60"))
_DATA_RATE_LIMIT_MESSAGE = "Too many data search requests. Please try again in a minute."
_REDIS_URL = os.getenv("REDIS_URL", "").strip()
_REDIS_TUTOR_RATE_LIMIT_PREFIX = os.getenv("REDIS_TUTOR_RATE_LIMIT_PREFIX", "ratelimit:tutor")
_REDIS_SESSIONS_RATE_LIMIT_PREFIX = os.getenv("REDIS_SESSIONS_RATE_LIMIT_PREFIX", "ratelimit:sessions")
_REDIS_YOUTUBE_RATE_LIMIT_PREFIX = os.getenv("REDIS_YOUTUBE_RATE_LIMIT_PREFIX", "ratelimit:youtube")
_REDIS_CODE_RATE_LIMIT_PREFIX = os.getenv("REDIS_CODE_RATE_LIMIT_PREFIX", "ratelimit:code")
_REDIS_DATA_RATE_LIMIT_PREFIX = os.getenv("REDIS_DATA_RATE_LIMIT_PREFIX", "ratelimit:data")
_REDIS_UNAVAILABLE_MESSAGE = "Rate limiter backend unavailable. Please try again shortly."


def _is_truthy(value: str | None) -> bool:
    return (value or "").strip().lower() in {"1", "true", "yes", "on"}


_ENVIRONMENT = os.getenv("ENVIRONMENT", os.getenv("NODE_ENV", "development")).lower()
_RATE_LIMIT_REDIS_STRICT = _is_truthy(
    os.getenv("RATE_LIMIT_REDIS_STRICT", "true" if _ENVIRONMENT == "production" else "false")
)

_tutor_rate_limit_bucket: dict[str, list[float]] = {}
_sessions_rate_limit_bucket: dict[str, list[float]] = {}
_youtube_rate_limit_bucket: dict[str, list[float]] = {}
_code_rate_limit_bucket: dict[str, list[float]] = {}
_data_rate_limit_bucket: dict[str, list[float]] = {}
_tutor_rate_limit_lock = threading.Lock()
_sessions_rate_limit_lock = threading.Lock()
_youtube_rate_limit_lock = threading.Lock()
_code_rate_limit_lock = threading.Lock()
_data_rate_limit_lock = threading.Lock()

_redis_client: Any = None
_redis_client_lock = threading.Lock()
_redis_init_failed = False

_REDIS_RATE_LIMIT_LUA = """
local current = redis.call('INCR', KEYS[1])
if current == 1 then
    redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return current
"""


def _unauthorized(detail: str = "Invalid or missing authorization token") -> HTTPException:
    return HTTPException(status_code=401, detail=detail)


def _get_jwks_fetch_lock(url: str) -> threading.Lock:
    with _jwks_fetch_locks_lock:
        lock = _jwks_fetch_locks.get(url)
        if lock is None:
            lock = threading.Lock()
            _jwks_fetch_locks[url] = lock
        return lock


def _get_redis_client() -> Any:
    global _redis_client, _redis_init_failed

    if not _REDIS_URL or redis is None or _redis_init_failed:
        return None

    with _redis_client_lock:
        if _redis_client is not None:
            return _redis_client

        try:
            client = redis.from_url(
                _REDIS_URL,
                decode_responses=True,
                socket_connect_timeout=1.5,
                socket_timeout=1.5,
            )
            client.ping()
            _redis_client = client
        except Exception:
            _redis_init_failed = True
            return None

    return _redis_client


def _enforce_tutor_rate_limit_with_redis(current_user_id: str) -> bool:
    client = _get_redis_client()
    if client is None:
        if _RATE_LIMIT_REDIS_STRICT:
            raise HTTPException(status_code=503, detail=_REDIS_UNAVAILABLE_MESSAGE)
        return False

    window_seconds = max(_TUTOR_RATE_LIMIT_WINDOW_SECONDS, 1)
    max_requests = max(_TUTOR_RATE_LIMIT_MAX_REQUESTS, 1)
    key = f"{_REDIS_TUTOR_RATE_LIMIT_PREFIX}:{current_user_id}"

    try:
        current_count = int(client.eval(_REDIS_RATE_LIMIT_LUA, 1, key, window_seconds))
    except Exception:
        if _RATE_LIMIT_REDIS_STRICT:
            raise HTTPException(status_code=503, detail=_REDIS_UNAVAILABLE_MESSAGE)
        return False

    if current_count > max_requests:
        raise HTTPException(status_code=429, detail=_TUTOR_RATE_LIMIT_MESSAGE)

    return True


def _enforce_rate_limit_with_redis(
    current_user_id: str,
    redis_prefix: str,
    max_requests: int,
    window_seconds: int,
    limit_message: str,
) -> bool:
    client = _get_redis_client()
    if client is None:
        if _RATE_LIMIT_REDIS_STRICT:
            raise HTTPException(status_code=503, detail=_REDIS_UNAVAILABLE_MESSAGE)
        return False

    key = f"{redis_prefix}:{current_user_id}"

    try:
        current_count = int(client.eval(_REDIS_RATE_LIMIT_LUA, 1, key, max(window_seconds, 1)))
    except Exception:
        if _RATE_LIMIT_REDIS_STRICT:
            raise HTTPException(status_code=503, detail=_REDIS_UNAVAILABLE_MESSAGE)
        return False

    if current_count > max(max_requests, 1):
        raise HTTPException(status_code=429, detail=limit_message)

    return True


def _enforce_rate_limit_in_memory(
    current_user_id: str,
    bucket: dict[str, list[float]],
    lock: threading.Lock,
    max_requests: int,
    window_seconds: int,
    limit_message: str,
) -> None:
    now = time.time()
    window_start = now - max(window_seconds, 1)

    with lock:
        timestamps = bucket.setdefault(current_user_id, [])
        timestamps[:] = [timestamp for timestamp in timestamps if timestamp >= window_start]

        if len(timestamps) >= max(max_requests, 1):
            raise HTTPException(status_code=429, detail=limit_message)

        timestamps.append(now)


def _jwks_url_for_token(token: str, prefer_env: bool = True) -> str:
    if prefer_env and CLERK_JWKS_URL.strip():
        return CLERK_JWKS_URL.strip()

    try:
        payload = jwt.decode(
            token,
            options={"verify_signature": False, "verify_aud": False},
            algorithms=["RS256"],
        )
    except PyJWTError as exc:
        raise _unauthorized() from exc

    issuer = payload.get("iss")
    if not isinstance(issuer, str) or not issuer:
        raise _unauthorized("Token issuer is missing")

    normalized_issuer = issuer.rstrip("/")
    if not _CLERK_ISS_RE.match(normalized_issuer):
        raise _unauthorized("Token issuer is invalid")

    return f"{normalized_issuer}/.well-known/jwks.json"


async def _fetch_jwks(url: str, force_refresh: bool = False) -> dict[str, Any]:
    now = time.time()

    with _jwks_cache_lock:
        if not force_refresh and url in _jwks_cache and _jwks_cache_expiry.get(url, 0) > now:
            return _jwks_cache[url]

    fetch_lock = _get_jwks_fetch_lock(url)
    with fetch_lock:
        now = time.time()
        with _jwks_cache_lock:
            cached_payload = _jwks_cache.get(url)
            cached_expiry = _jwks_cache_expiry.get(url, 0)
            if not force_refresh and cached_payload is not None and cached_expiry > now:
                return cached_payload

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(url)
                response.raise_for_status()
                payload = response.json()
        except Exception as exc:
            if (
                not force_refresh
                and cached_payload is not None
                and now <= (cached_expiry + max(_JWKS_STALE_WHILE_REVALIDATE_SECONDS, 0))
            ):
                return cached_payload
            raise _unauthorized("Unable to fetch Clerk JWKS") from exc

        keys = payload.get("keys")
        if not isinstance(keys, list):
            raise _unauthorized("Invalid Clerk JWKS response")

        ttl_seconds = max(_JWKS_CACHE_TTL_SECONDS, 1)
        with _jwks_cache_lock:
            _jwks_cache[url] = payload
            _jwks_cache_expiry[url] = time.time() + ttl_seconds

        return payload


async def _get_signing_key(token: str) -> Any:
    try:
        unverified_header = jwt.get_unverified_header(token)
    except PyJWTError as exc:
        raise _unauthorized() from exc

    kid = unverified_header.get("kid")
    if not isinstance(kid, str) or not kid:
        raise _unauthorized()

    primary_url = _jwks_url_for_token(token, prefer_env=True)
    fallback_url = _jwks_url_for_token(token, prefer_env=False)

    jwks_urls: list[str] = [primary_url]
    if fallback_url != primary_url:
        jwks_urls.append(fallback_url)

    for url in jwks_urls:
        for refresh in (False, True):
            try:
                jwks = await _fetch_jwks(url, force_refresh=refresh)
            except HTTPException:
                break
            for jwk in jwks.get("keys", []):
                if jwk.get("kid") == kid:
                    return PyJWK.from_dict(jwk).key

    raise _unauthorized()


async def get_current_user_id(authorization: str | None = Header(default=None)) -> str:
    if not authorization:
        raise _unauthorized("Missing Authorization header")

    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise _unauthorized("Authorization header must use Bearer token")

    signing_key = await _get_signing_key(token)

    decode_options = {"verify_aud": bool(CLERK_JWT_AUDIENCE)}
    decode_kwargs: dict[str, Any] = {
        "algorithms": ["RS256"],
        "options": decode_options,
    }
    if CLERK_JWT_AUDIENCE:
        decode_kwargs["audience"] = CLERK_JWT_AUDIENCE

    try:
        payload = jwt.decode(token, signing_key, **decode_kwargs)
    except PyJWTError as exc:
        raise _unauthorized() from exc

    subject = payload.get("sub")
    if not isinstance(subject, str) or not subject:
        raise _unauthorized("Token subject is missing")

    return subject


async def get_tutor_user_id_with_rate_limit(
    current_user_id: str = Depends(get_current_user_id),
) -> str:
    # If Redis is configured, use it when available.
    if _REDIS_URL:
        enforced_with_redis = _enforce_tutor_rate_limit_with_redis(current_user_id)
        if enforced_with_redis:
            return current_user_id

    _enforce_rate_limit_in_memory(
        current_user_id,
        _tutor_rate_limit_bucket,
        _tutor_rate_limit_lock,
        _TUTOR_RATE_LIMIT_MAX_REQUESTS,
        _TUTOR_RATE_LIMIT_WINDOW_SECONDS,
        _TUTOR_RATE_LIMIT_MESSAGE,
    )

    return current_user_id


async def get_sessions_user_id_with_rate_limit(
    current_user_id: str = Depends(get_current_user_id),
) -> str:
    if _REDIS_URL:
        enforced_with_redis = _enforce_rate_limit_with_redis(
            current_user_id,
            _REDIS_SESSIONS_RATE_LIMIT_PREFIX,
            _SESSIONS_RATE_LIMIT_MAX_REQUESTS,
            _SESSIONS_RATE_LIMIT_WINDOW_SECONDS,
            _SESSIONS_RATE_LIMIT_MESSAGE,
        )
        if enforced_with_redis:
            return current_user_id

    _enforce_rate_limit_in_memory(
        current_user_id,
        _sessions_rate_limit_bucket,
        _sessions_rate_limit_lock,
        _SESSIONS_RATE_LIMIT_MAX_REQUESTS,
        _SESSIONS_RATE_LIMIT_WINDOW_SECONDS,
        _SESSIONS_RATE_LIMIT_MESSAGE,
    )

    return current_user_id


async def get_code_user_id_with_rate_limit(
    current_user_id: str = Depends(get_current_user_id),
) -> str:
    if _REDIS_URL:
        enforced_with_redis = _enforce_rate_limit_with_redis(
            current_user_id,
            _REDIS_CODE_RATE_LIMIT_PREFIX,
            _CODE_RATE_LIMIT_MAX_REQUESTS,
            _CODE_RATE_LIMIT_WINDOW_SECONDS,
            _CODE_RATE_LIMIT_MESSAGE,
        )
        if enforced_with_redis:
            return current_user_id

    _enforce_rate_limit_in_memory(
        current_user_id,
        _code_rate_limit_bucket,
        _code_rate_limit_lock,
        _CODE_RATE_LIMIT_MAX_REQUESTS,
        _CODE_RATE_LIMIT_WINDOW_SECONDS,
        _CODE_RATE_LIMIT_MESSAGE,
    )

    return current_user_id


async def get_data_user_id_with_rate_limit(
    current_user_id: str = Depends(get_current_user_id),
) -> str:
    if _REDIS_URL:
        enforced_with_redis = _enforce_rate_limit_with_redis(
            current_user_id,
            _REDIS_DATA_RATE_LIMIT_PREFIX,
            _DATA_RATE_LIMIT_MAX_REQUESTS,
            _DATA_RATE_LIMIT_WINDOW_SECONDS,
            _DATA_RATE_LIMIT_MESSAGE,
        )
        if enforced_with_redis:
            return current_user_id

    _enforce_rate_limit_in_memory(
        current_user_id,
        _data_rate_limit_bucket,
        _data_rate_limit_lock,
        _DATA_RATE_LIMIT_MAX_REQUESTS,
        _DATA_RATE_LIMIT_WINDOW_SECONDS,
        _DATA_RATE_LIMIT_MESSAGE,
    )

    return current_user_id


async def get_youtube_user_id_with_rate_limit(
    current_user_id: str = Depends(get_current_user_id),
) -> str:
    if _REDIS_URL:
        enforced_with_redis = _enforce_rate_limit_with_redis(
            current_user_id,
            _REDIS_YOUTUBE_RATE_LIMIT_PREFIX,
            _YOUTUBE_RATE_LIMIT_MAX_REQUESTS,
            _YOUTUBE_RATE_LIMIT_WINDOW_SECONDS,
            _YOUTUBE_RATE_LIMIT_MESSAGE,
        )
        if enforced_with_redis:
            return current_user_id

    _enforce_rate_limit_in_memory(
        current_user_id,
        _youtube_rate_limit_bucket,
        _youtube_rate_limit_lock,
        _YOUTUBE_RATE_LIMIT_MAX_REQUESTS,
        _YOUTUBE_RATE_LIMIT_WINDOW_SECONDS,
        _YOUTUBE_RATE_LIMIT_MESSAGE,
    )

    return current_user_id
