# QuickKit

Windows 桌面端快捷工具集 — 代码片段管理、剪贴板图片上传、日常效率工具。

按下 **Ctrl+P** 弹出全局搜索框，输入关键词即可找到需要的代码片段，回车一键复制到剪贴板。

## 功能

- **全局快速搜索** — 系统级 Ctrl+P 快捷键，任何界面都能呼出
- **多词过滤** — 输入 `docker compose` 同时匹配多个关键词
- **24 种语言支持** — JavaScript、Python、Go、Rust、SQL 等
- **语法高亮** — 查看代码时自动着色（highlight.js）
- **增删改查** — 完整的代码片段管理
- **剪贴板图片上传** — 截图后快捷键上传到七牛云等云存储，自动返回 URL
- **开机自启** — 可选开机自动运行
- **可配置快捷键** — 自由定制全局快捷键

## 截图

<!-- TODO: 添加截图 -->

## 技术栈

| 层 | 技术 |
|------|------|
| 前端 | React 19 + TypeScript + TailwindCSS v3 + shadcn/ui |
| 后端 | Rust + Tauri v2 |
| 存储 | SQLite (rusqlite) |
| 搜索 | 自定义多词 AND 匹配 |
| 剪贴板 | clipboard-win / arboard |
| 高亮 | highlight.js |
| 图标 | lucide-react |

## 快速开始

```bash
# 安装依赖
bun install

# 开发模式
bun tauri dev

# 构建生产版本
bun tauri build
```

## 项目结构

```
src/                          # React 前端
├── App.tsx                   # 主界面（侧边栏 + 页面路由）
├── main.tsx                  # 入口
├── index.css                 # Tailwind 指令 + 主题变量
├── quicklaunch_main.tsx      # QuickLaunch 独立入口
├── types.ts                  # 共享类型 + 语言配置
├── lib/utils.ts              # cn() 工具
├── components/
│   ├── SyntaxHighlight.tsx   # 语法高亮组件
│   ├── KeyCapture.tsx        # 快捷键录制组件
│   └── ui/                   # shadcn UI 组件
│       ├── button.tsx
│       ├── input.tsx
│       ├── select.tsx
│       ├── switch.tsx
│       └── badge.tsx
└── pages/
    ├── ScriptList.tsx        # 代码片段列表 + 详情
    ├── ScriptEditor.tsx      # 新增/编辑
    ├── Settings.tsx          # 设置页
    └── QuickLaunchWindow.tsx # 全局搜索框

src-tauri/                    # Rust 后端
├── src/
│   ├── lib.rs                # Tauri 入口 + 命令 + 全局快捷键
│   ├── main.rs               # Windows 子系统
│   ├── db.rs                 # SQLite CRUD
│   ├── executor.rs           # 脚本执行（可选）
│   ├── uploader.rs           # 云存储上传
│   └── autostart.rs          # 开机自启持久化
├── Cargo.toml
└── tauri.conf.json
```

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+P` | 全局搜索框（任何界面） |
| `Ctrl+Shift+U` | 剪贴板图片上传到云存储 |
| `↑ ↓` | 选择结果 |
| `Enter` | 复制到剪贴板并关闭 |
| `Esc` | 关闭搜索框 |

> 所有快捷键均可在设置页自定义配置。

## 构建要求

- [Rust](https://www.rust-lang.org/) (latest stable)
- [Bun](https://bun.sh/) (或 npm/pnpm)
- Windows 10/11（仅支持 Windows）

## TODO

参见 [TODO.md](TODO.md)

## License

MIT
