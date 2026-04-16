import os
import re
import threading
import time
from typing import Any

import httpx
import jwt
from fastapi import Depends, Header, HTTPException
from jwt import PyJWK, PyJWTError

CLERK_JWKS_URL = os.getenv(
    "CLERK_JWKS_URL",
    "https://api.clerk.com/v1/jwks",
)

_CLERK_ISS_RE = re.compile(
    r"^https://(?:[a-z0-9-]+\.)*[a-z0-9-]+\.clerk\.(?:accounts\.dev|com)/?$",
    re.IGNORECASE,
)

_jwks_cache: dict[str, dict[str, Any]] = {}
_jwks_cache_expiry: dict[str, float] = {}
_jwks_cache_lock = threading.Lock()

_JWKS_CACHE_TTL_SECONDS = int(os.getenv("CLERK_JWKS_CACHE_TTL_SECONDS", "3600"))
_TUTOR_RATE_LIMIT_MAX_REQUESTS = int(os.getenv("TUTOR_RATE_LIMIT_MAX_REQUESTS", "10"))
_TUTOR_RATE_LIMIT_WINDOW_SECONDS = int(os.getenv("TUTOR_RATE_LIMIT_WINDOW_SECONDS", "60"))
_TUTOR_RATE_LIMIT_MESSAGE = "Too many tutor requests. Please try again in a minute."

_tutor_rate_limit_bucket: dict[str, list[float]] = {}
_tutor_rate_limit_lock = threading.Lock()


def _unauthorized(detail: str = "Invalid or missing authorization token") -> HTTPException:
    return HTTPException(status_code=401, detail=detail)


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


def _fetch_jwks(url: str, force_refresh: bool = False) -> dict[str, Any]:
    now = time.time()

    with _jwks_cache_lock:
        if not force_refresh and url in _jwks_cache and _jwks_cache_expiry.get(url, 0) > now:
            return _jwks_cache[url]

    try:
        response = httpx.get(url, timeout=10.0)
        response.raise_for_status()
        payload = response.json()
    except Exception as exc:
        raise _unauthorized("Unable to fetch Clerk JWKS") from exc

    keys = payload.get("keys")
    if not isinstance(keys, list):
        raise _unauthorized("Invalid Clerk JWKS response")

    ttl_seconds = max(_JWKS_CACHE_TTL_SECONDS, 1)
    with _jwks_cache_lock:
        _jwks_cache[url] = payload
        _jwks_cache_expiry[url] = now + ttl_seconds

    return payload


def _get_signing_key(token: str) -> Any:
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
                jwks = _fetch_jwks(url, force_refresh=refresh)
            except HTTPException:
                break
            for jwk in jwks.get("keys", []):
                if jwk.get("kid") == kid:
                    return PyJWK.from_dict(jwk).key

    raise _unauthorized()


def get_current_user_id(authorization: str | None = Header(default=None)) -> str:
    if not authorization:
        raise _unauthorized("Missing Authorization header")

    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise _unauthorized("Authorization header must use Bearer token")

    signing_key = _get_signing_key(token)

    try:
        payload = jwt.decode(
            token,
            signing_key,
            algorithms=["RS256"],
            options={"verify_aud": False},
        )
    except PyJWTError as exc:
        raise _unauthorized() from exc

    subject = payload.get("sub")
    if not isinstance(subject, str) or not subject:
        raise _unauthorized("Token subject is missing")

    return subject


def get_tutor_user_id_with_rate_limit(
    current_user_id: str = Depends(get_current_user_id),
) -> str:
    now = time.time()
    window_start = now - _TUTOR_RATE_LIMIT_WINDOW_SECONDS

    with _tutor_rate_limit_lock:
        timestamps = _tutor_rate_limit_bucket.setdefault(current_user_id, [])
        timestamps[:] = [timestamp for timestamp in timestamps if timestamp >= window_start]

        if len(timestamps) >= _TUTOR_RATE_LIMIT_MAX_REQUESTS:
            raise HTTPException(status_code=429, detail=_TUTOR_RATE_LIMIT_MESSAGE)

        timestamps.append(now)

    return current_user_id
