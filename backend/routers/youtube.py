import os

import httpx
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException, Query

from auth import get_current_user_id

load_dotenv()

router = APIRouter(prefix="/api", tags=["youtube"])

YOUTUBE_SEARCH_URL = "https://www.googleapis.com/youtube/v3/search"


@router.get("/youtube")
async def youtube(
    query: str = Query(min_length=2, max_length=120),
    current_user_id: str = Depends(get_current_user_id),
) -> dict[str, object]:
    api_key = os.getenv("YOUTUBE_API_KEY")
    if not api_key or api_key == "your_youtube_api_key_here":
        raise HTTPException(status_code=500, detail="YOUTUBE_API_KEY is not configured.")

    params = {
        "part": "snippet",
        "q": f"{query} GIS tutorial Nigeria",
        "maxResults": 3,
        "type": "video",
        "key": api_key,
    }

    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            response = await client.get(YOUTUBE_SEARCH_URL, params=params)
    except httpx.TimeoutException as exc:
        raise HTTPException(status_code=504, detail="YouTube API request timed out.") from exc
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=502,
            detail="Unable to fetch videos from YouTube right now.",
        ) from exc

    if response.status_code != 200:
        status = 429 if response.status_code == 403 else 502
        detail = (
            "YouTube quota limit reached. Please try again later."
            if status == 429
            else "Unable to fetch videos from YouTube right now."
        )
        raise HTTPException(status_code=status, detail=detail)

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
