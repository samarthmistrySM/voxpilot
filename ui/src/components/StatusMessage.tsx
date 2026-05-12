type StatusMessageProps = {
  message: string;
};

export function StatusMessage({ message }: StatusMessageProps) {
  return (
    <div className="mt-3">
      <p className="text-xs text-zinc-300">{message}</p>
    </div>
  );
}
