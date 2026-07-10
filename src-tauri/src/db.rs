use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Script {
    pub id: String,
    pub name: String,
    pub content: String,
    pub language: String,
    pub folder_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Folder {
    pub id: String,
    pub name: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Serialize)]
pub struct ExportData {
    pub version: u32,
    pub exported_at: String,
    pub folders: Vec<Folder>,
    pub scripts: Vec<Script>,
}

#[derive(Deserialize)]
pub struct ImportData {
    pub version: u32,
    pub folders: Vec<ImportFolder>,
    pub scripts: Vec<ImportScript>,
}

#[derive(Deserialize)]
pub struct ImportFolder {
    pub name: String,
}

#[derive(Deserialize)]
pub struct ImportScript {
    pub name: String,
    pub content: String,
    pub language: String,
    pub folder_name: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UploadRecord {
    pub id: String,
    pub url: String,
    pub filename: String,
    pub file_size: u64,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct CloudConfig {
    pub provider: String,     // "qiniu" | "aliyun" | "s3"
    pub endpoint: String,     // S3 兼容端点
    pub region: String,       // 区域
    pub bucket: String,       // 存储空间名
    pub access_key: String,   // AccessKey
    pub secret_key: String,   // SecretKey
    pub domain: String,       // 公网访问域名
}

pub struct Database {
    pub conn: Mutex<Connection>,
}

impl Database {
    pub fn new(app_dir: PathBuf) -> Result<Self, String> {
        std::fs::create_dir_all(&app_dir).map_err(|e| e.to_string())?;
        let db_path = app_dir.join("scripts.db");
        let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

        conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS scripts (
                id          TEXT PRIMARY KEY,
                name        TEXT NOT NULL,
                content     TEXT NOT NULL,
                language    TEXT NOT NULL DEFAULT 'powershell',
                folder_id   TEXT,
                created_at  TEXT NOT NULL,
                updated_at  TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS folders (
                id          TEXT PRIMARY KEY,
                name        TEXT NOT NULL,
                created_at  TEXT NOT NULL,
                updated_at  TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS settings (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            INSERT OR IGNORE INTO settings (key, value) VALUES ('autostart', 'false');

            CREATE TABLE IF NOT EXISTS uploads (
                id          TEXT PRIMARY KEY,
                url         TEXT NOT NULL,
                filename    TEXT NOT NULL,
                file_size   INTEGER NOT NULL,
                created_at  TEXT NOT NULL
            );
            ",
        )
        .map_err(|e| e.to_string())?;

        // 迁移：老数据库可能没有 folder_id 列
        let has_fcid: bool = conn
            .prepare("SELECT folder_id FROM scripts LIMIT 1")
            .is_ok();
        if !has_fcid {
            let _ = conn.execute_batch("ALTER TABLE scripts ADD COLUMN folder_id TEXT;");
        }

        Ok(Database {
            conn: Mutex::new(conn),
        })
    }

    pub fn seed_demo_data(&self) -> Result<(), String> {
        // 保持原样
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM scripts", [], |row| row.get(0))
            .map_err(|e| e.to_string())?;
        if count > 0 {
            return Ok(());
        }
        let now = chrono::Utc::now().to_rfc3339();
        let demos: [(&str, &str, &str); 30] = [
            ("清理临时文件", "powershell", "Write-Host '正在清理系统临时文件...'\n$tempDirs = @(\n    \"$env:TEMP\",\n    \"$env:WINDIR\\Temp\",\n    \"$env:WINDIR\\Prefetch\"\n)\nforeach ($dir in $tempDirs) {\n    if (Test-Path $dir) {\n        try {\n            Get-ChildItem -Path $dir -Recurse -Force -ErrorAction SilentlyContinue |\n                Where-Object { !$_.PSIsContainer } |\n                Remove-Item -Force -ErrorAction SilentlyContinue\n            Write-Host \"  ✓ 已清理: $dir\"\n        } catch {\n            Write-Warning \"  ⚠ 跳过: $dir\"\n        }\n    }\n}\nWrite-Host '清理完成!'"),
            ("查看系统信息", "powershell", "Write-Host '========== 系统信息 =========='\nGet-CimInstance Win32_OperatingSystem | ForEach-Object {\n    Write-Host \"系统: $($_.Caption)\"\n    Write-Host \"版本: $($_.Version)\"\n    Write-Host \"架构: $($_.OSArchitecture)\"\n    Write-Host \"安装时间: $($_.InstallDate)\"\n    Write-Host \"最后启动: $($_.LastBootUpTime)\"\n}\nWrite-Host \"\"\nWrite-Host '========== 硬件信息 =========='\nGet-CimInstance Win32_ComputerSystem | ForEach-Object {\n    Write-Host \"制造商: $($_.Manufacturer)\"\n    Write-Host \"型号: $($_.Model)\"\n    Write-Host \"内存: $([math]::Round($_.TotalPhysicalMemory / 1GB, 2)) GB\"\n}"),
            ("网络连通性测试", "powershell", "param([string]$Target = '8.8.8.8')\nWrite-Host \"正在测试到 $Target 的连通性...\"\n$result = Test-Connection -ComputerName $Target -Count 4 -Quiet\nif ($result) {\n    Write-Host \"✓ 网络连通正常\"\n} else {\n    Write-Host \"✗ 网络不可达\"\n}\n# 附加 DNS 查询\nWrite-Host \"\"\nWrite-Host 'DNS 解析:'\nResolve-DnsName -Name 'www.baidu.com' -Type A -ErrorAction SilentlyContinue |\n    Select-Object Name, IPAddress | Format-Table -AutoSize"),
            ("端口扫描 (本地)", "powershell", "$ports = @(80, 443, 3389, 22, 8080, 3000, 5000, 3306, 5432, 6379)\nWrite-Host \"正在扫描本地端口...\"\nforeach ($port in $ports) {\n    $socket = New-Object System.Net.Sockets.TcpClient\n    $result = $socket.BeginConnect('127.0.0.1', $port, $null, $null)\n    $wait = $result.AsyncWaitHandle.WaitOne(200, $false)\n    if ($wait -and $socket.Connected) {\n        Write-Host \"  ✓ 端口 $port 开放\"\n    } else {\n        Write-Host \"  - 端口 $port 关闭\"\n    }\n    $socket.Close()\n}"),
            ("批量重命名文件", "powershell", "param([string]$Dir = '.', [string]$Prefix = 'file_', [string]$Ext = '*.*')\n$files = Get-ChildItem -Path $Dir -Filter $Ext -File\n$i = 1\nforeach ($file in $files) {\n    $newName = \"$Prefix$i$($file.Extension)\"\n    Rename-Item -Path $file.FullName -NewName $newName -ErrorAction SilentlyContinue\n    Write-Host \"  $($file.Name) → $newName\"\n    $i++\n}\nWrite-Host \"已完成 $($files.Count) 个文件重命名\""),
            ("IP 地址查询", "powershell", "Write-Host '========== 网络配置 =========='\nGet-NetIPAddress -AddressFamily IPv4 |\n    Where-Object {$_.InterfaceAlias -notlike '*Loopback*'} |\n    Select-Object InterfaceAlias, IPAddress, PrefixLength |\n    Format-Table -AutoSize\n\nWrite-Host \"\"\nWrite-Host '========== 公网 IP =========='\ntry {\n    $publicIP = (Invoke-WebRequest -Uri 'https://api.ipify.org' -TimeoutSec 5).Content\n    Write-Host \"公网 IP: $publicIP\"\n} catch {\n    Write-Warning '无法获取公网 IP'\n}"),
            ("进程管理器", "powershell", "Write-Host \"${'='*20} 进程排行 (按内存) ${'='*20}\"\nGet-Process | Sort-Object WorkingSet -Descending |\n    Select-Object -First 20 |\n    Format-Table -Property Name, Id, @{n='CPU(s)';e={[math]::Round($_.CPU, 1)}},\n        @{n='内存(MB)';e={[math]::Round($_.WorkingSet/1MB, 1)}} -AutoSize\n\nWrite-Host \"\"\nWrite-Host \"总进程数: $(Get-Process | Measure-Object | Select-Object -ExpandProperty Count)\""),
            ("磁盘空间分析", "powershell", "Write-Host '磁盘空间使用情况:'\nWrite-Host ('{0,-10} {1,>10} {2,>10} {3,>10} {4,>8}' -f '盘符','总大小','已用','可用','使用率')\nGet-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' | ForEach-Object {\n    $total = [math]::Round($_.Size / 1GB, 1)\n    $free = [math]::Round($_.FreeSpace / 1GB, 1)\n    $used = $total - $free\n    $pct = if ($total -gt 0) { [math]::Round($used / $total * 100, 0) } else { 0 }\n    Write-Host ('{0,-10} {1,>8}GB {2,>8}GB {3,>8}GB {4,>6}%' -f $_.DeviceID, $total, $used, $free, $pct)\n}"),
            ("定时关机", "powershell", "param([int]$Minutes = 60, [string]$Message = '系统将在一小时后关机')\n$seconds = $Minutes * 60\nWrite-Host \"⏰ 将在 $Minutes 分钟后关机 ($(Get-Date -Format 'HH:mm:ss'))\"\nWrite-Host \"📝 提示: $Message\"\nshutdown /s /t $seconds /c $Message\nWrite-Host \"\"\nWrite-Host \"取消关机请运行: shutdown /a\""),
            ("系统服务管理", "powershell", "param([string]$Status = 'Stopped')\nWrite-Host \"以下服务正在运行中:\"\nGet-Service | Where-Object { $_.Status -eq 'Running' } |\n    Select-Object Name, DisplayName, StartType |\n    Format-Table -AutoSize\nWrite-Host \"\"\nWrite-Host \"以下服务已停止:\"\nGet-Service | Where-Object { $_.Status -eq 'Stopped' -and $_.StartType -ne 'Disabled' } |\n    Select-Object -First 15 Name, DisplayName |\n    Format-Table -AutoSize"),
            ("每日 Git 提交统计", "powershell", "param([string]$RepoPath = '.')\nSet-Location $RepoPath\n$since = (Get-Date).AddDays(-7).ToString('yyyy-MM-dd')\nWrite-Host \"最近 7 天 Git 提交统计\"\nWrite-Host ('='*40)\ngit log --since=$since --format='%ad %an: %s' --date=short\nWrite-Host \"\"\nWrite-Host \"提交总数:\"\ngit rev-list --count --since=$since HEAD\nWrite-Host \"\"\nWrite-Host \"按作者统计:\"\ngit shortlog -sn --since=$since"),
            ("Docker 容器状态", "powershell", "Write-Host '========== Docker 容器状态 =========='\ndocker ps -a --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'\nWrite-Host \"\"\nWrite-Host '========== 镜像列表 =========='\ndocker images --format 'table {{.Repository}}\t{{.Tag}}\t{{.Size}}'\nWrite-Host \"\"\nWrite-Host '========== 磁盘占用 =========='\ndocker system df"),
            ("WiFi 密码查看", "powershell", "param([string]$ProfileName = '*')\nWrite-Host '已保存的 WiFi 网络:'\n$profiles = netsh wlan show profiles | Select-String '所有用户配置文件' | ForEach-Object {\n    $_ -replace '.*: ', ''\n}\nforeach ($profile in $profiles) {\n    $info = netsh wlan show profile name=\"$profile\" key=clear\n    $password = $info | Select-String '关键内容' | ForEach-Object {\n        $_ -replace '.*: ', ''\n    }\n    if ($password) {\n        Write-Host \"  ✓ $profile : $password\"\n    } else {\n        Write-Host \"  - $profile : (无密码)\"\n    }\n}"),
            ("文件哈希校验", "powershell", "param([string]$Path, [string]$Algorithm = 'SHA256')\nif (-not $Path) {\n    Write-Host '用法: 请传入文件路径参数'\n    return\n}\nif (-not (Test-Path $Path)) {\n    Write-Error \"文件不存在: $Path\"\n    return\n}\n$hash = Get-FileHash -Path $Path -Algorithm $Algorithm\nWrite-Host \"文件: $(Split-Path $Path -Leaf)\"\nWrite-Host \"算法: $Algorithm\"\nWrite-Host \"哈希: $($hash.Hash.ToLower())\""),
            ("一键更新 Chocolatey 包", "powershell", "Write-Host '正在检查 Chocolatey 更新...'\n# 检查 choco 是否安装\nif (-not (Get-Command choco -ErrorAction SilentlyContinue)) {\n    Write-Error 'Chocolatey 未安装'\n    return\n}\nWrite-Host '已过时的包:'\nchoco outdated\nWrite-Host \"\"\n$answer = Read-Host '是否更新所有包? (y/n)'\nif ($answer -eq 'y') {\n    choco upgrade all -y\n    Write-Host '✓ 更新完成!'\n} else {\n    Write-Host '已取消'\n}"),
            ("环境变量编辑器", "powershell", "Write-Host '========== 用户环境变量 =========='\nGet-ChildItem Env: | Sort-Object Name | Format-Table -AutoSize -Wrap\nWrite-Host \"\"\nWrite-Host \"PATH 路径:\"\n($env:Path -split ';') | ForEach-Object { Write-Host \"  $_\" }"),
            ("系统启动项管理", "powershell", "Write-Host '注册表自启动项:'\nGet-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' |\n    Get-Member -MemberType NoteProperty | Select-Object -ExpandProperty Name |\n    ForEach-Object {\n        $val = (Get-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run').$_\n        Write-Host \"  $_ → $val\"\n    }\nWrite-Host \"\"\nWrite-Host '启动文件夹:'\n$startupPath = [Environment]::GetFolderPath('Startup')\nGet-ChildItem $startupPath | ForEach-Object {\n    Write-Host \"  $($_.Name)\"\n}"),
            ("目录树生成器", "cmd", "@echo off\nchcp 65001 >nul\necho ========== 项目目录树 ==========\nif \"%1\"==\"\" (set DIR=.%) else (set DIR=%1%)\ntree /F \"%DIR%\" /A\necho.\necho 生成完成!"),
            ("CMD 系统信息", "cmd", "@echo off\nchcp 65001 >nul\necho ========== 系统信息 ==========\nsysteminfo | findstr /B /C:\"OS Name\" /C:\"OS Version\" /C:\"System Type\"\necho.\necho ========== CPU 信息 ==========\nwmic cpu get Name,NumberOfCores,MaxClockSpeed\necho.\necho ========== 内存信息 ==========\nwmic memorychip get Capacity,Speed,Manufacturer"),
            ("批量创建用户", "cmd", "@echo off\nchcp 65001 >nul\nset USERS=张三 李四 王五 赵六 钱七\necho 正在创建用户...\nfor %%u in (%USERS%) do (\n    net user %%u P@ssw0rd /add >nul 2>&1\n    if %ERRORLEVEL%==0 (\n        echo   ✓ 已创建: %%u\n    ) else (\n        echo   ⚠ 跳过: %%u \\(可能已存在\\)\n    )\n)\necho.\necho 所有用户创建完成，默认密码: P@ssw0rd"),
            ("Ping 批量检测", "cmd", "@echo off\nchcp 65001 >nul\nset HOSTS=8.8.8.8 114.114.114.114 192.168.1.1 baidu.com github.com\necho 正在批量 Ping 测试...\necho.\nfor %%h in (%HOSTS%) do (\n    ping -n 2 %%h | find \"TTL=\" >nul\n    if %ERRORLEVEL%==0 (\n        echo   ✓ %%h 可达\n    ) else (\n        echo   ✗ %%h 不可达\n    )\n)\necho.\necho 测试完成!"),
            ("一键清理 npm 缓存", "cmd", "@echo off\nchcp 65001 >nul\necho ========== npm 缓存清理 ==========\nnpm cache clean --force\necho.\necho ========== node_modules 大小 ==========\nif exist node_modules (\n    du -sh node_modules 2>nul || dir /s /w node_modules 2>nul | find \"File(s)\"\n) else (\n    echo 当前目录没有 node_modules\n)\necho.\necho 完成!"),
            ("Bash 系统健康检查", "bash", "#!/bin/bash\necho '========== 系统健康检查 =========='\necho \"运行时间: $(uptime -p)\"\necho \"负载均值: $(cat /proc/loadavg)\"\necho \"\"\necho '--------- 内存使用 ---------'\nfree -h\necho \"\"\necho '--------- 磁盘使用 ---------'\ndf -h --total | grep -v tmpfs\necho \"\"\necho '--------- TOP 5 CPU 进程 ---------'\nps aux --sort=-%cpu | head -6"),
            ("Bash 批量下载文件", "bash", "#!/bin/bash\nURLS=(\n    'https://example.com/file1.zip'\n    'https://example.com/file2.zip'\n    'https://example.com/file3.zip'\n)\nOUTPUT_DIR='./downloads'\nmkdir -p \"$OUTPUT_DIR\"\ncd \"$OUTPUT_DIR\"\nfor url in \"${URLS[@]}\"; do\n    filename=$(basename \"$url\")\n    echo \"正在下载: $filename\"\n    curl -# -O \"$url\" -o \"$filename\" 2>&1\n    if [ $? -eq 0 ]; then\n        echo \"  ✓ 下载完成: $filename\"\n    else\n        echo \"  ✗ 下载失败: $url\"\n    fi\ndone\necho \"所有下载任务完成\""),
            ("Bash Git 分支清理", "bash", "#!/bin/bash\necho '检查已合并的分支...'\ngit checkout main 2>/dev/null || git checkout master 2>/dev/null\ngit pull --prune\nmerged_branches=$(git branch --merged | grep -v '\\*' | grep -v 'main' | grep -v 'master' | grep -v 'develop')\nif [ -n \"$merged_branches\" ]; then\n    echo \"以下分支已被合并，可以删除:\"\n    echo \"$merged_branches\"\n    echo \"\"\n    read -p \"是否删除这些分支? (y/n): \" answer\n    if [ \"$answer\" = \"y\" ]; then\n        echo \"$merged_branches\" | xargs -r git branch -d\n        echo \"✓ 清理完成\"\n    fi\nelse\n    echo '没有需要清理的分支'\nfi"),
            ("Bash 查找大文件", "bash", "#!/bin/bash\nTARGET_DIR=\"${1:-.}\"\nSIZE=\"${2:-100M}\"\necho \"正在查找 $TARGET_DIR 中大于 $SIZE 的文件...\"\necho \"\"\nfind \"$TARGET_DIR\" -type f -size +\"$SIZE\" -exec ls -lh {} \\; 2>/dev/null |\n    sort -k5 -h -r |\n    awk '{printf \"%5s  %s\\n\", $5, $NF}'\necho \"\"\necho \"--- 统计 ---\"\ntotal=$(find \"$TARGET_DIR\" -type f -size +\"$SIZE\" 2>/dev/null | wc -l)\necho \"共找到 $total 个大文件\""),
            ("Bash Docker 日志清理", "bash", "#!/bin/bash\necho 'Docker 日志清理工具'\necho '===================='\necho \"\"\necho '正在清理容器日志...'\nlogs=$(find /var/lib/docker/containers/ -name '*-json.log' 2>/dev/null | wc -l)\nif [ \"$logs\" -gt 0 ]; then\n    truncate -s 0 /var/lib/docker/containers/*/*-json.log 2>/dev/null\n    echo \"✓ 已清空 $logs 个日志文件\"\nelse\n    echo '未找到 Docker 容器日志（可能需要 sudo）'\nfi\necho \"\"\necho '释放的磁盘空间:'\ndocker system df\necho \"\"\necho '--- 清理未使用的资源 ---'\ndocker system prune -f --volumes 2>&1"),
            ("Bash 压缩备份", "bash", "#!/bin/bash\nBACKUP_DIR=\"${1:-./backup}\"\nTIMESTAMP=$(date +%Y%m%d_%H%M%S)\nARCHIVE_NAME=\"backup_$TIMESTAMP.tar.gz\"\necho \"创建备份: $ARCHIVE_NAME\"\necho \"源目录: $BACKUP_DIR\"\nif [ ! -d \"$BACKUP_DIR\" ]; then\n    echo \"错误: 目录 $BACKUP_DIR 不存在\"\n    exit 1\nfi\ntar -czf \"$ARCHIVE_NAME\" -C \"$(dirname \"$BACKUP_DIR\")\" \"$(basename \"$BACKUP_DIR\")\"\nif [ $? -eq 0 ]; then\n    size=$(du -h \"$ARCHIVE_NAME\" | cut -f1)\n    echo \"✓ 备份完成！文件大小: $size\"\nfi"),
            ("Bash 系统温度监控", "bash", "#!/bin/bash\necho '系统温度信息'\necho '================'\nif command -v sensors &> /dev/null; then\n    sensors\nelif [ -d /sys/class/thermal/ ]; then\n    for zone in /sys/class/thermal/thermal_zone*; do\n        [ -e \"$zone/temp\" ] || continue\n        type=$(cat \"$zone/type\" 2>/dev/null)\n        temp=$(cat \"$zone/temp\" 2>/dev/null)\n        temp_c=$(echo \"scale=1; $temp / 1000\" | bc 2>/dev/null || echo \"?\")\n        printf \"%-20s %s°C\\n\" \"$type\" \"$temp_c\"\n    done\nelse\n    echo '当前系统不支持温度读取'\nfi"),
            ("Bash 快速建站 (Python)", "bash", "#!/bin/bash\nPORT=\"${1:-8000}\"\nDIR=\"${2:-.}\"\necho \"正在启动 HTTP 服务器...\"\necho \"目录: $(realpath \"$DIR\")\"\necho \"地址: http://localhost:$PORT\"\necho \"\"\nif command -v python3 &> /dev/null; then\n    python3 -m http.server \"$PORT\" --directory \"$DIR\"\nelif command -v python &> /dev/null; then\n    python -m http.server \"$PORT\"\nelse\n    echo '错误: 未找到 Python'\n    exit 1\nfi"),
        ];
        for (name, language, content) in &demos {
            let id = uuid::Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO scripts (id, name, content, language, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![id, name, content, language, now, now],
            )
            .map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    // ============ Script CRUD ============

    pub fn add_script(&self, name: &str, content: &str, language: &str, folder_id: Option<&str>) -> Result<Script, String> {
        let id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO scripts (id, name, content, language, folder_id, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![id, name, content, language, folder_id, now, now],
        )
        .map_err(|e| e.to_string())?;
        Ok(Script { id, name: name.to_string(), content: content.to_string(), language: language.to_string(), folder_id: folder_id.map(|s| s.to_string()), created_at: now.clone(), updated_at: now })
    }

    pub fn update_script(&self, id: &str, name: &str, content: &str, language: &str, folder_id: Option<&str>) -> Result<Script, String> {
        let now = chrono::Utc::now().to_rfc3339();
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let rows = conn
            .execute(
                "UPDATE scripts SET name=?1, content=?2, language=?3, folder_id=?4, updated_at=?5 WHERE id=?6",
                params![name, content, language, folder_id, now, id],
            )
            .map_err(|e| e.to_string())?;
        if rows == 0 {
            return Err("脚本不存在".to_string());
        }
        self.get_script_internal(&conn, id)
    }

    pub fn delete_script(&self, id: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let rows = conn.execute("DELETE FROM scripts WHERE id=?1", params![id]).map_err(|e| e.to_string())?;
        if rows == 0 { return Err("脚本不存在".to_string()); }
        Ok(())
    }

    pub fn get_script(&self, id: &str) -> Result<Script, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        self.get_script_internal(&conn, id)
    }

    fn get_script_internal(&self, conn: &Connection, id: &str) -> Result<Script, String> {
        conn.query_row(
            "SELECT id, name, content, language, folder_id, created_at, updated_at FROM scripts WHERE id=?1",
            params![id],
            |row| Ok(Script { id: row.get(0)?, name: row.get(1)?, content: row.get(2)?, language: row.get(3)?, folder_id: row.get(4)?, created_at: row.get(5)?, updated_at: row.get(6)? }),
        ).map_err(|e| e.to_string())
    }

    pub fn list_scripts(&self, folder_id: Option<&str>) -> Result<Vec<Script>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let (sql, param_values): (&str, Vec<Box<dyn rusqlite::types::ToSql>>) = match folder_id {
            Some(fid) => (
                "SELECT id, name, content, language, folder_id, created_at, updated_at FROM scripts WHERE folder_id=?1 ORDER BY updated_at DESC",
                vec![Box::new(fid.to_string())],
            ),
            None => (
                "SELECT id, name, content, language, folder_id, created_at, updated_at FROM scripts ORDER BY updated_at DESC",
                vec![],
            ),
        };
        let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
        let params_ref: Vec<&dyn rusqlite::types::ToSql> = param_values.iter().map(|b| b.as_ref()).collect();
        let scripts = stmt
            .query_map(params_ref.as_slice(), |row| {
                Ok(Script { id: row.get(0)?, name: row.get(1)?, content: row.get(2)?, language: row.get(3)?, folder_id: row.get(4)?, created_at: row.get(5)?, updated_at: row.get(6)? })
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
        Ok(scripts)
    }

    // ============ Folder CRUD ============

    pub fn create_folder(&self, name: &str) -> Result<Folder, String> {
        let id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO folders (id, name, created_at, updated_at) VALUES (?1, ?2, ?3, ?4)",
            params![id, name, now, now],
        ).map_err(|e| e.to_string())?;
        Ok(Folder { id, name: name.to_string(), created_at: now.clone(), updated_at: now })
    }

    pub fn rename_folder(&self, id: &str, name: &str) -> Result<Folder, String> {
        let now = chrono::Utc::now().to_rfc3339();
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let rows = conn.execute(
            "UPDATE folders SET name=?1, updated_at=?2 WHERE id=?3",
            params![name, now, id],
        ).map_err(|e| e.to_string())?;
        if rows == 0 { return Err("文件夹不存在".to_string()); }
        conn.query_row(
            "SELECT id, name, created_at, updated_at FROM folders WHERE id=?1", params![id],
            |row| Ok(Folder { id: row.get(0)?, name: row.get(1)?, created_at: row.get(2)?, updated_at: row.get(3)? }),
        ).map_err(|e| e.to_string())
    }

    pub fn delete_folder(&self, id: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        // 将该文件夹下的脚本设为未分类
        conn.execute("UPDATE scripts SET folder_id=NULL WHERE folder_id=?1", params![id]).map_err(|e| e.to_string())?;
        let rows = conn.execute("DELETE FROM folders WHERE id=?1", params![id]).map_err(|e| e.to_string())?;
        if rows == 0 { return Err("文件夹不存在".to_string()); }
        Ok(())
    }

    pub fn list_folders(&self) -> Result<Vec<Folder>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn.prepare("SELECT id, name, created_at, updated_at FROM folders ORDER BY name ASC").map_err(|e| e.to_string())?;
        let folders = stmt.query_map([], |row| {
            Ok(Folder { id: row.get(0)?, name: row.get(1)?, created_at: row.get(2)?, updated_at: row.get(3)? })
        }).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();
        Ok(folders)
    }

    /// 设置自动启动
    pub fn set_autostart(&self, enabled: bool) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let value = if enabled { "true" } else { "false" };
        conn.execute("UPDATE settings SET value=?1 WHERE key='autostart'", params![value]).map_err(|e| e.to_string())?;
        Ok(())
    }

    // ============ 快捷键配置 ============

    /// 返回默认快捷键映射 (action → 快捷键字符串)
    pub fn default_shortcuts() -> HashMap<String, String> {
        let mut m = HashMap::new();
        m.insert("toggle_quicklaunch".to_string(), "Ctrl+P".to_string());
        m.insert("show_main".to_string(), "Ctrl+Shift+Space".to_string());
        m.insert("upload_image".to_string(), "Ctrl+Shift+U".to_string());
        m
    }

    /// 返回所有操作的默认标签 (action → 中文描述)
    pub fn shortcut_labels() -> HashMap<String, String> {
        let mut m = HashMap::new();
        m.insert("toggle_quicklaunch".to_string(), "快速搜索框".to_string());
        m.insert("show_main".to_string(), "打开主界面".to_string());
        m.insert("upload_image".to_string(), "剪贴板图片上传".to_string());
        m
    }

    /// 读取所有快捷键配置，未配置的返回默认值
    pub fn get_shortcuts(&self) -> Result<HashMap<String, String>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let saved: Option<String> = conn
            .query_row(
                "SELECT value FROM settings WHERE key='shortcuts'",
                [],
                |row| row.get(0),
            )
            .ok();
        let saved_map: HashMap<String, String> = match saved {
            Some(json) => serde_json::from_str(&json).unwrap_or_default(),
            None => HashMap::new(),
        };
        // 合并默认值：已保存的覆盖默认
        let mut result = Self::default_shortcuts();
        for (k, v) in saved_map {
            result.insert(k, v);
        }
        Ok(result)
    }

    /// 设置单个快捷键并持久化
    pub fn set_shortcut(&self, action: &str, shortcut: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        // 直接读 DB，不走 self.get_shortcuts() 避免死锁
        let saved: Option<String> = conn
            .query_row(
                "SELECT value FROM settings WHERE key='shortcuts'",
                [],
                |row| row.get(0),
            )
            .ok();
        let mut current: HashMap<String, String> = match saved {
            Some(json) => serde_json::from_str(&json).unwrap_or_default(),
            None => HashMap::new(),
        };
        if shortcut.is_empty() {
            current.remove(action);
        } else {
            current.insert(action.to_string(), shortcut.to_string());
        }
        let json = serde_json::to_string(&current).map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES ('shortcuts', ?1)",
            params![json],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    // ============ 云存储配置 ============

    /// 读取云存储配置，未配置时返回默认空配置
    pub fn get_cloud_config(&self) -> Result<CloudConfig, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let saved: Option<String> = conn
            .query_row(
                "SELECT value FROM settings WHERE key='cloud_config'",
                [],
                |row| row.get(0),
            )
            .ok();
        match saved {
            Some(json) => serde_json::from_str(&json).map_err(|e| e.to_string()),
            None => Ok(CloudConfig::default()),
        }
    }

    /// 保存云存储配置
    pub fn set_cloud_config(&self, config: &CloudConfig) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let json = serde_json::to_string(config).map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES ('cloud_config', ?1)",
            params![json],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    // ============ 导入导出 ============

    /// 添加上传记录
    pub fn add_upload(&self, url: &str, filename: &str, file_size: u64) -> Result<UploadRecord, String> {
        let id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO uploads (id, url, filename, file_size, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![id, url, filename, file_size, now],
        )
        .map_err(|e| e.to_string())?;
        Ok(UploadRecord { id, url: url.to_string(), filename: filename.to_string(), file_size, created_at: now })
    }

    /// 获取上传历史
    pub fn list_uploads(&self) -> Result<Vec<UploadRecord>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("SELECT id, url, filename, file_size, created_at FROM uploads ORDER BY created_at DESC LIMIT 100")
            .map_err(|e| e.to_string())?;
        let records = stmt
            .query_map([], |row| {
                Ok(UploadRecord {
                    id: row.get(0)?,
                    url: row.get(1)?,
                    filename: row.get(2)?,
                    file_size: row.get(3)?,
                    created_at: row.get(4)?,
                })
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
        Ok(records)
    }

    /// 删除上传记录
    pub fn delete_upload(&self, id: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let rows = conn
            .execute("DELETE FROM uploads WHERE id=?1", params![id])
            .map_err(|e| e.to_string())?;
        if rows == 0 {
            return Err("记录不存在".to_string());
        }
        Ok(())
    }

    // ============ 导入导出 ============

    pub fn export_data(&self) -> Result<String, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn.prepare("SELECT id, name, created_at, updated_at FROM folders ORDER BY name").map_err(|e| e.to_string())?;
        let folders: Vec<Folder> = stmt.query_map([], |row| {
            Ok(Folder { id: row.get(0)?, name: row.get(1)?, created_at: row.get(2)?, updated_at: row.get(3)? })
        }).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();

        let mut stmt = conn.prepare("SELECT id, name, content, language, folder_id, created_at, updated_at FROM scripts ORDER BY updated_at DESC").map_err(|e| e.to_string())?;
        let scripts: Vec<Script> = stmt.query_map([], |row| {
            Ok(Script { id: row.get(0)?, name: row.get(1)?, content: row.get(2)?, language: row.get(3)?, folder_id: row.get(4)?, created_at: row.get(5)?, updated_at: row.get(6)? })
        }).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();

        let export = serde_json::json!({
            "version": 1,
            "exported_at": chrono::Utc::now().to_rfc3339(),
            "folders": folders,
            "scripts": scripts,
        });
        serde_json::to_string_pretty(&export).map_err(|e| e.to_string())
    }

    pub fn import_data(&self, json_str: &str) -> Result<(usize, usize), String> {
        let import: ImportData = serde_json::from_str(json_str).map_err(|e| format!("JSON 解析失败: {e}"))?;
        let conn = self.conn.lock().map_err(|e| e.to_string())?;

        // 先收集已有文件夹名 → id 映射，避免重复创建同名文件夹
        let mut folder_map: std::collections::HashMap<String, String> = std::collections::HashMap::new();
        {
            let mut stmt = conn
                .prepare("SELECT id, name FROM folders")
                .map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map([], |row| {
                    let id: String = row.get(0)?;
                    let name: String = row.get(1)?;
                    Ok((id, name))
                })
                .map_err(|e| e.to_string())?;
            for row in rows.flatten() {
                folder_map.insert(row.1, row.0);
            }
        }

        // 为导入的文件夹创建新 ID（如已存在同名则复用）
        for f in &import.folders {
            if !folder_map.contains_key(&f.name) {
                let id = uuid::Uuid::new_v4().to_string();
                let now = chrono::Utc::now().to_rfc3339();
                conn.execute(
                    "INSERT INTO folders (id, name, created_at, updated_at) VALUES (?1, ?2, ?3, ?4)",
                    params![id, f.name, now, now],
                )
                .map_err(|e| e.to_string())?;
                folder_map.insert(f.name.clone(), id);
            }
        }

        // 导入脚本
        let mut script_count = 0;
        for s in &import.scripts {
            let id = uuid::Uuid::new_v4().to_string();
            let now = chrono::Utc::now().to_rfc3339();
            let fid = s.folder_name.as_ref().and_then(|n| folder_map.get(n)).cloned();
            conn.execute(
                "INSERT INTO scripts (id, name, content, language, folder_id, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![id, s.name, s.content, s.language, fid, now, now],
            ).map_err(|e| e.to_string())?;
            script_count += 1;
        }

        Ok((import.folders.len(), script_count))
    }
}
