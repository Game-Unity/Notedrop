import { AgentPanel } from "@/components/agent-panel";
import type { SidebarContext } from "../SidebarTypes";

type AgentChatProps = Pick<SidebarContext, "onCloseChat" | "onAgentChanged">;

export function AgentChat({ onCloseChat, onAgentChanged }: AgentChatProps) {
  return <AgentPanel embedded onClose={onCloseChat} onChanged={onAgentChanged} />;
}
