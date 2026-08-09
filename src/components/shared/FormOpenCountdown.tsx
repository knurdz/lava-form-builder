"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

function getCountdownParts(remainingMs: number) {
  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return { days, hours, minutes, seconds };
}

function CountdownUnit({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className="relative flex h-24 w-20 items-center justify-center overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900">
        <span className="font-serif text-3xl tabular-nums text-zinc-900 dark:text-zinc-100">
          {String(value).padStart(2, "0")}
        </span>
      </div>
      <span className="mt-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        {label}
      </span>
    </div>
  );
}

export default function FormOpenCountdown({
  targetIso,
  title,
  description,
  onOpen,
}: {
  targetIso: string;
  title?: string | null;
  description?: string | null;
  onOpen?: () => void;
}) {
  const openedRef = useRef(false);
  const [now, setNow] = useState(() => Date.now());
  const targetMs = Date.parse(targetIso);
  const remainingMs = Number.isNaN(targetMs) ? 0 : Math.max(0, targetMs - now);
  const parts = getCountdownParts(remainingMs);

  useEffect(() => {
    if (Number.isNaN(targetMs)) return;
    const intervalId = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, [targetMs]);

  useEffect(() => {
    if (remainingMs > 0 || openedRef.current) return;
    openedRef.current = true;
    onOpen?.();
  }, [remainingMs, onOpen]);

  if (Number.isNaN(targetMs) || remainingMs <= 0) return null;

  const showDays = parts.days > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex w-full flex-col items-center text-center"
    >
      <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">
        Opens soon
      </p>
      {title ? (
        <h2 className="mt-4 max-w-xl text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
          {title}
        </h2>
      ) : null}
      <div className="mt-6 flex items-start gap-2">
        {showDays ? (
          <>
            <CountdownUnit value={parts.days} label="Days" />
            <span className="pt-8 text-2xl text-zinc-300">:</span>
          </>
        ) : null}
        <CountdownUnit value={parts.hours} label="Hours" />
        <span className="pt-8 text-2xl text-zinc-300">:</span>
        <CountdownUnit value={parts.minutes} label="Minutes" />
        <span className="pt-8 text-2xl text-zinc-300">:</span>
        <CountdownUnit value={parts.seconds} label="Seconds" />
      </div>
      {description ? (
        <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">{description}</p>
      ) : null}
    </motion.div>
  );
}
