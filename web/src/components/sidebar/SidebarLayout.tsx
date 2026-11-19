import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type SidebarHeaderProps = HTMLAttributes<HTMLElement>;

export function SidebarHeader({ className, ...props }: SidebarHeaderProps) {
  return <header {...props} className={cn("nd-side-panel-header", className)} />;
}

export const SidebarScroll = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function SidebarScroll({ className, ...props }, ref) {
    return <div {...props} ref={ref} className={cn("nd-side-panel-scroll", className)} />;
  },
);

export const SidebarFooter = forwardRef<HTMLElement, HTMLAttributes<HTMLElement>>(
  function SidebarFooter({ className, ...props }, ref) {
    return <footer {...props} ref={ref} className={cn("nd-side-panel-footer", className)} />;
  },
);
