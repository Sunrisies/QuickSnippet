import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import Fuse from "fuse.js";
import type { Script } from "../types";
import { LANG_STYLES } from "../types";

const langShort = (v: string) => {
  const m: Record<string, string> = {
    javascript: "JS", typescript: "TS", python: "Py", go: "Go", rust: "Rs",
    java: "Java", kotlin: "Kt", csharp: "C#", cpp: "C++", sql: "SQL",
    html: "HTML", css: "CSS", json: "JSON", yaml: "YAML", markdown: "MD",
    bash: "Bash", powershell: "PS", cmd: "CMD", dockerfile: "Dkr",
    plaintext: "TxT",
  };
  return m[v] || v.slice(0, 3).toUpperCase();
};

export default function QuickLaunchWindow() {
  const [scripts, setScripts] = useState<Script[]>([]);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    invoke<Script[]>("list_scripts").then(setScripts).catch(console.error);
    setTimeout(() => inputRef.current?.focus(), 80);
  }, []);

  // 失焦隐藏
  useEffect(() => {
    const onBlur = () => getCurrentWindow().hide().catch(() => {});
    window.addEventListener("blur", onBlur);
    return () => window.removeEventListener("blur", onBlur);
  }, []);

  const fuse = useMemo(
    () =>
      new Fuse(scripts, {
        keys: [{ name: "name", weight: 0.7 }, { name: "content", weight: 0.3 }],
        threshold: 0.4,
        minMatchCharLength: 1,
      }),
    [scripts],
  );

  const results = useMemo(() => {
    if (!query.trim()) return scripts;
    return fuse.search(query).map((r) => r.item);
  }, [fuse, query, scripts]);

  useEffect(() => { setSelectedIndex(0); }, [query]);

  useEffect(() => {
    const el = listRef.current?.children[selectedIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const copyAndClose = useCallback(async (script: Script) => {
    try {
      await invoke("copy_to_clipboard", { text: script.content });
      setCopiedId(script.id);
      await new Promise((r) => setTimeout(r, 150));
      await getCurrentWindow().hide();
    } catch (e) {
      console.error("复制失败:", e);
    }
  }, []);

  const hideWindow = useCallback(() => {
    getCurrentWindow().hide().catch(() => {});
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "Escape":
          hideWindow();
          break;
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((prev) => Math.max(prev - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (results[selectedIndex]) copyAndClose(results[selectedIndex]);
          break;
      }
    },
    [results, selectedIndex, copyAndClose, hideWindow],
  );

  return (
    <div className="h-full flex flex-col bg-white rounded-xl shadow-2xl border border-zinc-200 overflow-hidden">
      {/* 搜索框 */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-200">
        <svg className="w-4 h-4 text-zinc-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8" />
          <path d="M21 21l-4.35-4.35" />
        </svg>
        <input
          ref={inputRef}
          className="flex-1 border-none bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-400"
          placeholder="搜索脚本…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          spellCheck={false}
          autoComplete="off"
        />
        <kbd className="text-[10px] text-zinc-400 bg-zinc-100 px-1.5 py-0.5 rounded border border-zinc-200">
          Ctrl+P
        </kbd>
      </div>

      {/* 结果列表 */}
      <div ref={listRef} className="flex-1 overflow-y-auto px-2 py-1.5 space-y-0.5">
        {results.length === 0 ? (
          <p className="text-xs text-zinc-400 text-center py-8">
            {query ? "没有匹配的脚本" : "输入关键词搜索脚本"}
          </p>
        ) : (
          results.map((script, i) => (
            <div
              key={script.id}
              onClick={() => copyAndClose(script)}
              onMouseEnter={() => setSelectedIndex(i)}
              className={`relative rounded-lg px-3 py-2 cursor-pointer transition-colors ${
                i === selectedIndex
                  ? "bg-indigo-50"
                  : "hover:bg-zinc-50"
              } ${copiedId === script.id ? "bg-emerald-50" : ""}`}
            >
              <div className="flex items-center gap-2 mb-0.5">
                <span className={`text-sm font-medium truncate flex-1 ${i === selectedIndex ? "text-indigo-900" : "text-zinc-800"}`}>
                  {script.name}
                </span>
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${LANG_STYLES[script.language] || "bg-zinc-100 text-zinc-500"}`}>
                  {langShort(script.language)}
                </span>
              </div>
              <p className={`text-xs truncate font-mono ${i === selectedIndex ? "text-indigo-600" : "text-zinc-400"}`}>
                {script.content.slice(0, 100)}
              </p>
              {copiedId === script.id && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-emerald-600 animate-[qlw-pop_0.2s_ease]">
                  ✓ 已复制
                </span>
              )}
            </div>
          ))
        )}
      </div>

      {/* 底部提示 */}
      <div className="flex gap-4 px-4 py-2 border-t border-zinc-200 text-[10px] text-zinc-400">
        <span>↑↓ 选择</span>
        <span>↵ 复制并关闭</span>
        <span>Esc 关闭</span>
      </div>
    </div>
  );
}
