import { useState, useMemo, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Script, ExecutionResult } from "../types";
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
        let matchCount = 0;
        let nameMatch = 0;
        for (const w of words) {
          if (name.includes(w)) { matchCount++; nameMatch++; }
          else if (content.includes(w)) matchCount++;
        }
        if (matchCount < words.length) return null;
        // 分数：名称匹配越多越靠前
        return { script: s, score: nameMatch / words.length };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => b.score - a.score)
      .map((r) => r.script);
  }, [scripts, query]);
}

const langLabel = (v: string) => LANGUAGES.find((l) => l.value === v)?.label || v;

interface Props {
  onEditSnippet: (id: string | null) => void;
}

export default function ScriptList({ onEditSnippet }: Props) {
  const [snippets, setSnippets] = useState<Script[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSnippets = useCallback(async () => {
    try {
      const list = await invoke<Script[]>("list_scripts");
      setSnippets(list);
    } catch (e) {
      console.error("加载代码列表失败:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSnippets();
  }, [fetchSnippets]);

  const filtered = useSearch(snippets, searchQuery);
  const selected = snippets.find((s) => s.id === selectedId) ?? null;

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await invoke("delete_script", { id });
        if (selectedId === id) {
          setSelectedId(null);
          setResult(null);
        }
        fetchSnippets();
      } catch (e) {
        console.error("删除失败:", e);
      }
    },
    [selectedId, fetchSnippets],
  );

  const handleCopy = useCallback(
    async (content: string) => {
      try {
        await invoke("copy_to_clipboard", { text: content });
      } catch (e) {
        console.error("复制失败:", e);
      }
    },
    [],
  );

  const handleExecute = useCallback(async () => {
    if (!selected) return;
    setExecuting(true);
    setResult(null);
    try {
      const res = await invoke<ExecutionResult>("execute_script", {
        content: selected.content,
        language: selected.language,
      });
      setResult(res);
    } catch (e) {
      setResult({
        stdout: "",
        stderr: String(e),
        exit_code: -1,
        elapsed_ms: 0,
      });
    } finally {
      setExecuting(false);
    }
  }, [selected]);

  return (
    <div className="flex h-full">
      {/* ── 左侧列表 ── */}
      <div className="w-80 shrink-0 border-r border-border flex flex-col">
        <div className="flex items-center justify-between px-4 pt-4 pb-3">
          <h2 className="text-sm font-semibold">代码片段</h2>
          <Button size="sm" onClick={() => onEditSnippet(null)}>
            + 新增
          </Button>
        </div>

        <div className="px-3 pb-3">
          <Input
            placeholder="搜索代码…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 text-xs"
          />
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1">
          {loading ? (
            <p className="text-xs text-muted-foreground text-center py-8">加载中…</p>
          ) : filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">
              {searchQuery ? "没有匹配的代码" : "还没有代码片段，点击上方新增"}
            </p>
          ) : (
            filtered.map((s) => (
              <div
                key={s.id}
                onClick={() => {
                  setSelectedId(s.id);
                  setResult(null);
                }}
                className={`rounded-md px-3 py-2 cursor-pointer transition-colors ${
                  selectedId === s.id
                    ? "bg-primary/10 border border-primary/30"
                    : "hover:bg-muted border border-transparent"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium truncate flex-1">{s.name}</span>
                  <Badge className={LANG_STYLES[s.language] || "bg-zinc-100 text-zinc-500"}>
                    {langLabel(s.language)}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground truncate mt-0.5 font-mono">
                  {s.content.slice(0, 80)}
                </p>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── 右侧详情 ── */}
      <div className="flex-1 flex flex-col p-5 overflow-hidden">
        {selected ? (
          <>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-semibold">{selected.name}</h3>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => handleCopy(selected.content)}>
                  复制
                </Button>
                <Button size="sm" variant="secondary" onClick={() => onEditSnippet(selected.id)}>
                  编辑
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    if (confirm("确定删除？")) handleDelete(selected.id);
                  }}
                >
                  删除
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-3 mb-3 text-xs text-muted-foreground">
              <Badge className={LANG_STYLES[selected.language] || "bg-zinc-100 text-zinc-500"}>
                {langLabel(selected.language)}
              </Badge>
              <span>更新于 {new Date(selected.updated_at).toLocaleString()}</span>
            </div>

            {/* 语法高亮代码视图 */}
            <div className="flex-1 overflow-auto border border-border rounded-lg mb-3">
              <SyntaxHighlight code={selected.content} language={selected.language} className="p-4 m-0" />
            </div>

            <div className="flex gap-2 mb-3">
              <Button size="sm" variant="secondary" onClick={() => handleCopy(selected.content)}>
                复制代码
              </Button>
              <Button size="sm" onClick={handleExecute} disabled={executing}>
                {executing ? "执行中…" : "▶ 运行"}
              </Button>
            </div>

            {result && (
              <div className="border border-border rounded-lg overflow-hidden bg-card">
                <div className="flex items-center justify-between px-3 py-2 bg-muted/50 text-xs text-muted-foreground">
                  <span>
                    退出码: {result.exit_code} · {result.elapsed_ms}ms
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => setResult(null)}>
                    关闭
                  </Button>
                </div>
                <div className="max-h-48 overflow-y-auto divide-y divide-border">
                  {result.stdout && (
                    <div className="px-3 py-2">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">
                        标准输出
                      </p>
                      <pre className="text-xs font-mono whitespace-pre-wrap">{result.stdout}</pre>
                    </div>
                  )}
                  {result.stderr && (
                    <div className="px-3 py-2">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">
                        错误输出
                      </p>
                      <pre className="text-xs font-mono whitespace-pre-wrap text-destructive">
                        {result.stderr}
                      </pre>
                    </div>
                  )}
                  {!result.stdout && !result.stderr && (
                    <p className="text-xs text-muted-foreground text-center py-4">（无输出）</p>
                  )}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            从左侧选择一个代码片段
          </div>
        )}
      </div>
    </div>
  );
}
