import type { ReactNode } from "react";

export function NoteDropSidePanel({ children, visible }: { children: ReactNode; visible: boolean }) {
  return (
    <aside className="nd-side-panel" aria-label="Side panel" hidden={!visible}>
      {children}
    </aside>
  );
}
