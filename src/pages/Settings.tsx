import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save, open, message } from "@tauri-apps/plugin-dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

interface Props {
  onBack: () => void;
  onDataChanged?: () => void;
}

export default function Settings({ onBack, onDataChanged }: Props) {
  const [autostart, setAutostart] = useState(false);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState<"success" | "error" | "info">("info");

  useEffect(() => {
    invoke<boolean>("get_autostart")
      .then((v) => { setAutostart(v); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const showMsg = (text: string, type: "success" | "error" | "info" = "info") => {
    setMsg(text);
    setMsgType(type);
  };

  const handleToggle = useCallback(async () => {
    const next = !autostart;
    setMsg("");
    try {
      await invoke("set_autostart", { enabled: next });
      setAutostart(next);
      showMsg(next ? "已启用开机自启" : "已禁用开机自启", "success");
    } catch (e) { showMsg(String(e), "error"); }
  }, [autostart]);

  // ── 导出 ──
  const handleExport = useCallback(async () => {
    try {
      const path = await save({
        defaultPath: `QuickSnippet-export-${new Date().toISOString().slice(0, 10)}.json`,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!path) return;
      setExporting(true);
      showMsg("正在导出…", "info");
      const json = await invoke<string>("export_data");
      await invoke("write_text_file", { path, content: json });
      showMsg("✓ 导出成功", "success");
    } catch (e) {
      showMsg(`✗ 导出失败: ${e}`, "error");
    } finally {
      setExporting(false);
    }
  }, []);

  // ── 导入 ──
  const handleImport = useCallback(async () => {
    try {
      const path = await open({
        filters: [{ name: "JSON", extensions: ["json"] }],
        multiple: false,
      });
      if (!path) return;

      const ok = await message("导入将追加数据到当前库中。同名文件夹会合并，同名的代码片段会重复添加。\n\n确定继续导入？", {
        title: "确认导入",
        kind: "warning",
        okLabel: "确定导入",
        cancelLabel: "取消",
      });
      if (!ok) return;

      setImporting(true);
      showMsg("正在导入…", "info");
      const json = await invoke<string>("read_text_file", { path });
      const result = await invoke<[number, number]>("import_data", { json });
      showMsg(`✓ 导入成功：${result[0]} 个文件夹，${result[1]} 条代码片段`, "success");
      onDataChanged?.();
    } catch (e) {
      showMsg(`✗ 导入失败: ${e}`, "error");
    } finally {
      setImporting(false);
    }
  }, [onDataChanged]);

  return (
    <div className="h-full flex flex-col p-5">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="sm" onClick={onBack}>← 返回</Button>
        <h2 className="text-lg font-semibold">设置</h2>
      </div>

      <div className="max-w-md space-y-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">加载中…</p>
        ) : (
          <>
            <div className="flex items-center justify-between rounded-lg border border-border p-4 bg-card">
              <div>
                <p className="text-sm font-medium">开机自动启动</p>
                <p className="text-xs text-muted-foreground mt-0.5">启用后 Scripter 在系统启动时自动运行</p>
              </div>
              <Switch checked={autostart} onCheckedChange={handleToggle} />
            </div>
          </>
        )}

        {/* ── 数据导入导出 ── */}
        <div className="rounded-lg border border-border p-4 bg-card">
          <p className="text-sm font-medium mb-3">数据管理</p>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={handleExport} disabled={exporting}>
              {exporting ? "导出中…" : "导出数据"}
            </Button>
            <Button variant="secondary" size="sm" onClick={handleImport} disabled={importing}>
              {importing ? "导入中…" : "导入数据"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            导出为 JSON 格式，支持导入备份和跨设备迁移
          </p>
        </div>

        {msg && (
          <p className={`text-sm ${msgType === "error" ? "text-destructive" : msgType === "success" ? "text-green-600" : "text-muted-foreground"}`}>
            {msg}
          </p>
        )}
      </div>

      <div className="mt-auto pt-6 text-center text-xs text-muted-foreground">
        <p>QuickSnippet v0.1.1 &middot; 基于 Tauri + Rust</p>
      </div>
    </div>
  );
}
