import os
from typing import Any

import httpx
import jwt
from fastapi import Header, HTTPException
from jwt import PyJWK, PyJWTError

CLERK_JWKS_URL = os.getenv(
    "CLERK_JWKS_URL",
    "https://api.clerk.com/v1/jwks",
)

_jwks_cache: dict[str, Any] | None = None


def _unauthorized(detail: str = "Invalid or missing authorization token") -> HTTPException:
    return HTTPException(status_code=401, detail=detail)


def _get_jwks(force_refresh: bool = False) -> dict[str, Any]:
    global _jwks_cache

    if _jwks_cache is not None and not force_refresh:
        return _jwks_cache

    try:
        response = httpx.get(CLERK_JWKS_URL, timeout=10.0)
        response.raise_for_status()
        payload = response.json()
    except Exception as exc:
        raise _unauthorized("Unable to fetch Clerk JWKS") from exc

    keys = payload.get("keys")
    if not isinstance(keys, list):
        raise _unauthorized("Invalid Clerk JWKS response")

    _jwks_cache = payload
    return payload


def _get_signing_key(token: str) -> Any:
    try:
        unverified_header = jwt.get_unverified_header(token)
    except PyJWTError as exc:
        raise _unauthorized() from exc

    kid = unverified_header.get("kid")
    if not isinstance(kid, str) or not kid:
        raise _unauthorized()

    for refresh in (False, True):
        jwks = _get_jwks(force_refresh=refresh)
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
