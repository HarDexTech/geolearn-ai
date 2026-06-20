from fastapi import APIRouter, Depends, HTTPException, Query
from pystac_client import Client as StacClient
import planetary_computer

from auth import get_data_user_id_with_rate_limit

router = APIRouter(prefix="/api/data", tags=["data"])


async def _search_planetary_computer(
    query: str,
    bbox: list[float],
    date_range: tuple[str, str] | None,
) -> list[dict]:
    collection_map = {
        "sentinel": ["sentinel-2-l2a"],
        "landsat": ["landsat-c2-l2"],
        "elevation": ["cop-dem-glo-30"],
        "dem": ["cop-dem-glo-30"],
    }
    q = query.lower()
    collections: list[str] = []
    for keyword, colls in collection_map.items():
        if keyword in q:
            collections.extend(colls)
    if not collections:
        collections = ["sentinel-2-l2a"]

    try:
        catalog = StacClient.open(
            "https://planetarycomputer.microsoft.com/api/stac/v1",
            modifier=planetary_computer.sign_inplace,
        )
        search = catalog.search(
            collections=collections,
            bbox=bbox,
            max_items=8,
            datetime=f"{date_range[0]}/{date_range[1]}" if date_range else None,
        )
        items = search.item_collection()
    except Exception:
        return []

    results = []
    for item in items:
        thumbnail = None
        for asset in item.assets.values():
            if asset.roles and "thumbnail" in asset.roles:
                thumbnail = asset.href
                break

        results.append(
            {
                "id": item.id,
                "name": item.id,
                "source": "planetary_computer",
                "collection": item.collection_id,
                "layer_type": "raster",
                "bbox": item.bbox or [0, 0, 0, 0],
                "date": str(item.datetime.date()) if item.datetime else None,
                "cloud_cover": item.properties.get("eo:cloud_cover"),
                "thumbnail": thumbnail,
                "metadata": {
                    "bands": list(item.assets.keys()),
                    "crs": item.properties.get("proj:epsg"),
                },
            }
        )
    return results


_GRID3_DATASETS = [
    {
        "id": "grid3-nga-admin-boundaries",
        "name": "Nigeria Administrative Boundaries (LGA level)",
        "source": "grid3",
        "layer_type": "vector",
        "bbox": [2.6, 4.2, 14.7, 13.9],
        "date": "2022",
        "thumbnail": None,
        "metadata": {"levels": ["national", "state", "lga"]},
        "download_url": "https://data.grid3.org/maps/GRID3::nigeria-lga-boundaries",
    },
    {
        "id": "grid3-nga-health-facilities",
        "name": "Nigeria Health Care Facilities",
        "source": "grid3",
        "layer_type": "vector",
        "bbox": [2.6, 4.2, 14.7, 13.9],
        "date": "2022",
        "thumbnail": None,
        "metadata": {},
        "download_url": "https://data.grid3.org/maps/GRID3::nigeria-health-care-facilities",
    },
    {
        "id": "grid3-nga-settlements",
        "name": "Nigeria Settlement Extents",
        "source": "grid3",
        "layer_type": "vector",
        "bbox": [2.6, 4.2, 14.7, 13.9],
        "date": "2022",
        "thumbnail": None,
        "metadata": {},
        "download_url": "https://data.grid3.org/maps/GRID3::nga-settlement-extents-v3-4",
    },
]


def _search_grid3(query: str) -> list[dict]:
    q = query.lower().strip()
    if not q:
        return list(_GRID3_DATASETS)
    matched = []
    for ds in _GRID3_DATASETS:
        for val in ds.values():
            if q in str(val).lower():
                matched.append(ds)
                break
    return matched


@router.get("/search", responses={429: {"description": "Too many data search requests"}})
async def search_data(
    q: str = Query(min_length=1, max_length=200),
    bbox: str = Query(default="2.6,4.2,14.7,13.9"),
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    _current_user_id: str = Depends(get_data_user_id_with_rate_limit),
):
    try:
        parts = [float(x) for x in bbox.split(",")]
        if len(parts) != 4:
            raise ValueError
    except (ValueError, AttributeError):
        raise HTTPException(422, "bbox must be minx,miny,maxx,maxy")
    bbox_list = parts

    date_range = (date_from, date_to) if date_from and date_to else None

    import asyncio

    pc_results = await asyncio.gather(
        _search_planetary_computer(q, bbox_list, date_range),
        return_exceptions=True,
    )

    all_results: list[dict] = []
    for result in pc_results:
        if isinstance(result, list):
            all_results.extend(result)

    all_results.extend(_search_grid3(q))

    return {"count": len(all_results), "results": all_results}
