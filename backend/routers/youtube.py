import os

import httpx
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException, Query

from auth import get_youtube_user_id_with_rate_limit

load_dotenv()

router = APIRouter(prefix="/api", tags=["youtube"])

YOUTUBE_SEARCH_URL = "https://www.googleapis.com/youtube/v3/search"


def _extract_youtube_error_reason(payload: dict[str, object]) -> str | None:
    error = payload.get("error")
    if not isinstance(error, dict):
        return None

    errors = error.get("errors")
    if not isinstance(errors, list) or not errors:
        return None

    first_error = errors[0]
    if not isinstance(first_error, dict):
        return None

    reason = first_error.get("reason")
    return reason if isinstance(reason, str) else None


def _upstream_error_to_http_exception(response: httpx.Response) -> HTTPException:
    payload: dict[str, object] = {}
    try:
        payload = response.json()
    except ValueError:
        payload = {}

    reason = (_extract_youtube_error_reason(payload) or "").lower()

    if reason in {"quotaexceeded", "dailylimitexceeded", "ratelimitexceeded"}:
        return HTTPException(
            status_code=429,
            detail="YouTube quota limit reached. Please try again later.",
        )

    if reason in {"keyinvalid", "accessnotconfigured", "iprefererblocked"}:
        return HTTPException(
            status_code=503,
            detail="YouTube API key is invalid or restricted for this server.",
        )

    if response.status_code == 403:
        return HTTPException(
            status_code=429,
            detail="YouTube request was denied. Check quota and API key restrictions.",
        )

    if response.status_code in {400, 401}:
        return HTTPException(
            status_code=503,
            detail="YouTube API credentials are misconfigured.",
        )

    if response.status_code >= 500:
        return HTTPException(
            status_code=502,
            detail="YouTube service is temporarily unavailable. Please try again later.",
        )

    return HTTPException(
        status_code=502,
        detail="Unable to fetch videos from YouTube right now.",
    )


@router.get("/youtube")
async def youtube(
    query: str = Query(min_length=2, max_length=120),
    current_user_id: str = Depends(get_youtube_user_id_with_rate_limit),
) -> dict[str, object]:
    api_key = os.getenv("YOUTUBE_API_KEY")
    if not api_key or api_key == "your_youtube_api_key_here":
        raise HTTPException(status_code=503, detail="Video service unavailable.")

    params = {
        "part": "snippet",
        "q": f"{query} GIS tutorial Nigeria",
        "maxResults": 3,
        "type": "video",
        "key": api_key,
    }

    timeout = httpx.Timeout(connect=8.0, read=12.0, write=12.0, pool=8.0)
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.get(YOUTUBE_SEARCH_URL, params=params)
    except httpx.TimeoutException as exc:
        raise HTTPException(
            status_code=504,
            detail="YouTube API connection timed out. Check your network and try again.",
        ) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=502,
            detail="Unable to reach YouTube from the backend right now.",
        ) from exc

    if response.status_code != 200:
        raise _upstream_error_to_http_exception(response)

    payload = response.json()
    items = payload.get("items", [])

    results = []
    for item in items[:3]:
        video_id = item.get("id", {}).get("videoId")
        snippet = item.get("snippet", {})
        thumbs = snippet.get("thumbnails", {})
        thumbnail = (
            thumbs.get("high", {}).get("url")
            or thumbs.get("medium", {}).get("url")
            or thumbs.get("default", {}).get("url")
        )

        if not video_id:
            continue

        results.append(
            {
                "title": snippet.get("title", "Untitled"),
                "thumbnail": thumbnail,
                "video_url": f"https://www.youtube.com/watch?v={video_id}",
                "channel": snippet.get("channelTitle", "Unknown Channel"),
            }
        )

    return {"count": len(results), "results": results}
