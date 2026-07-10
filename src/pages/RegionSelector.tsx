import { useState, useRef, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

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

  const [confirmed, setConfirmed] = useState(false);
  const confirmedRgn = useRef<Region | null>(null);

  const drawBorder = useCallback((ctx: CanvasRenderingContext2D, r: Region) => {
    ctx.strokeStyle = "#7c3aed";
    ctx.lineWidth = 2;
    ctx.strokeRect(r.x, r.y, r.w, r.h);

    const cl = 8;
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2.5;
    [[0, 0], [1, 0], [0, 1], [1, 1]].forEach(([dx, dy]) => {
      const rx = dx ? r.x + r.w : r.x;
      const ry = dy ? r.y + r.h : r.y;
      ctx.beginPath();
      ctx.moveTo(rx + (dx ? -cl : cl), ry);
      ctx.lineTo(rx, ry);
      ctx.lineTo(rx, ry + (dy ? -cl : cl));
      ctx.stroke();
    });

    const label = `${r.w} × ${r.h}`;
    ctx.font = "13px system-ui, sans-serif";
    ctx.fillStyle = "rgba(124, 58, 237, 0.9)";
    const tw = ctx.measureText(label).width;
    const lx = r.x + r.w / 2 - tw / 2 - 6;
    const ly = r.y - 16;
    const ph = 22;
    ctx.fillRect(lx, ly, tw + 12, ph);
    ctx.fillStyle = "#fff";
    ctx.fillText(label, lx + 6, ly + 15);
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!confirmed) {
      ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    const r = (region && region.w >= 5 && region.h >= 5) ? region : (confirmed ? confirmedRgn.current : null);
    if (!r) return;

    if (!confirmed) {
      ctx.clearRect(r.x, r.y, r.w, r.h);
    }
    drawBorder(ctx, r);
  }, [region, confirmed, drawBorder]);

  useEffect(() => { draw(); }, [draw]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (confirmed) return; // 确认后禁止拖动
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
    confirmedRgn.current = region;
    try {
      // await invoke("set_selected_region", { region });

      await invoke("open_recording_frame", { region });

      // await invoke("close_region_selector");
    } catch (e) {
      console.error("确认选区失败:", e);
    }
  };

  const handleReselect = () => {
    setConfirmed(false);
    confirmedRgn.current = null;
    setStart(null);
    setEnd(null);
  };

  const handleCancel = () => {
    invoke("close_region_selector");
  };

  const handleStartRecording = async () => {
    try {
      await invoke("start_recording");
      await invoke("close_region_selector");
    } catch (e) {
      console.error("开始录制失败:", e);
    }
  };

  useEffect(() => {
    const onMouseUp = () => setDragging(false);
    window.addEventListener("mouseup", onMouseUp);
    return () => window.removeEventListener("mouseup", onMouseUp);
  }, []);

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
          invoke("set_selected_region", { region: r })
            .then(() => invoke("close_region_selector"));
        }
      }
      if (e.key === "I" && e.ctrlKey && e.shiftKey) {
        (getCurrentWebviewWindow() as any).openDevTools();
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
      translate="no"
      onKeyDown={handleDivKeyDown}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      <canvas ref={canvasRef} className="absolute inset-0" />

      {/* 确认后的工具栏 */}
      {confirmed && confirmedRgn.current && (
        <div
          className="absolute flex items-center gap-2 bg-white/95 backdrop-blur-sm rounded-xl px-3 py-2 shadow-lg border border-zinc-200 z-20"
          style={{ left: confirmedRgn.current.x + confirmedRgn.current.w / 2, top: confirmedRgn.current.y + confirmedRgn.current.h + 12, transform: "translateX(-50%)" }}
        >
          <button
            className="text-xs font-medium text-zinc-600 hover:text-zinc-800 px-2.5 py-1.5 rounded-md hover:bg-zinc-100 transition-colors"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={handleReselect}
          >
            ← 重新规划
          </button>
          <div className="w-px h-4 bg-zinc-200" />
          <button
            className="text-xs font-medium text-white bg-gradient-to-r from-violet-500 to-indigo-500 px-3 py-1.5 rounded-md hover:shadow-md transition-shadow"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={handleStartRecording}
          >
            开始录制
          </button>
        </div>
      )}

      {/* 确认前的操作栏 */}
      {region && region.w >= 10 && region.h >= 10 && !dragging && !confirmed && (
        <div
          className="absolute flex items-center gap-3 bg-white/90 backdrop-blur-sm rounded-xl px-4 py-2.5 shadow-lg border border-zinc-200 z-20"
          style={{ left: region.x + region.w / 2, top: region.y + region.h + 12, transform: "translateX(-50%)" }}
        >
          <span className="text-xs text-zinc-500 font-medium">
            {region.w} × {region.h}
          </span>
          <div className="w-px h-4 bg-zinc-200" />
          <button className="text-xs font-medium text-zinc-600 hover:text-zinc-800 px-2 py-1 rounded-md hover:bg-zinc-100 transition-colors" onMouseDown={(e) => e.stopPropagation()} onClick={handleCancel}>
            取消 (Esc)
          </button>
          <button className="text-xs font-medium text-white bg-gradient-to-r from-violet-500 to-indigo-500 px-3 py-1.5 rounded-md hover:shadow-md transition-shadow" onMouseDown={(e) => e.stopPropagation()} onClick={handleConfirm}>
            确认 (Enter)
          </button>
        </div>
      )}
    </div>
  );
}
