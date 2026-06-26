import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

interface Props {
  onBack: () => void;
}

export default function Settings({ onBack }: Props) {
  const [autostart, setAutostart] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    invoke<boolean>("get_autostart")
      .then(setAutostart)
      .catch((e) => setMsg(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const handleToggle = useCallback(async () => {
    const next = !autostart;
    setSaving(true);
    setMsg("");
    try {
      await invoke("set_autostart", { enabled: next });
      setAutostart(next);
      setMsg(next ? "已启用开机自启" : "已禁用开机自启");
    } catch (e) {
      setMsg(String(e));
    } finally {
      setSaving(false);
    }
  }, [autostart]);

  return (
    <div className="settings-page">
      <div className="settings-header">
        <button className="btn btn-secondary" onClick={onBack}>
          ← 返回
        </button>
        <h2>设置</h2>
      </div>

      {loading ? (
        <div className="settings-loading">加载中…</div>
      ) : (
        <div className="settings-body">
          <div className="setting-item">
            <div className="setting-info">
              <span className="setting-label">开机自动启动</span>
              <span className="setting-desc">
                启用后，Scripter 将在系统启动时自动运行
              </span>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={autostart}
                onChange={handleToggle}
                disabled={saving}
              />
              <span className="toggle-slider" />
            </label>
          </div>

          {msg && <div className="setting-msg">{msg}</div>}
        </div>
      )}

      <div className="settings-footer">
        <p>Scripter v0.1.0 &middot; 基于 Tauri + Rust</p>
      </div>
    </div>
  );
}
