# -*- coding: utf-8 -*-
"""
PPT语音AI改写工具 V1.1
======================
麦克风实时录音 -> OpenAI Whisper 语音识别 -> GPT 智能文案改写 -> 一键批量写入选中PPT幻灯片

V1.1 修订要点（相对原版）：
1. 修复 pyqtSignal 类型与返回值不匹配导致的崩溃
2. 修复 default_prompt 语法错误
3. write_ppt 增加 PPT 已打开 / 已选中幻灯片前置检查，改用 GetActiveObject 绑定已运行实例
4. 兼容 PyInstaller -F 单文件模式：BASE_PATH 走 sys.executable，资源走 sys._MEIPASS
5. 移除 Claude 模型（与 OpenAI 接口不兼容）
6. 改写结果按段落切分依次写入不同文本框，不再全框同文
7. 全部 API 响应增加状态码检查 + 友好错误提示
8. 录音线程异常捕获，停止瞬间不再抛 OSError
9. 每次录音独立 pyaudio 实例并在结束时 terminate()，重写 closeEvent
10. API Key 使用 pycryptodome AES 加密存储
11. 写入 PPT 前备份原始文本框内容到历史记录
12. 录音 VU 电平条 + 录音时长显示
13. AI 处理过程可取消（取消按钮 + Session.close 中断请求）
14. Whisper 上传前校验文件大小（25MB 限制）
15. 清理无用依赖（python-pptx 未使用）
16. 图标使用 resource_path() 兼容打包
17. 密钥校验改用 /models 轻量接口
18. 文档补充 VC++ 运行库前置说明
"""

import sys
import os
import json
import time
import wave
import re
import array
import base64
import hashlib
import threading
import requests
from datetime import datetime

from PyQt6.QtWidgets import (
    QApplication, QMainWindow, QPushButton, QTextEdit, QLabel,
    QDialog, QLineEdit, QMessageBox, QFileDialog, QWidget,
    QVBoxLayout, QHBoxLayout, QComboBox, QGroupBox, QListWidget,
    QListWidgetItem, QDialogButtonBox, QProgressBar
)
from PyQt6.QtCore import Qt, QTimer, pyqtSignal, QThread
from PyQt6.QtGui import QIcon, QFont

try:
    import pyaudio
except ImportError:
    pyaudio = None

try:
    import win32com.client
    from pythoncom import CoInitialize, CoUninitialize
except ImportError:
    win32com = None

from Crypto.Cipher import AES
from Crypto.Util.Padding import pad, unpad


# ====================== 路径常量（兼容 PyInstaller -F）======================
if getattr(sys, 'frozen', False):
    # 打包后：exe 同级目录存 config/record/history（用户数据可持久化）
    BASE_PATH = os.path.dirname(sys.executable)
else:
    BASE_PATH = os.path.dirname(os.path.abspath(__file__))

CONFIG_PATH = os.path.join(BASE_PATH, "config", "config.json")
RECORD_PATH = os.path.join(BASE_PATH, "record")
HISTORY_PATH = os.path.join(BASE_PATH, "history")

os.makedirs(RECORD_PATH, exist_ok=True)
os.makedirs(HISTORY_PATH, exist_ok=True)
os.makedirs(os.path.dirname(CONFIG_PATH), exist_ok=True)


def resource_path(relative):
    """获取资源绝对路径，兼容开发态与 PyInstaller 打包态。"""
    if getattr(sys, 'frozen', False):
        base = getattr(sys, '_MEIPASS', os.path.dirname(sys.executable))
    else:
        base = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(base, relative)


# ====================== API Key 加密（pycryptodome AES-256-CBC）======================
_APP_SECRET = b"PPTVoiceRewrite_v1.1_local_secret_key"
_AES_KEY = hashlib.sha256(_APP_SECRET).digest()  # 32 bytes


def encrypt_key(plaintext: str) -> str:
    if not plaintext:
        return ""
    iv = os.urandom(16)
    cipher = AES.new(_AES_KEY, AES.MODE_CBC, iv)
    ct = cipher.encrypt(pad(plaintext.encode("utf-8"), AES.block_size))
    return base64.b64encode(iv + ct).decode("ascii")


def decrypt_key(blob: str) -> str:
    if not blob:
        return ""
    try:
        raw = base64.b64decode(blob)
        if len(raw) < 32:
            return ""
        iv, ct = raw[:16], raw[16:]
        cipher = AES.new(_AES_KEY, AES.MODE_CBC, iv)
        return unpad(cipher.decrypt(ct), AES.block_size).decode("utf-8")
    except Exception:
        return ""


# ====================== 默认配置初始化 ======================
DEFAULT_CONFIG = {
    "api_key": "",  # 存储加密后的密钥（兼容字段名）
    "model_name": "gpt-3.5-turbo",
    "last_check_time": 0,
    "base_url": "https://api.openai.com",  # 支持自定义中转 API
}

if not os.path.exists(CONFIG_PATH):
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(DEFAULT_CONFIG, f, indent=2, ensure_ascii=False)


# ====================== 音频工具 ======================
def compute_rms(data: bytes, sample_width: int = 2) -> int:
    """计算音频块的 RMS，归一化到 0-100 用于 VU 电平显示。"""
    try:
        if sample_width == 2:
            arr = array.array('h')
            arr.frombytes(data)
        elif sample_width == 1:
            arr = array.array('b')
            arr.frombytes(data)
        else:
            return 0
        if not arr:
            return 0
        sum_sq = sum(int(x) * int(x) for x in arr)
        rms = (sum_sq / len(arr)) ** 0.5
        max_val = float(2 ** (8 * sample_width - 1))
        # 灵敏度 x3，使正常说话音量能到 60-90
        val = int(rms / max_val * 100 * 3)
        return max(0, min(100, val))
    except Exception:
        return 0


# ====================== 录音线程 ======================
class RecordThread(QThread):
    vu_signal = pyqtSignal(int)          # VU 电平 0-100
    error_signal = pyqtSignal(str)
    finished_signal = pyqtSignal(str)    # 录音文件路径

    def __init__(self, file_path, parent=None):
        super().__init__(parent)
        self._file_path = file_path
        self._stop_flag = False
        self._pyaudio = None
        self._stream = None
        self._wf = None

    def run(self):
        if pyaudio is None:
            self.error_signal.emit("pyaudio 未安装，无法录音")
            return
        try:
            CoInitialize()
            self._pyaudio = pyaudio.PyAudio()
            fmt = pyaudio.paInt16
            channels = 1
            rate = 16000
            chunk = 1024
            self._wf = wave.open(self._file_path, 'wb')
            self._wf.setnchannels(channels)
            self._wf.setsampwidth(self._pyaudio.get_sample_size(fmt))
            self._wf.setframerate(rate)
            self._stream = self._pyaudio.open(
                format=fmt, channels=channels, rate=rate,
                input=True, frames_per_buffer=chunk
            )
            while not self._stop_flag:
                try:
                    data = self._stream.read(chunk, exception_on_overflow=False)
                except OSError:
                    break  # 流被停止
                except Exception:
                    break
                self._wf.writeframes(data)
                self.vu_signal.emit(compute_rms(data))
            self._cleanup()
            if os.path.exists(self._file_path) and os.path.getsize(self._file_path) > 0:
                self.finished_signal.emit(self._file_path)
            else:
                self.error_signal.emit("录音文件为空，可能麦克风未授权或无声音输入")
        except Exception as e:
            self._cleanup()
            self.error_signal.emit(f"录音启动失败：{e}")
        finally:
            try:
                CoUninitialize()
            except Exception:
                pass

    def stop(self):
        self._stop_flag = True

    def _cleanup(self):
        for closer in (
            lambda: self._stream.stop_stream() if self._stream else None,
            lambda: self._stream.close() if self._stream else None,
            lambda: self._wf.close() if self._wf else None,
            lambda: self._pyaudio.terminate() if self._pyaudio else None,
        ):
            try:
                closer()
            except Exception:
                pass
        self._stream = None
        self._wf = None
        self._pyaudio = None


# ====================== 密钥校验线程 ======================
class KeyCheckThread(QThread):
    finish_signal = pyqtSignal(str)  # HTTP 状态码字符串
    error_signal = pyqtSignal(str)

    def __init__(self, api_key, base_url, parent=None):
        super().__init__(parent)
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")

    def run(self):
        try:
            CoInitialize()
            headers = {"Authorization": f"Bearer {self._api_key}"}
            # 用 /models 轻量校验，不消耗 token
            resp = requests.get(
                f"{self._base_url}/v1/models",
                headers=headers, timeout=15
            )
            self.finish_signal.emit(str(resp.status_code))
        except Exception as e:
            self.error_signal.emit(str(e))
        finally:
            try:
                CoUninitialize()
            except Exception:
                pass


# ====================== AI 处理线程（语音转写+改写，可取消）======================
class AIProcessThread(QThread):
    finished_signal = pyqtSignal(str, str)  # origin_text, rewrite_text
    error_signal = pyqtSignal(str)
    progress_signal = pyqtSignal(str)       # 进度提示

    def __init__(self, audio_path, prompt, api_key, model, base_url, parent=None):
        super().__init__(parent)
        self._audio_path = audio_path
        self._prompt = prompt
        self._api_key = api_key
        self._model = model
        self._base_url = base_url.rstrip("/")
        self._cancel = False
        self._session = None

    def cancel(self):
        self._cancel = True
        if self._session:
            try:
                self._session.close()
            except Exception:
                pass

    def run(self):
        try:
            CoInitialize()
            self._session = requests.Session()

            # ---- 文件大小预检（Whisper 单文件 25MB 限制）----
            size = os.path.getsize(self._audio_path)
            if size > 25 * 1024 * 1024:
                raise Exception(
                    f"录音文件过大（{size // 1024 // 1024}MB），Whisper 单文件限制 25MB，"
                    "请缩短录音时长或降低采样率"
                )

            # ---- 1. Whisper 语音转文字 ----
            self.progress_signal.emit("正在上传音频进行语音识别...")
            headers = {"Authorization": f"Bearer {self._api_key}"}
            with open(self._audio_path, "rb") as f:
                files = {"file": f}
                data = {"model": "whisper-1"}
                resp1 = self._session.post(
                    f"{self._base_url}/v1/audio/transcriptions",
                    headers=headers, files=files, data=data, timeout=120
                )
            if self._cancel:
                return
            if resp1.status_code != 200:
                raise Exception(
                    f"语音识别失败（HTTP {resp1.status_code}）：{self._truncate(resp1.text)}"
                )
            origin_text = resp1.json().get("text", "").strip()
            if not origin_text:
                raise Exception("未识别到语音内容（可能录音过短或环境嘈杂）")

            self.progress_signal.emit("识别完成，AI 改写中...")
            if self._cancel:
                return

            # ---- 2. GPT 文案改写 ----
            chat_header = {
                "Authorization": f"Bearer {self._api_key}",
                "Content-Type": "application/json"
            }
            messages = [
                {"role": "system", "content": self._prompt},
                {"role": "user", "content": origin_text}
            ]
            chat_body = {
                "model": self._model,
                "messages": messages,
                "temperature": 0.65
            }
            resp2 = self._session.post(
                f"{self._base_url}/v1/chat/completions",
                headers=chat_header, json=chat_body, timeout=90
            )
            if self._cancel:
                return
            if resp2.status_code != 200:
                raise Exception(
                    f"AI 改写失败（HTTP {resp2.status_code}）：{self._truncate(resp2.text)}"
                )
            data = resp2.json()
            if "choices" not in data or not data["choices"]:
                raise Exception(f"AI 返回数据异常：{self._truncate(json.dumps(data, ensure_ascii=False))}")
            rewrite_text = data["choices"][0]["message"]["content"].strip()
            self.finished_signal.emit(origin_text, rewrite_text)
        except requests.exceptions.RequestException as e:
            if not self._cancel:
                self.error_signal.emit(f"网络请求异常：{e}")
        except Exception as e:
            if not self._cancel:
                self.error_signal.emit(str(e))
        finally:
            if self._session:
                try:
                    self._session.close()
                except Exception:
                    pass
            try:
                CoUninitialize()
            except Exception:
                pass

    @staticmethod
    def _truncate(text, n=200):
        text = str(text)
        return text[:n] + "..." if len(text) > n else text


# ====================== 密钥配置弹窗 ======================
class KeyConfigDialog(QDialog):
    def __init__(self, parent=None, old_key="", old_model="", old_base_url=""):
        super().__init__(parent)
        self.setWindowTitle("API 密钥配置")
        self.setFixedSize(480, 300)
        layout = QVBoxLayout(spacing=12)

        # API 密钥
        lay1 = QHBoxLayout()
        lay1.addWidget(QLabel("OpenAI 密钥："), stretch=1)
        self.key_edit = QLineEdit(old_key)
        self.key_edit.setPlaceholderText("sk- 开头的 API Key")
        self.key_edit.setEchoMode(QLineEdit.EchoMode.Password)
        lay1.addWidget(self.key_edit, stretch=4)
        layout.addLayout(lay1)

        # 模型选择
        lay2 = QHBoxLayout()
        lay2.addWidget(QLabel("AI 模型："), stretch=1)
        self.model_box = QComboBox()
        # 仅保留 OpenAI 接口兼容模型，移除 Claude
        self.model_box.addItems(["gpt-3.5-turbo", "gpt-4", "gpt-4o", "gpt-4o-mini"])
        if old_model and self.model_box.findText(old_model) >= 0:
            self.model_box.setCurrentText(old_model)
        elif old_model:
            self.model_box.addItem(old_model)
            self.model_box.setCurrentText(old_model)
        lay2.addWidget(self.model_box, stretch=4)
        layout.addLayout(lay2)

        # 接口地址（支持中转）
        lay3 = QHBoxLayout()
        lay3.addWidget(QLabel("接口地址："), stretch=1)
        self.base_url_edit = QLineEdit(old_base_url or "https://api.openai.com")
        self.base_url_edit.setPlaceholderText("默认 https://api.openai.com，可填中转地址")
        lay3.addWidget(self.base_url_edit, stretch=4)
        layout.addLayout(lay3)

        # 提示
        hint = QLabel("提示：密钥本地 AES 加密存储，不会上传。")
        hint.setStyleSheet("color:#888;font-size:11px;")
        layout.addWidget(hint)

        btns = QDialogButtonBox(QDialogButtonBox.Ok | QDialogButtonBox.Cancel)
        btns.accepted.connect(self.accept)
        btns.rejected.connect(self.reject)
        layout.addWidget(btns)
        self.setLayout(layout)

    def get_data(self):
        return (
            self.key_edit.text().strip(),
            self.model_box.currentText(),
            self.base_url_edit.text().strip()
        )


# ====================== 改写预览弹窗 ======================
class PreviewDialog(QDialog):
    def __init__(self, parent=None, content=""):
        super().__init__(parent)
        self.setWindowTitle("AI 改写内容预览确认")
        self.resize(620, 440)
        layout = QVBoxLayout()
        layout.addWidget(QLabel("可在下方编辑改写结果，确认后写入 PPT："))
        self.text_edit = QTextEdit()
        self.text_edit.setText(content)
        self.text_edit.setFont(QFont("Microsoft YaHei", 10))
        layout.addWidget(self.text_edit)
        btns = QDialogButtonBox(QDialogButtonBox.Ok | QDialogButtonBox.Cancel)
        btns.button(QDialogButtonBox.Ok).setText("写入 PPT")
        btns.button(QDialogButtonBox.Cancel).setText("取消")
        btns.accepted.connect(self.accept)
        btns.rejected.connect(self.reject)
        layout.addWidget(btns)
        self.setLayout(layout)

    def get_content(self):
        return self.text_edit.toPlainText()


# ====================== 历史记录弹窗 ======================
class HistoryDialog(QDialog):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle("改写历史记录")
        self.resize(720, 520)
        layout = QVBoxLayout(spacing=8)
        self.list_widget = QListWidget()
        self.load_history()
        layout.addWidget(QLabel("点击左侧条目查看详情："))

        body = QHBoxLayout()
        body.addWidget(self.list_widget, stretch=2)
        self.content_view = QTextEdit()
        self.content_view.setReadOnly(True)
        self.content_view.setFont(QFont("Microsoft YaHei", 10))
        body.addWidget(self.content_view, stretch=3)
        layout.addLayout(body)

        close_btn = QDialogButtonBox(QDialogButtonBox.Close)
        close_btn.rejected.connect(self.close)
        layout.addWidget(close_btn)
        self.setLayout(layout)
        self.list_widget.itemClicked.connect(self.show_detail)

    def load_history(self):
        self.list_widget.clear()
        if not os.path.exists(HISTORY_PATH):
            return
        file_list = sorted(
            [f for f in os.listdir(HISTORY_PATH) if f.endswith(".json")],
            reverse=True
        )
        for filename in file_list:
            item = QListWidgetItem(filename)
            self.list_widget.addItem(item)

    def show_detail(self, item):
        file_path = os.path.join(HISTORY_PATH, item.text())
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            backup_count = len(data.get("backup", []))
            text = (
                f"【记录时间】{data.get('time', '')}\n"
                f"【修改幻灯片页数】{data.get('slide_count', 0)} 页\n"
                f"【写入文本框数】{data.get('written', 0)} / 共 {data.get('box_count', 0)} 个\n"
                f"【原始备份文本框数】{backup_count}\n"
                f"──────────────────────────────\n"
                f"【语音原始内容】\n{data.get('origin', '')}\n"
                f"──────────────────────────────\n"
                f"【AI 改写完成内容】\n{data.get('rewrite', '')}\n"
            )
            if backup_count:
                text += "──────────────────────────────\n【写入前原始文本框备份】\n"
                for i, b in enumerate(data["backup"]):
                    text += f"  · 第{b.get('slide', '?')}页 框{i+1}：{b.get('original', '')[:80]}\n"
            self.content_view.setText(text)
        except Exception as e:
            self.content_view.setText(f"读取历史记录失败：{e}")


# ====================== 主程序窗口 ======================
class MainWin(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("PPT 语音 AI 改写工具 V1.1")
        self.resize(720, 560)

        # 运行变量
        self.api_key = ""
        self.cur_model = "gpt-3.5-turbo"
        self.base_url = "https://api.openai.com"
        self.is_recording = False
        self.record_file = ""
        self.record_thread = None
        self.check_key_thread = None
        self.ai_thread = None

        # 录音计时
        self.record_start_time = 0
        self.duration_timer = QTimer(self)
        self.duration_timer.timeout.connect(self._update_duration)

        # 加载配置 + 界面
        self.load_config()
        self.build_ui()

        # 后台密钥校验
        self.start_key_check()

    # ---------------- 界面 ----------------
    def build_ui(self):
        central = QWidget()
        self.setCentralWidget(central)
        main_layout = QVBoxLayout(central, spacing=10, contentsMargins=(12, 12, 12, 12))

        # 顶部按钮行
        btn_layout = QHBoxLayout()
        self.btn_config = QPushButton("🔑 密钥设置")
        self.btn_record = QPushButton("🎙️ 开始录音")
        self.btn_history = QPushButton("📋 历史记录")
        self.btn_config.clicked.connect(self.open_config)
        self.btn_record.clicked.connect(self.toggle_record)
        self.btn_history.clicked.connect(self.open_history)
        btn_layout.addWidget(self.btn_config)
        btn_layout.addWidget(self.btn_record)
        btn_layout.addWidget(self.btn_history)
        main_layout.addLayout(btn_layout)

        # 状态提示
        self.status_label = QLabel("程序就绪，请先配置 OpenAI 密钥")
        self.status_label.setStyleSheet("color:#222;font-size:13px;font-weight:bold;")
        main_layout.addWidget(self.status_label)

        # 录音 VU 电平 + 时长
        vu_layout = QHBoxLayout()
        vu_layout.addWidget(QLabel("电平："))
        self.vu_bar = QProgressBar()
        self.vu_bar.setRange(0, 100)
        self.vu_bar.setValue(0)
        self.vu_bar.setTextVisible(False)
        self.vu_bar.setFixedHeight(14)
        self.vu_bar.setStyleSheet(
            "QProgressBar { background:#eee; border-radius:7px; }"
            "QProgressBar::chunk { background:#22c55e; border-radius:7px; }"
        )
        vu_layout.addWidget(self.vu_bar, stretch=4)
        self.duration_label = QLabel("00:00")
        self.duration_label.setFixedWidth(60)
        vu_layout.addWidget(self.duration_label)
        main_layout.addLayout(vu_layout)

        # AI 提示词
        group = QGroupBox("✍️ AI 改写自定义要求")
        g_layout = QVBoxLayout(group)
        self.prompt_edit = QTextEdit()
        self.prompt_edit.setPlaceholderText(
            "自定义改写要求：口语精简、正式文案、演讲稿、分段排版、提炼要点等。"
            "改写结果会按段落自动写入不同文本框。"
        )
        default_prompt = (
            "把口述语音内容梳理通顺，剔除口语冗余语气词，逻辑分段清晰，"
            "精简凝练，适配 PPT 页面文字展示，不要长篇大论。"
            "不同要点之间用空行分隔，便于写入不同文本框。"
        )
        self.prompt_edit.setText(default_prompt)
        g_layout.addWidget(self.prompt_edit)
        main_layout.addWidget(group)

        # 取消按钮（AI 处理时显示）
        self.btn_cancel = QPushButton("⏹ 取消 AI 处理")
        self.btn_cancel.setStyleSheet("background:#ef4444;color:white;font-weight:bold;")
        self.btn_cancel.clicked.connect(self.cancel_ai)
        self.btn_cancel.hide()
        main_layout.addWidget(self.btn_cancel)

        # 进度提示
        self.progress_label = QLabel("")
        self.progress_label.setStyleSheet("color:#2563eb;font-size:12px;")
        main_layout.addWidget(self.progress_label)

        main_layout.addStretch(1)

    # ---------------- 配置 ----------------
    def load_config(self):
        try:
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                cfg = json.load(f)
        except Exception:
            cfg = dict(DEFAULT_CONFIG)
        # 解密密钥
        encrypted = cfg.get("api_key", "")
        self.api_key = decrypt_key(encrypted) if encrypted else ""
        self.cur_model = cfg.get("model_name", "gpt-3.5-turbo")
        self.base_url = cfg.get("base_url", "https://api.openai.com")

    def save_config(self):
        encrypted_key = encrypt_key(self.api_key) if self.api_key else ""
        cfg = {
            "api_key": encrypted_key,
            "model_name": self.cur_model,
            "last_check_time": int(time.time()),
            "base_url": self.base_url,
        }
        try:
            with open(CONFIG_PATH, "w", encoding="utf-8") as f:
                json.dump(cfg, f, indent=2, ensure_ascii=False)
        except Exception as e:
            QMessageBox.warning(self, "警告", f"配置保存失败：{e}")

    # ---------------- 密钥校验 ----------------
    def start_key_check(self):
        if not self.api_key:
            self.status_label.setText("⚠️ 尚未配置 API 密钥，请点击「密钥设置」")
            return
        self.check_key_thread = KeyCheckThread(self.api_key, self.base_url, self)
        self.check_key_thread.finish_signal.connect(self.check_key_ok)
        self.check_key_thread.error_signal.connect(self.check_key_err)
        self.check_key_thread.start()

    def check_key_ok(self, code):
        if code == "401":
            self.status_label.setText("❌ 密钥无效，请重新配置")
        elif code == "429":
            self.status_label.setText("⚠️ API 调用次数超限 / 余额不足")
        elif code == "200":
            self.status_label.setText("✅ 密钥校验正常，可以正常使用")
        else:
            self.status_label.setText(f"⚠️ 接口返回异常：{code}")

    def check_key_err(self, err):
        self.status_label.setText(f"⚠️ 联网校验失败：{err[:40]}")

    # ---------------- 密钥配置窗口 ----------------
    def open_config(self):
        dlg = KeyConfigDialog(self, self.api_key, self.cur_model, self.base_url)
        if dlg.exec():
            key, model, base_url = dlg.get_data()
            self.api_key = key
            self.cur_model = model
            self.base_url = base_url or "https://api.openai.com"
            self.save_config()
            self.start_key_check()

    # ---------------- 历史记录 ----------------
    def open_history(self):
        HistoryDialog(self).exec()

    # ---------------- 录音启停 ----------------
    def toggle_record(self):
        if not self.api_key.strip():
            QMessageBox.warning(self, "提示", "请先完成 API 密钥配置！")
            return
        if self.is_recording:
            self.stop_record()
        else:
            self.start_record()

    def start_record(self):
        if pyaudio is None:
            QMessageBox.critical(self, "错误", "pyaudio 未安装，无法录音")
            return
        self.is_recording = True
        self.btn_record.setText("🛑 结束录音")
        self.status_label.setText("🔴 正在录音中，请口述内容...")
        self.vu_bar.setValue(0)
        self.duration_label.setText("00:00")

        time_str = datetime.now().strftime("%Y%m%d_%H%M%S")
        self.record_file = os.path.join(RECORD_PATH, f"{time_str}.wav")

        self.record_start_time = time.time()
        self.duration_timer.start(1000)

        self.record_thread = RecordThread(self.record_file, self)
        self.record_thread.vu_signal.connect(self._on_vu)
        self.record_thread.error_signal.connect(self._on_record_err)
        self.record_thread.finished_signal.connect(self._on_record_done)
        self.record_thread.start()

    def _on_vu(self, val):
        self.vu_bar.setValue(val)

    def _update_duration(self):
        elapsed = int(time.time() - self.record_start_time)
        m, s = divmod(elapsed, 60)
        self.duration_label.setText(f"{m:02d}:{s:02d}")

    def _on_record_err(self, err):
        self.is_recording = False
        self.btn_record.setText("🎙️ 开始录音")
        self.duration_timer.stop()
        self.vu_bar.setValue(0)
        QMessageBox.critical(self, "录音错误", err)
        self.status_label.setText("❌ 录音失败")

    def _on_record_done(self, file_path):
        # 录音正常结束（用户点停止）
        if not self.is_recording:
            return  # 已被取消流程处理
        self.is_recording = False
        self.btn_record.setText("🎙️ 开始录音")
        self.duration_timer.stop()
        self.vu_bar.setValue(0)
        self.status_label.setText("🟡 录音完成，AI 识别改写中...")
        self.btn_cancel.show()
        self.progress_label.setText("准备处理...")
        self._run_ai(file_path)

    def stop_record(self):
        if self.record_thread and self.record_thread.isRunning():
            self.record_thread.stop()
        # _on_record_done 会在线程结束后被触发

    # ---------------- AI 处理 ----------------
    def _run_ai(self, audio_path):
        prompt = self.prompt_edit.toPlainText().strip()
        if not prompt:
            prompt = "把口述语音内容梳理通顺，剔除口语冗余，精简凝练。"
        self.ai_thread = AIProcessThread(
            audio_path, prompt, self.api_key, self.cur_model, self.base_url, self
        )
        self.ai_thread.finished_signal.connect(self.preview_content)
        self.ai_thread.error_signal.connect(self.process_err)
        self.ai_thread.progress_signal.connect(self._on_ai_progress)
        self.ai_thread.start()

    def _on_ai_progress(self, msg):
        self.progress_label.setText(msg)

    def cancel_ai(self):
        if self.ai_thread and self.ai_thread.isRunning():
            self.ai_thread.cancel()
            self.ai_thread.quit()
            self.ai_thread.wait(3000)
        self.btn_cancel.hide()
        self.progress_label.setText("")
        self.status_label.setText("⚠️ 已取消 AI 处理")
        QMessageBox.information(self, "已取消", "AI 处理已取消")

    def preview_content(self, origin_txt, rewrite_txt):
        self.btn_cancel.hide()
        self.progress_label.setText("")
        dlg = PreviewDialog(self, rewrite_txt)
        if dlg.exec():
            final_txt = dlg.get_content()
            try:
                write_info = self.write_ppt(final_txt)
                self.save_history(origin_txt, final_txt, write_info)
                QMessageBox.information(
                    self, "完成",
                    f"成功写入 {write_info['written']} 个文本框"
                    f"（共 {write_info['box_count']} 个，覆盖 {write_info['slide_count']} 页）！"
                )
                self.status_label.setText("✅ 全部任务完成，等待下次操作")
            except Exception as e:
                QMessageBox.critical(self, "PPT 写入失败", str(e))
                self.status_label.setText("❌ PPT 写入失败")
                # 仍保存历史（不含 PPT 写入信息）
                self.save_history(origin_txt, final_txt, {
                    "slide_count": 0, "box_count": 0, "written": 0, "backup": []
                })
        else:
            self.status_label.setText("⚪ 用户取消写入 PPT")
            self.save_history(origin_txt, rewrite_txt, {
                "slide_count": 0, "box_count": 0, "written": 0, "backup": []
            })

    def process_err(self, errmsg):
        self.btn_cancel.hide()
        self.progress_label.setText("")
        QMessageBox.critical(self, "处理失败", f"运行异常：{errmsg}")
        self.status_label.setText("❌ 处理失败")

    # ---------------- PPT 写入（分段写入 + 备份）----------------
    def write_ppt(self, content):
        if win32com is None:
            raise Exception("pywin32 未安装，无法操控 PPT")

        # 优先绑定已运行的 PowerPoint 实例，避免新开进程
        ppt_app = None
        try:
            ppt_app = win32com.client.GetActiveObject("PowerPoint.Application")
        except Exception:
            try:
                ppt_app = win32com.client.Dispatch("PowerPoint.Application")
                ppt_app.Visible = True
            except Exception:
                raise Exception("无法连接 PowerPoint，请先打开 PPT 文件")

        if ppt_app is None or ppt_app.Presentations.Count == 0:
            raise Exception("未检测到已打开的 PPT 文件，请先打开 PPT 并选中幻灯片")

        try:
            active_window = ppt_app.ActiveWindow
            if active_window is None:
                raise Exception("未找到活动 PPT 窗口，请先在 PPT 中选中幻灯片")
            sel = active_window.Selection
            slide_range = sel.SlideRange
            if slide_range.Count == 0:
                raise Exception("未选中任何幻灯片，请在 PPT 中选中一页或多页幻灯片")
        except Exception as e:
            raise Exception(f"获取选中幻灯片失败：{e}")

        # 收集所有可写入文本框（按幻灯片顺序）
        boxes = []
        for slide in slide_range:
            try:
                slide_index = slide.SlideIndex
            except Exception:
                slide_index = "?"
            for shape in slide.Shapes:
                try:
                    # HasTextFrame: -1=True, 0=False
                    if shape.HasTextFrame == -1:
                        tf = shape.TextFrame
                        if tf.HasText == -1:
                            boxes.append((slide_index, tf))
                except Exception:
                    continue

        if not boxes:
            raise Exception("选中幻灯片内没有可写入的文本框（请确认文本框已包含文字）")

        # 备份原始内容
        backup = []
        for idx, (slide_idx, tf) in enumerate(boxes):
            try:
                orig = tf.TextRange.Text
            except Exception:
                orig = ""
            backup.append({"slide": slide_idx, "box_index": idx, "original": orig})

        # 按空行切分段落
        paragraphs = [p.strip() for p in re.split(r"\n\s*\n", content) if p.strip()]
        if not paragraphs:
            paragraphs = [content.strip()]

        n_boxes = len(boxes)
        n_paras = len(paragraphs)
        written = 0

        # 依次写入不同文本框
        for i in range(min(n_boxes, n_paras)):
            try:
                boxes[i][1].TextRange.Text = paragraphs[i]
                written += 1
            except Exception:
                pass

        # 段落多于文本框：余下段落追加到最后一个文本框
        if n_paras > n_boxes and n_boxes > 0:
            remainder = "\n\n".join(paragraphs[n_boxes:])
            try:
                last_text = boxes[-1][1].TextRange.Text
                boxes[-1][1].TextRange.Text = (last_text + "\n\n" + remainder).strip()
            except Exception:
                pass

        return {
            "slide_count": slide_range.Count,
            "box_count": n_boxes,
            "written": written,
            "backup": backup,
        }

    # ---------------- 历史保存 ----------------
    def save_history(self, origin, rewrite, write_info):
        now_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        file_name = datetime.now().strftime("%Y%m%d_%H%M%S") + ".json"
        save_dict = {
            "time": now_time,
            "origin": origin,
            "rewrite": rewrite,
            "slide_count": write_info.get("slide_count", 0),
            "box_count": write_info.get("box_count", 0),
            "written": write_info.get("written", 0),
            "backup": write_info.get("backup", []),
        }
        try:
            save_path = os.path.join(HISTORY_PATH, file_name)
            with open(save_path, "w", encoding="utf-8") as f:
                json.dump(save_dict, f, indent=2, ensure_ascii=False)
        except Exception as e:
            QMessageBox.warning(self, "警告", f"历史记录保存失败：{e}")

    # ---------------- 窗口关闭清理 ----------------
    def closeEvent(self, event):
        if self.is_recording and self.record_thread:
            self.record_thread.stop()
            self.record_thread.wait(3000)
        if self.ai_thread and self.ai_thread.isRunning():
            self.ai_thread.cancel()
            self.ai_thread.quit()
            self.ai_thread.wait(3000)
        if self.check_key_thread and self.check_key_thread.isRunning():
            self.check_key_thread.quit()
            self.check_key_thread.wait(2000)
        event.accept()


# ====================== 程序入口 ======================
def main():
    app = QApplication(sys.argv)
    icon_path = resource_path("icon.ico")
    if os.path.exists(icon_path):
        app.setWindowIcon(QIcon(icon_path))
    window = MainWin()
    window.show()
    sys.exit(app.exec())


if __name__ == "__main__":
    main()
