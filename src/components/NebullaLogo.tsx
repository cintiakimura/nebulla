type NebullaLogoProps = {
  /** Pixel size of the mark (image area, not including tray padding). */
  size?: number;
  className?: string;
  /** White rounded tray so the mark reads on dark backgrounds. */
  tray?: boolean;
};

export function NebullaLogo({ size = 40, className = "", tray = true }: NebullaLogoProps) {
  const img = (
    <img
      src="/nebulla-logo.png"
      alt="Nebulla"
      width={size}
      height={size}
      className="object-contain select-none"
      draggable={false}
    />
  );
  if (!tray) {
    return (
      <span className={`inline-flex shrink-0 ${className}`}>{img}</span>
    );
  }
  return (
    <span
      className={`inline-flex items-center justify-center rounded-xl bg-white p-1.5 shadow-sm ring-1 ring-black/10 shrink-0 ${className}`}
    >
      {img}
    </span>
  );
}
