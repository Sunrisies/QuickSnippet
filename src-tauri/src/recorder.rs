use crate::ScreenRegion;
use std::io::Write;
use std::sync::Mutex;
use std::time::Duration;
use xcap::Monitor;

pub struct RecordingSession {
    pub handle: Mutex<Option<RecordingHandle>>,
}

pub struct RecordingHandle {
    // 用 Box<dyn Any> 擦除 xcap 类型
    video_recorder: Option<Box<dyn std::any::Any + Send>>,
    ffmpeg_child: Option<std::process::Child>,
    output_path: String,
}

/// 开始区域录屏
pub fn start_recording(region: &ScreenRegion) -> Result<RecordingHandle, String> {
    if region.w < 10 || region.h < 10 {
        return Err("选区太小".to_string());
    }

    let monitor = Monitor::from_point(region.x, region.y)
        .map_err(|e| format!("获取显示器失败: {e}"))?;
    let mon_x = monitor.x().map_err(|e| e.to_string())? as i32;
    let mon_y = monitor.y().map_err(|e| e.to_string())? as i32;
    let mon_w = monitor.width().map_err(|e| e.to_string())? as i32;
    let mon_h = monitor.height().map_err(|e| e.to_string())? as i32;

    let rel_x = region.x - mon_x;
    let rel_y = region.y - mon_y;
    let crop_w = region.w.min(mon_w - rel_x);
    let crop_h = region.h.min(mon_h - rel_y);

    if crop_w < 10 || crop_h < 10 {
        return Err("选区超出显示器范围".to_string());
    }

    let timestamp = chrono::Local::now().format("%Y%m%d%H%M%S");
    let output = format!("QuickKit_{}.mp4", timestamp);
    // 保存到桌面
    let output_dir = std::env::var("USERPROFILE")
        .map(|p| std::path::PathBuf::from(p).join("Desktop"))
        .unwrap_or_else(|_| std::env::temp_dir());
    let output_path = output_dir.join(&output);

    // 检查 FFmpeg 是否可用
    if std::process::Command::new("ffmpeg").arg("-version").output().is_err() {
        return Err("未找到 FFmpeg，请安装 FFmpeg 并加入 PATH 环境变量".to_string());
    }

    let mut cmd = std::process::Command::new("ffmpeg");
    cmd.args(["-f", "rawvideo"])
        .args(["-pix_fmt", "rgba"])
        .args(["-s", &format!("{}x{}", mon_w, mon_h)])
        .args(["-r", "30"])
        .args(["-i", "-"])
        .args(["-vf", &format!("crop={}:{}:{}:{}", crop_w, crop_h, rel_x, rel_y)])
        .args(["-c:v", "libx264"])
        .args(["-preset", "ultrafast"])
        .args(["-y", &output_path.to_string_lossy()])
        .stdin(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .stdout(std::process::Stdio::null());

    let mut child = cmd.spawn().map_err(|e| format!("启动 FFmpeg 失败: {e}"))?;
    let stdin = child.stdin.take().ok_or("无法获取 FFmpeg stdin")?;

    let (video_recorder, rx) = monitor
        .video_recorder()
        .map_err(|e| format!("创建 recorder 失败: {e}"))?;

    video_recorder
        .start()
        .map_err(|e| format!("启动录制失败: {e}"))?;

    // 写入线程
    std::thread::spawn(move || {
        let mut w = stdin;
        let mut frame_count = 0u64;
        while let Ok(frame) = rx.recv() {
            if let Err(e) = w.write_all(&frame.raw) {
                eprintln!("[QuickKit] 写入失败(帧{frame_count}): {e}");
                break;
            }
            frame_count += 1;
            if frame_count % 10 == 0 {
                std::thread::sleep(Duration::from_millis(1));
            }
        }
        let _ = w.flush();
        eprintln!("[QuickKit] 录制完成, 共 {frame_count} 帧");
    });

    Ok(RecordingHandle {
        video_recorder: Some(Box::new(video_recorder)),
        ffmpeg_child: Some(child),
        output_path: output_path.to_string_lossy().to_string(),
    })
}

/// 停止录屏
pub fn stop_recording(handle: &mut RecordingHandle) -> Result<String, String> {
    // drop video_recorder 会触发 stop
    drop(handle.video_recorder.take());

    // 等待 FFmpeg 结束
    if let Some(mut child) = handle.ffmpeg_child.take() {
        let status = child.wait().map_err(|e| format!("等待 FFmpeg 失败: {e}"))?;
        if !status.success() {
            eprintln!("[QuickKit] FFmpeg 退出码: {:?}", status.code());
        }
    }

    Ok(handle.output_path.clone())
}
