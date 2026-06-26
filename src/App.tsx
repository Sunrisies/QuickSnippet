import { useState, useCallback, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import type { PageView } from "./types";
import ScriptList from "./pages/ScriptList";
import ScriptEditor from "./pages/ScriptEditor";
import Settings from "./pages/Settings";
import QuickLaunch from "./pages/QuickLaunch";
import "./App.css";

function App() {
  const [view, setView] = useState<PageView>("list");
  const [editId, setEditId] = useState<string | null>(null);
  const [qlOpen, setQlOpen] = useState(false);

  // 来自 Rust 全局快捷键的事件
  useEffect(() => {
    const unlisten = listen("toggle-quicklaunch", () => {
      setQlOpen(true);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Ctrl+P / Ctrl+Shift+P 应用内打开快速启动
  const handleGlobalKey = useCallback((e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "p") {
      e.preventDefault();
      setQlOpen((prev) => !prev);
    }
    if (e.key === "Escape") {
      setQlOpen(false);
    }
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", handleGlobalKey);
    return () => window.removeEventListener("keydown", handleGlobalKey);
  }, [handleGlobalKey]);

  const handleEditScript = (id: string | null) => {
    setEditId(id);
    setView("editor");
  };

  const handleBackToList = () => {
    setView("list");
  };

  return (
    <div className="app-container">
      {/* ── 侧边栏导航 ── */}
      <nav className="sidebar">
        <div className="sidebar-logo">Scripter</div>
        <div className="sidebar-nav">
          <button
            className={`sidebar-item ${view === "list" ? "active" : ""}`}
            onClick={() => setView("list")}
          >
            <span className="sidebar-icon">📜</span>
            脚本
          </button>
          <button
            className={`sidebar-item ${view === "settings" ? "active" : ""}`}
            onClick={() => setView("settings")}
          >
            <span className="sidebar-icon">⚙️</span>
            设置
          </button>
        </div>

        <div className="sidebar-spacer" />

        <div className="sidebar-footer">
          <button
            className="sidebar-item ql-trigger"
            onClick={() => setQlOpen(true)}
          >
            <span className="sidebar-icon">⏩</span>
            快速启动
            <span className="ql-shortcut">Ctrl+Shift+P</span>
          </button>
        </div>
      </nav>

      {/* ── 主内容区 ── */}
      <main className="main-content">
        {view === "list" && <ScriptList onEditScript={handleEditScript} />}
        {view === "editor" && (
          <ScriptEditor editId={editId} onBack={handleBackToList} />
        )}
        {view === "settings" && <Settings onBack={handleBackToList} />}
      </main>

      {/* ── 快速启动浮层 ── */}
      <QuickLaunch open={qlOpen} onClose={() => setQlOpen(false)} />
    </div>
  );
}

export default App;
