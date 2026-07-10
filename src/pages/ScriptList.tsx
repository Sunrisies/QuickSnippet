import { useState, useMemo, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Search, Play, Copy, Edit3, Trash2, Plus, X, FileCode, FolderOpen } from "lucide-react";
import type { Script, Folder, ExecutionResult } from "../types";
import { LANGUAGES, LANG_STYLES } from "../types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import SyntaxHighlight from "@/components/SyntaxHighlight";

function useSearch(scripts: Script[], query: string) {
  return useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return scripts;
    return scripts
      .map((s) => {
        const name = s.name.toLowerCase();
        const content = s.content.toLowerCase();
        let matchCount = 0, nameMatch = 0;
        for (const w of words) {
          if (name.includes(w)) { matchCount++; nameMatch++; }
          else if (content.includes(w)) matchCount++;
        }
        if (matchCount < words.length) return null;
        return { script: s, score: nameMatch / words.length };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => b.score - a.score)
      .map((r) => r.script);
  }, [scripts, query]);
}

const langLabel = (v: string) => LANGUAGES.find((l) => l.value === v)?.label || v;

interface Props {
  folderId: string | null;
  folders: Folder[];
  onEditSnippet: (id: string | null, folderId: string | null) => void;
}

export default function ScriptList({ folderId, folders, onEditSnippet }: Props) {
  const [snippets, setSnippets] = useState<Script[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSnippets = useCallback(async () => {
    try {
      const list = await invoke<Script[]>("list_scripts", { folderId });
      setSnippets(list);
    } catch (e) {
      console.error("加载代码列表失败:", e);
    } finally {
      setLoading(false);
    }
  }, [folderId]);

  useEffect(() => { fetchSnippets(); }, [fetchSnippets]);

  const filtered = useSearch(snippets, searchQuery);
  const selected = snippets.find((s) => s.id === selectedId) ?? null;

  const handleDelete = useCallback(async (id: string) => {
    try {
      await invoke("delete_script", { id });
      if (selectedId === id) { setSelectedId(null); setResult(null); }
      fetchSnippets();
    } catch (e) { console.error("删除失败:", e); }
  }, [selectedId, fetchSnippets]);

  const handleCopy = useCallback(async (content: string) => {
    try { await invoke("copy_to_clipboard", { text: content }); } catch (e) { console.error("复制失败:", e); }
  }, []);

  const handleExecute = useCallback(async () => {
    if (!selected) return;
    setExecuting(true);
    setResult(null);
    try {
      const res = await invoke<ExecutionResult>("execute_script", { content: selected.content, language: selected.language });
      setResult(res);
    } catch (e) {
      setResult({ stdout: "", stderr: String(e), exit_code: -1, elapsed_ms: 0 });
    } finally { setExecuting(false); }
  }, [selected]);

  const currentFolderName = folderId ? folders.find((f) => f.id === folderId)?.name : "全部";

  return (
    <div className="flex h-full">
      {/* 左侧列表 */}
      <div className="w-80 shrink-0 border-r border-zinc-200/70 flex flex-col bg-white">
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <div className="flex items-center gap-2">
            <FileCode className="w-4 h-4 text-violet-500" />
            <h2 className="text-sm font-semibold text-zinc-800">代码片段</h2>
            <span className="text-[10px] text-zinc-400 bg-zinc-100 px-1.5 py-0.5 rounded-full font-medium">{currentFolderName}</span>
          </div>
          <Button size="sm" className="h-7 text-xs gap-1" onClick={() => onEditSnippet(null, folderId)}>
            <Plus className="w-3 h-3" /> 新增
          </Button>
        </div>

        <div className="px-3 pb-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
            <Input placeholder="搜索代码…" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="h-8 text-xs pl-8 rounded-lg border-zinc-200 bg-zinc-50/50" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1">
          {loading ? (
            <p className="text-xs text-zinc-400 text-center py-12">加载中…</p>
          ) : filtered.length === 0 ? (
            <p className="text-xs text-zinc-400 text-center py-12">
              {searchQuery ? "没有匹配的代码" : "还没有代码片段，点击上方新增"}
            </p>
          ) : (
            filtered.map((s) => (
              <div
                key={s.id}
                onClick={() => { setSelectedId(s.id); setResult(null); }}
                className={`rounded-lg px-3 py-2.5 cursor-pointer transition-all shadow-card ${
                  selectedId === s.id
                    ? "bg-gradient-to-r from-violet-50 to-indigo-50 border border-violet-200/60 shadow-card-hover"
                    : "bg-white border border-zinc-200/60 hover:border-violet-200/40 hover:shadow-card-hover"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-zinc-800 truncate flex-1">{s.name}</span>
                  <Badge className={`${LANG_STYLES[s.language] || "bg-zinc-100 text-zinc-500"} text-[10px] px-1.5 py-0 rounded`}>
                    {langLabel(s.language)}
                  </Badge>
                </div>
                <p className="text-xs text-zinc-400 truncate mt-1 font-mono">{s.content.slice(0, 80)}</p>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 右侧详情 */}
      <div className="flex-1 flex flex-col p-5 overflow-hidden bg-zinc-50/30">
        {selected ? (
          <>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-base font-semibold text-zinc-800">{selected.name}</h3>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => handleCopy(selected.content)}>
                  <Copy className="w-3 h-3" /> 复制
                </Button>
                <Button size="sm" variant="secondary" className="h-7 text-xs gap-1" onClick={() => onEditSnippet(selected.id, selected.folder_id)}>
                  <Edit3 className="w-3 h-3" /> 编辑
                </Button>
                <Button size="sm" variant="destructive" className="h-7 text-xs gap-1" onClick={() => { if (confirm("确定删除？")) handleDelete(selected.id); }}>
                  <Trash2 className="w-3 h-3" /> 删除
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-3 mb-3 text-xs text-zinc-400">
              <Badge className={`${LANG_STYLES[selected.language] || "bg-zinc-100 text-zinc-500"} text-[10px]`}>
                {langLabel(selected.language)}
              </Badge>
              {selected.folder_id && (
                <span className="flex items-center gap-1">
                  <FolderOpen className="w-3 h-3" />
                  {folders.find((f) => f.id === selected.folder_id)?.name || "未分类"}
                </span>
              )}
              <span>更新于 {new Date(selected.updated_at).toLocaleString()}</span>
            </div>

            <div className="flex-1 overflow-auto bg-white border border-zinc-200/70 rounded-xl shadow-card">
              <SyntaxHighlight code={selected.content} language={selected.language} className="p-4 m-0" />
            </div>

            <div className="flex gap-2 mt-3">
              <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={() => handleCopy(selected.content)}>
                <Copy className="w-3.5 h-3.5" /> 复制代码
              </Button>
              <Button size="sm" className="h-8 text-xs gap-1" onClick={handleExecute} disabled={executing}>
                <Play className="w-3.5 h-3.5" /> {executing ? "执行中…" : "运行"}
              </Button>
            </div>

            {result && (
              <div className="mt-3 border border-zinc-200/70 rounded-xl overflow-hidden bg-white shadow-card">
                <div className="flex items-center justify-between px-4 py-2.5 bg-zinc-50 text-xs text-zinc-500 border-b border-zinc-100">
                  <span>退出码: {result.exit_code} · {result.elapsed_ms}ms</span>
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setResult(null)}>
                    <X className="w-3 h-3" />
                  </Button>
                </div>
                <div className="max-h-48 overflow-y-auto divide-y divide-zinc-100">
                  {result.stdout && <div className="px-4 py-3"><p className="text-[10px] text-zinc-400 uppercase tracking-wide mb-1.5 font-medium">标准输出</p><pre className="text-xs font-mono whitespace-pre-wrap text-zinc-700">{result.stdout}</pre></div>}
                  {result.stderr && <div className="px-4 py-3"><p className="text-[10px] text-zinc-400 uppercase tracking-wide mb-1.5 font-medium">错误输出</p><pre className="text-xs font-mono whitespace-pre-wrap text-red-500">{result.stderr}</pre></div>}
                  {!result.stdout && !result.stderr && <p className="text-xs text-zinc-400 text-center py-6">（无输出）</p>}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-zinc-400">
            <FileCode className="w-10 h-10 text-zinc-300" />
            <p className="text-sm">从左侧选择一个代码片段</p>
          </div>
        )}
      </div>
    </div>
  );
}
