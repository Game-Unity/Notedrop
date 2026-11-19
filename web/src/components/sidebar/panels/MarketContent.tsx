export function MarketContent({ onHost }: { onHost(host: HTMLDivElement | null): void }) {
  return <div ref={onHost} className="nd-market-sidebar-host" />;
}
