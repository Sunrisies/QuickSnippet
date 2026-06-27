import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import Fuse from "fuse.js";
import type { Script } from "../types";

const LANG_LABEL: Record<string, string> = {
  powershell: "PS",
  cmd: "CMD",
  bash: "Bash",
};

const LANG_COLOR: Record<string, string> = {
  powershell: "#2674b0",
  cmd: "#4d4d4d",
  bash: "#4eaa25",
};

export default function QuickLaunchWindow() {
  const [scripts, setScripts] = useState<Script[]>([]);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // 加载脚本列表
  useEffect(() => {
    invoke<Script[]>("list_scripts")
      .then(setScripts)
      .catch(console.error);
    // 自动聚焦
    setTimeout(() => inputRef.current?.focus(), 80);
  }, []);

  // 窗口失焦时关闭（点击外部）
  useEffect(() => {
    const onBlur = () => {
      getCurrentWindow().hide().catch(() => {});
    };
    window.addEventListener("blur", onBlur);
    return () => window.removeEventListener("blur", onBlur);
  }, []);

  // Fuse.js 模糊搜索
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

  const results = useMemo(() => {
    if (!query.trim()) return scripts;
    return fuse.search(query).map((r) => r.item);
  }, [fuse, query, scripts]);

  // 重置选中索引
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // 选中项滚动到视野
  useEffect(() => {
    const container = listRef.current;
    const selected = container?.children[selectedIndex] as HTMLElement | undefined;
    selected?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  // 复制并关闭
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

  // 关闭窗口
  const hideWindow = useCallback(() => {
    getCurrentWindow().hide().catch(() => {});
  }, []);

  // 键盘事件
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
          if (results[selectedIndex]) {
            copyAndClose(results[selectedIndex]);
          }
          break;
      }
    },
    [results, selectedIndex, copyAndClose, hideWindow],
  );

  return (
    <div className="qlw-container">
      {/* 搜索输入框 */}
      <div className="qlw-input-wrap">
        <svg className="qlw-search-icon" viewBox="0 0 24 24" fill="none" stroke="#71717a" strokeWidth="2">
          <circle cx="11" cy="11" r="8" />
          <path d="M21 21l-4.35-4.35" />
        </svg>
        <input
          ref={inputRef}
          className="qlw-input"
          type="text"
          placeholder="搜索脚本…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          spellCheck={false}
          autoComplete="off"
        />
        <span className="qlw-shortcut">Ctrl+P</span>
      </div>

      {/* 结果列表 */}
      <div className="qlw-results" ref={listRef}>
        {results.length === 0 ? (
          <div className="qlw-empty">
            {query ? "没有匹配的脚本" : "输入关键词搜索脚本"}
          </div>
        ) : (
          results.map((script, i) => (
            <div
              key={script.id}
              className={`qlw-item ${i === selectedIndex ? "qlw-item-active" : ""} ${copiedId === script.id ? "qlw-item-copied" : ""}`}
              onClick={() => copyAndClose(script)}
              onMouseEnter={() => setSelectedIndex(i)}
            >
              <div className="qlw-item-top">
                <span className="qlw-item-name">{script.name}</span>
                <span
                  className="qlw-item-lang"
                  style={{ backgroundColor: LANG_COLOR[script.language] || "#71717a" }}
                >
                  {LANG_LABEL[script.language] || script.language}
                </span>
              </div>
              <div className="qlw-item-preview">
                {script.content.slice(0, 100)}
              </div>
              {copiedId === script.id && (
                <div className="qlw-item-check">✓ 已复制</div>
              )}
            </div>
          ))
        )}
      </div>

      {/* 底部提示 */}
      <div className="qlw-footer">
        <span>↑↓ 选择</span>
        <span>↵ 复制并关闭</span>
        <span>Esc 关闭</span>
      </div>
    </div>
  );
}
