# PPT 语音 AI 改写工具 - Web 版

> 浏览器录音 → AI 语音识别 → 智能文案改写 → 一键生成 PPT 下载
> 跨平台 · 免安装 · 无需 Office · 支持 Win/Mac/Linux/手机

---

## 🎯 与桌面版（A 路线）对比

| 特性 | 桌面版 V1.1（A 路线） | Web 版（B 路线） |
|---|---|---|
| 部署形态 | Windows EXE + 安装包 | Web 应用（浏览器访问） |
| 跨平台 | ❌ 仅 Windows | ✅ Win / Mac / Linux / 手机 |
| 安装 | 需安装 EXE | 免安装，打开网址即用 |
| 依赖 Office | ✅ 必须装 PowerPoint/WPS | ❌ 不需要，服务端生成 PPT |
| 录音 | pyaudio + 桌面麦克风 | 浏览器 MediaRecorder API |
| 语音识别 | OpenAI Whisper API | z-ai-web-dev-sdk ASR |
| 文案改写 | OpenAI GPT API | z-ai-web-dev-sdk LLM |
| PPT 生成 | win32com 操控已打开 PPT | pptxgenjs 服务端生成 .pptx |
| 密钥管理 | 用户自配 OpenAI Key | 无需密钥（服务端内置） |
| PPT 写入方式 | 覆盖已打开 PPT 的文本框 | 生成全新 .pptx 下载 |
| 历史记录 | 本地 JSON 文件 | 浏览器内存（会话级） |

## 🏗️ 技术架构

```
浏览器（前端）                      服务端（Next.js API Routes）
┌─────────────────┐                ┌──────────────────────────┐
│  MediaRecorder  │  base64 audio  │  /api/asr                │
│  录制 webm/opus │ ─────────────▶ │  z-ai-web-dev-sdk ASR    │
│  VU 电平+时长   │                │  → 识别文本              │
│  暂停/恢复      │                └──────────────────────────┘
└─────────────────┘                ┌──────────────────────────┐
┌─────────────────┐   origin+prompt│  /api/rewrite            │
│  提示词配置     │ ─────────────▶ │  z-ai-web-dev-sdk LLM    │
│  风格预设       │                │  → 改写文案              │
│  模板选择       │                └──────────────────────────┘
└─────────────────┘                ┌──────────────────────────┐
┌─────────────────┐  rewrite text  │  /api/ppt                │
│  改写结果预览   │ ─────────────▶ │  LLM 结构化 → slides[]   │
│  可编辑         │                │  pptxgenjs 生成 .pptx    │
│  下载 .pptx     │ ◀───────────── │  → 二进制文件下载        │
└─────────────────┘                └──────────────────────────┘
```

## 📁 文件结构

```
src/
├─ app/
│  ├─ page.tsx              主页面（录音 UI + 提示词 + 预览 + 下载）
│  ├─ layout.tsx            根布局
│  └─ api/
│     ├─ asr/route.ts       语音转文字 API
│     ├─ rewrite/route.ts   AI 文案改写 API
│     └─ ppt/route.ts       PPT 生成 API（LLM 结构化 + pptxgenjs）
├─ hooks/
│  └─ use-audio-recorder.ts 浏览器录音 Hook（MediaRecorder + VU 电平）
└─ components/ui/           shadcn/ui 组件库
```

## ✨ 核心功能

### 1. 浏览器录音
- MediaRecorder API，输出 webm/opus（Chrome 默认）
- 实时 VU 电平条（绿/黄/红三色）
- 录音时长显示
- 暂停 / 恢复 / 停止
- 麦克风权限错误友好提示

### 2. 语音识别（ASR）
- 16kHz 单声道优化
- 25MB 文件大小预检
- base64 上传，返回识别文本
- 可手动编辑识别结果

### 3. AI 文案改写（LLM）
- 5 种风格预设（精简/正式/通俗/要点/叙事）
- 自定义提示词
- 输出按段落分隔（适配 PPT 分页）
- 可手动编辑改写结果

### 4. PPT 生成（pptxgenjs）
- LLM 自动结构化为幻灯片数组（标题 + 要点）
- 3 种模板主题（清新绿/深色商务/极简白）
- 自动生成封面页 + 内容页 + 结束页
- 16:9 宽屏，含页码
- 下载为 .pptx 文件（可直接用 PowerPoint/WPS/Keynote 打开）

### 5. 历史记录
- 会话级存储（浏览器内存）
- 可查看历史记录原文 + 改写结果
- 一键重新生成 PPT

## 🚀 使用流程

1. 打开网页（无需安装）
2. 点击「🎙️ 开始录音」，口述内容（观察电平条）
3. 点击「🛑 停止」结束录音
4. 点击「语音识别」→ ASR 自动转文字
5. 可编辑识别结果
6. 点击「✨ AI 改写文案」→ LLM 优化文案
7. 可编辑改写结果
8. 点击「📥 生成 PPT」→ 下载 .pptx 文件

## 🔒 隐私说明

- 录音在浏览器本地完成
- 音频 base64 上传仅用于本次识别，不持久化
- 历史记录仅存浏览器内存，关闭页面即清除
- 服务端不存储任何用户数据

## 🛠️ 技术栈

- **前端**：Next.js 16 + React 19 + TypeScript + Tailwind CSS 4 + shadcn/ui
- **录音**：浏览器 MediaRecorder API + AudioContext (AnalyserNode)
- **ASR**：z-ai-web-dev-sdk `audio.asr.create()`
- **LLM**：z-ai-web-dev-sdk `chat.completions.create()`（glm-4-plus）
- **PPT**：pptxgenjs 4.0
- **图标**：lucide-react

## ✅ 验证结果

- ESLint：0 errors
- 页面渲染：桌面 + 移动端响应式正常
- 交互测试：录音按钮、Toast 错误提示正常
- Rewrite API：真实 LLM 调用成功（glm-4-plus）
- ASR API：错误处理正确
- PPT API：真实生成 75KB .pptx 文件，Content-Type 正确
