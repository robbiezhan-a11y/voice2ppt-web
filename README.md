# PPT Voice AI Rewrite Tool

[🌐 中文文档](README_CN.md) | **English**

> 🎙️ Record → 📝 Speech Recognition → ✨ AI Rewrite → 📊 Generate PPT
>
> Turn your spoken words into structured PowerPoint presentations in one click.

This project delivers **two editions** to serve different scenarios:

| Edition | Directory | Use Case |
|---|---|---|
| 🌐 **Web Edition** (Recommended) | `src/` | Cross-platform, zero-install, runs in browser, server-side PPT generation |
| 🖥️ **Desktop Edition** | `PPTVoiceRewrite/` | Windows desktop app, controls locally opened PPT files |

---

## 🔗 Relationship with OpenAI

This project is **deeply integrated with OpenAI's API ecosystem**. Understanding this relationship is important before deployment:

### Desktop Edition — Direct OpenAI API Integration

The desktop edition (`PPTVoiceRewrite/`) **directly calls OpenAI's official API endpoints** and requires users to provide their own OpenAI API key:

| Feature | OpenAI API Used | Endpoint |
|---|---|---|
| Speech-to-Text | **OpenAI Whisper** (`whisper-1` model) | `POST https://api.openai.com/v1/audio/transcriptions` |
| Text Rewrite | **OpenAI GPT** (`gpt-3.5-turbo` / `gpt-4` / `gpt-4o` / `gpt-4o-mini`) | `POST https://api.openai.com/v1/chat/completions` |
| Key Validation | OpenAI Models list (lightweight check) | `GET https://api.openai.com/v1/models` |

**User responsibilities for the desktop edition:**
1. **Obtain an OpenAI API Key** — Register at [platform.openai.com](https://platform.openai.com/), create an API key (`sk-` prefix), and add billing.
2. **Keep the key secure** — The key is stored locally with AES-256-CBC encryption, but you must not leak `config/config.json`.
3. **Pay OpenAI usage fees** — Whisper and GPT calls are billed per use. See [OpenAI Pricing](https://openai.com/pricing).
4. **Network access required** — Must be able to reach `api.openai.com`. Users in regions with restricted access may configure a custom `base_url` (relay/proxy API) in the key settings dialog.

### Web Edition — Indirect OpenAI-Compatible Integration

The web edition (`src/`) uses the `z-ai-web-dev-sdk`, which provides an **OpenAI-compatible API interface** but routes requests through Z.ai's gateway service instead of OpenAI directly:

```typescript
// The SDK exposes an OpenAI-style API surface
import ZAI from 'z-ai-web-dev-sdk';
const zai = await ZAI.create();

// Speech-to-text (OpenAI Whisper-compatible interface)
await zai.audio.asr.create({ file_base64 });

// Chat completion (OpenAI GPT-compatible interface)
await zai.chat.completions.create({ messages, thinking });
```

**Why this matters:**
- ✅ **No OpenAI API key needed** for the web edition — the SDK handles authentication server-side.
- ✅ **OpenAI-compatible interface** — If you want to switch the web edition to use OpenAI directly, just replace the SDK calls with the official `openai` npm package; the request/response shapes are compatible.
- ⚠️ **Different provider** — The actual model serving the web edition is `glm-4-plus` (Z.ai's model), not OpenAI's GPT. Output style and quality may differ.
- 💡 **Migrating to OpenAI**: To make the web edition use OpenAI directly, install `openai` package and swap the three API routes (`/api/asr`, `/api/rewrite`, `/api/ppt`) to call `openai.audio.transcriptions.create()` and `openai.chat.completions.create()`.

### OpenAI API Key Application

If you choose the desktop edition or want to migrate the web edition to OpenAI:

1. Visit [platform.openai.com](https://platform.openai.com/)
2. Sign up / log in
3. Go to **API Keys** → **Create new secret key**
4. Copy the `sk-...` key (shown only once)
5. Add a payment method under **Billing**
6. Set usage limits under **Usage limits**

> ⚠️ **Security reminder**: Never commit your API key to git. The `.gitignore` already excludes `config/config.json` and `.env` files.

---

## 🌐 Web Edition (Recommended)

Built with Next.js 16 + React 19 + TypeScript. Records audio in the browser, processes via server-side AI, and generates a downloadable `.pptx` file.

### Key Features

- 🎙️ **Native browser recording** — MediaRecorder API with real-time VU meter, duration display, pause/resume
- 📝 **AI speech recognition** — ASR SDK, 16kHz mono optimized, 25MB file pre-check
- ✨ **Smart text rewrite** — 5 style presets (concise / formal / casual / keypoints / narrative) + custom prompt
- 📊 **One-click PPT generation** — LLM auto-structuring + pptxgenjs rendering, 3 template themes
- 📱 **Responsive design** — Adapts to desktop / tablet / mobile
- 🔒 **Privacy-friendly** — Audio captured locally in browser, no persistent storage, no API key required

### Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16, React 19, TypeScript 5, Tailwind CSS 4, shadcn/ui |
| Recording | Browser MediaRecorder API + AudioContext (AnalyserNode) |
| ASR | z-ai-web-dev-sdk `audio.asr.create()` (OpenAI Whisper-compatible) |
| LLM | z-ai-web-dev-sdk `chat.completions.create()` → `glm-4-plus` (OpenAI GPT-compatible interface) |
| PPT Generation | pptxgenjs 4.0 |
| Icons | lucide-react |

### Project Structure

```
src/
├─ app/
│  ├─ page.tsx              # Main page (recording UI + prompt + preview + download)
│  ├─ layout.tsx            # Root layout
│  └─ api/
│     ├─ asr/route.ts       # Speech-to-text API
│     ├─ rewrite/route.ts   # AI text rewrite API
│     └─ ppt/route.ts       # PPT generation API (LLM structuring + pptxgenjs)
├─ hooks/
│  └─ use-audio-recorder.ts # Browser recording hook
└─ components/ui/           # shadcn/ui component library
```

### Quick Start

```bash
# Install dependencies
bun install   # or npm install

# Start dev server
bun run dev   # http://localhost:3000

# Lint check
bun run lint
```

### Usage Flow

1. Open the page → click the green record button → grant microphone permission → speak
2. Click stop → click "Start Speech Recognition" → ASR converts audio to text
3. Edit the recognized text → click "AI Rewrite" → LLM refines the copy
4. Edit the rewrite result → click "Generate PPT" → download the `.pptx` file

---

## 🖥️ Desktop Edition (Windows)

Built with Python + PyQt6. Controls locally opened PowerPoint/WPS and batch-writes to selected slide text frames.

### Key Features

- 🎙️ pyaudio recording (16kHz mono wav)
- 📝 **OpenAI Whisper** speech recognition
- ✨ **OpenAI GPT** text rewrite (supports custom relay API URL)
- 📊 win32com controls opened PPT, writes to text frames paragraph-by-paragraph
- 🔒 API Key encrypted with AES-256-CBC
- 📋 History records include original PPT text backup (rollback support)
- 📦 PyInstaller + Inno Setup one-click installer packaging

### Directory Structure

```
PPTVoiceRewrite/
├─ main.py              # Main source (V1.1, 948 lines)
├─ generate_icon.py     # Icon generator script
├─ icon.ico             # App icon
├─ requirements.txt     # Python dependencies
├─ build.bat            # PyInstaller packaging script
├─ install.iss          # Inno Setup installer script
├─ config/config.json   # Default config
├─ README.md            # Quick start
├─ CHANGELOG.md         # Changelog
└─ docs/                # Dev / packaging / ops docs
```

### Quick Start

```cmd
cd PPTVoiceRewrite
pip install -r requirements.txt
python generate_icon.py        # Generate icon
python main.py                 # Run from source (debug)
build.bat                      # Package as EXE
# Open install.iss in Inno Setup → Ctrl+F9 to compile installer
```

See [`PPTVoiceRewrite/README.md`](PPTVoiceRewrite/README.md) for details.

---

## 🔄 Edition Comparison

| Dimension | Web Edition | Desktop Edition |
|---|---|---|
| Cross-platform | ✅ Win/Mac/Linux/Mobile | ❌ Windows only |
| Installation | Zero-install, open URL | Requires EXE + VC++ runtime |
| Office dependency | ❌ Server-side generation | ✅ PowerPoint/WPS required |
| Key management | None (built-in SDK) | User-configured **OpenAI API Key** |
| PPT output | Generate new `.pptx` download | Overwrite opened PPT text frames |
| Original backup | No | ✅ Rollback support |
| Offline use | ❌ Requires internet | ❌ Requires internet (calls OpenAI) |
| AI provider | Z.ai (glm-4-plus, OpenAI-compatible) | **OpenAI** (Whisper + GPT) |

---

## 📋 Version History

- **Web Edition V1.0** — Browser recording + ASR + LLM rewrite + pptxgenjs generation
- **Desktop Edition V1.1** — Fixed 5 critical bugs + 13 robustness improvements (see [CHANGELOG](PPTVoiceRewrite/CHANGELOG.md))

---

## 📄 License

This project's source code is free to use, modify, and distribute.

AI capabilities are provided by:
- **Web Edition**: `z-ai-web-dev-sdk` (Z.ai gateway, OpenAI-compatible interface)
- **Desktop Edition**: **OpenAI API** (Whisper + GPT, user-supplied key)

Users are responsible for the corresponding service fees of the AI providers they use.
