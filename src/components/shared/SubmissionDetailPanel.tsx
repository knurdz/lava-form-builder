"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { AlertTriangle, LoaderCircle, Trash2, X } from "lucide-react";
import { formatDateTimeDisplay, formatStoredDateForInput } from "../../core/date-format";
import type { ActionResult, FormWithFields, SubmissionDetail } from "../../types";

const DELETE_SUBMISSION_IDLE: ActionResult = {
  status: "idle",
  message: null,
  toastKey: 0,
};

function formatValue(
  value: unknown,
  fieldType?: FormWithFields["fields"][number]["type"],
) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (fieldType === "date" && typeof value === "string") {
    return formatStoredDateForInput(value);
  }

  return String(value);
}

function formatTimestamp(value: string) {
  return formatDateTimeDisplay(value);
}

function DeleteSubmissionTrigger({
  disabled,
  onClick,
}: {
  disabled?: boolean;
  onClick: () => void;
}) {
  const { pending } = useFormStatus();
  const isDisabled = disabled || pending;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isDisabled}
      className="inline-flex items-center justify-center gap-2 rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 shadow-sm transition-colors hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-rose-900/60 dark:bg-rose-950/50 dark:text-rose-300 dark:hover:bg-rose-950"
    >
      {pending ? (
        <LoaderCircle className="h-4 w-4 animate-spin" />
      ) : (
        <Trash2 className="h-4 w-4" />
      )}
      {pending ? "Deleting..." : "Delete"}
    </button>
  );
}

function DeleteSubmissionConfirmationDialog({
  isOpen,
  onCancel,
  submissionTitle,
}: {
  isOpen: boolean;
  onCancel: () => void;
  submissionTitle: string;
}) {
  const { pending } = useFormStatus();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-zinc-950/60 px-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Confirm delete for ${submissionTitle}`}
        className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
      >
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-300">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <h4 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Delete this submission?
            </h4>
            <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
              This permanently deletes the submission and any related stored files or
              unique-value locks for{" "}
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                {submissionTitle}
              </span>
              .
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="inline-flex items-center justify-center rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center justify-center gap-2 rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 transition-colors hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-rose-900/60 dark:bg-rose-950/50 dark:text-rose-300 dark:hover:bg-rose-950"
          >
            {pending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
            {pending ? "Deleting..." : "Yes, delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SummaryItem({
  label,
  value,
  vertical = false,
}: {
  label: string;
  value: string;
  vertical?: boolean;
}) {
  if (vertical) {
    return (
      <div className="rounded-md border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
        <p className="mb-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</p>
        <p className="whitespace-pre-wrap break-words text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {value}
        </p>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
      <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</span>
      <span className="truncate text-right text-sm font-semibold text-zinc-900 dark:text-zinc-100">
        {value}
      </span>
    </div>
  );
}

export function SubmissionDetailPanel({
  form,
  onDeleted,
  submission,
  onCloseHref,
  onDeleteSubmission,
  onNavigate,
}: {
  form: FormWithFields | null;
  onDeleted?: () => void;
  submission: SubmissionDetail;
  onCloseHref: string;
  onDeleteSubmission: (prevState: ActionResult, formData: FormData) => Promise<ActionResult>;
  onNavigate?: (url: string) => void;
}) {
  const labelMap = new Map(form?.fields.map((f) => [f.key, f.label] as const) ?? []);
  const typeMap = new Map(form?.fields.map((f) => [f.key, f.type] as const) ?? []);
  const handledDeleteToastKeyRef = useRef(0);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteState, deleteFormAction] = useActionState(
    onDeleteSubmission,
    DELETE_SUBMISSION_IDLE,
  );

  useEffect(() => {
    if (
      deleteState.status !== "success" ||
      !deleteState.toastKey ||
      handledDeleteToastKeyRef.current === deleteState.toastKey
    ) {
      return;
    }

    handledDeleteToastKeyRef.current = deleteState.toastKey;
    setDeleteConfirmOpen(false);

    if (onDeleted) {
      onDeleted();
      return;
    }

    if (onNavigate) {
      onNavigate(onCloseHref);
    } else if (typeof window !== "undefined") {
      window.location.assign(onCloseHref);
    }
  }, [deleteState.status, deleteState.toastKey, onCloseHref, onDeleted, onNavigate]);

  return (
    <div className="w-full bg-white dark:bg-zinc-900">
      <div className="sticky top-0 z-10 border-b border-zinc-100 bg-white/95 px-6 pb-6 pt-6 backdrop-blur-md sm:px-8 sm:pt-8 dark:border-zinc-800/80 dark:bg-zinc-900/95">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[0.625rem] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Submission Detail
            </p>
            <h3 className="mt-2 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              {submission.displayTitle}
            </h3>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Submitted on {formatTimestamp(submission.createdAt)}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <form action={deleteFormAction}>
              <input type="hidden" name="submissionId" value={submission.id} />
              <DeleteSubmissionTrigger onClick={() => setDeleteConfirmOpen(true)} />
              <DeleteSubmissionConfirmationDialog
                isOpen={deleteConfirmOpen}
                onCancel={() => setDeleteConfirmOpen(false)}
                submissionTitle={submission.displayTitle}
              />
            </form>

            <a
              href={onCloseHref}
              className="-m-2 rounded-full p-2 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </a>
          </div>
        </div>

        {deleteState.status === "error" && deleteState.message ? (
          <p
            className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200"
            role="alert"
          >
            {deleteState.message}
          </p>
        ) : null}
      </div>

      <div className="p-4 sm:p-6 md:p-8">
        <div className="grid gap-4 md:grid-cols-2">
          {submission.displaySubtitle ? (
            <SummaryItem label="Contact" value={submission.displaySubtitle} />
          ) : null}
          {submission.teamName ? (
            <SummaryItem label="Team name" value={submission.teamName} />
          ) : null}
          <SummaryItem
            label="Form"
            value={submission.formTitle ?? form?.title ?? "Unknown form"}
          />
        </div>

        {submission.commonMatches && submission.commonMatches.length > 0 ? (
          <div className="mt-6 rounded-lg border border-zinc-200 bg-zinc-50 p-5 dark:border-zinc-800 dark:bg-zinc-950">
            <h4 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Common across forms
            </h4>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {submission.commonMatches.map((match) => (
                <SummaryItem
                  key={`${submission.id}-${match.formId}-${match.submissionId}`}
                  label={match.formTitle ?? "Form"}
                  value={`Submitted ${formatTimestamp(match.createdAt)}`}
                  vertical
                />
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-6 rounded-lg border border-zinc-200 bg-zinc-50 p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <h4 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Submission fields
          </h4>
          <div className="mt-4 space-y-3">
            {Object.entries(submission.answers).map(([key, value]) => (
              <SummaryItem
                key={key}
                label={labelMap.get(key) ?? key}
                value={formatValue(value, typeMap.get(key))}
                vertical
              />
            ))}
          </div>
        </div>

        {submission.memberAnswers.length > 0 ? (
          <div className="mt-8 space-y-4">
            <h4 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Team members
            </h4>
            {submission.memberAnswers.map((member, index) => (
              <div
                key={`${submission.id}-member-${index}`}
                className="rounded-lg border border-zinc-200 bg-zinc-50 p-5 dark:border-zinc-800 dark:bg-zinc-950"
              >
                <p className="mb-4 border-b border-zinc-200 pb-2 text-sm font-semibold text-zinc-900 dark:border-zinc-800 dark:text-zinc-100">
                  Member {index + 1}
                </p>
                <div className="space-y-3">
                  {Object.entries(member).map(([key, value]) => (
                    <SummaryItem
                      key={`${submission.id}-${index}-${key}`}
                      label={labelMap.get(key) ?? key}
                      value={formatValue(value, typeMap.get(key))}
                      vertical
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
