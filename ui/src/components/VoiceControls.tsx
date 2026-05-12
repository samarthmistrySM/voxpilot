import type { RecognitionStatus } from "../types/speech";

type VoiceControlsProps = {
  status: RecognitionStatus;
  onStart: () => void;
  onStop: () => void;
  onSpeak: () => void;
};

export function VoiceControls({ status, onStart, onStop, onSpeak }: VoiceControlsProps) {
  return (
    <>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onStart}
          disabled={status === "unsupported" || status === "listening"}
          className="w-full bg-blue-500 hover:bg-blue-600 disabled:bg-zinc-700 disabled:cursor-not-allowed transition p-2 rounded-lg text-sm font-medium"
        >
          Start Listening
        </button>
        <button
          type="button"
          onClick={onStop}
          disabled={status !== "listening"}
          className="w-full bg-zinc-700 hover:bg-zinc-600 disabled:bg-zinc-800 disabled:cursor-not-allowed transition p-2 rounded-lg text-sm font-medium"
        >
          Stop
        </button>
      </div>

      <button
        type="button"
        onClick={onSpeak}
        className="mt-2 w-full bg-emerald-600 hover:bg-emerald-700 transition p-2 rounded-lg text-sm font-medium"
      >
        Speak Transcript
      </button>
    </>
  );
}
