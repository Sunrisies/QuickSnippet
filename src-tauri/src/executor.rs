use serde::{Deserialize, Serialize};
use std::process::Command;
use std::time::Instant;

#[derive(Debug, Serialize, Deserialize)]
pub struct ExecutionResult {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
    pub elapsed_ms: u64,
}

/// 根据脚本语言执行脚本内容
pub fn execute_script(content: &str, language: &str) -> Result<ExecutionResult, String> {
    let start = Instant::now();

    let result = match language {
        "powershell" => {
            let mut output = Command::new("powershell")
                .args(["-NoProfile", "-Command", "-"])
                .stdin(std::process::Stdio::piped())
                .stdout(std::process::Stdio::piped())
                .stderr(std::process::Stdio::piped())
                .spawn()
                .map_err(|e| format!("无法启动 PowerShell: {}", e))?;

            // 写入脚本内容到 stdin
            use std::io::Write;
            if let Some(ref mut stdin) = output.stdin {
                let _ = stdin.write_all(content.as_bytes());
            }
            // 关闭 stdin 管道，让 powershell 处理全部输入
            drop(output.stdin.take());

            output
                .wait_with_output()
                .map_err(|e| format!("执行 PowerShell 脚本失败: {}", e))?
        }
        "cmd" => {
            let output = Command::new("cmd")
                .args(["/C", content])
                .stdout(std::process::Stdio::piped())
                .stderr(std::process::Stdio::piped())
                .output()
                .map_err(|e| format!("无法启动 CMD: {}", e))?;

            output
        }
        "bash" => {
            let output = Command::new("wsl")
                .args(["bash", "-c", content])
                .stdout(std::process::Stdio::piped())
                .stderr(std::process::Stdio::piped())
                .output()
                .map_err(|e| format!("无法启动 WSL Bash: {}", e))?;

            output
        }
        _ => return Err(format!("不支持的语言: {}", language)),
    };

    let elapsed = start.elapsed().as_millis() as u64;

    let stdout = String::from_utf8_lossy(&result.stdout).to_string();
    let stderr = String::from_utf8_lossy(&result.stderr).to_string();
    let exit_code = result.status.code().unwrap_or(-1);

    Ok(ExecutionResult {
        stdout,
        stderr,
        exit_code,
        elapsed_ms: elapsed,
    })
}
