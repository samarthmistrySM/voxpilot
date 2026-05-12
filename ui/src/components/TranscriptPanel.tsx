type TranscriptPanelProps = {
  transcript: string;
};

export function TranscriptPanel({ transcript }: TranscriptPanelProps) {
  return (
    <div className="mt-3 rounded-lg bg-zinc-800 p-3 min-h-36">
      <p className="text-xs uppercase tracking-wide text-zinc-400 mb-2">Transcript</p>
      <p className="text-sm text-zinc-100 whitespace-pre-wrap">
        {transcript || "Say something..."}
      </p>
    </div>
  );
}
