"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useWorkspaceStore, type Layer } from "@/lib/workspace-store";

const SOURCE_ID = (id: number) => `layer-${id}`;
const FILL_LAYER_ID = (id: number) => `layer-${id}-fill`;
const OUTLINE_LAYER_ID = (id: number) => `layer-${id}-outline`;

function addLayerToMap(map: maplibregl.Map, layer: Layer) {
  if (layer.layer_type !== "vector" || !layer.file_url) return;

  const sourceId = SOURCE_ID(layer.id);
  const fillId = FILL_LAYER_ID(layer.id);
  const outlineId = OUTLINE_LAYER_ID(layer.id);

  if (!map.getSource(sourceId)) {
    map.addSource(sourceId, { type: "geojson", data: layer.file_url });
  }

  if (!map.getLayer(fillId)) {
    map.addLayer({
      id: fillId,
      type: "fill",
      source: sourceId,
      paint: { "fill-color": "#1b6b3a", "fill-opacity": 0.4 },
    });
  }

  if (!map.getLayer(outlineId)) {
    map.addLayer({
      id: outlineId,
      type: "line",
      source: sourceId,
      paint: { "line-color": "#1b6b3a", "line-width": 1 },
    });
  }

  const visibility = layer.visible ? "visible" : "none";
  map.setLayoutProperty(fillId, "visibility", visibility);
  map.setLayoutProperty(outlineId, "visibility", visibility);
}

function removeLayerFromMap(map: maplibregl.Map, layerId: number) {
  const fillId = FILL_LAYER_ID(layerId);
  const outlineId = OUTLINE_LAYER_ID(layerId);
  const sourceId = SOURCE_ID(layerId);

  if (map.getLayer(outlineId)) map.removeLayer(outlineId);
  if (map.getLayer(fillId)) map.removeLayer(fillId);
  if (map.getSource(sourceId)) map.removeSource(sourceId);
}

function syncLayersToMap(map: maplibregl.Map, layers: Layer[]) {
  const liveLayerIds = new Set(layers.map((l) => l.id));

  layers.forEach((layer) => {
    if (layer.layer_type !== "vector" || !layer.file_url) return;
    if (map.loaded()) {
      addLayerToMap(map, layer);
    } else {
      map.once("load", () => addLayerToMap(map, layer));
    }
  });

  const removable: number[] = [];
  map.getStyle()?.layers?.forEach((styleLayer) => {
    const match = /^layer-(\d+)(?:-fill|-outline)?$/.exec(styleLayer.id);
    if (match) {
      const id = Number(match[1]);
      if (!liveLayerIds.has(id)) removable.push(id);
    }
  });
  removable.forEach((id) => removeLayerFromMap(map, id));
}

export default function MapView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const layers = useWorkspaceStore((s) => s.layers);
  const toggleLayerVisibility = useWorkspaceStore((s) => s.toggleLayerVisibility);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: "https://tiles.openfreemap.org/styles/liberty",
      center: [8.6753, 9.0820],
      zoom: 5,
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const onStyleLoaded = () => syncLayersToMap(map, layers);
    if (map.loaded() || map.isStyleLoaded()) {
      onStyleLoaded();
    } else {
      map.once("styledata", onStyleLoaded);
      map.once("load", onStyleLoaded);
      return () => {
        map.off("styledata", onStyleLoaded);
        map.off("load", onStyleLoaded);
      };
    }
  }, [layers]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      <div className="absolute bottom-3 left-3 z-10 max-h-[60%] overflow-y-auto rounded-lg border border-(--color-border) bg-white/90 p-2 shadow-sm backdrop-blur">
        <p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">
          Layers
        </p>
        {layers.length === 0 && (
          <p className="text-xs text-slate-400">No layers</p>
        )}
        {layers.map((layer) => (
          <div
            key={layer.id}
            className="flex items-center gap-2 rounded px-2 py-1 text-xs hover:bg-slate-100"
          >
            <button
              type="button"
              onClick={() => toggleLayerVisibility(layer.id)}
              className="flex-shrink-0"
              aria-label={layer.visible ? "Hide layer" : "Show layer"}
            >
              {layer.visible ? (
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="text-slate-700"
                >
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              ) : (
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="text-slate-400"
                >
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-10-8a18.45 18.45 0 0 1 5.06-5.94" />
                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              )}
            </button>
            <span className={layer.visible ? "text-slate-800" : "text-slate-400"}>
              {layer.name}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
