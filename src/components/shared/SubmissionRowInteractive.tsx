"use client";

import { useTransition, ReactNode } from "react";
import { openOptimisticDrawer } from "./OptimisticSubmissionDrawer";

export default function SubmissionRowInteractive({
  href,
  isActive,
  submissionId,
  onNavigate,
  children,
}: {
  href: string;
  isActive: boolean;
  submissionId: string;
  onNavigate?: (url: string) => void;
  children: ReactNode;
}) {
  const [isPending, startTransition] = useTransition();

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (isActive) return;

    openOptimisticDrawer(submissionId);

    startTransition(() => {
      if (onNavigate) {
        onNavigate(href);
        return;
      }
      if (typeof window !== "undefined") {
        window.location.assign(href);
      }
    });
  };

  return (
    <div
      onClick={handleClick}
      className={`block rounded-lg border p-4 transition-all hover:border-zinc-300 dark:hover:border-zinc-700 cursor-pointer ${
        isActive
          ? "border-zinc-900 bg-zinc-50/50 dark:border-zinc-400 dark:bg-zinc-900/50 shadow-sm"
          : "border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950"
      }`}
    >
      <div className={`transition-opacity ${isPending ? "opacity-60" : "opacity-100"}`}>
        {children}
      </div>
    </div>
  );
}
