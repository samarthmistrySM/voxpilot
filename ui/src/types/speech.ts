export type RecognitionStatus = "idle" | "listening" | "unsupported" | "error";

export type SpeechRecognitionEvent = Event & {
  results: SpeechRecognitionResultList;
};

export type SpeechRecognitionErrorEvent = Event & {
  error: string;
};

export type SpeechRecognitionInstance = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

export type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;
