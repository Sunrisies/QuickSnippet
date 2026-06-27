import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Script } from "../types";
import { LANGUAGES } from "../types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Props {
  editId: string | null;
  onBack: () => void;
}

export default function ScriptEditor({ editId, onBack }: Props) {
  const isNew = editId === null;
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [language, setLanguage] = useState("javascript");
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
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        加载中…
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-5">
      {/* 顶栏 */}
      <div className="flex items-center gap-3 mb-4">
        <Button variant="ghost" size="sm" onClick={onBack}>
          ← 返回
        </Button>
        <h2 className="text-lg font-semibold flex-1">
          {isNew ? "新建脚本" : "编辑脚本"}
        </h2>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "保存中…" : "保存"}
        </Button>
      </div>

      {error && (
        <div className="bg-destructive/10 text-destructive text-sm px-3 py-2 rounded-md mb-3">
          {error}
        </div>
      )}

      {/* 表单 */}
      <div className="flex-1 flex flex-col gap-4">
        <div className="flex gap-4">
          <div className="flex-1 space-y-1.5">
            <label className="text-xs text-muted-foreground font-medium">名称</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="脚本名称"
            />
          </div>
          <div className="w-36 space-y-1.5">
            <label className="text-xs text-muted-foreground font-medium">语言</label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {LANGUAGES.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex-1 space-y-1.5 flex flex-col">
          <label className="text-xs text-muted-foreground font-medium">脚本内容</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="在此输入脚本内容…"
            spellCheck={false}
            className="flex-1 w-full rounded-lg border border-input bg-background p-4 text-sm font-mono leading-relaxed resize-none outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors placeholder:text-muted-foreground"
          />
        </div>
      </div>
    </div>
  );
}
