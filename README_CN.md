# PPT 语音 AI 改写工具

**中文** | [🌐 English](README.md)

> 🎙️ 录音 → 📝 语音识别 → ✨ AI 改写 → 📊 生成 PPT
>
> 把口述内容一键转化为结构化的 PowerPoint 演示文稿

本项目提供**两种交付形态**，满足不同场景需求：

| 形态 | 目录 | 适用场景 |
|---|---|---|
| 🌐 **Web 版**（推荐） | `src/` | 跨平台、免安装、浏览器即用，服务端生成 PPT |
| 🖥️ **桌面版** | `PPTVoiceRewrite/` | Windows 桌面应用，操控本地已打开的 PPT |

---

## 🔗 与 OpenAI 的关联性

本项目**深度集成 OpenAI 的 API 生态**。部署前请务必了解这一关联关系：

### 桌面版 —— 直接调用 OpenAI 官方 API

桌面版（`PPTVoiceRewrite/`）**直接调用 OpenAI 官方 API 端点**，需要用户自行提供 OpenAI API Key：

| 功能 | 使用的 OpenAI 服务 | 端点 |
|---|---|---|
| 语音转文字 | **OpenAI Whisper**（`whisper-1` 模型） | `POST https://api.openai.com/v1/audio/transcriptions` |
| 文案改写 | **OpenAI GPT**（`gpt-3.5-turbo` / `gpt-4` / `gpt-4o` / `gpt-4o-mini`） | `POST https://api.openai.com/v1/chat/completions` |
| 密钥校验 | OpenAI 模型列表（轻量校验，不消耗 token） | `GET https://api.openai.com/v1/models` |

**桌面版用户需自行承担的事项：**
1. **申请 OpenAI API Key** —— 在 [platform.openai.com](https://platform.openai.com/) 注册，创建 API Key（`sk-` 开头），并完成充值。
2. **妥善保管密钥** —— 密钥使用 AES-256-CBC 加密存储在本地，但仍需注意不要泄露 `config/config.json`。
3. **支付 OpenAI 使用费用** —— Whisper 和 GPT 调用按次计费，详见 [OpenAI 定价](https://openai.com/pricing)。
4. **需联网访问** —— 必须能访问 `api.openai.com`。网络受限地区的用户可在「密钥设置」中配置自定义 `base_url`（中转 / 代理 API）。

### Web 版 —— 间接兼容 OpenAI 接口

Web 版（`src/`）使用 `z-ai-web-dev-sdk`，该 SDK 提供**与 OpenAI 兼容的 API 接口**，但请求实际通过 Z.ai 的网关服务转发，而非直接调用 OpenAI：

```typescript
// SDK 暴露的是 OpenAI 风格的 API
import ZAI from 'z-ai-web-dev-sdk';
const zai = await ZAI.create();

// 语音转文字（OpenAI Whisper 兼容接口）
await zai.audio.asr.create({ file_base64 });

// 对话补全（OpenAI GPT 兼容接口）
await zai.chat.completions.create({ messages, thinking });
```

**这意味着什么：**
- ✅ **无需 OpenAI API Key** —— Web 版由 SDK 在服务端处理鉴权。
- ✅ **OpenAI 兼容接口** —— 若想把 Web 版改为直接使用 OpenAI，只需把 SDK 调用替换为官方 `openai` npm 包，请求/响应结构完全兼容。
- ⚠️ **实际服务方不同** —— Web 版实际承载的模型是 `glm-4-plus`（Z.ai 的模型），并非 OpenAI 的 GPT，输出风格和质量可能存在差异。
- 💡 **迁移到 OpenAI 的方法**：安装 `openai` 包，把三个 API 路由（`/api/asr`、`/api/rewrite`、`/api/ppt`）中的调用改为 `openai.audio.transcriptions.create()` 和 `openai.chat.completions.create()` 即可。

### OpenAI API Key 申请流程

如果您选择桌面版，或希望把 Web 版迁移到 OpenAI：

1. 访问 [platform.openai.com](https://platform.openai.com/)
2. 注册 / 登录账号
3. 进入 **API Keys** → **Create new secret key**
4. 复制 `sk-...` 开头的密钥（仅展示一次）
5. 在 **Billing** 下绑定支付方式
6. 在 **Usage limits** 下设置用量上限

> ⚠️ **安全提示**：切勿将 API Key 提交到 git 仓库。`.gitignore` 已排除 `config/config.json` 和 `.env` 文件。

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
| ASR | z-ai-web-dev-sdk `audio.asr.create()`（OpenAI Whisper 兼容接口） |
| LLM | z-ai-web-dev-sdk `chat.completions.create()` → `glm-4-plus`（OpenAI GPT 兼容接口） |
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
- 📝 **OpenAI Whisper** 语音识别
- ✨ **OpenAI GPT** 文案改写（支持中转 API 地址）
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
| 密钥管理 | 无需（服务端内置） | 用户自配 **OpenAI API Key** |
| PPT 产出 | 生成全新 .pptx 下载 | 覆盖已打开 PPT 文本框 |
| 原文备份 | 无 | ✅ 含回滚功能 |
| 离线使用 | ❌ 需联网 | ❌ 需联网（调用 OpenAI） |
| AI 服务方 | Z.ai（glm-4-plus，OpenAI 兼容） | **OpenAI**（Whisper + GPT） |

---

## 📋 版本历史

- **Web 版 V1.0**：浏览器录音 + ASR + LLM 改写 + pptxgenjs 生成
- **桌面版 V1.1**：修复 5 个致命 Bug + 13 项健壮性改进（详见 [CHANGELOG](PPTVoiceRewrite/CHANGELOG.md)）

---

## 📄 许可

本项目源码可自由使用、修改、分发。

AI 能力由以下方提供：
- **Web 版**：`z-ai-web-dev-sdk`（Z.ai 网关，OpenAI 兼容接口）
- **桌面版**：**OpenAI API**（Whisper + GPT，用户提供密钥）

用户需自行承担所使用 AI 服务方的相应费用。
