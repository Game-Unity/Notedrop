export function Logo({ className, tile = false }: { className?: string; tile?: boolean }) {
  return (
    <img
      src={`${import.meta.env.BASE_URL}notedrop-logo.svg`}
      className={tile ? `nd-logo-tile ${className ?? ""}` : className}
      alt=""
      aria-hidden="true"
    />
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={className} aria-label="Notedrop">Notedrop</span>
  );
}
