import { useEffect, useMemo, useRef, useState } from "react";
import type {
  RecognitionStatus,
  SpeechRecognitionConstructor,
  SpeechRecognitionInstance,
} from "../types/speech";

// Detect whether we're running inside a Chrome extension popup.
// In web dev mode, `chrome` is undefined.
const IS_EXTENSION =
  typeof chrome !== "undefined" && typeof chrome.runtime?.id === "string";

type VoiceFoundationState = {
  status: RecognitionStatus;
  statusMessage: string;
  fullTranscript: string;
  startListening: () => void;
  stopListening: () => void;
  speakTranscript: () => void;
};

// ---------------------------------------------------------------------------
// Helper: error code → human-readable message (web mode)
// ---------------------------------------------------------------------------
function getWebErrorMessage(error: string): string {
  switch (error) {
    case "not-allowed":
      return "Microphone access denied. Allow microphone access in your browser settings.";
    case "network":
      return "Network error: Arc/Brave block Google's speech service by default. Disable Shields for this page, or use Chrome/Safari.";
    case "no-speech":
      return "No speech detected — please try again.";
    default:
      return `Speech recognition error: ${error}`;
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export function useVoiceFoundation(): VoiceFoundationState {
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const [status, setStatus] = useState<RecognitionStatus>("idle");
  const [statusMessage, setStatusMessage] = useState(
    "Tap start and say a command."
  );
  const [finalTranscript, setFinalTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");

  // -------------------------------------------------------------------------
  // Effect: wire up listeners (different per environment)
  // -------------------------------------------------------------------------
  useEffect(() => {
    // -- EXTENSION MODE: listen for messages from content script -------------
    if (IS_EXTENSION) {
      const handler = (message: unknown) => {
        const msg = message as Record<string, string>;
        switch (msg.type) {
          case "RECOGNITION_STARTED":
            setStatus("listening");
            setStatusMessage("Listening…");
            break;
          case "TRANSCRIPT":
            setFinalTranscript(msg.final ?? "");
            setInterimTranscript(msg.interim ?? "");
            break;
          case "RECOGNITION_NO_SPEECH":
            setStatusMessage(msg.message ?? "No speech detected.");
            break;
          case "RECOGNITION_END":
            setStatus((s) => (s === "listening" ? "idle" : s));
            setStatusMessage((s) =>
              s === "Listening…" ? "Stopped." : s
            );
            break;
          case "RECOGNITION_ERROR":
            setStatus(
              msg.error === "unsupported" ? "unsupported" : "error"
            );
            setStatusMessage(msg.message ?? `Error: ${msg.error}`);
            break;
          case "ACTION_RESULT": {
            const actionMsg = msg.message ?? "";
            setStatusMessage(actionMsg);
            if (actionMsg) {
              window.speechSynthesis.cancel();
              const utterance = new SpeechSynthesisUtterance(actionMsg);
              utterance.lang = "en-US";
              window.speechSynthesis.speak(utterance);
            }
            break;
          }
        }
      };

      chrome.runtime.onMessage.addListener(handler);
      return () => {
        chrome.runtime.onMessage.removeListener(handler);
        chrome.runtime.sendMessage({ type: "STOP_LISTENING" });
      };
    }

    // -- WEB MODE: direct SpeechRecognition -----------------------------------
    const webSpeechWindow = window as Window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    const Recognition =
      webSpeechWindow.SpeechRecognition ??
      webSpeechWindow.webkitSpeechRecognition;

    if (!Recognition) {
      setStatus("unsupported");
      setStatusMessage("Speech recognition is not supported in this browser.");
      return;
    }

    const recognition = new Recognition();
    recognition.lang = "en-US";
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let nextFinal = "";
      let nextInterim = "";
      for (let i = 0; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = result[0]?.transcript ?? "";
        if (result.isFinal) {
          nextFinal += `${text} `;
        } else {
          nextInterim += text;
        }
      }
      setFinalTranscript(nextFinal.trim());
      setInterimTranscript(nextInterim.trim());
    };

    recognition.onerror = (event) => {
      // "no-speech" is non-fatal — recognition keeps running
      if (event.error === "no-speech") {
        setStatusMessage(getWebErrorMessage("no-speech"));
        return;
      }
      setStatus("error");
      setStatusMessage(getWebErrorMessage(event.error));
    };

    recognition.onend = () => {
      setStatus((s) => (s === "listening" ? "idle" : s));
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.stop();
      window.speechSynthesis.cancel();
    };
  }, []);

  // -------------------------------------------------------------------------
  // startListening
  // -------------------------------------------------------------------------
  const startListening = () => {
    if (status === "listening") return;

    setInterimTranscript("");
    setStatusMessage("Requesting microphone permission…");

    if (IS_EXTENSION) {
      chrome.runtime.sendMessage({ type: "START_LISTENING" }, () => {
        const err = chrome.runtime.lastError;
        if (err) {
          setStatus("error");
          setStatusMessage(err.message ?? "Could not reach background worker.");
        }
      });
      return;
    }

    // Web mode — SpeechRecognition handles the mic permission prompt itself
    const recognition = recognitionRef.current;
    if (!recognition) return;

    setStatus("listening");
    setStatusMessage("Listening…");

    try {
      recognition.start();
    } catch {
      setStatus("error");
      setStatusMessage("Could not start listening. Try again.");
    }
  };

  // -------------------------------------------------------------------------
  // stopListening
  // -------------------------------------------------------------------------
  const stopListening = () => {
    setStatus("idle");
    setStatusMessage("Stopped listening.");
    window.speechSynthesis.cancel();

    if (IS_EXTENSION) {
      chrome.runtime.sendMessage({ type: "STOP_LISTENING" });
      return;
    }

    recognitionRef.current?.stop();
  };

  // -------------------------------------------------------------------------
  // speakTranscript
  // -------------------------------------------------------------------------
  const speakTranscript = () => {
    const textToSpeak = `${finalTranscript} ${interimTranscript}`.trim();
    if (!textToSpeak) {
      setStatusMessage("No transcript available to speak yet.");
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    utterance.lang = "en-US";
    window.speechSynthesis.speak(utterance);
    setStatusMessage("Speaking transcript…");
  };

  const fullTranscript = useMemo(
    () => `${finalTranscript} ${interimTranscript}`.trim(),
    [finalTranscript, interimTranscript]
  );

  return {
    status,
    statusMessage,
    fullTranscript,
    startListening,
    stopListening,
    speakTranscript,
  };
}
