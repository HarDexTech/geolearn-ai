"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useWorkspaceStore } from "@/lib/workspace-store";

export default function MapView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const layers = useWorkspaceStore((s) => s.layers);
  const toggleLayerVisibility = useWorkspaceStore((s) => s.toggleLayerVisibility);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: "https://demotiles.maplibre.org/style.json",
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
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
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
