from fastapi import APIRouter, Query

router = APIRouter(prefix="/api", tags=["datasets"])

DATASETS = [
    {
        "id": "ng-admin-boundaries",
        "name": "Nigeria Administrative Boundaries",
        "description": "National and state-level administrative boundaries for Nigeria.",
        "source": "GRID3",
        "category": "administrative",
        "download_url": "https://data.grid3.org/",
    },
    {
        "id": "ng-landuse-ondo",
        "name": "Ondo State Land Use",
        "description": "Land cover classification for Ondo State including urban and agricultural classes.",
        "source": "NASRDA",
        "category": "land-use",
        "download_url": "https://nasrda.gov.ng/",
    },
    {
        "id": "ng-dem-lagos",
        "name": "Lagos Elevation Model (DEM)",
        "description": "Digital elevation model for Lagos and surrounding coastal areas.",
        "source": "USGS EarthExplorer",
        "category": "raster",
        "download_url": "https://earthexplorer.usgs.gov/",
    },
    {
        "id": "ng-rainfall-indices",
        "name": "Nigeria Rainfall Indices",
        "description": "Station and gridded rainfall records for Nigerian climate analysis.",
        "source": "NiMet",
        "category": "climate",
        "download_url": "https://nimet.gov.ng/",
    },
    {
        "id": "ng-flood-risk-niger",
        "name": "Niger Flood Risk Zones",
        "description": "Flood hazard zones around River Niger corridor.",
        "source": "NEMA",
        "category": "hazard",
        "download_url": "https://nema.gov.ng/",
    },
    {
        "id": "ng-transport-road-network",
        "name": "Nigeria Road Network",
        "description": "Primary and secondary road network dataset for Nigeria.",
        "source": "OpenStreetMap",
        "category": "transport",
        "download_url": "https://download.geofabrik.de/africa/nigeria.html",
    },
    {
        "id": "ng-pop-density-2024",
        "name": "Nigeria Population Density 2024",
        "description": "Population density raster for demographic and accessibility studies.",
        "source": "WorldPop",
        "category": "demography",
        "download_url": "https://www.worldpop.org/",
    },
    {
        "id": "ng-soil-type",
        "name": "Nigeria Soil Type Map",
        "description": "National soil type polygons for agricultural suitability analysis.",
        "source": "FAO",
        "category": "environment",
        "download_url": "https://www.fao.org/soils-portal/",
    },
    {
        "id": "ng-hydrography",
        "name": "Nigeria Hydrography",
        "description": "River and stream network data for hydrological modeling.",
        "source": "HydroSHEDS",
        "category": "hydrology",
        "download_url": "https://www.hydrosheds.org/",
    },
    {
        "id": "ng-sentinel-imagery",
        "name": "Nigeria Sentinel-2 Imagery",
        "description": "Recent multispectral satellite imagery for Nigerian AOIs.",
        "source": "Copernicus Open Access Hub",
        "category": "satellite",
        "download_url": "https://dataspace.copernicus.eu/",
    },
]


@router.get("/datasets")
def list_datasets(
    query: str | None = Query(default=None),
    category: str | None = Query(default=None),
) -> dict[str, object]:
    filtered = DATASETS

    if query:
        q = query.strip().lower()
        filtered = [
            item
            for item in filtered
            if q in item["name"].lower()
            or q in item["description"].lower()
            or q in item["source"].lower()
        ]

    if category:
        c = category.strip().lower()
        filtered = [item for item in filtered if item["category"].lower() == c]

    return {"count": len(filtered), "datasets": filtered}
