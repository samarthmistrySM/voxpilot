/**
 * VoxPilot content script — mic + Web Speech on the page tab (user is usually here).
 * Messages use VOXPILOT_* prefix to avoid collisions.
 */

const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;

let recognition = null;
let mediaStream = null;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "VOXPILOT_START_LISTENING") {
    void startPipeline().then(() => sendResponse({ ok: true })).catch((e) => {
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

function notify(type, extra = {}) {
  void chrome.runtime.sendMessage({ type, ...extra });
}

function notifyError(error, message) {
  notify("RECOGNITION_ERROR", { error, message });
}

function silenceCleanup() {
  if (recognition) {
    try {
      recognition.stop();
    } catch {
      /* ignore */
    }
    recognition = null;
  }
  if (mediaStream) {
    for (const t of mediaStream.getTracks()) {
      t.stop();
    }
    mediaStream = null;
  }
}

function stopPipeline() {
  silenceCleanup();
  notify("RECOGNITION_END");
}

async function startPipeline() {
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
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false,
    });
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

  recognition = new Recognition();
  recognition.lang = "en-US";
  recognition.continuous = true;
  recognition.interimResults = true;

  recognition.onresult = (event) => {
    let finalText = "";
    let interimText = "";
    for (let i = 0; i < event.results.length; i += 1) {
      const r = event.results[i];
      const piece = r[0]?.transcript ?? "";
      if (r.isFinal) {
        finalText += piece;
      } else {
        interimText += piece;
      }
    }
    notify("TRANSCRIPT", {
      final: finalText.trim(),
      interim: interimText.trim(),
    });
  };

  recognition.onerror = (event) => {
    if (event.error === "no-speech") {
      notify("RECOGNITION_NO_SPEECH", { message: "No speech detected." });
      return;
    }
    notifyError(event.error, `Speech recognition error: ${event.error}`);
  };

  recognition.onend = () => {
    notify("RECOGNITION_END");
    recognition = null;
  };

  try {
    recognition.start();
  } catch (e) {
    notifyError("start", e?.message ?? String(e));
    stopPipeline();
  }
}
