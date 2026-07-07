"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import { useIsDesktop } from "./useMediaQuery";
import { cn } from "./cn";

export interface SidePanelProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

/**
 * Persistent detail panel for a selected row/cell — never a modal, per the
 * product requirement. Docks to the side on desktop, becomes a full-screen
 * bottom sheet on mobile (the natural touch adaptation of the same slot).
 */
export function SidePanel({ open, onClose, title, children }: SidePanelProps) {
  const isDesktop = useIsDesktop();

  if (!open) return null;

  if (isDesktop) {
    return (
      <aside className="flex h-full w-80 shrink-0 flex-col border-l border-border bg-surface">
        <SidePanelHeader title={title} onClose={onClose} />
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </aside>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[85vh] flex-col rounded-t-2xl border-t border-border bg-surface animate-slide-in">
        <SidePanelHeader title={title} onClose={onClose} />
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}

function SidePanelHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className={cn("flex shrink-0 items-center justify-between border-b border-border px-4 py-3")}>
      <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
      <button
        type="button"
        onClick={onClose}
        className="rounded-lg p-1.5 text-text-secondary hover:bg-border/50 hover:text-text-primary"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
