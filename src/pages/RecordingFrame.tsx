import { useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

const btn = {
  fontSize: "12px",
  fontWeight: 500,
  padding: "6px 12px",
  borderRadius: "6px",
  border: "none",
  cursor: "pointer",
  transition: "all 0.15s",
} as const;

export default function RecordingFrame() {
  const handleStart = useCallback(() => {
    invoke("start_recording");
  }, []);
  const handleReselect = useCallback(() => {
    invoke("open_region_selector");
    getCurrentWebviewWindow().close();
  }, []);

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      {/* 四边框 */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "2px", background: "linear-gradient(90deg, #7c3aed, #6366f1)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "2px", background: "linear-gradient(90deg, #6366f1, #7c3aed)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: "2px", background: "linear-gradient(180deg, #7c3aed, #6366f1)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", top: 0, bottom: 0, right: 0, width: "2px", background: "linear-gradient(180deg, #6366f1, #7c3aed)", pointerEvents: "none" }} />

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
          onClick={handleReselect}>← 重新规划</button>
        <div style={{ width: "1px", height: "16px", background: "#e4e4e7" }} />
        <button style={{ ...btn, color: "#fff", background: "linear-gradient(90deg, #7c3aed, #6366f1)" }}
          onClick={handleStart}>开始录制</button>
      </div>
    </div>
  );
}
