import { PopupHeader } from "./components/PopupHeader";
import { StatusMessage } from "./components/StatusMessage";
import { TranscriptPanel } from "./components/TranscriptPanel";
import { VoiceControls } from "./components/VoiceControls";
import { useVoiceFoundation } from "./hooks/useVoiceFoundation";

export default function App() {
  const {
    status,
    statusMessage,
    fullTranscript,
    startListening,
    stopListening,
    speakTranscript,
  } = useVoiceFoundation();

  return (
    <div className="w-[320px] min-h-[420px] bg-zinc-900 text-white p-4">
      <PopupHeader title="VoxPilot 🎤" />
      <VoiceControls
        status={status}
        onStart={startListening}
        onStop={stopListening}
        onSpeak={speakTranscript}
      />
      <StatusMessage message={statusMessage} />
      <TranscriptPanel transcript={fullTranscript} />
    </div>
  );
}
