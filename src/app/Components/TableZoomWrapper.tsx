"use client";

import { ReactNode, useEffect, useState } from "react";
import { Minus, Plus } from "lucide-react";

type TableZoomWrapperProps = {
  storageKey: string;
  children: ReactNode;
  defaultZoom?: number;
  minZoom?: number;
  maxZoom?: number;
  step?: number;
};

function clampZoom(value: number, minZoom: number, maxZoom: number) {
  return Math.min(maxZoom, Math.max(minZoom, value));
}

export default function TableZoomWrapper({
  storageKey,
  children,
  defaultZoom = 1,
  minZoom = 0.75,
  maxZoom = 1.5,
  step = 0.1,
}: TableZoomWrapperProps) {
  const [zoom, setZoom] = useState(defaultZoom);
  const [hasLoadedStoredZoom, setHasLoadedStoredZoom] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`table-zoom:${storageKey}`);
      if (!raw) return;
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) return;
      setZoom(clampZoom(parsed, minZoom, maxZoom));
    } catch {
    }
    setHasLoadedStoredZoom(true);
  }, [storageKey, minZoom, maxZoom]);

  useEffect(() => {
    if (!hasLoadedStoredZoom) return;
    try {
      localStorage.setItem(`table-zoom:${storageKey}`, String(zoom));
    } catch {
    }
  }, [storageKey, zoom, hasLoadedStoredZoom]);

  function changeZoom(nextZoom: number) {
    setZoom(clampZoom(nextZoom, minZoom, maxZoom));
  }

  function handleWheel(event: React.WheelEvent<HTMLDivElement>) {
    if (!event.ctrlKey) return;
    event.preventDefault();
    changeZoom(zoom + (event.deltaY < 0 ? step : -step));
  }

  return (
    <div className="space-y-3" onWheel={handleWheel}>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#e5dcc7] bg-white/90 px-4 py-3 shadow-sm">
        <div>
          <div className="text-sm font-semibold text-black">Table Zoom</div>
          <div className="text-xs text-gray-500">Use Ctrl + scroll or the buttons to fit more rows and columns on screen.</div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => changeZoom(zoom - step)}
            className="h-9 w-9 rounded-xl border bg-white flex items-center justify-center text-black hover:bg-gray-50"
            aria-label="Zoom out"
            title="Zoom out"
          >
            <Minus className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() => changeZoom(defaultZoom)}
            className="px-3 py-2 rounded-xl border bg-white text-black text-xs font-semibold hover:bg-gray-50"
            title="Reset zoom"
          >
            {Math.round(zoom * 100)}%
          </button>

          <button
            type="button"
            onClick={() => changeZoom(zoom + step)}
            className="h-9 w-9 rounded-xl border bg-white flex items-center justify-center text-black hover:bg-gray-50"
            aria-label="Zoom in"
            title="Zoom in"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div style={{ zoom }} className="origin-top-left">
        {children}
      </div>
    </div>
  );
}