import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

type Status = "idle" | "recording" | "error";

const btn = {
  fontSize: "12px",
  fontWeight: 500,
  padding: "6px 12px",
  borderRadius: "6px",
  border: "none",
  cursor: "pointer",
  transition: "all 0.15s",
} as const;

function fmt(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function RecordingFrame() {
  const [status, setStatus] = useState<Status>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const startTimeRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const un1 = listen("recording-started", () => {
      startTimeRef.current = Date.now();
      setElapsed(0);
      setStatus("recording");
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);
    });
    const un2 = listen("recording-error", (e: any) => {
      setErrorMsg(String(e.payload));
      setStatus("error");
    });
    const un3 = listen("recording-stopped", () => {
      if (timerRef.current) clearInterval(timerRef.current);
      setStatus("idle");
      setElapsed(0);
    });
    return () => {
      un1.then((fn) => fn());
      un2.then((fn) => fn());
      un3.then((fn) => fn());
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const handleStart = useCallback(() => {
    setStatus("recording");
    invoke("start_recording");
  }, []);

  const handleStop = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    invoke("stop_recording");
  }, []);

  const handleReselect = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    invoke("open_region_selector");
    getCurrentWebviewWindow().close();
  }, []);

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      {/* 四边边框 */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "2px", background: status === "recording" ? "linear-gradient(90deg, #ef4444, #f97316)" : "linear-gradient(90deg, #7c3aed, #6366f1)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "2px", background: status === "recording" ? "linear-gradient(90deg, #f97316, #ef4444)" : "linear-gradient(90deg, #6366f1, #7c3aed)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: "2px", background: status === "recording" ? "linear-gradient(180deg, #ef4444, #f97316)" : "linear-gradient(180deg, #7c3aed, #6366f1)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", top: 0, bottom: 0, right: 0, width: "2px", background: status === "recording" ? "linear-gradient(180deg, #f97316, #ef4444)" : "linear-gradient(180deg, #6366f1, #7c3aed)", pointerEvents: "none" }} />

      {/* 录制中 → 顶部计时器 */}
      {status === "recording" && (
        <div style={{
          position: "absolute", top: "6px", left: "50%", transform: "translateX(-50%)",
          background: "rgba(239,68,68,0.9)", color: "#fff",
          borderRadius: "20px", padding: "2px 10px",
          fontSize: "11px", fontWeight: 600, fontFamily: "monospace",
          display: "flex", alignItems: "center", gap: "5px",
          zIndex: 10,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#fff", display: "inline-block" }} />
          {fmt(elapsed)}
        </div>
      )}

      {/* 错误提示 */}
      {status === "error" && (
        <div style={{
          position: "absolute", top: "6px", left: "50%", transform: "translateX(-50%)",
          background: "rgba(239,68,68,0.9)", color: "#fff",
          borderRadius: "8px", padding: "4px 12px",
          fontSize: "11px", zIndex: 10,
        }}>
          {errorMsg}
        </div>
      )}

      {/* 底部操作栏 */}
      <div style={{
        position: "absolute", bottom: "8px", left: "50%", transform: "translateX(-50%)",
        display: "flex", alignItems: "center", gap: "8px",
        background: "rgba(255,255,255,0.95)", backdropFilter: "blur(8px)",
        borderRadius: "12px", padding: "8px 12px",
        boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
        border: "1px solid #e4e4e7",
        zIndex: 10,
      }}>
        <button style={{ ...btn, color: "#52525b", background: "transparent" }}
          onClick={handleReselect}>重新规划</button>
        <div style={{ width: "1px", height: "16px", background: "#e4e4e7" }} />

        {status === "recording" ? (
          <button style={{ ...btn, color: "#fff", background: "linear-gradient(90deg, #ef4444, #dc2626)" }}
            onClick={handleStop}>
            ■ 停止录制
          </button>
        ) : (
          <button style={{ ...btn, color: "#fff", background: status === "error" ? "linear-gradient(90deg, #a1a1aa, #a1a1aa)" : "linear-gradient(90deg, #7c3aed, #6366f1)" }}
            disabled={status === "error"}
            onClick={handleStart}>
            {status === "error" ? "出错" : "开始录制"}
          </button>
        )}
      </div>
    </div>
  );
}
