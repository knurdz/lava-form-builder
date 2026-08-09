"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, Plus } from "lucide-react";

export interface FormSelectorItem {
  id: string;
  title: string;
  href?: string;
  onSelect?: () => void;
  status: "open" | "draft" | "closed" | string;
  kind: string;
}

interface FormSelectorDropdownProps {
  items: FormSelectorItem[];
  selectedId?: string;
  canCreate?: boolean;
  onNew?: () => void;
  afterSelector?: ReactNode;
}

export default function FormSelectorDropdown({
  items,
  selectedId,
  canCreate,
  onNew,
  afterSelector,
}: FormSelectorDropdownProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedItem = items.find((item) => item.id === selectedId);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent | TouchEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside, { capture: true });
      document.addEventListener("touchstart", handleClickOutside, { capture: true });
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside, { capture: true });
      document.removeEventListener("touchstart", handleClickOutside, { capture: true });
    };
  }, [open]);

  return (
    <div
      className="relative mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"
    >
      <div className="flex min-w-0 flex-col gap-4 md:flex-row md:flex-wrap md:items-start lg:items-center">
        <div className="relative w-full min-w-0 md:w-auto md:min-w-70" ref={containerRef}>
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="flex w-full items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-900 shadow-sm transition-all hover:border-zinc-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:border-zinc-700"
          >
            <div className="flex items-center gap-2.5">
              {selectedItem ? (
                <>
                  <span
                    className={`h-2.5 w-2.5 rounded-full shadow-sm ${
                      selectedItem.status === "open"
                        ? "bg-emerald-500"
                        : selectedItem.status === "draft"
                        ? "bg-amber-500"
                        : selectedItem.status === "filter"
                        ? "bg-sky-500"
                        : "bg-rose-500"
                    }`}
                  />
                  <span className="truncate">{selectedItem.title}</span>
                </>
              ) : (
                <span className="text-zinc-500">Select a form...</span>
              )}
            </div>
            <ChevronDown
              className={`h-4 w-4 text-zinc-400 transition-transform duration-200 ${
                open ? "rotate-180" : ""
              }`}
            />
          </button>

          {open && (
            <div className="absolute left-0 top-full z-30 mt-2 w-full overflow-hidden rounded-xl border border-zinc-200 bg-white py-1.5 shadow-2xl animate-in fade-in slide-in-from-top-2 duration-200 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="max-h-[18.75rem] overflow-y-auto px-1.5">
                {items.map((item) => {
                  const itemClassName = `flex w-full flex-col gap-0.5 rounded-lg px-3 py-2.5 text-left text-sm transition-all ${
                    item.id === selectedId
                      ? "bg-zinc-100 font-bold text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50"
                      : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
                  }`;
                  const dotClassName =
                    item.status === "open"
                      ? "bg-emerald-500"
                      : item.status === "draft"
                      ? "bg-amber-500"
                      : item.status === "filter"
                      ? "bg-sky-500"
                      : "bg-rose-500";
                  const inner = (
                    <>
                      <div className="flex items-center gap-3">
                        <span className={`h-2 w-2 rounded-full ${dotClassName}`} />
                        <span className="truncate">{item.title}</span>
                      </div>
                      <span className="ml-5 text-[0.625rem] font-bold uppercase tracking-wider opacity-60">
                        {item.kind}
                      </span>
                    </>
                  );

                  if (item.href) {
                    return (
                      <a
                        key={item.id}
                        href={item.href}
                        onClick={() => setOpen(false)}
                        className={itemClassName}
                      >
                        {inner}
                      </a>
                    );
                  }

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        item.onSelect?.();
                        setOpen(false);
                      }}
                      className={itemClassName}
                    >
                      {inner}
                    </button>
                  );
                })}
                {items.length === 0 && (
                  <div className="px-3 py-8 text-center text-xs text-zinc-500">
                    No forms available
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {afterSelector}
      </div>

      {canCreate && (
        <button
          type="button"
          onClick={onNew}
          className="flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-zinc-200 bg-white px-5 py-2.5 text-sm font-bold text-zinc-600 transition-all hover:border-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400 dark:hover:border-zinc-100 dark:hover:shadow-[0_0_0.9375rem_rgba(255,255,255,0.05)]"
        >
          <Plus className="h-4 w-4" />
          <span>New Form</span>
        </button>
      )}
    </div>
  );
}
