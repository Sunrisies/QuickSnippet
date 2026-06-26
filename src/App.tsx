import { useState, useEffect } from "react";
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

  // 来自 Rust 全局快捷键 Ctrl+P 的事件
  useEffect(() => {
    const unlisten = listen("toggle-quicklaunch", () => {
      setQlOpen(true);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // 仅阻止 WebView 的 Ctrl+P 打印行为 + Esc 关闭
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "p") {
        e.preventDefault(); // 阻止打印对话框
      }
      if (e.key === "Escape") {
        setQlOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handleEditScript = (id: string | null) => {
    setEditId(id);
    setView("editor");
  };

  const handleBackToList = () => {
    setView("list");
  };

  // QuickLaunch 打开时只显示浮层，隐藏主界面
  if (qlOpen) {
    return <QuickLaunch open={qlOpen} onClose={() => setQlOpen(false)} />;
  }

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
            <span className="ql-shortcut">Ctrl+P</span>
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
    </div>
  );
}

export default App;
