import { useState, useRef, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
}

export default function RegionSelector() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [end, setEnd] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const region: Region | null = start && end
    ? {
        x: Math.min(start.x, end.x),
        y: Math.min(start.y, end.y),
        w: Math.abs(end.x - start.x),
        h: Math.abs(end.y - start.y),
      }
    : null;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (!region || region.w < 5 || region.h < 5) return;

    ctx.clearRect(region.x, region.y, region.w, region.h);

    ctx.strokeStyle = "#7c3aed";
    ctx.lineWidth = 2;
    ctx.strokeRect(region.x, region.y, region.w, region.h);

    const cl = 8;
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2.5;
    [[0,0],[1,0],[0,1],[1,1]].forEach(([dx, dy]) => {
      const rx = dx ? region.x + region.w : region.x;
      const ry = dy ? region.y + region.h : region.y;
      ctx.beginPath();
      ctx.moveTo(rx + (dx ? -cl : cl), ry);
      ctx.lineTo(rx, ry);
      ctx.lineTo(rx, ry + (dy ? -cl : cl));
      ctx.stroke();
    });

    const label = `${region.w} × ${region.h}`;
    ctx.font = "13px system-ui, sans-serif";
    ctx.fillStyle = "rgba(124, 58, 237, 0.9)";
    const tw = ctx.measureText(label).width;
    const lx = region.x + region.w / 2 - tw / 2 - 6;
    const ly = region.y - 16;
    const ph = 22;
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(lx, ly, tw + 12, ph, 4);
      ctx.fill();
    } else {
      ctx.fillRect(lx, ly, tw + 12, ph);
    }
    ctx.fillStyle = "#fff";
    ctx.fillText(label, lx + 6, ly + 15);
  }, [region]);

  useEffect(() => { draw(); }, [draw]);

  const handleMouseDown = (e: React.MouseEvent) => {
    setStart({ x: e.clientX, y: e.clientY });
    setEnd({ x: e.clientX, y: e.clientY });
    setDragging(true);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragging) return;
    setEnd({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = () => setDragging(false);

  const handleConfirm = async () => {
    if (!region || region.w < 10 || region.h < 10) return;
    await invoke("set_selected_region", { region });
    invoke("close_region_selector");
  };

  const handleCancel = () => {
    invoke("close_region_selector");
  };

  const regionRef = useRef(region);
  regionRef.current = region;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        invoke("close_region_selector");
      }
      if (e.key === "Enter") {
        const r = regionRef.current;
        if (r && r.w >= 10 && r.h >= 10) {
          invoke("set_selected_region", { region: r }).then(() => invoke("close_region_selector"));
        }
      }
    };
    window.addEventListener("keydown", onKey);
    const root = document.querySelector('#region-root') as HTMLElement | null;
    if (root) { root.setAttribute('tabindex', '0'); root.focus(); }
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const handleDivKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") invoke("close_region_selector");
  };

  return (
    <div
      className="fixed inset-0 cursor-crosshair select-none bg-transparent outline-none"
      tabIndex={-1}
      onKeyDown={handleDivKeyDown}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      <canvas ref={canvasRef} className="absolute inset-0" />

      {region && region.w >= 10 && region.h >= 10 && !dragging && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-white/90 backdrop-blur-sm rounded-xl px-4 py-2.5 shadow-lg border border-zinc-200">
          <span className="text-xs text-zinc-500 font-medium">
            {region.w} × {region.h}
          </span>
          <div className="w-px h-4 bg-zinc-200" />
          <button className="text-xs font-medium text-zinc-600 hover:text-zinc-800 px-2 py-1 rounded-md hover:bg-zinc-100 transition-colors" onClick={handleCancel}>
            取消 (Esc)
          </button>
          <button className="text-xs font-medium text-white bg-gradient-to-r from-violet-500 to-indigo-500 px-3 py-1.5 rounded-md hover:shadow-md transition-shadow" onClick={handleConfirm}>
            确认 (Enter)
          </button>
        </div>
      )}
    </div>
  );
}
