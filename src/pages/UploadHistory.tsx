import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Button } from "@/components/ui/button";

interface UploadRecord {
  id: string;
  url: string;
  filename: string;
  file_size: number;
  created_at: string;
}

interface CloudConfig {
  domain: string;
  [key: string]: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString();
}

export default function UploadHistory() {
  const [records, setRecords] = useState<UploadRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [cloudConfig, setCloudConfig] = useState<CloudConfig | null>(null);

  const fetchHistory = useCallback(async () => {
    try {
      const [list, config] = await Promise.all([
        invoke<UploadRecord[]>("get_upload_history"),
        invoke<CloudConfig>("get_cloud_config"),
      ]);
      setRecords(list);
      setCloudConfig(config);
    } catch (e) {
      console.error("加载失败:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  // 上传完成后自动刷新
  useEffect(() => {
    const unlisten = listen("upload-complete", () => fetchHistory());
    return () => { unlisten.then((fn) => fn()); };
  }, [fetchHistory]);

  /** 从文件名/路径构造完整可访问 URL */
  const resolveUrl = useCallback(
    (record: UploadRecord): string => {
      // 如果 url 字段已经是完整 URL 则直接用
      if (record.url.startsWith("http://") || record.url.startsWith("https://")) {
        return record.url;
      }
      // 否则用 config 中的 domain 拼装
      const domain = cloudConfig?.domain?.trim().replace(/\/+$/, "");
      if (domain) {
        const path = record.url.startsWith("/") ? record.url : `/${record.url}`;
        return `${domain}${path}`;
      }
      return record.url;
    },
    [cloudConfig],
  );

  const handleCopy = useCallback(async (url: string) => {
    try {
      await invoke("copy_to_clipboard", { text: url });
    } catch (e) {
      console.error("复制失败:", e);
    }
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm("确定删除这条记录？")) return;
    try {
      await invoke("delete_upload", { id });
      setRecords((prev) => prev.filter((r) => r.id !== id));
    } catch (e) {
      console.error("删除失败:", e);
    }
  }, []);

  return (
    <div className="h-full flex flex-col p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">上传历史</h2>
        <Button size="sm" variant="secondary" onClick={fetchHistory}>
          刷新
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground text-center py-12">加载中…</p>
      ) : records.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-12">
          还没有上传记录
        </p>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-3">
          {records.map((r) => {
            const imgUrl = resolveUrl(r);
            return (
              <div
                key={r.id}
                className="flex items-start gap-4 rounded-lg border border-border p-3 bg-card hover:border-muted-foreground/30 transition-colors"
              >
                {/* 缩略图 */}
                <div
                  className="w-20 h-20 shrink-0 rounded-md overflow-hidden bg-muted cursor-pointer border"
                  onClick={() => setPreviewUrl(previewUrl === imgUrl ? null : imgUrl)}
                >
                  <img
                    src={imgUrl}
                    alt={r.filename}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </div>

                {/* 信息 */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{r.filename}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatSize(r.file_size)} · {formatTime(r.created_at)}
                  </p>
                  <div className="flex gap-2 mt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => handleCopy(resolveUrl(r))}
                    >
                      复制 URL
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-destructive hover:text-destructive"
                      onClick={() => handleDelete(r.id)}
                    >
                      删除
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 图片预览弹窗 */}
      {previewUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center"
          onClick={() => setPreviewUrl(null)}
        >
          <img
            src={previewUrl}
            className="max-w-[90vw] max-h-[90vh] rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            alt="预览"
          />
        </div>
      )}
    </div>
  );
}
