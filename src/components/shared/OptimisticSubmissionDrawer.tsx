"use client";

import { useEffect, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import type { ActionResult, FormWithFields, SubmissionDetail } from "../../types";
import { buildPageHref } from "../../core/submission-links";
import { SubmissionDetailPanel } from "./SubmissionDetailPanel";

let dispatchOptimisticOpen: ((id: string | null) => void) | null = null;

export const openOptimisticDrawer = (id: string | null) => {
  dispatchOptimisticOpen?.(id);
};

export type SubmissionFilterState = {
  from?: string | null;
  to?: string | null;
  pageSize?: number | "all" | null;
  searchField?: string | null;
  searchQuery?: string | null;
  page?: number;
};

const DRAWER_PORTAL_ID = "lava-form-builder-drawer-portal";
const PORTAL_CLASS =
  "fixed inset-0 z-[100] isolate pointer-events-none [&:empty]:hidden";

function getOrCreateDrawerPortalRoot() {
  let portalRoot = document.getElementById(DRAWER_PORTAL_ID);
  if (!portalRoot) {
    portalRoot = document.createElement("div");
    portalRoot.id = DRAWER_PORTAL_ID;
    portalRoot.setAttribute("data-lava-form-builder", "drawer-portal");
    portalRoot.className = PORTAL_CLASS;
    document.body.appendChild(portalRoot);
  } else {
    portalRoot.className = PORTAL_CLASS;
  }
  return portalRoot;
}

export function OptimisticSubmissionDrawer({
  forms,
  mode,
  formSlug,
  commonFormSlugs,
  commonFieldKey,
  submissions,
  selectedSubmission,
  onDeleteSubmission,
  onNavigate,
  submissionsBasePath = "/admin/registrations",
  filterState,
}: {
  forms: FormWithFields[];
  mode: "single" | "common";
  formSlug: string | null;
  commonFormSlugs: string[];
  commonFieldKey: string;
  submissions: SubmissionDetail[];
  selectedSubmission: SubmissionDetail | null;
  onDeleteSubmission: (prevState: ActionResult, formData: FormData) => Promise<ActionResult>;
  onNavigate?: (url: string) => void;
  submissionsBasePath?: string;
  filterState: SubmissionFilterState;
}) {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  const formById = new Map(forms.map((form) => [form.id, form] as const));

  useEffect(() => {
    if (typeof document === "undefined") return;
    setPortalRoot(getOrCreateDrawerPortalRoot());
  }, []);

  useEffect(() => {
    dispatchOptimisticOpen = setLoadingId;
    return () => {
      dispatchOptimisticOpen = null;
    };
  }, []);

  useEffect(() => {
    if (!selectedSubmission?.id) return;
    setLoadingId((current) =>
      current === selectedSubmission.id ? null : current,
    );
  }, [selectedSubmission?.id]);

  const closeHref = buildPageHref({
    slug: mode === "common" ? null : formSlug,
    mode,
    commonFormSlugs,
    commonFieldKey,
    from: filterState.from,
    to: filterState.to,
    page: filterState.page ?? 1,
    pageSize: filterState.pageSize,
    searchField: mode === "common" ? null : filterState.searchField,
    searchQuery: filterState.searchQuery,
    basePath: submissionsBasePath,
  });

  function goTo(url: string) {
    if (onNavigate) {
      onNavigate(url);
      return;
    }
    if (typeof window !== "undefined") {
      window.location.assign(url);
    }
  }

  const handleClose = () => {
    setLoadingId(null);
    goTo(closeHref);
  };

  const handleDeleted = () => {
    setLoadingId(null);
    goTo(closeHref);
  };

  const isOpen = loadingId !== null || selectedSubmission !== null;

  useEffect(() => {
    if (typeof document === "undefined" || !isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  if (!portalRoot) return null;

  const submissionToRender =
    (loadingId ? submissions.find((s) => s.id === loadingId) : null) ??
    selectedSubmission;
  const form = submissionToRender ? formById.get(submissionToRender.formId) ?? null : null;

  return createPortal(
    <AnimatePresence mode="wait">
      {isOpen ? (
        <div
          key="optimistic-drawer-wrap"
          className="pointer-events-none absolute inset-0 size-full"
        >
          <motion.div
            key="optimistic-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="pointer-events-auto absolute inset-0 bg-zinc-900/40 backdrop-blur-sm dark:bg-zinc-900/60"
            onClick={handleClose}
            aria-label="Close submission drawer"
          />

          <motion.div
            key="optimistic-drawer"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="pointer-events-auto absolute bottom-0 flex h-[95vh] max-h-[95vh] w-full flex-col items-center overflow-hidden rounded-t-2xl border-t border-zinc-200 bg-white shadow-[0_-1.25rem_2.5rem_-1.25rem_rgba(0,0,0,0.1)] dark:border-zinc-800 dark:bg-zinc-900"
            onClick={(event: MouseEvent<HTMLDivElement>) => {
              const link = (event.target as HTMLElement).closest("a");
              if (link?.getAttribute("aria-label") === "Close") {
                event.preventDefault();
                handleClose();
              }
            }}
          >
            {submissionToRender ? (
              <div className="w-full self-start overflow-y-auto text-left">
                <SubmissionDetailPanel
                  form={form}
                  onDeleted={handleDeleted}
                  submission={submissionToRender}
                  onCloseHref={closeHref}
                  onDeleteSubmission={onDeleteSubmission}
                  onNavigate={onNavigate}
                />
              </div>
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center">
                <p className="animate-pulse text-sm font-medium text-zinc-500 dark:text-zinc-400">
                  Loading submission details...
                </p>
              </div>
            )}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    portalRoot,
  );
}
