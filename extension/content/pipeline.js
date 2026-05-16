/**
 * VoxPilot content — speech pipeline.
 *
 * Manages microphone acquisition, SpeechRecognition lifecycle, and
 * auto-restart so listening never drops while the session is active.
 * Also owns the chrome.runtime message listener that bridges popup ↔ content.
 *
 * Depends on: state.js, messaging.js, parser.js, actions.js
 */

const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function clearRestartTimer() {
  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }
}

function silenceCleanup() {
  clearRestartTimer();
  const r = recognition;
  recognition = null;
  if (r) {
    try {
      // abort() drops pending finals immediately; stop() can still emit a final onresult.
      if (typeof r.abort === "function") {
        r.abort();
      } else {
        r.stop();
      }
    } catch {
      /* ignore */
    }
  }
  if (mediaStream) {
    for (const t of mediaStream.getTracks()) {
      t.stop();
    }
    mediaStream = null;
  }
}

function clearCommandDebounce() {
  if (commandSilenceTimer) {
    clearTimeout(commandSilenceTimer);
    commandSilenceTimer = null;
  }
}

/**
 * Fallback debounce path — used only when the final transcript doesn't yet
 * parse to a known command (e.g., user may still be speaking more words).
 */
function scheduleCommandAfterSilence(finalText) {
  const trimmed = finalText.trim();
  if (!trimmed) return;
  latestFinalForCommand = trimmed;
  clearCommandDebounce();
  commandSilenceTimer = setTimeout(() => {
    commandSilenceTimer = null;
    if (!listeningSessionActive) return;
    const text = latestFinalForCommand.trim();
    if (!text) return;
    tryRunCommand(text);
  }, SILENCE_MS_BEFORE_ACTION);
}

// ---------------------------------------------------------------------------
// Public: stop
// ---------------------------------------------------------------------------

function stopPipeline() {
  // Flip off first so any in-flight onresult / onend cannot revive the session.
  listeningSessionActive = false;
  clearCommandDebounce();
  clearRestartTimer();
  latestFinalForCommand = "";
  silenceCleanup();
  notify("RECOGNITION_END");
}

// ---------------------------------------------------------------------------
// Core: attach a recognition instance (called on start and on every auto-restart)
// ---------------------------------------------------------------------------

/**
 * Create and start a new SpeechRecognition instance using the already-open
 * mediaStream. Called once by startPipeline() and then automatically by
 * onend whenever Chrome ends a recognition period mid-session, so that
 * listening never drops while the user hasn't explicitly stopped.
 */
function attachRecognition() {
  if (!listeningSessionActive || !mediaStream) return;

  const r = new Recognition();
  r.lang = "en-US";
  r.continuous = true;
  r.interimResults = true;

  // ----- onresult -----
  r.onresult = (event) => {
    if (!listeningSessionActive) return;

    let finalText = "";
    let interimText = "";
    // Start at event.resultIndex — event.results is cumulative across the
    // whole session. Starting at 0 would concatenate all previous finals
    // into one broken string and silently drop the new command.
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const res = event.results[i];
      const piece = res[0]?.transcript ?? "";
      if (res.isFinal) {
        finalText += piece;
      } else {
        interimText += piece;
      }
    }

    notify("TRANSCRIPT", { final: finalText.trim(), interim: interimText.trim() });

    if (finalText.trim()) {
      const trimmed = finalText.trim();
      // Immediate path: if the final text is already a recognisable command,
      // run it now — no 400 ms wait.
      const parsed = parseCommand(trimmed);
      if (parsed) {
        clearCommandDebounce();
        latestFinalForCommand = trimmed;
        tryRunCommand(trimmed);
      } else {
        // Debounce path: might be a partial utterance; wait for more words.
        scheduleCommandAfterSilence(trimmed);
      }
    }
  };

  // ----- onerror -----
  r.onerror = (event) => {
    if (!listeningSessionActive) return;
    if (event.error === "aborted") return;
    if (event.error === "no-speech") {
      // Non-fatal — onend will fire and auto-restart will keep us alive.
      notify("RECOGNITION_NO_SPEECH", { message: "No speech detected." });
      return;
    }
    // Fatal: tear everything down.
    listeningSessionActive = false;
    notifyError(event.error, `Speech recognition error: ${event.error}`);
  };

  // ----- onend -----
  // Chrome fires onend after every session timeout or network hiccup.
  // Auto-restart with a 150 ms breath so we never stop listening mid-session.
  r.onend = () => {
    recognition = null;
    if (!listeningSessionActive) {
      // User stopped intentionally — stopPipeline already sent RECOGNITION_END.
      return;
    }
    clearRestartTimer();
    restartTimer = setTimeout(() => {
      restartTimer = null;
      if (listeningSessionActive && mediaStream) {
        attachRecognition();
      }
    }, 150);
  };

  recognition = r;
  try {
    r.start();
  } catch (e) {
    recognition = null;
    listeningSessionActive = false;
    notifyError("start", e?.message ?? String(e));
    notify("RECOGNITION_END");
  }
}

// ---------------------------------------------------------------------------
// Public: start
// ---------------------------------------------------------------------------

async function startPipeline() {
  listeningSessionActive = false;
  clearCommandDebounce();
  clearRestartTimer();
  latestFinalForCommand = "";
  silenceCleanup();

  if (!navigator.mediaDevices?.getUserMedia) {
    notifyError("unsupported", "getUserMedia is not available.");
    return;
  }

  if (!Recognition) {
    notifyError("unsupported", "Speech recognition is not supported in this browser.");
    return;
  }

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  } catch (err) {
    const name = err instanceof DOMException ? err.name : "";
    if (name === "NotAllowedError" || name === "SecurityError") {
      notifyError("not-allowed", "Microphone permission denied for this site.");
    } else {
      notifyError("media", err?.message ?? String(err));
    }
    return;
  }

  notify("RECOGNITION_STARTED");
  listeningSessionActive = true;
  attachRecognition(); // restarts itself on every onend from here on
}

// ---------------------------------------------------------------------------
// Message listener — bridges popup ↔ content script via background relay
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "VOXPILOT_START_LISTENING") {
    void startPipeline()
      .then(() => sendResponse({ ok: true }))
      .catch((e) => {
        notifyError("start-failed", e?.message ?? String(e));
        sendResponse({ ok: false });
      });
    return true;
  }
  if (message?.type === "VOXPILOT_STOP_LISTENING") {
    stopPipeline();
    sendResponse({ ok: true });
    return false;
  }
  return false;
});
