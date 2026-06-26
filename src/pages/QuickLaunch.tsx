import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import Fuse from "fuse.js";
import type { Script } from "../types";

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function QuickLaunch({ open, onClose }: Props) {
  const [scripts, setScripts] = useState<Script[]>([]);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // 打开时加载脚本列表
  useEffect(() => {
    if (open) {
      invoke<Script[]>("list_scripts").then(setScripts).catch(console.error);
      setQuery("");
      setSelectedIndex(0);
      setCopiedId(null);
      // 自动聚焦
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

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

  // 复制到剪贴板
  const copyScript = useCallback(
    async (script: Script) => {
      try {
        await invoke("copy_to_clipboard", { text: script.content });
        setCopiedId(script.id);
        setTimeout(() => onClose(), 400);
      } catch (e) {
        console.error("复制失败:", e);
      }
    },
    [onClose],
  );

  // 键盘事件
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "Escape":
          onClose();
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
            copyScript(results[selectedIndex]);
          }
          break;
      }
    },
    [onClose, results, selectedIndex, copyScript],
  );

  if (!open) return null;

  return (
    <div className="ql-overlay" onClick={onClose}>
      <div
        className="ql-panel"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* 输入框 */}
        <div className="ql-input-wrap">
          <span className="ql-icon">🔍</span>
          <input
            ref={inputRef}
            className="ql-input"
            type="text"
            placeholder="搜索脚本，回车复制内容到剪贴板…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <span className="ql-hint">Ctrl+P</span>
        </div>

        {/* 结果列表 */}
        <div className="ql-results" ref={listRef}>
          {results.length === 0 ? (
            <div className="ql-empty">没有匹配的脚本</div>
          ) : (
            results.map((script, i) => (
              <div
                key={script.id}
                className={`ql-item ${i === selectedIndex ? "ql-item-active" : ""} ${copiedId === script.id ? "ql-item-copied" : ""}`}
                onClick={() => copyScript(script)}
                onMouseEnter={() => setSelectedIndex(i)}
              >
                <div className="ql-item-top">
                  <span className="ql-item-name">{script.name}</span>
                  <span
                    className="ql-item-lang"
                    data-lang={script.language}
                  >
                    {script.language === "powershell"
                      ? "PS"
                      : script.language === "cmd"
                        ? "CMD"
                        : "Bash"}
                  </span>
                </div>
                <div className="ql-item-preview">
                  {script.content.slice(0, 100)}
                </div>
                {copiedId === script.id && (
                  <div className="ql-item-check">✓ 已复制!</div>
                )}
              </div>
            ))
          )}
        </div>

        {/* 底部提示 */}
        <div className="ql-footer">
          <span>↑↓ 选择</span>
          <span>↵ 复制</span>
          <span>Esc 关闭</span>
        </div>
      </div>
    </div>
  );
}
