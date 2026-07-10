import { Button } from "@/components/ui/button";
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useState } from "react";
import {
  Code2, Settings as SettingsIcon, Image, Folder as FolderIcon,
  FolderOpen, Plus, Pencil, Trash2
} from "lucide-react";
import ScriptEditor from "./pages/ScriptEditor";
import ScriptList from "./pages/ScriptList";
import Settings from "./pages/Settings";
import UploadHistory from "./pages/UploadHistory";
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

  const navItems = [
    { id: "list" as PageView, icon: Code2, label: "代码" },
    { id: "settings" as PageView, icon: SettingsIcon, label: "设置" },
    { id: "history" as PageView, icon: Image, label: "上传" },
  ];

  return (
    <div className="flex h-screen bg-gradient-to-br from-zinc-50 to-zinc-100/60">
      {/* ── 侧边栏 ── */}
      <aside className="w-52 shrink-0 bg-white border-r border-zinc-200/70 flex flex-col shadow-sm">
        {/* Logo */}
        <div className="px-5 pt-5 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center shadow-sm">
              <span className="text-white text-xs font-bold">QK</span>
            </div>
            <span className="text-base font-bold text-zinc-800 tracking-tight">QuickKit</span>
          </div>
        </div>

        {/* 导航 */}
        <nav className="flex flex-col gap-0.5 px-3 mb-3">
          {navItems.map(({ id, icon: Icon, label }) => (
            <Button
              key={id}
              variant={view === id ? "default" : "ghost"}
              className={`justify-start gap-2.5 h-9 text-sm font-normal ${
                view === id
                  ? "bg-gradient-to-r from-violet-500/10 to-indigo-500/10 text-violet-700 border border-violet-200/50 shadow-sm"
                  : "text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100"
              }`}
              onClick={() => setView(id)}
            >
              <Icon className="w-4 h-4" />
              {label}
            </Button>
          ))}
        </nav>

        {/* 文件夹标题 */}
        <div className="px-4 mb-1.5 flex items-center justify-between">
          <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-widest">文件夹</span>
          <button
            className="w-5 h-5 flex items-center justify-center rounded-md text-zinc-400 hover:text-violet-600 hover:bg-violet-50 transition-colors"
            onClick={handleCreateFolder}
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* 文件夹列表 */}
        <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-0.5">
          {/* 全部 */}
          <div
            onClick={() => { setSelectedFolderId(null); setView("list"); }}
            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer text-xs transition-all ${
              selectedFolderId === null
                ? "bg-violet-50 text-violet-700 font-medium border border-violet-200/50"
                : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-700 border border-transparent"
            }`}
          >
            <FolderOpen className="w-3.5 h-3.5 shrink-0" />
            全部
          </div>
          {/* 各文件夹 */}
          {folders.map((f) => (
            <div key={f.id} className="group flex items-center gap-1">
              {renamingId === f.id ? (
                <input
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={() => handleRenameFolder(f.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRenameFolder(f.id);
                    if (e.key === "Escape") setRenamingId(null);
                  }}
                  className="flex-1 h-7 px-2 text-xs rounded-lg border border-violet-300 bg-white outline-none shadow-sm"
                  autoFocus
                />
              ) : (
                <div
                  onClick={() => { setSelectedFolderId(f.id); setView("list"); }}
                  className={`flex-1 flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer text-xs transition-all ${
                    selectedFolderId === f.id
                      ? "bg-violet-50 text-violet-700 font-medium border border-violet-200/50"
                      : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-700 border border-transparent"
                  }`}
                >
                  <FolderIcon className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{f.name}</span>
                </div>
              )}
              {renamingId !== f.id && (
                <div className="hidden group-hover:flex gap-0.5 pr-1">
                  <button
                    className="w-5 h-5 flex items-center justify-center rounded text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors"
                    onClick={() => { setRenamingId(f.id); setRenameValue(f.name); }}
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button
                    className="w-5 h-5 flex items-center justify-center rounded text-zinc-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                    onClick={() => handleDeleteFolder(f.id)}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
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
        {view === "history" && <UploadHistory />}
      </main>
    </div>
  );
}

export default App;
