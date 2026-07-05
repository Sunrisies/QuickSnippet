import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";

interface Props {
  value: string;
  onChange: (shortcut: string) => void;
  disabled?: boolean;
}

/** 修饰键名称规范化 */
const MOD_NAMES: Record<string, string> = {
  Control: "Ctrl",
  Meta: "Super",
  Alt: "Alt",
  Shift: "Shift",
};

/** 键名规范化 */
function normalizeKey(key: string): string | null {
  const map: Record<string, string> = {
    " ": "Space",
    Escape: "Escape",
    Esc: "Escape",
    Enter: "Enter",
    Tab: "Tab",
    ArrowUp: "Up",
    ArrowDown: "Down",
    ArrowLeft: "Left",
    ArrowRight: "Right",
  };
  if (map[key]) return map[key];
  // 单字符字母/数字
  if (/^[a-zA-Z0-9]$/.test(key)) return key.toUpperCase();
  // F 键
  if (/^F\d{1,2}$/.test(key)) return key;
  return null; // 不支持
}

/** 判断是否为修饰键 */
function isModifier(key: string): boolean {
  return ["Control", "Meta", "Alt", "Shift"].includes(key);
}

export default function KeyCapture({ value, onChange, disabled }: Props) {
  const [recording, setRecording] = useState(false);
  const [tempKeys, setTempKeys] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  const startRecording = useCallback(() => {
    if (disabled) return;
    setRecording(true);
    setTempKeys([]);
  }, [disabled]);

  const stopRecording = useCallback(
    (cancel = false) => {
      setRecording(false);
      if (!cancel && tempKeys.length > 0) {
        // 检查是否有非修饰键
        const mainKeys = tempKeys.filter((k) => !isModifier(k));
        if (mainKeys.length === 1) {
          const mods = tempKeys
            .filter((k) => isModifier(k))
            .map((k) => MOD_NAMES[k] || k);
          const result = [...mods, mainKeys[0]].join("+");
          onChange(result);
        }
        // 否则无效，保留原值
      }
      setTempKeys([]);
    },
    [tempKeys, onChange],
  );

  const handleClear = useCallback(() => {
    onChange("");
  }, [onChange]);

  // 键盘捕获
  useEffect(() => {
    if (!recording) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === "Escape") {
        stopRecording(true);
        return;
      }

      if (e.key === "Enter" && tempKeys.length > 0) {
        stopRecording(false);
        return;
      }

      // 收集所有按下的键
      const pressed: string[] = [];
      if (e.ctrlKey && !tempKeys.includes("Control")) pressed.push("Control");
      if (e.altKey && !tempKeys.includes("Alt")) pressed.push("Alt");
      if (e.shiftKey && !tempKeys.includes("Shift")) pressed.push("Shift");
      if (e.metaKey && !tempKeys.includes("Meta")) pressed.push("Meta");

      const mainKey = normalizeKey(e.key);
      if (mainKey && !isModifier(e.key)) {
        pressed.push(mainKey);
      }

      if (pressed.length > 0) {
        // 确保保持已有的修饰键 + 只追加新的主键
        const existingMods = tempKeys.filter((k) => isModifier(k));
        const newMods = pressed.filter((k) => isModifier(k));
        const existingMain = tempKeys.filter((k) => !isModifier(k));
        const newMain = pressed.filter((k) => !isModifier(k));

        const mergedMods = [...new Set([...existingMods, ...newMods])];
        const mergedMain = newMain.length > 0 ? newMain : existingMain;

        setTempKeys([...mergedMods, ...mergedMain]);
      }
    };

    const handleKeyUp = () => {
      // 如果已经捕获了一个主键，可以自动结束
      // 但为了更好的体验，让用户按 Enter 确认或直接松开自动确认
    };

    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("keyup", handleKeyUp, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("keyup", handleKeyUp, true);
    };
  }, [recording, tempKeys, stopRecording]);

  // 失焦时取消录制
  useEffect(() => {
    if (!recording) return;
    const handleBlur = () => stopRecording(true);
    window.addEventListener("blur", handleBlur);
    return () => window.removeEventListener("blur", handleBlur);
  }, [recording, stopRecording]);

  const displayValue =
    recording && tempKeys.length > 0
      ? tempKeys
          .map((k) => MOD_NAMES[k] || k)
          .join("+")
      : value || "未设置";

  return (
    <div className="flex items-center gap-2" ref={containerRef}>
      <div
        role="button"
        tabIndex={0}
        className={`flex-1 h-9 px-3 text-sm rounded-md border transition-colors cursor-pointer flex items-center select-none ${
          recording
            ? "border-primary ring-1 ring-primary bg-primary/5"
            : "border-input bg-background hover:border-muted-foreground"
        } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
        onClick={startRecording}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            startRecording();
          }
        }}
      >
        <span
          className={`font-mono text-xs ${
            !value && !recording ? "text-muted-foreground" : ""
          } ${recording ? "text-primary" : ""}`}
        >
          {recording
            ? tempKeys.length === 0
              ? "按下快捷键组合…"
              : displayValue
            : displayValue}
        </span>
      </div>

      {recording ? (
        <Button
          size="sm"
          variant="ghost"
          className="h-8 text-xs"
          onClick={() => stopRecording(true)}
        >
          取消
        </Button>
      ) : value ? (
        <Button
          size="sm"
          variant="ghost"
          className="h-8 text-xs text-destructive hover:text-destructive"
          onClick={handleClear}
          disabled={disabled}
        >
          清除
        </Button>
      ) : null}
    </div>
  );
}
