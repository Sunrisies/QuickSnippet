use crate::ScreenRegion;
use ffmpeg_sidecar::child::FfmpegChild;
use ffmpeg_sidecar::command::FfmpegCommand;
use std::io::Write;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use xcap::{Monitor, VideoRecorder};

pub struct RecordingSession {
    pub handle: Mutex<Option<RecordingHandle>>,
}

pub struct RecordingHandle {
    _video_recorder: Option<VideoRecorder>,
    stop_flag: Arc<AtomicBool>,
    write_thread: Option<thread::JoinHandle<()>>,
    output_path: String,
    ffmpeg: FfmpegChild,
}

/// 开始区域录屏（使用 xcap DXGI VideoRecorder）
pub fn start_recording(
    region: &ScreenRegion,
) -> Result<RecordingHandle, Box<dyn std::error::Error>> {
    if region.w < 10 || region.h < 10 {
        return Err("选区太小".to_string().into());
    }
    println!("线程ID: {:?}", thread::current().id());
    let monitor =
        Monitor::from_point(region.x, region.y).map_err(|e| format!("获取显示器失败: {e}"))?;
    let mon_x = monitor.x().map_err(|e| e.to_string())? as i32;
    let mon_y = monitor.y().map_err(|e| e.to_string())? as i32;
    let mon_w = monitor.width().map_err(|e| e.to_string())? as i32;
    let mon_h = monitor.height().map_err(|e| e.to_string())? as i32;
    println!("显示器: {}x{} 偏移({},{})", mon_w, mon_h, mon_x, mon_y);
    let rel_x = region.x - mon_x;
    let rel_y = region.y - mon_y;
    let crop_w = region.w.min(mon_w - rel_x);
    let crop_h = region.h.min(mon_h - rel_y);
    println!(
        "裁剪区域: rel({},{}) size({},{})",
        rel_x, rel_y, crop_w, crop_h
    );
    if crop_w < 10 || crop_h < 10 {
        return Err("选区超出显示器范围".to_string().into());
    }

    let timestamp = chrono::Local::now().format("%Y年%m月%d日 %H时%M分%S秒");
    let output = format!("QuickKit_{}.mp4", timestamp);

    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()))
        .unwrap_or_else(|| std::path::PathBuf::from("."));

    let output_dir = exe_dir.join("recordings");

    if let Err(e) = std::fs::create_dir_all(&output_dir) {
        return Err(format!("无法创建录制目录: {}", e).into());
    }

    let output_path = output_dir.join(&output);
    println!("输出路径: {:?}", output_path);

    // 检查 FFmpeg 是否可用
    if std::process::Command::new("ffmpeg")
        .arg("-version")
        .output()
        .is_err()
    {
        return Err("未找到 FFmpeg，请安装 FFmpeg 并加入 PATH 环境变量"
            .to_string()
            .into());
    }

    // ========== 创建 DXGI VideoRecorder（捕获全屏，速度极快，不黑屏） ==========
    let (video_recorder, sx) = monitor
        .video_recorder()
        .map_err(|e| format!("创建 VideoRecorder 失败: {e}"))?;

    // 构建 FFmpeg 命令：输入为全屏 rawvideo RGBA，输出用 crop 裁剪选区
    let mut ffmpeg = FfmpegCommand::new()
        .args([
            "-f",
            "rawvideo",
            "-pix_fmt",
            "rgba",
            "-s",
            &format!("{}x{}", mon_w, mon_h),
            "-r",
            "30",
            "-i",
            "-",
        ])
        .args([
            "-vf",
            &format!("crop={}:{}:{}:{}", crop_w, crop_h, rel_x, rel_y),
        ])
        .args(["-c:v", "libx264", "-preset", "ultrafast", "-crf", "23"])
        .args(["-y", &output_path.to_string_lossy()])
        .spawn()?;

    let mut stdin = ffmpeg.take_stdin().ok_or("无法获取 FFmpeg 标准输入")?;

    let stop_flag = Arc::new(AtomicBool::new(false));
    let stop_flag_writer = stop_flag.clone();

    // 写入线程：从 VideoRecorder 通道接收帧，直接写入 FFmpeg stdin
    let write_thread = thread::spawn(move || {
        let mut frame_count = 0;
        let start_time = Instant::now();
        let mut last_frame_buf: Option<Vec<u8>> = None;
        let frame_interval = Duration::from_millis(33); // ~30fps

        loop {
            match sx.recv_timeout(frame_interval) {
                Ok(frame) => {
                    // 新帧来自 DXGI → 保存并写入
                    last_frame_buf = Some(frame.raw);
                    frame_count += 1;

                    if let Err(e) = stdin.write_all(last_frame_buf.as_ref().unwrap()) {
                        eprintln!("写入 FFmpeg 失败 (帧 {}): {}", frame_count, e);
                        break;
                    }
                }
                Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                    if stop_flag_writer.load(Ordering::Relaxed) {
                        println!("收到停止信号，退出写入线程 (共 {} 帧)", frame_count);
                        break;
                    }
                    // 屏幕无变化，DXGI 未产生新帧 → 重发最后一帧维持帧率
                    if let Some(ref data) = last_frame_buf {
                        frame_count += 1;
                        if let Err(e) = stdin.write_all(data) {
                            eprintln!("写入 FFmpeg 失败 (帧 {}): {}", frame_count, e);
                            break;
                        }
                    }
                }
                Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
                    println!("采集通道断开，退出写入线程 (共 {} 帧)", frame_count);
                    break;
                }
            }

            if frame_count % 30 == 0 && frame_count > 0 {
                println!(
                    "已写入 {} 帧, 耗时: {:?}",
                    frame_count,
                    start_time.elapsed()
                );
            }
        }

        // 关闭 stdin → FFmpeg 收到 EOF → 写入 moov atom 完成文件
        let _ = stdin.flush();
        drop(stdin);
        println!("写入线程退出 (总帧数: {})", frame_count);
    });

    // 启动 VideoRecorder 开始采集
    video_recorder.start()?;

    Ok(RecordingHandle {
        _video_recorder: Some(video_recorder),
        stop_flag,
        write_thread: Some(write_thread),
        output_path: output_path.to_string_lossy().to_string(),
        ffmpeg,
    })
}

/// 停止录屏
pub fn stop_recording(handle: &mut RecordingHandle) -> Result<String, Box<dyn std::error::Error>> {
    println!("停止录屏");

    // 1. 设置停止标志 → 写入线程会在下次 recv_timeout 超时时检测到并退出
    handle.stop_flag.store(true, Ordering::Relaxed);

    // 2. 停止 VideoRecorder → 采集线程进入休眠（不消耗 CPU），不再发帧
    if let Some(recorder) = handle._video_recorder.take() {
        let _ = recorder.stop();
        // stop 后 drop recorder，释放其 tx
    }

    // 3. 等待写入线程结束（超时 3 秒）
    if let Some(wt) = handle.write_thread.take() {
        let deadline = Instant::now() + Duration::from_secs(3);
        loop {
            if wt.is_finished() {
                break;
            }
            if Instant::now() >= deadline {
                eprintln!("警告: 写入线程未在 3 秒内退出");
                break;
            }
            thread::sleep(Duration::from_millis(50));
        }
        match wt.join() {
            Ok(_) => println!("写入线程已安全退出"),
            Err(_) => eprintln!("写入线程 panic"),
        }
    }

    // 4. 等待 FFmpeg 编码完成（stdin 已关闭 → FFmpeg 收到 EOF → 输出完整 MP4）
    let output = handle.ffmpeg.wait()?;
    if output.success() {
        println!("录制成功完成");
    } else {
        eprintln!("FFmpeg 进程失败: {:?}", output);
        return Err(format!("FFmpeg 进程输出: {:?}", output).into());
    }

    Ok(handle.output_path.clone())
}
