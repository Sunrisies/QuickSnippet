import { useState, useMemo, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import Fuse from "fuse.js";
import type { Script, ExecutionResult } from "../types";

// ---------- Search Hook ----------
function useSearch(scripts: Script[], query: string) {
  const fuse = useMemo(
    () =>
      new Fuse(scripts, {
        keys: [
          { name: "name", weight: 0.7 },
          { name: "content", weight: 0.3 },
        ],
        threshold: 0.4,
        minMatchCharLength: 1,
      }),
    [scripts],
  );

  return useMemo(() => {
    if (!query.trim()) return scripts;
    return fuse.search(query).map((r) => r.item);
  }, [fuse, query, scripts]);
}

// ---------- Language Display ----------
const LANG_LABELS: Record<string, string> = {
  powershell: "PowerShell",
  cmd: "CMD",
  bash: "Bash",
};

const LANG_COLORS: Record<string, string> = {
  powershell: "var(--lang-powershell)",
  cmd: "var(--lang-cmd)",
  bash: "var(--lang-bash)",
};

// ---------- Component ----------
interface Props {
  onEditScript: (id: string | null) => void;
}

export default function ScriptList({ onEditScript }: Props) {
  const [scripts, setScripts] = useState<Script[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchScripts = useCallback(async () => {
    try {
      const list = await invoke<Script[]>("list_scripts");
      setScripts(list);
    } catch (e) {
      console.error("加载脚本列表失败:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchScripts();
  }, [fetchScripts]);

  const filtered = useSearch(scripts, searchQuery);
  const selectedScript = scripts.find((s) => s.id === selectedId) ?? null;

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await invoke("delete_script", { id });
        if (selectedId === id) {
          setSelectedId(null);
          setResult(null);
        }
        fetchScripts();
      } catch (e) {
        console.error("删除脚本失败:", e);
      }
    },
    [selectedId, fetchScripts],
  );

  const handleExecute = useCallback(async () => {
    if (!selectedScript) return;
    setExecuting(true);
    setResult(null);
    try {
      const res = await invoke<ExecutionResult>("execute_script", {
        content: selectedScript.content,
        language: selectedScript.language,
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
  }, [selectedScript]);

  const selected = selectedScript;

  return (
    <div className="script-list-layout">
      {/* ── 左侧：搜索 + 列表 ── */}
      <div className="script-list-panel">
        <div className="script-list-header">
          <h2>脚本列表</h2>
          <button className="btn btn-primary" onClick={() => onEditScript(null)}>
            + 新建
          </button>
        </div>

        <div className="search-bar">
          <input
            type="text"
            placeholder="搜索脚本名称或内容…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoFocus
          />
          {searchQuery && (
            <span className="search-count">
              {filtered.length}/{scripts.length}
            </span>
          )}
        </div>

        <div className="script-cards">
          {loading ? (
            <div className="empty-state">加载中…</div>
          ) : filtered.length === 0 ? (
            <div className="empty-state">
              {searchQuery ? "没有匹配的脚本" : "还没有脚本，点击上方新建"}
            </div>
          ) : (
            filtered.map((s) => (
              <div
                key={s.id}
                className={`script-card ${selectedId === s.id ? "active" : ""}`}
                onClick={() => {
                  setSelectedId(s.id);
                  setResult(null);
                }}
              >
                <div className="script-card-top">
                  <span className="script-name">{s.name}</span>
                  <span
                    className="lang-badge"
                    style={{
                      backgroundColor: LANG_COLORS[s.language] || "var(--text-dim)",
                    }}
                  >
                    {LANG_LABELS[s.language] || s.language}
                  </span>
                </div>
                <div className="script-card-preview">{s.content.slice(0, 80)}</div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── 右侧：详情 + 执行 ── */}
      <div className="script-detail-panel">
        {selected ? (
          <>
            <div className="detail-header">
              <h3>{selected.name}</h3>
              <div className="detail-actions">
                <button
                  className="btn btn-secondary"
                  onClick={() => onEditScript(selected.id)}
                >
                  编辑
                </button>
                <button
                  className="btn btn-danger"
                  onClick={() => {
                    if (confirm("确定要删除该脚本吗？")) handleDelete(selected.id);
                  }}
                >
                  删除
                </button>
              </div>
            </div>

            <div className="detail-meta">
              <span
                className="lang-badge"
                style={{
                  backgroundColor:
                    LANG_COLORS[selected.language] || "var(--text-dim)",
                }}
              >
                {LANG_LABELS[selected.language] || selected.language}
              </span>
              <span className="meta-time">
                更新于 {new Date(selected.updated_at).toLocaleString()}
              </span>
            </div>

            <pre className="detail-content">{selected.content}</pre>

            <div className="execute-bar">
              <button
                className="btn btn-execute"
                onClick={handleExecute}
                disabled={executing}
              >
                {executing ? "执行中…" : "▶ 执行"}
              </button>
            </div>

            {/* ── 输出面板 ── */}
            {result && (
              <div className="output-panel">
                <div className="output-header">
                  <span>
                    退出码: {result.exit_code} &middot;{" "}
                    {result.elapsed_ms}ms
                  </span>
                  <button
                    className="btn btn-sm"
                    onClick={() => setResult(null)}
                  >
                    关闭
                  </button>
                </div>
                <div className="output-body">
                  {result.stdout && (
                    <div className="output-section">
                      <div className="output-label">标准输出</div>
                      <pre
                        className={`output-text ${result.exit_code === 0 ? "" : "output-error"}`}
                      >
                        {result.stdout}
                      </pre>
                    </div>
                  )}
                  {result.stderr && (
                    <div className="output-section">
                      <div className="output-label">错误输出</div>
                      <pre className="output-text output-error">
                        {result.stderr}
                      </pre>
                    </div>
                  )}
                  {!result.stdout && !result.stderr && (
                    <div className="output-text output-empty">
                      （无输出）
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="empty-state detail-empty">
            从左侧选择一个脚本，或新建一个脚本
          </div>
        )}
      </div>
    </div>
  );
}
