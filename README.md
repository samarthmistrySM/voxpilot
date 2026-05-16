# VoxPilot

**VoxPilot** is a voice-first Chrome extension that helps people control and navigate the web using speech, with a path toward AI interpretation and strong use of accessibility signals (ARIA, labels, roles, headings).

**Accessibility focus:** VoxPilot is built as an **accessibility-oriented** tool. Many sites still assume heavy **keyboard and tab** navigation; VoxPilot aims to reduce that burden so a person does **not** have to rely on tabbing through every control to use a page. Instead, **voice plus AI** can drive the same actions—moving focus, activating buttons, following links, filling fields—so the **whole website** can be operated more directly by what you say, with spoken feedback along the way.

## What we are building

- **Voice input** — capture speech, show a live transcript in the popup, and route commands toward the active page.
- **Speech feedback** — text-to-speech in the popup for confirmations and results.
- **DOM-aware actions (V2)** — rule-based voice commands in the tab (`click …`, `find …`, `list buttons` / `list links`, `next` / `previous`); spoken feedback in the popup.
- **Accessible navigation** — prefer semantic cues (e.g. “login button”, `aria-label`, visible text) over brittle selectors alone.

Target browsers: **Chromium family** (Chrome, Brave, Arc). Web Speech and mic behavior can differ by browser; Chrome is the reference environment.

## How we are building it

### Repository layout

```
voxpilot/
├── extension/          # Load this folder as “Unpacked” in Chrome
│   ├── manifest.json   # MV3 manifest
│   ├── background.js   # Service worker — messaging hub
│   ├── content.js      # Runs in web pages — mic + speech + (later) DOM
│   ├── index.html      # Popup shell (from Vite build)
│   └── assets/         # Bundled React app
│
├── ui/                 # React + Vite + TypeScript + Tailwind
│   └── src/            # Popup UI, hooks, components
│
└── README.md
```

### Architecture (Manifest V3)

| Layer | Role |
|--------|------|
| **Popup (`ui/` → built into `extension/`)** | React UI: start/stop listening, transcript, TTS. User gestures start here. |
| **Service worker (`background.js`)** | Receives commands from the popup, forwards them to the **active tab’s** content script, and **relays** messages from the tab back to the popup so the UI stays in sync. |
| **Content script (`content.js`)** | Runs on `http(s)` pages: microphone, **Web Speech API**, **V2 rule-based commands** (click / find / list / next-prev), and `ACTION_RESULT` updates for the popup. |

**Why not only the popup for mic + speech?**  
The popup is small and closes easily. Running capture and recognition in the **tab** keeps voice tied to the page the user is controlling and avoids some “stuck requesting permission” cases when nothing was listening on the other end.

**Messaging flow (voice today)**

1. User clicks **Start Listening** in the popup.  
2. Popup sends `START_LISTENING` to the **background** (`chrome.runtime.sendMessage`).  
3. Background finds the active tab and sends `VOXPILOT_START_LISTENING` to the **content script** (`chrome.tabs.sendMessage`). If no listener exists yet, it **injects** `content.js` with the `scripting` API and retries.  
4. Content script calls `getUserMedia`, starts recognition, and posts updates (`RECOGNITION_STARTED`, `TRANSCRIPT`, errors, end) to the runtime.  
5. Background **relays** those messages so the **popup** can update React state.  
6. **Stop** follows the same path with `STOP_LISTENING` / `VOXPILOT_STOP_LISTENING`.

> **Note:** `chrome.runtime.sendMessage` from a content script is handled by the service worker first. The popup does not receive those events unless the background relays them — that relay is intentional.

### Tech stack

- **Chrome Extension** — Manifest V3, `activeTab`, `scripting`, `tabs`, `host_permissions` for `http(s)` pages.  
- **UI** — React 19, Vite, TypeScript, Tailwind CSS v4.  
- **Speech** — `navigator.mediaDevices.getUserMedia` + `SpeechRecognition` / `webkitSpeechRecognition` in the content script.  
- **TTS** — `speechSynthesis` in the popup.

### Local development

1. **Install and build the popup**

   ```bash
   cd ui
   npm install
   npm run build
   ```

   `npm run build` compiles the UI and copies `ui/dist/` into `extension/` (see `ui/package.json` scripts).

2. **Load the extension**

   - Open `chrome://extensions`  
   - Enable **Developer mode**  
   - **Load unpacked** → choose the `extension/` directory.

3. **Try voice**

   - Open a normal **https** page (not `chrome://` or the extensions gallery).  
   - Open the VoxPilot popup and click **Start Listening**.  
   - Approve the microphone prompt for that **site** when the browser asks.

### Roadmap (short)

- **V2 — Actions** — rule-based commands in the content script: **click / find / list buttons|links / next|previous control**; results relayed to the popup with spoken feedback (`ACTION_RESULT`). DOM collection is **capped and ordered** so large SPAs stay responsive; **open** Shadow DOM is scanned lightly (many sites use **closed** shadows — those controls stay inaccessible to extensions).
- **Richer accessibility layer** — headings, landmarks, refined name computation and disambiguation.  
- **AI layer** — natural language → validated action plan, then the same DOM executor.  
- **Optional: offscreen document** — long-running listening without depending on an open popup or only tab-scoped speech.

#### V2 voice commands (examples)

Say these on a normal webpage while listening:

| Say | Effect |
|-----|--------|
| `click login` / `press sign in` / `tap submit` | Scrolls to best text/label match and clicks |
| `find password` / `locate search` | Scrolls and focuses first match |
| `list buttons` / `what links` | Announces a short numbered list (first 12) |
| `next` / `next button` / `which is next button` | Focus next actionable control |
| `previous` / `prev button` / `which is previous button` | Focus previous actionable control |

**Heavy pages (e.g. large SPAs, YouTube):** scanning is limited to a few hundred controls so the tab stays fast. Many custom players use **closed Shadow DOM** — Chrome does not let content scripts see inside, so some buttons may never match until we add different strategies (keyboard routing, site-specific helpers, etc.).

VoxPilot is built in **small, testable steps**: ship a working voice path first, then wire DOM and AI on top of stable messaging between popup, background, and content scripts.
