type PopupHeaderProps = {
  title: string;
};

export function PopupHeader({ title }: PopupHeaderProps) {
  return <h2 className="text-xl font-semibold mb-3">{title}</h2>;
}
