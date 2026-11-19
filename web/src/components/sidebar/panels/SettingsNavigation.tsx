import { useEffect, useState } from "react";
import { SETTINGS_SECTIONS } from "@/components/settings-navigation";
import { cn } from "@/lib/utils";
import { SidebarHeader, SidebarScroll } from "../SidebarLayout";

export function SettingsNavigation() {
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const scrollRoot = document.querySelector<HTMLElement>(".nd-app-content");
    if (!scrollRoot) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const marker = scrollRoot.getBoundingClientRect().top + 120;
      let current: string | null = null;
      for (const section of SETTINGS_SECTIONS) {
        const element = document.getElementById(section.id);
        if (!element) continue;
        const bounds = element.getBoundingClientRect();
        if (bounds.top <= marker && bounds.bottom > marker) {
          current = section.id;
          break;
        }
      }
      setActive(current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    scrollRoot.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      scrollRoot.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  const jumpTo = (id: string) => {
    const element = document.getElementById(id);
    if (!element) return;
    setActive(id);
    history.replaceState(null, "", `#${id}`);
    element.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <nav aria-label="Settings sections" className="nd-types-sidebar nd-settings-sidebar flex h-full min-h-0 flex-col gap-0.5 text-sm">
      <SidebarHeader className="mb-3 shrink-0">
        <h2 className="min-w-0 flex-1 text-sm font-semibold">Settings</h2>
      </SidebarHeader>
      <SidebarScroll className="nd-types-sidebar-scroll min-h-0 flex-1">
        <div className="nd-tree-content">
          {SETTINGS_SECTIONS.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              aria-current={active === section.id ? "location" : undefined}
              onClick={(event) => {
                event.preventDefault();
                jumpTo(section.id);
              }}
              className={cn("nd-tree-row nd-types-sidebar-item pl-2.5 text-left", active === section.id && "is-active")}
            >
              <span className="nd-tree-badge" aria-hidden="true">
                <section.icon className="size-4 shrink-0" />
              </span>
              <span className="min-w-0 flex-1 truncate">{section.label}</span>
            </a>
          ))}
        </div>
      </SidebarScroll>
    </nav>
  );
}
