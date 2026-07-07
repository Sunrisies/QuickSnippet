use crate::db::CloudConfig;
use chrono::Datelike;
use qiniu_sdk::upload::{
    AutoUploader, AutoUploaderObjectParams, UploadManager, UploadTokenSigner,
    apis::credential::Credential,
};
use std::time::Duration;

const TOKEN_EXPIRY_SECS: u64 = 3600;

/// 从剪贴板读取图片并上传到七牛云，返回可访问的 URL
pub async fn upload_clipboard_image(config: &CloudConfig) -> Result<String, String> {
    // 1. 验证配置
    if config.access_key.is_empty() || config.secret_key.is_empty() || config.bucket.is_empty() {
        return Err("云存储配置不完整，请在设置页填写".to_string());
    }

    // 2. 从剪贴板读取图片
    let mut clipboard =
        arboard::Clipboard::new().map_err(|e| format!("无法打开剪贴板: {}", e))?;
    let image_data = clipboard
        .get_image()
        .map_err(|e| format!("剪贴板中没有图片: {}", e))?;

    // 3. RGBA → PNG 编码
    let rgba = image::RgbaImage::from_raw(
        image_data.width as u32,
        image_data.height as u32,
        image_data.bytes.to_vec(),
    )
    .ok_or("图片数据无效".to_string())?;

    let mut png_buf = std::io::Cursor::new(Vec::new());
    rgba.write_to(&mut png_buf, image::ImageFormat::Png)
        .map_err(|e| format!("编码 PNG 失败: {}", e))?;
    let png_bytes = png_buf.into_inner();

    // 4. 生成唯一文件名和存储路径
    let now = chrono::Local::now();
    let filename = format!("{}.png", uuid::Uuid::new_v4());
    let object_key =
        format!("image/{}/{:02}/{:02}/{}", now.year(), now.month(), now.day(), filename);

    // 5. 写入临时文件（qiniu-sdk 的 async_upload_path 需要文件路径）
    let temp_dir = std::env::temp_dir();
    let temp_path = temp_dir.join(&filename);
    std::fs::write(&temp_path, &png_bytes)
        .map_err(|e| format!("写入临时文件失败: {}", e))?;

    // 6. 初始化七牛云上传
    let credential = Credential::new(&config.access_key, &config.secret_key);
    let upload_manager = UploadManager::builder(UploadTokenSigner::new_credential_provider(
        credential,
        &config.bucket,
        Duration::from_secs(TOKEN_EXPIRY_SECS),
    ))
    .build();

    let uploader: AutoUploader = upload_manager.auto_uploader();

    let params = AutoUploaderObjectParams::builder()
        .object_name(&object_key)
        .file_name(&filename)
        .build();

    // 7. 上传
    let result = uploader
        .async_upload_path(&temp_path, params)
        .await;

    // 8. 清理临时文件
    let _ = std::fs::remove_file(&temp_path);

    let response = result.map_err(|e| format!("上传失败: {}", e))?;
    let key = response["key"].as_str().unwrap_or(&object_key);

    // 9. 返回完整 URL
    let domain = config.domain.trim_end_matches('/');
    Ok(format!("{}/{}", domain, key))
}
