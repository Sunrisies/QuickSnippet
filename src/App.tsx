import { useState } from "react";
import type { PageView } from "./types";
import ScriptList from "./pages/ScriptList";
import ScriptEditor from "./pages/ScriptEditor";
import Settings from "./pages/Settings";
import "./App.css";

function App() {
  const [view, setView] = useState<PageView>("list");
  const [editId, setEditId] = useState<string | null>(null);

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
            onClick={async () => {
              const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
              const win = await WebviewWindow.getByLabel("quicklaunch");
              if (win) {
                win.show();
                win.setFocus();
              }
            }}
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
