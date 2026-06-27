import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

interface Props {
  onBack: () => void;
}

export default function Settings({ onBack }: Props) {
  const [autostart, setAutostart] = useState(false);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    invoke<boolean>("get_autostart")
      .then((v) => {
        setAutostart(v);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleToggle = useCallback(async () => {
    const next = !autostart;
    setMsg("");
    try {
      await invoke("set_autostart", { enabled: next });
      setAutostart(next);
      setMsg(next ? "已启用开机自启" : "已禁用开机自启");
    } catch (e) {
      setMsg(String(e));
    }
  }, [autostart]);

  return (
    <div className="h-full flex flex-col p-5">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="sm" onClick={onBack}>
          ← 返回
        </Button>
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
                <p className="text-xs text-muted-foreground mt-0.5">
                  启用后 Scripter 在系统启动时自动运行
                </p>
              </div>
              <Switch checked={autostart} onCheckedChange={handleToggle} />
            </div>

            {msg && (
              <p className="text-sm text-primary">{msg}</p>
            )}
          </>
        )}
      </div>

      <div className="mt-auto pt-6 text-center text-xs text-muted-foreground">
        <p>Scripter v0.1.3 &middot; 基于 Tauri + Rust</p>
      </div>
    </div>
  );
}
