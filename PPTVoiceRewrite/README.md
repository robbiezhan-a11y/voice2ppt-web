# PPT 语音 AI 改写工具 V1.1

> 麦克风实时录音 → OpenAI Whisper 语音识别 → GPT 智能文案改写 → 一键批量写入选中 PPT 幻灯片

适配 Microsoft Office PowerPoint 与 WPS 演示，全程可视化 GUI 操作，内置密钥加密存储、操作历史记录（含原文备份）、自定义 AI 改写规则。

---

## 📦 交付包内容

```
PPTVoiceRewrite/
├─ main.py                 主程序源码（V1.1 已修复全部已知问题）
├─ generate_icon.py        图标生成脚本（Pillow）
├─ icon.ico                程序图标（256×256 多尺寸，已生成）
├─ icon.png                图标 PNG 源文件
├─ requirements.txt        依赖清单（已清理无用依赖）
├─ build.bat               PyInstaller 一键打包脚本
├─ install.iss             Inno Setup 安装包脚本
├─ README.md               本文件（快速开始）
├─ CHANGELOG.md            版本变更记录
├─ config/
│  └─ config.json          默认配置（首次安装写入，升级不覆盖）
├─ record/                 录音存储目录（运行时自动生成）
├─ history/                历史记录目录（运行时自动生成）
├─ assets/
│  └─ icon.ico             图标备份
└─ docs/
   ├─ 开发文档.md           技术架构与模块说明
   ├─ 打包详细文档.md       PyInstaller + Inno Setup 全流程
   └─ 运维部署文档.md       部署、运维、故障排查
```

---

## 🚀 快速开始（开发者）

### 1. 环境准备
- **操作系统**：Windows 10 / Windows 11 64 位
- **Python**：3.10 64 位（安装时勾选 *Add Python to PATH*）
- **VC++ 运行库**：VC++ 2015-2022 x64（PyQt6 / pywin32 依赖，缺省会闪退）
  下载：https://aka.ms/vs/17/release/vc_redist.x64.exe
- **Office/WPS**：完整安装版（精简绿色版缺 COM 组件无法调用）

### 2. 安装依赖
```cmd
cd PPTVoiceRewrite
pip install -r requirements.txt
```
> pyaudio 若 pip 安装失败，使用离线 whl：
> `pip install PyAudio-0.2.13-cp310-cp310-win_amd64.whl`

### 3. 生成图标（如需）
```cmd
python generate_icon.py
```

### 4. 源码运行调试
```cmd
python main.py
```

### 5. 打包成 EXE
```cmd
双击 build.bat
```
产物：`dist\PPTVoiceRewrite\PPTVoiceRewrite.exe`

### 6. 制作安装包
1. 安装 [Inno Setup 6](https://jrsoftware.org/isdl.php)
2. 打开 Inno Setup Compiler → File → Open → 选择 `install.iss`
3. 按 `Ctrl+F9` 编译
4. 产物：`安装包成品\PPTVoiceRewrite_Setup_v1.1.exe`

---

## 🎯 使用流程（终端用户）

1. 双击启动程序
2. 点击 **🔑 密钥设置**，填入 OpenAI API Key，选择模型，保存
3. 在 PowerPoint / WPS 中打开 PPT，**选中要改写的幻灯片**（可多选）
4. 回到本工具，在 **✍️ AI 改写自定义要求** 中编辑提示词
5. 点击 **🎙️ 开始录音**，口述内容（观察电平条 + 时长）
6. 点击 **🛑 结束录音**，等待 AI 识别改写
7. 在预览窗口确认/编辑改写结果
8. 点击 **写入 PPT**，改写内容按段落自动写入不同文本框
9. 历史记录可随时查看，含写入前原文备份

---

## 🔒 安全说明
- API Key 使用 **AES-256-CBC** 加密存储在本地 `config/config.json`
- 软件无任何后台上传行为，录音 / 历史仅本地存储
- 禁止把带密钥的 `config.json` 打包分发

---

## ⚠️ 已知限制
- 仅支持 Windows（依赖 win32com 操控 PPT）
- 需联网访问 OpenAI 接口（或自定义中转地址）
- Whisper 单文件限制 25MB（约 15 分钟录音），超限会提示
- 必须手动打开 PPT 并选中幻灯片，软件不会自动打开 PPT 文件

---

## 📝 V1.1 相对原版改进

| # | 改进项 | 说明 |
|---|---|---|
| 1 | 修复信号类型崩溃 | `pyqtSignal(str, str)` 正确传递双文本 |
| 2 | 修复语法错误 | `default_prompt` 赋值语法 |
| 3 | PPT 写入前置检查 | GetActiveObject 绑定已运行实例 |
| 4 | 兼容 PyInstaller -F | `sys.executable` + `sys._MEIPASS` |
| 5 | 移除 Claude 模型 | 与 OpenAI 接口不兼容 |
| 6 | 分段写入文本框 | 不再全框同文 |
| 7 | API 状态码检查 | 友好错误提示 |
| 8 | 录音异常捕获 | 停止瞬间不崩 |
| 9 | pyaudio 资源释放 | 每次录音独立实例 + terminate |
| 10 | 打包路径修复 | 配置/录音/历史持久化 |
| 11 | API Key 加密 | pycryptodome AES |
| 12 | PPT 原文备份 | 写入前存入历史记录 |
| 13 | VU 电平 + 时长 | 录音可视化反馈 |
| 14 | AI 处理可取消 | 取消按钮 + Session 中断 |
| 15 | Whisper 文件预检 | 25MB 超限提示 |
| 16 | 清理无用依赖 | 移除 python-pptx |
| 17 | 图标资源路径 | 兼容打包 |
| 18 | 密钥轻量校验 | `/models` 替代 chat completion |

详见 `CHANGELOG.md`。

---

## 📄 许可
本项目源码可自由使用、修改、分发。API Key 与 OpenAI 服务需用户自行申请。
