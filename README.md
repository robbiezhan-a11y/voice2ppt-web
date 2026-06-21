# PPT 语音 AI 改写工具

> 🎙️ 录音 → 📝 语音识别 → ✨ AI 改写 → 📊 生成 PPT
>
> 把口述内容一键转化为结构化的 PowerPoint 演示文稿

本项目提供**两种交付形态**，满足不同场景需求：

| 形态 | 目录 | 适用场景 |
|---|---|---|
| 🌐 **Web 版**（推荐） | `src/` | 跨平台、免安装、浏览器即用，服务端生成 PPT |
| 🖥️ **桌面版** | `PPTVoiceRewrite/` | Windows 桌面应用，操控本地已打开的 PPT |

---

## 🌐 Web 版（推荐）

基于 Next.js 16 + React 19 + TypeScript 构建，浏览器录音，服务端 AI 处理，生成 .pptx 下载。

### 核心特性

- 🎙️ **浏览器原生录音**：MediaRecorder API，实时 VU 电平条 + 录音时长 + 暂停/恢复
- 📝 **AI 语音识别**：基于 ASR SDK，16kHz 单声道优化，25MB 文件预检
- ✨ **智能文案改写**：5 种风格预设（精简/正式/通俗/要点/叙事）+ 自定义提示词
- 📊 **一键生成 PPT**：LLM 自动结构化 + pptxgenjs 生成，3 种模板主题
- 📱 **响应式设计**：桌面 / 平板 / 手机 均适配
- 🔒 **隐私友好**：录音在浏览器本地，数据不持久化，无需 API Key

### 技术栈

| 层 | 技术 |
|---|---|
| 前端 | Next.js 16, React 19, TypeScript 5, Tailwind CSS 4, shadcn/ui |
| 录音 | 浏览器 MediaRecorder API + AudioContext (AnalyserNode) |
| ASR | z-ai-web-dev-sdk `audio.asr.create()` |
| LLM | z-ai-web-dev-sdk `chat.completions.create()` (glm-4-plus) |
| PPT 生成 | pptxgenjs 4.0 |
| 图标 | lucide-react |

### 项目结构

```
src/
├─ app/
│  ├─ page.tsx              # 主页面（录音 UI + 提示词 + 预览 + 下载）
│  ├─ layout.tsx            # 根布局
│  └─ api/
│     ├─ asr/route.ts       # 语音转文字 API
│     ├─ rewrite/route.ts   # AI 文案改写 API
│     └─ ppt/route.ts       # PPT 生成 API（LLM 结构化 + pptxgenjs）
├─ hooks/
│  └─ use-audio-recorder.ts # 浏览器录音 Hook
└─ components/ui/           # shadcn/ui 组件库
```

### 快速开始

```bash
# 安装依赖
bun install   # 或 npm install

# 启动开发服务器
bun run dev   # http://localhost:3000

# 代码检查
bun run lint
```

### 使用流程

1. 打开网页 → 点击绿色录音按钮 → 授权麦克风 → 口述内容
2. 点击停止 → 点击「开始语音识别」→ ASR 自动转文字
3. 可编辑识别结果 → 点击「AI 改写文案」→ LLM 优化文案
4. 可编辑改写结果 → 点击「生成 PPT」→ 下载 .pptx 文件

---

## 🖥️ 桌面版（Windows）

基于 Python + PyQt6 构建，操控本地已打开的 PowerPoint/WPS，批量写入选中幻灯片文本框。

### 核心特性

- 🎙️ pyaudio 录音（16K 单声道 wav）
- 📝 OpenAI Whisper 语音识别
- ✨ GPT 文案改写（支持中转 API 地址）
- 📊 win32com 操控已打开 PPT，分段写入选中文本框
- 🔒 API Key AES-256-CBC 加密存储
- 📋 历史记录含 PPT 原文备份（可回滚）
- 📦 PyInstaller + Inno Setup 一键打包安装包

### 目录结构

```
PPTVoiceRewrite/
├─ main.py              # 主程序源码（V1.1，948 行）
├─ generate_icon.py     # 图标生成脚本
├─ icon.ico             # 程序图标
├─ requirements.txt     # Python 依赖清单
├─ build.bat            # PyInstaller 打包脚本
├─ install.iss          # Inno Setup 安装包脚本
├─ config/config.json   # 默认配置
├─ README.md            # 快速开始
├─ CHANGELOG.md         # 变更记录
└─ docs/                # 开发/打包/运维文档
```

### 快速开始

```cmd
cd PPTVoiceRewrite
pip install -r requirements.txt
python generate_icon.py        # 生成图标
python main.py                 # 源码运行调试
build.bat                      # 打包 EXE
# Inno Setup 打开 install.iss → Ctrl+F9 编译安装包
```

详见 [`PPTVoiceRewrite/README.md`](PPTVoiceRewrite/README.md)。

---

## 🔄 两种形态对比

| 维度 | Web 版 | 桌面版 |
|---|---|---|
| 跨平台 | ✅ Win/Mac/Linux/手机 | ❌ 仅 Windows |
| 安装 | 免安装，开网址即用 | 需装 EXE + VC++ 运行库 |
| 依赖 Office | ❌ 服务端生成 | ✅ 必须装 PowerPoint/WPS |
| 密钥管理 | 无需（服务端内置） | 用户自配 OpenAI Key |
| PPT 产出 | 生成全新 .pptx 下载 | 覆盖已打开 PPT 文本框 |
| 原文备份 | 无 | ✅ 含回滚功能 |
| 离线使用 | ❌ 需联网 | ❌ 需联网（调 OpenAI） |

---

## 📋 版本历史

- **Web 版 V1.0**：浏览器录音 + ASR + LLM 改写 + pptxgenjs 生成
- **桌面版 V1.1**：修复 5 个致命 Bug + 13 项健壮性改进（详见 [CHANGELOG](PPTVoiceRewrite/CHANGELOG.md)）

---

## 📄 许可

本项目源码可自由使用、修改、分发。

AI 能力由 z-ai-web-dev-sdk 提供（Web 版）或 OpenAI API 提供（桌面版），需用户自行承担相应服务费用。
