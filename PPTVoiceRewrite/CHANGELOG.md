# 更新日志

## V1.1（2024-12）

### 🔴 致命 Bug 修复
- **修复** `WorkThread.finish_signal = pyqtSignal(str)` 与 `run_ai_process` 返回 tuple 不匹配导致的 `TypeError` 崩溃
  - 新增 `AIProcessThread` 专用线程类，信号定义为 `pyqtSignal(str, str)`
- **修复** `default_prompt = "..."` 等号后直接换行的语法错误（Python 解释器无法启动）
- **修复** `write_ppt` 未检查 PPT 是否打开 / 是否选中幻灯片，`ActiveWindow` / `SlideRange` 为 None 时崩溃
  - 改用 `GetActiveObject("PowerPoint.Application")` 绑定已运行实例
  - 增加四道前置检查：PPT 进程 / 已打开文档 / 活动窗口 / 选中幻灯片
- **修复** PyInstaller `-F` 单文件模式下 `__file__` 指向临时解压目录，导致 config/record/history 每次丢失
  - `BASE_PATH` 改用 `sys.executable` 所在目录
  - 资源文件改用 `sys._MEIPASS` + `resource_path()` 辅助函数
- **修复** 模型下拉框包含 `claude-3-sonnet`（Anthropic 模型走 OpenAI 接口会 404）

### 🟡 健壮性改进
- **改进** 改写结果按空行切分段落，依次写入不同文本框（原版所有文本框写入相同内容）
  - 段落数 > 文本框数时，余下段落追加到最后一个文本框
- **改进** 所有 API 响应增加 `status_code != 200` 检查，提取错误信息友好提示
- **改进** 录音循环 `stream.read(exception_on_overflow=False)`，停止瞬间不再抛 `OSError`
- **改进** 每次录音独立 `pyaudio.PyAudio()` 实例，结束 `stop_stream/close/terminate` 全链路释放
  - 重写 `MainWin.closeEvent`，窗口关闭时清理所有线程与资源
- **改进** API Key 使用 `pycryptodome` AES-256-CBC 加密存储（终于用上 requirements 里的依赖）
- **改进** 写入 PPT 前备份所有文本框原始内容到历史记录 JSON
- **改进** 录音 VU 电平条（QProgressBar 实时显示音量）+ 录音时长显示（QTimer）
- **改进** AI 处理过程可取消（红色取消按钮 + `requests.Session.close()` 中断请求）
- **改进** Whisper 上传前校验文件大小（25MB 限制），超限给出明确提示
- **改进** 密钥校验改用 `/v1/models` 轻量接口（不消耗 token）
- **改进** 新增 `base_url` 自定义接口地址（支持中转 API）

### 🟢 工程改进
- **移除** 无用依赖 `python-pptx`（原版声明"备用离线解析"但从未调用）
- **保留** `pycryptodome`（V1.1 已落地用于密钥加密）
- **新增** `generate_icon.py` 图标生成脚本（Pillow，可重复执行）
- **新增** `icon.ico` 多尺寸图标（16/32/48/64/128/256）
- **新增** `build.bat` 一键打包脚本（含依赖检查、图标生成、产物整理）
- **新增** `install.iss` Inno Setup 安装包脚本（桌面/开始菜单快捷方式、卸载、配置保留）
- **新增** `README.md` 快速开始指南
- **新增** `CHANGELOG.md` 版本记录
- **补充** 三份技术文档（开发/打包/运维）全部重写，与新代码一致

### 📚 文档修复
- 修复 `PyAudio‑0.2.13` 中非 ASCII 连字符 `‑` 导致复制到 cmd 报错
- 移除"用户需同级新建 config/record/history 文件夹"的误导（程序自动创建）
- 补充 VC++ 2015-2022 x64 运行库前置说明
- 补充 upx 压缩的安装与挂载方式
- 统一 requirements.txt 与实际使用依赖

---

## V1.0（原版）

- 初始版本
- 已知 5 处致命 Bug + 多处逻辑缺陷（见 V1.1 修复列表）
