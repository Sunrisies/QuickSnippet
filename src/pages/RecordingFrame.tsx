import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import "../index.css";

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

const PAD = 30;   // 与 lib.rs 中的 PAD 保持一致
const CORNER = 30; // 角标尺寸
const BAR_H = 48;  // 底部控制栏高度

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

  const isRecording = status === "recording";
  const clr = isRecording ? "#ef4444" : "#7c3aed";

  return (
    <div style={{
      width: "100%", height: "100%", position: "relative",
    }}
      className="border border-red-400"

    >
      <div
        className="border border-black-400 absolute"> {/* 录制区域 — 纯透明，无 UI 元素，位于 PAD 边距内 */}
        < div style={{
          position: "absolute",
          top: PAD, left: PAD, right: PAD, bottom: PAD + BAR_H,
        }
        }>
          {/* 错误提示 */}
          {
            status === "error" && (
              <div style={{
                position: "absolute", top: "6px", left: "50%", transform: "translateX(-50%)",
                background: "rgba(239,68,68,0.9)", color: "#fff",
                borderRadius: "8px", padding: "4px 12px",
                fontSize: "11px", zIndex: 10,
              }}>
                {errorMsg}
              </div>
            )
          }
        </div >

        {/* 左上角 — 右/下臂朝录制区 */}
        <div style={{
          position: "absolute", top: PAD - CORNER, left: PAD - CORNER,
          width: CORNER, height: CORNER,
          borderTop: "4px solid", borderLeft: "4px solid",
          borderColor: clr, pointerEvents: "none",
        }} />
        {/* 右上角 */}
        <div style={{
          position: "absolute", top: PAD - CORNER, right: PAD - CORNER,
          width: CORNER, height: CORNER,
          borderTop: "4px solid", borderRight: "4px solid",
          borderColor: clr, pointerEvents: "none",
        }} />
        {/* 左下角 — right/up 朝录制区 */}
        <div style={{
          position: "absolute", bottom: PAD + BAR_H - CORNER, left: PAD - CORNER,
          width: CORNER, height: CORNER,
          borderBottom: "4px solid", borderLeft: "4px solid",
          borderColor: clr, pointerEvents: "none",
        }} />
        {/* 右下角 */}
        <div style={{
          position: "absolute", bottom: PAD + BAR_H - CORNER, right: PAD - CORNER,
          width: CORNER, height: CORNER,
          borderBottom: "4px solid", borderRight: "4px solid",
          borderColor: clr, pointerEvents: "none",
        }} />

        <div className="border border-red-400 left-[4px] absolute"></div>

      </div>


      {/* 底部控制栏 */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0,
        height: BAR_H,
        background: "rgba(0,0,0,0.3)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        gap: "8px", padding: "0 12px",
      }}>
        <button style={{ ...btn, color: "rgba(255,255,255,0.7)", background: "transparent" }}
          onClick={handleReselect}>重新规划</button>
        <div style={{ width: "1px", height: "16px", background: "rgba(255,255,255,0.15)" }} />

        {status === "recording" ? (
          <button style={{
            ...btn, color: "#fff",
            background: "linear-gradient(90deg, #ef4444, #dc2626)",
            display: "flex", alignItems: "center", gap: "6px",
          }}
            onClick={handleStop}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#fff", display: "inline-block" }} />
            {fmt(elapsed)}
            <span style={{ fontWeight: 600 }}>停止</span>
          </button>
        ) : (
          <button style={{
            ...btn, color: "#fff",
            background: status === "error"
              ? "linear-gradient(90deg, #52525b, #52525b)"
              : "linear-gradient(90deg, #7c3aed, #6366f1)",
          }}
            disabled={status === "error"}
            onClick={handleStart}>
            {status === "error" ? "出错" : "开始录制"}
          </button>
        )}
      </div>
    </div >
  );
}
