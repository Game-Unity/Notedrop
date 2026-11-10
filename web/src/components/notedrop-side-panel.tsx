import type { ReactNode } from "react";

export function NoteDropSidePanel({ children, visible, mode }: { children: ReactNode; visible: boolean; mode: "overview" | "editor" | "chat" }) {
  return (
    <aside className="nd-side-panel" aria-label="Side panel" data-mode={mode} hidden={!visible}>
      {children}
    </aside>
  );
}
