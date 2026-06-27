import { useState } from "react";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { PageView } from "./types";
import ScriptList from "./pages/ScriptList";
import ScriptEditor from "./pages/ScriptEditor";
import Settings from "./pages/Settings";
import { Button } from "@/components/ui/button";

function App() {
  const [view, setView] = useState<PageView>("list");
  const [editId, setEditId] = useState<string | null>(null);

  const openQuickLaunch = async () => {
    const win = await WebviewWindow.getByLabel("quicklaunch");
    if (win) {
      win.show();
      win.setFocus();
    }
  };

  return (
    <div className="flex h-screen bg-background">
      {/* ── 侧边栏 ── */}
      <aside className="w-44 shrink-0 bg-sidebar border-r border-border flex flex-col">
        <div className="px-5 pt-5 pb-4">
          <h1 className="text-lg font-bold text-primary">Scripter</h1>
        </div>

        <nav className="flex flex-col gap-1 px-2">
          <Button
            variant={view === "list" ? "default" : "ghost"}
            className="justify-start gap-2"
            onClick={() => setView("list")}
          >
            <span>📜</span> 代码
          </Button>
          <Button
            variant={view === "settings" ? "default" : "ghost"}
            className="justify-start gap-2"
            onClick={() => setView("settings")}
          >
            <span>⚙️</span> 设置
          </Button>
        </nav>

        <div className="flex-1" />

        <div className="px-2 pb-3">
          <Button variant="outline" className="w-full justify-start gap-2 text-xs" onClick={openQuickLaunch}>
            <span>⏩</span> 快速启动
            <kbd className="ml-auto text-[10px] text-muted-foreground bg-background px-1.5 py-0.5 rounded border border-border">
              Ctrl+P
            </kbd>
          </Button>
        </div>
      </aside>

      {/* ── 主内容 ── */}
      <main className="flex-1 overflow-hidden">
        {view === "list" && (
          <ScriptList onEditSnippet={(id) => { setEditId(id); setView("editor"); }} />
        )}
        {view === "editor" && (
          <ScriptEditor editId={editId} onBack={() => setView("list")} />
        )}
        {view === "settings" && <Settings onBack={() => setView("list")} />}
      </main>
    </div>
  );
}

export default App;
