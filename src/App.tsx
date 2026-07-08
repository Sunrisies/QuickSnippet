import { Button } from "@/components/ui/button";
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useState } from "react";
import ScriptEditor from "./pages/ScriptEditor";
import ScriptList from "./pages/ScriptList";
import Settings from "./pages/Settings";
import type { Folder, PageView } from "./types";

function App() {
  const [view, setView] = useState<PageView>("list");
  const [editId, setEditId] = useState<string | null>(null);
  const [editFolderId, setEditFolderId] = useState<string | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const fetchFolders = useCallback(async () => {
    try {
      const list = await invoke<Folder[]>("list_folders");
      setFolders(list);
    } catch (e) {
      console.error("加载文件夹失败:", e);
    }
  }, []);

  useEffect(() => {
    fetchFolders();
    invoke("close_splash");
  }, [fetchFolders]);



  const handleCreateFolder = async () => {
    const name = prompt("文件夹名称：");
    if (name?.trim()) {
      await invoke("create_folder", { name: name.trim() });
      fetchFolders();
    }
  };

  const handleRenameFolder = async (id: string) => {
    if (renameValue.trim()) {
      await invoke("rename_folder", { id, name: renameValue.trim() });
      setRenamingId(null);
      fetchFolders();
    }
  };

  const handleDeleteFolder = async (id: string) => {
    if (confirm("删除文件夹后其中的代码片段将变为未分类，确定删除？")) {
      await invoke("delete_folder", { id });
      if (selectedFolderId === id) setSelectedFolderId(null);
      fetchFolders();
    }
  };

  return (
    <div className="flex h-screen bg-background">
      {/* ── 侧边栏 ── */}
      <aside className="w-44 shrink-0 bg-sidebar border-r border-border flex flex-col">
        <div className="px-5 pt-5 pb-4">
          <h1 className="text-lg font-bold text-primary">QuickSnippet</h1>
        </div>

        {/* 导航按钮 */}
        <nav className="flex flex-col gap-1 px-2 mb-2">
          <Button variant={view === "list" ? "default" : "ghost"} className="justify-start gap-2" onClick={() => setView("list")}>
            <span>📜</span> 代码
          </Button>
          <Button variant={view === "settings" ? "default" : "ghost"} className="justify-start gap-2" onClick={() => setView("settings")}>
            <span>⚙️</span> 设置
          </Button>
        </nav>

        {/* 文件夹列表 */}
        <div className="px-2 mb-1 flex items-center justify-between">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">文件夹</span>
          <Button size="sm" variant="ghost" className="h-5 w-5 p-0 text-muted-foreground" onClick={handleCreateFolder}>+</Button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 space-y-0.5">
          {/* 全部 */}
          <div
            onClick={() => setSelectedFolderId(null)}
            className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md cursor-pointer text-xs transition-colors ${selectedFolderId === null ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted text-muted-foreground"
              }`}
          >
            <span>📁</span> 全部
          </div>
          {/* 各文件夹 */}
          {folders.map((f) => (
            <div key={f.id} className="group flex items-center gap-1">
              {renamingId === f.id ? (
                <input
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={() => handleRenameFolder(f.id)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleRenameFolder(f.id); if (e.key === "Escape") setRenamingId(null); }}
                  className="flex-1 h-6 px-1.5 text-xs rounded border border-primary bg-background outline-none"
                  autoFocus
                />
              ) : (
                <div
                  onClick={() => setSelectedFolderId(f.id)}
                  className={`flex-1 flex items-center gap-2 px-2.5 py-1.5 rounded-md cursor-pointer text-xs transition-colors ${selectedFolderId === f.id ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted text-muted-foreground"
                    }`}
                >
                  <span>📂</span>
                  <span className="truncate">{f.name}</span>
                </div>
              )}
              {renamingId !== f.id && (
                <div className="hidden group-hover:flex gap-0.5 mr-1">
                  <button className="text-[10px] text-muted-foreground hover:text-foreground px-0.5" onClick={() => { setRenamingId(f.id); setRenameValue(f.name); }}>✏️</button>
                  <button className="text-[10px] text-muted-foreground hover:text-destructive px-0.5" onClick={() => handleDeleteFolder(f.id)}>🗑️</button>
                </div>
              )}
            </div>
          ))}
        </div>


      </aside>

      {/* ── 主内容 ── */}
      <main className="flex-1 overflow-hidden">
        {view === "list" && (
          <ScriptList
            folderId={selectedFolderId}
            folders={folders}
            onEditSnippet={(id, folderId) => { setEditId(id); setEditFolderId(folderId); setView("editor"); }}
          />
        )}
        {view === "editor" && (
          <ScriptEditor
            editId={editId}
            initialFolderId={editFolderId}
            folders={folders}
            onBack={() => { setView("list"); fetchFolders(); }}
          />
        )}
        {view === "settings" && <Settings onBack={() => setView("list")} onDataChanged={fetchFolders} />}
      </main>
    </div>
  );
}

export default App;
