export interface Script {
  id: string;
  name: string;
  content: string;
  language: string;
  created_at: string;
  updated_at: string;
}

export interface ExecutionResult {
  stdout: string;
  stderr: string;
  exit_code: number;
  elapsed_ms: number;
}

export type PageView = "list" | "editor" | "settings";

// 支持的语言列表（代码片段场景）
export const LANGUAGES = [
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" },
  { value: "python", label: "Python" },
  { value: "go", label: "Go" },
  { value: "rust", label: "Rust" },
  { value: "java", label: "Java" },
  { value: "kotlin", label: "Kotlin" },
  { value: "csharp", label: "C#" },
  { value: "cpp", label: "C++" },
  { value: "c", label: "C" },
  { value: "sql", label: "SQL" },
  { value: "html", label: "HTML" },
  { value: "css", label: "CSS" },
  { value: "json", label: "JSON" },
  { value: "yaml", label: "YAML" },
  { value: "markdown", label: "Markdown" },
  { value: "bash", label: "Bash" },
  { value: "powershell", label: "PowerShell" },
  { value: "cmd", label: "CMD" },
  { value: "dockerfile", label: "Dockerfile" },
  { value: "nginx", label: "Nginx" },
  { value: "regex", label: "Regex" },
  { value: "diff", label: "Diff" },
  { value: "plaintext", label: "纯文本" },
] as const;

export const LANG_STYLES: Record<string, string> = {
  javascript: "bg-yellow-100 text-yellow-700",
  typescript: "bg-blue-100 text-blue-700",
  python: "bg-green-100 text-green-700",
  go: "bg-cyan-100 text-cyan-700",
  rust: "bg-orange-100 text-orange-700",
  java: "bg-red-100 text-red-700",
  kotlin: "bg-purple-100 text-purple-700",
  csharp: "bg-violet-100 text-violet-700",
  cpp: "bg-blue-200 text-blue-800",
  c: "bg-slate-100 text-slate-700",
  sql: "bg-indigo-100 text-indigo-700",
  html: "bg-pink-100 text-pink-700",
  css: "bg-teal-100 text-teal-700",
  json: "bg-zinc-100 text-zinc-600",
  yaml: "bg-stone-100 text-stone-600",
  markdown: "bg-gray-100 text-gray-600",
  bash: "bg-green-100 text-green-700",
  powershell: "bg-sky-100 text-sky-700",
  cmd: "bg-zinc-100 text-zinc-600",
  dockerfile: "bg-blue-100 text-blue-700",
  nginx: "bg-emerald-100 text-emerald-700",
  regex: "bg-rose-100 text-rose-700",
  diff: "bg-amber-100 text-amber-700",
  plaintext: "bg-gray-100 text-gray-500",
};
