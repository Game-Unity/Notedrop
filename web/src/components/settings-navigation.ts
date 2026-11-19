import { BookOpen, Database, Info, Keyboard, Monitor, RefreshCw, ShieldCheck, Sparkles, Trash2, UserRound } from "lucide-react";
import { desktopApp } from "@/lib/platform";

export const SETTINGS_SECTIONS = [
  { id: "account", label: "Account", icon: UserRound },
  { id: "sync", label: "Sync", icon: RefreshCw },
  { id: "ai", label: "AI grading", icon: Sparkles },
  { id: "study", label: "Study", icon: BookOpen },
  { id: "data", label: "Data", icon: Database },
  { id: "privacy", label: "Privacy", icon: ShieldCheck },
  ...(desktopApp() ? [{ id: "desktop", label: "Desktop app", icon: Monitor }] : []),
  { id: "keys", label: "Keyboard", icon: Keyboard },
  { id: "cleanup", label: "Clean up", icon: Trash2 },
  { id: "about", label: "About", icon: Info },
];
