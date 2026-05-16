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

## Voice Commands Reference

Say these on any normal **https** webpage while VoxPilot is listening.  
Commands are **case-insensitive** and ignore punctuation — speak naturally.

---

### 🖱️ Click / Activate

Click or activate an element by its visible label, `aria-label`, or accessible name.

| Say | Effect |
|-----|--------|
| `click <name>` | Scrolls to the best-matching element and clicks it |
| `press <name>` | Same as `click` |
| `tap <name>` | Same as `click` |

**Examples:** `click login` · `press sign in` · `tap submit`

> If multiple elements score equally, VoxPilot asks you to be more specific and lists the top matches.

---

### 🎯 Click / Activate Focused Element

Click whichever element already has keyboard focus (use after `next` / `previous`).

| Say | Effect |
|-----|--------|
| `click` | Clicks the currently focused element |
| `press` | Same as `click` |
| `tap` | Same as `click` |
| `click this` | Same as `click` |
| `click it` | Same as `click` |
| `click current` | Same as `click` |
| `activate` | Same as `click` |
| `activate this` | Same as `click` |

---

### 🔍 Find / Focus a Named Element

Scroll to and focus an element without clicking it — useful for inspecting before acting.

| Say | Effect |
|-----|--------|
| `find <name>` | Scrolls to and focuses the best match |
| `show <name>` | Same as `find` |
| `locate <name>` | Same as `find` |
| `focus <name>` | Same as `find` |

**Examples:** `find password field` · `locate search box` · `show sign up`

---

### 📋 List Page Elements

Announce the first 12 buttons or links on the page so you know what's available.

| Say | Effect |
|-----|--------|
| `list buttons` | Reads out up to 12 buttons |
| `list button` | Same as `list buttons` |
| `show buttons` | Same as `list buttons` |
| `what buttons` | Same as `list buttons` |
| `list links` | Reads out up to 12 links |
| `list link` | Same as `list links` |
| `show links` | Same as `list links` |
| `what links` | Same as `list links` |

---

### ⏭️ Focus Navigation (next / previous)

Move keyboard focus forward or backward through all focusable elements on the page — fast, no DOM scan.

| Say | Effect |
|-----|--------|
| `next` | Focus the next focusable control |
| `next button` | Same as `next` |
| `next element` | Same as `next` |
| `next control` | Same as `next` |
| `next item` | Same as `next` |
| `which is next` | Same as `next` |
| `which is next button` | Same as `next` |
| `previous` | Focus the previous focusable control |
| `prev` | Same as `previous` |
| `back` (navigation context) | Same as `previous` |
| `previous button` | Same as `previous` |
| `previous element` | Same as `previous` |
| `previous control` | Same as `previous` |
| `previous item` | Same as `previous` |
| `which is previous` | Same as `previous` |
| `which is previous button` | Same as `previous` |

---

### 📖 Read Focused Element

Hear the accessible name and role of whichever element currently has focus.

| Say | Effect |
|-----|--------|
| `read` | Speaks the name + role of the focused element |
| `read this` | Same as `read` |
| `what is this` | Same as `read` |
| `what's this` | Same as `read` |
| `describe` | Same as `read` |

---

### ⌨️ Text Input

Focus the first visible text field on the page, then type into it.

| Say | Effect |
|-----|--------|
| `focus input` | Jumps to the first visible text input or textarea |
| `focus search` | Same as `focus input` |
| `focus text` | Same as `focus input` |
| `focus field` | Same as `focus input` |
| `focus box` | Same as `focus input` |
| `go to input` | Same as `focus input` |
| `go to search` | Same as `focus input` |
| `type <text>` | Types `<text>` into the currently focused input |
| `enter <text>` | Same as `type` |
| `write <text>` | Same as `type` |
| `input <text>` | Same as `type` |

**Typical flow:** `focus search` → `type hello world`

> `type` fires native `input` and `change` events so React / Vue controlled inputs update correctly.

---

### 📜 Scroll

| Say | Effect |
|-----|--------|
| `scroll down` | Scrolls down ~40 % of the viewport |
| `page down` | Same as `scroll down` |
| `go down` | Same as `scroll down` |
| `move down` | Same as `scroll down` |
| `scroll up` | Scrolls up ~40 % of the viewport |
| `page up` | Same as `scroll up` |
| `go up` | Same as `scroll up` |
| `move up` | Same as `scroll up` |

---

### ↩️ Browser Navigation

| Say | Effect |
|-----|--------|
| `go back` | Navigates the browser back one step in history |
| `navigate back` | Same as `go back` |
| `back` | Same as `go back` |

---

### 💡 Tips

- **Combine commands naturally:** say `next` a few times to walk to the right control, then say `click` or `read` to act on it.
- **Name matching is fuzzy:** VoxPilot scores by exact match → substring → word overlap. You don't need to say the full label — `click sign` will match a *Sign in* button.
- **Heavy pages (YouTube, large SPAs):** element scanning is capped at a few hundred controls for speed. Some buttons inside **closed Shadow DOM** are invisible to extensions and won't respond to named commands.
- **`focus input` → `type …`** is the recommended two-step for filling search boxes or forms via voice.

---

VoxPilot is built in **small, testable steps**: ship a working voice path first, then wire DOM and AI on top of stable messaging between popup, background, and content scripts.
