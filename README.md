<div align="center">

<img src="build/icon-source.png" width="128" alt="DeskLLMPet" />

# 🐾 DeskLLMPet 桌宠大肥鱼 doge~

**支持 AI 对话的交互式桌面宠物应用**

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Electron](https://img.shields.io/badge/electron-28.3.3-9feaf9.svg)](https://www.electronjs.org/)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS-lightgrey.svg)](#)
[![Release](https://img.shields.io/badge/release-v1.0.0-brightgreen.svg)](https://github.com/isKage/desk-llm-pet/releases)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-ff69b4.svg)](https://github.com/isKage/desk-llm-pet/pulls)


</div>

> 本项目**完全由 DeepSeek Harness 生成**。

> 感谢 [dsh-pet](https://github.com/PC2005-cloud/dsh-pet) 项目的灵感，本项目的所有动画素材均来自 dsh-pet 项目。

> 本项目桌宠形象采用【DeepSeek 娘】，侵权则删。提供自定义桌宠形象功能，见后（自定义动画资源需要自行生成）。

![桌宠部分功能演示](readme-assets/show_high.gif)


---

## ✨ 功能特性

### 🎬 桌面宠物
- **WebM 动画播放**：支持透明通道的 WebM 动画素材
- **随机动画切换**：从闲置动画池中随机挑选播放
- **点击互动**：鼠标点击切换反应动画，显示可爱提示文字
- **拖拽移动**：按住宠物拖拽到屏幕任意位置
- **右键菜单**：快速访问对话、设置、隐藏等功能

### 💬 AI 对话
- **现代聊天界面**：模仿 DeepSeek 网页端设计风格
- **流式响应**：支持 SSE 流式输出，实时显示回复
- **多模型支持**：兼容 OpenAI API 格式（DeepSeek、OpenAI 等）
- **对话历史**：本地持久化保存，支持清空和查看
- 更多功能待改进...

### ⚙️ 可视化配置
- **API 配置**：直观配置 API 地址、密钥、模型等参数
- **动画素材管理**：可视化选择闲置/点击动画池
- **外观设置**：调节 Pet 透明度、大小缩放（Windows 系统需退出重进生效）
- **快速预设**：一键填入 DeepSeek/OpenAI 常用配置

---

## 📦 安装与运行

### 方式一：下载预构建安装包（推荐）

从 [Releases](https://github.com/isKage/desk-llm-pet/releases) 页面下载对应平台的安装包：

| 平台 | 安装包 | 说明 |
|------|--------|------|
| 🍎 macOS | `DeskLLMPet-1.0.0-arm64.dmg` | Apple Silicon (M1/M2/M3) |
| 🍎 macOS | `DeskLLMPet-1.0.0-x64.dmg` | Intel Mac |
| 🪟 Windows | `DeskLLMPet-Setup-1.0.0.exe` | x64 安装程序 |

#### macOS 安装

1. 下载 `.dmg` 文件，双击挂载
2. 将 `DeskLLMPet.app` 拖入 `Applications` 文件夹
3. 首次打开时，如果系统提示"无法验证开发者"，请前往 **系统设置 → 隐私与安全性**，点击 **仍要打开**
4. 应用启动后，桌面上会出现你的宠物！

#### Windows 安装

1. 下载 `.exe` 安装程序，双击运行
2. 选择安装路径，按向导完成安装
3. 安装完成后自动创建桌面快捷方式
4. 双击快捷方式启动应用


<div align="center">
<img src="readme-assets/01.jpg" width="90%" alt="DeskLLMPet" />
</div>

<div align="center">
<img src="readme-assets/02.jpg" width="90%" alt="DeskLLMPet" />
</div>

### 方式二：从源码构建运行

```bash
# 1. 克隆项目
git clone https://github.com/isKage/desk-llm-pet.git
cd DeskLLMPet

# 2. 安装依赖
npm install

# 3. 直接运行（开发模式）
npm run dev

# 4. 打包安装包
npm run build:mac   # 打包 macOS
npm run build:win   # 打包 Windows
npm run build:all   # 同时打包两个平台
```

> 📦 打包产物在 `dist/` 目录下。

---

## 🔑 API 配置

应用启动后，右键点击宠物 → **设置**，配置你的 LLM API：

| 服务 | API 地址 | 模型示例 |
|------|---------|---------|
| DeepSeek | `https://api.deepseek.com/v1/chat/completions` | `deepseek-chat` |
| OpenAI | `https://api.openai.com/v1/chat/completions` | `gpt-4`, `gpt-3.5-turbo` |
| 自定义 | 你的 API 地址（兼容 OpenAI 格式） | 你的模型名 |

> 🔒 API 密钥仅保存在本地，不会上传到任何服务器。

---

## 🎨 自定义

### 更换应用图标

应用图标文件位于 `build/` 目录：

```
build/
├── icon.png        # 通用图标 (512×512)
├── icon.icns       # macOS 图标
├── icon.ico        # Windows 图标
└── tray-icon.png   # 系统托盘图标 (16×16 / 32×32)
```

替换方式：

1. 准备一张 **1024×1024** 的 PNG 图片（建议带透明背景）
2. 使用在线工具生成各平台图标：
   - [icns 生成](https://cloudconvert.com/png-to-icns) — 上传 PNG，转为 `.icns`
   - [ico 生成](https://cloudconvert.com/png-to-ico) — 上传 PNG，转为 `.ico`（选择 256×256）
3. 将生成的文件替换 `build/` 目录下的对应文件
4. 重新打包即可

### 自定义动画素材

将 `.webm` 格式的动画文件放入对应目录（动画素材过大，不上传，素材来源于 [dsh-pet](https://github.com/PC2005-cloud/dsh-pet)，具体要求可见 dsh-pet 项目）。


---

## 🗑️ 卸载与清理

### macOS 卸载

```bash
# 1. 退出应用（右键托盘图标 → 退出）
# 2. 删除应用
rm -rf /Applications/DeskLLMPet.app

# 3. 清理应用数据（缓存、配置、对话历史）
rm -rf ~/Library/Application\ Support/deskllmpet

# 4. 清理日志（可选）
rm -rf ~/Library/Logs/DeskLLMPet
```

> 也可以直接在 Finder 中将 `DeskLLMPet.app` 拖入废纸篓，然后手动删除数据目录。

### Windows 卸载

**方法一：通过控制面板**

1. 打开 **控制面板 → 程序和功能**（或 **设置 → 应用 → 已安装的应用**）
2. 找到 `DeskLLMPet`
3. 点击 **卸载**

**方法二：通过开始菜单**

1. 打开 **开始菜单**
2. 找到 `DeskLLMPet` 文件夹
3. 点击 `Uninstall DeskLLMPet`

**手动清理残留数据：**

```
# 删除应用数据目录（配置、对话历史、缓存）
%APPDATA%\deskllmpet

# 通常位于：
C:\Users\<用户名>\AppData\Roaming\deskllmpet
```

> 按 `Win + R`，输入 `%APPDATA%\deskllmpet` 回车，直接打开该目录并删除。

### 清理内容说明

| 目录/文件 | 内容 | 删除后影响 |
|-----------|------|-----------|
| `~/Library/Application Support/deskllmpet/` (macOS) | 配置、API密钥、对话历史 | 所有设置和对话记录丢失 |
| `%APPDATA%\deskllmpet` (Windows) | 配置、API密钥、对话历史 | 所有设置和对话记录丢失 |
| `~/Library/Logs/DeskLLMPet/` (macOS) | 应用日志 | 仅日志丢失，不影响功能 |
| `/Applications/DeskLLMPet.app` (macOS) | 应用本体 | 应用不可用 |

---

## 🏗️ 技术架构

```
DeskLLMPet/
├── package.json                 # 项目配置与依赖
├── README.md                    # 项目文档
├── .gitignore                   # Git 忽略规则
├── src/
│   ├── main/                    # Electron 主进程
│   │   ├── main.js              # 入口，应用生命周期
│   │   ├── pet-window.js        # 桌宠透明窗口
│   │   ├── chat-window.js       # LLM 对话窗口
│   │   ├── settings-window.js   # 设置窗口
│   │   ├── tray.js              # 系统托盘
│   │   └── ipc-handlers.js      # IPC 通信处理
│   ├── preload/                 # 预加载脚本（安全桥接）
│   │   ├── pet-preload.js
│   │   ├── chat-preload.js
│   │   └── settings-preload.js
│   ├── renderer/                # 渲染进程（UI 页面）
│   │   ├── pet/                 # 桌宠页面
│   │   ├── chat/                # 对话页面
│   │   └── settings/            # 设置页面
│   └── shared/                  # 共享模块
│       ├── store.js             # 持久化存储
│       └── llm-client.js        # LLM API 客户端
├── assets/
│   ├── animations/              # 动画素材
│   │   ├── idle/                # 闲置动画
│   │   └── click/               # 点击反应动画
│   └── thumb/                   # 缩略图/素材
└── build/                       # 构建资源（图标等）
    ├── icon.png
    ├── icon.icns
    ├── icon.ico
    └── tray-icon.png

```

---

## 🛠️ 技术栈

| 技术 | 用途 |
|------|------|
| [Electron 28](https://www.electronjs.org/) | 跨平台桌面框架 |
| [electron-builder](https://www.electron.build/) | 打包与分发 |
| [electron-store](https://github.com/sindresorhus/electron-store) | 本地持久化存储 |
| 原生 HTML/CSS/JS | 渲染进程 UI |
| OpenAI 兼容 API | LLM 对话服务 |

---

## 📝 开发指南

### 开发模式

```bash
npm run dev  # 运行应用并打开 DevTools
```

### 安全原则

- 使用 `contextIsolation: true` 隔离渲染进程
- 通过 `contextBridge` 暴露安全 API
- API 密钥仅存储在本地，不上传

---

## 📄 License

MIT © [isKage](https://github.com/isKage)

---

<div align="center">
  <sub>Made with ❤️ by DeskLLMPet</sub>
</div>