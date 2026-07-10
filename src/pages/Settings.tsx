import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save, open, message } from "@tauri-apps/plugin-dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import KeyCapture from "@/components/KeyCapture";

interface ShortcutInfo {
  action: string;
  shortcut: string;
  label: string;
}

interface CloudConfig {
  provider: string;
  endpoint: string;
  region: string;
  bucket: string;
  access_key: string;
  secret_key: string;
  domain: string;
}

const PROVIDERS = [
  { value: "qiniu", label: "七牛云 (Kodo)" },
  { value: "aliyun", label: "阿里云 (OSS)" },
  { value: "s3", label: "通用 S3" },
];

const PROVIDER_PLACEHOLDERS: Record<string, Partial<CloudConfig>> = {
  qiniu: {
    endpoint: "s3-cn-south-1.qiniucs.com",
    region: "cn-south-1",
    domain: "https://cdn.example.com",
  },
  aliyun: {
    endpoint: "oss-cn-hangzhou.aliyuncs.com",
    region: "cn-hangzhou",
    domain: "https://bucket-name.oss-cn-hangzhou.aliyuncs.com",
  },
  s3: {
    endpoint: "s3.amazonaws.com",
    region: "us-east-1",
    domain: "https://bucket.s3.amazonaws.com",
  },
};

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

  // ── 快捷键 ──
  const [shortcuts, setShortcuts] = useState<ShortcutInfo[]>([]);
  const [savingShortcuts, setSavingShortcuts] = useState<Record<string, boolean>>({});

  // ── 云存储 ──
  const [cloudConfig, setCloudConfig] = useState<CloudConfig>({
    provider: "qiniu",
    endpoint: "",
    region: "",
    bucket: "",
    access_key: "",
    secret_key: "",
    domain: "",
  });
  const [savingCloud, setSavingCloud] = useState(false);

  useEffect(() => {
    Promise.all([
      invoke<boolean>("get_autostart"),
      invoke<ShortcutInfo[]>("get_shortcuts"),
      invoke<CloudConfig>("get_cloud_config"),
    ])
      .then(([auto, scs, cloud]) => {
        setAutostart(auto);
        setShortcuts(scs);
        setCloudConfig((prev) => ({ ...prev, ...cloud }));
        setLoading(false);
      })
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

  // ── 快捷键修改 ──
  const handleShortcutChange = useCallback(async (action: string, shortcut: string) => {
    setSavingShortcuts((prev) => ({ ...prev, [action]: true }));
    setMsg("");
    try {
      await invoke("set_shortcut", { action, shortcut });
      setShortcuts((prev) =>
        prev.map((s) => (s.action === action ? { ...s, shortcut } : s)),
      );
      showMsg(shortcut ? "快捷键已更新" : "快捷键已清除", "success");
    } catch (e) {
      showMsg(String(e), "error");
    } finally {
      setSavingShortcuts((prev) => ({ ...prev, [action]: false }));
    }
  }, []);

  // ── 云存储 ──
  const updateCloudField = (field: keyof CloudConfig, value: string) => {
    setCloudConfig((prev) => ({ ...prev, [field]: value }));
  };

  const handleProviderChange = (provider: string) => {
    const placeholders = PROVIDER_PLACEHOLDERS[provider] || {};
    setCloudConfig((prev) => ({
      ...prev,
      provider,
      endpoint: prev.endpoint || placeholders.endpoint || "",
      region: prev.region || placeholders.region || "",
      domain: prev.domain || placeholders.domain || "",
    }));
  };

  const handleSaveCloud = useCallback(async () => {
    setSavingCloud(true);
    setMsg("");
    try {
      await invoke("set_cloud_config", { config: cloudConfig });
      showMsg("云存储配置已保存", "success");
    } catch (e) {
      showMsg(`保存失败: ${e}`, "error");
    } finally {
      setSavingCloud(false);
    }
  }, [cloudConfig]);

  // ── 导出 ──
  const handleExport = useCallback(async () => {
    try {
      const path = await save({
        defaultPath: `QuickKit-export-${new Date().toISOString().slice(0, 10)}.json`,
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
        buttons: { yes: 'Show content', no: 'Show in folder', cancel: '取消' }
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

      <div className="space-y-4 overflow-y-auto pb-8">
        {loading ? (
          <p className="text-sm text-muted-foreground">加载中…</p>
        ) : (
          <>
            {/* ── 开机自启 ── */}
            <div className="flex items-center justify-between rounded-xl border border-zinc-200/70 p-4 bg-white shadow-card">
              <div>
                <p className="text-sm font-medium text-zinc-800">开机自动启动</p>
                <p className="text-xs text-zinc-400 mt-0.5">启用后 QuickKit 在系统启动时自动运行</p>
              </div>
              <Switch checked={autostart} onCheckedChange={handleToggle} />
            </div>

            {/* ── 快捷键 ── */}
            <div className="rounded-xl border border-zinc-200/70 p-4 bg-white shadow-card">
              <p className="text-sm font-medium text-zinc-800 mb-3">快捷键</p>
              <div className="space-y-3">
                {shortcuts.map((sc) => (
                  <div key={sc.action}>
                    <p className="text-xs text-zinc-400 mb-1">{sc.label}</p>
                    <KeyCapture
                      value={sc.shortcut}
                      onChange={(newShortcut) =>
                        handleShortcutChange(sc.action, newShortcut)
                      }
                      disabled={savingShortcuts[sc.action]}
                    />
                  </div>
                ))}
              </div>
              <p className="text-xs text-zinc-400 mt-2">
                点击快捷键输入框，然后按下新的组合键。支持 Ctrl、Alt、Shift、Super 修饰键。
              </p>
            </div>

            {/* ── 云存储 ── */}
            <div className="rounded-xl border border-zinc-200/70 p-4 bg-white shadow-card">
              <p className="text-sm font-medium text-zinc-800 mb-3">云存储</p>
              <p className="text-xs text-zinc-400 mb-3">
                配置后可使用快捷键快速将剪贴板图片上传到云端，URL 自动复制到剪贴板。
              </p>

              <div className="space-y-2.5">
                {/* Provider */}
                <div className="space-y-1">
                  <label className="text-xs text-zinc-400">服务商</label>
                  <select
                    value={cloudConfig.provider}
                    onChange={(e) => handleProviderChange(e.target.value)}
                    className="flex h-9 w-full rounded-lg border border-zinc-200 bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-violet-400"
                  >
                    {PROVIDERS.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </div>

                {/* Endpoint */}
                <div className="space-y-1">
                  <label className="text-xs text-zinc-400">Endpoint (S3 兼容端点)</label>
                  <input
                    value={cloudConfig.endpoint}
                    onChange={(e) => updateCloudField("endpoint", e.target.value)}
                    placeholder={PROVIDER_PLACEHOLDERS[cloudConfig.provider]?.endpoint}
                    className="flex h-9 w-full rounded-lg border border-zinc-200 bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-violet-400"
                  />
                </div>

                {/* Region */}
                <div className="space-y-1">
                  <label className="text-xs text-zinc-400">Region (区域)</label>
                  <input
                    value={cloudConfig.region}
                    onChange={(e) => updateCloudField("region", e.target.value)}
                    placeholder={PROVIDER_PLACEHOLDERS[cloudConfig.provider]?.region}
                    className="flex h-9 w-full rounded-lg border border-zinc-200 bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-violet-400"
                  />
                </div>

                {/* Bucket */}
                <div className="space-y-1">
                  <label className="text-xs text-zinc-400">Bucket (存储空间名)</label>
                  <input
                    value={cloudConfig.bucket}
                    onChange={(e) => updateCloudField("bucket", e.target.value)}
                    placeholder="my-images"
                    className="flex h-9 w-full rounded-lg border border-zinc-200 bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-violet-400"
                  />
                </div>

                {/* Access Key */}
                <div className="space-y-1">
                  <label className="text-xs text-zinc-400">AccessKey</label>
                  <input
                    value={cloudConfig.access_key}
                    onChange={(e) => updateCloudField("access_key", e.target.value)}
                    placeholder="输入 AccessKey"
                    className="flex h-9 w-full rounded-lg border border-zinc-200 bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-violet-400 font-mono"
                  />
                </div>

                {/* Secret Key */}
                <div className="space-y-1">
                  <label className="text-xs text-zinc-400">SecretKey</label>
                  <input
                    type="password"
                    value={cloudConfig.secret_key}
                    onChange={(e) => updateCloudField("secret_key", e.target.value)}
                    placeholder="输入 SecretKey"
                    className="flex h-9 w-full rounded-lg border border-zinc-200 bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-violet-400 font-mono"
                  />
                </div>

                {/* Domain */}
                <div className="space-y-1">
                  <label className="text-xs text-zinc-400">Domain (公网访问域名)</label>
                  <input
                    value={cloudConfig.domain}
                    onChange={(e) => updateCloudField("domain", e.target.value)}
                    placeholder={PROVIDER_PLACEHOLDERS[cloudConfig.provider]?.domain}
                    className="flex h-9 w-full rounded-lg border border-zinc-200 bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-violet-400"
                  />
                </div>

                <Button
                  size="sm"
                  className="mt-2 bg-gradient-to-r from-violet-500 to-indigo-500 text-white shadow-sm hover:shadow-md"
                  onClick={handleSaveCloud}
                  disabled={savingCloud}
                >
                  {savingCloud ? "保存中…" : "保存配置"}
                </Button>
              </div>
            </div>
          </>
        )}

        {/* ── 数据导入导出 ── */}
        <div className="rounded-xl border border-zinc-200/70 p-4 bg-white shadow-card">
          <p className="text-sm font-medium text-zinc-800 mb-3">数据管理</p>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={handleExport} disabled={exporting}>
              {exporting ? "导出中…" : "导出数据"}
            </Button>
            <Button variant="secondary" size="sm" onClick={handleImport} disabled={importing}>
              {importing ? "导入中…" : "导入数据"}
            </Button>
          </div>
          <p className="text-xs text-zinc-400 mt-2">
            导出为 JSON 格式，支持导入备份和跨设备迁移
          </p>
        </div>

        {msg && (
          <p className={`text-sm px-3 py-2 rounded-lg ${msgType === "error" ? "bg-red-50 text-red-600 border border-red-200" :
              msgType === "success" ? "bg-emerald-50 text-emerald-600 border border-emerald-200" :
                "text-zinc-400"
            }`}>
            {msg}
          </p>
        )}
      </div>

      <div className="pt-6 text-center text-xs text-zinc-400">
        <p>QuickKit v0.1.1</p>
      </div>
    </div>
  );
}
