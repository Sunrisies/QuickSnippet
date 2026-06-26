import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Script } from "../types";

interface Props {
  editId: string | null; // null = 新建
  onBack: () => void;
}

const LANGUAGES = [
  { value: "powershell", label: "PowerShell" },
  { value: "cmd", label: "CMD" },
  { value: "bash", label: "Bash" },
];

export default function ScriptEditor({ editId, onBack }: Props) {
  const isNew = editId === null;
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [language, setLanguage] = useState("powershell");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!isNew);
  const [error, setError] = useState("");

  useEffect(() => {
    if (editId) {
      invoke<Script>("get_script", { id: editId })
        .then((s) => {
          setName(s.name);
          setContent(s.content);
          setLanguage(s.language);
        })
        .catch((e) => setError(String(e)))
        .finally(() => setLoading(false));
    }
  }, [editId]);

  const handleSave = useCallback(async () => {
    if (!name.trim()) {
      setError("请输入脚本名称");
      return;
    }
    if (!content.trim()) {
      setError("请输入脚本内容");
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (isNew) {
        await invoke("add_script", { name: name.trim(), content, language });
      } else {
        await invoke("update_script", {
          id: editId,
          name: name.trim(),
          content,
          language,
        });
      }
      onBack();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }, [isNew, editId, name, content, language, onBack]);

  if (loading) {
    return <div className="editor-loading">加载中…</div>;
  }

  return (
    <div className="editor-page">
      <div className="editor-header">
        <button className="btn btn-secondary" onClick={onBack}>
          ← 返回
        </button>
        <h2>{isNew ? "新建脚本" : "编辑脚本"}</h2>
        <button
          className="btn btn-primary"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? "保存中…" : "保存"}
        </button>
      </div>

      {error && <div className="editor-error">{error}</div>}

      <div className="editor-form">
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="script-name">名称</label>
            <input
              id="script-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="脚本名称"
              autoFocus
            />
          </div>
          <div className="form-group">
            <label htmlFor="script-lang">语言</label>
            <select
              id="script-lang"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
            >
              {LANGUAGES.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="form-group">
          <label htmlFor="script-content">脚本内容</label>
          <textarea
            id="script-content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="在此输入脚本内容…"
            rows={18}
            spellCheck={false}
          />
        </div>
      </div>
    </div>
  );
}
