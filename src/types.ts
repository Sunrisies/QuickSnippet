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
