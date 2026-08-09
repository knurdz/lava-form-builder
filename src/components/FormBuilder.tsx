"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { createPortal } from "react-dom";
import { Reorder } from "framer-motion";
import {
  CheckCircle2, Copy, ExternalLink, FileImage, GripHorizontal,
  Loader2, Plus, Settings2, ShieldAlert, Trash2, X, ChevronDown,
  CheckSquare, Fingerprint, ListPlus, RefreshCw, UserSquare2
} from "lucide-react";
import FormSelectorDropdown from "./shared/FormSelectorDropdown";
import { parseDisplayDateInput, getStoredDateFromIso } from "../core/date-format";
import {
  isValidFieldPattern,
  normalizeFieldPatternInput,
} from "../core/pattern";
import type {
  ActionResult,
  FieldDefinition,
  FieldOption,
  FieldType,
  FormDefinition,
  FormWithFields,
  SheetsConnection,
} from "../types";
import {
  DEFAULT_MAX_FORMS,
  fieldTypeSupportsGoogleSheetsSync,
  fieldTypeSupportsCaseSensitiveUnique,
  fieldTypeSupportsPlaceholder,
  fieldTypeSupportsPattern,
  fieldTypeSupportsUnique,
  getDefaultFieldPlaceholder,
} from "../types";
import FormattedPickerInput from "./shared/FormattedPickerInput";

// ─── Constants ────────────────────────────────────────────────────────────────
const IDLE: ActionResult = { status: "idle", message: null, toastKey: 0 };
export type FormBuilderActions = {
  createForm: (prevState: ActionResult, formData: FormData) => Promise<ActionResult>;
  updateSettings: (prevState: ActionResult, formData: FormData) => Promise<ActionResult>;
  deleteForm: (prevState: ActionResult, formData: FormData) => Promise<ActionResult>;
  uploadBanner: (prevState: ActionResult, formData: FormData) => Promise<ActionResult>;
  deleteBanner: (prevState: ActionResult, formData: FormData) => Promise<ActionResult>;
  bulkSaveFields: (formId: string, fields: FieldDefinition[]) => Promise<ActionResult>;
};

export type FormBuilderProps = {
  forms: FormDefinition[];
  selectedForm: FormWithFields | null;
  bannerUrl: string | null;
  googleSheetsConnection: SheetsConnection | null;
  googleSheetsOAuthConfigured: boolean;
  linkedResourceTitle?: string | null;
  publicFormBaseUrl: string;
  maxForms?: number;
  actions: FormBuilderActions;
  onNavigate?: (url: string) => void;
  googleSheetsSettingsHref?: string;
};

function navigateTo(url: string, onNavigate?: (url: string) => void) {
  if (onNavigate) {
    onNavigate(url);
    return;
  }
  if (typeof window !== "undefined") {
    window.location.assign(url);
  }
}

const TYPE_LABELS: Record<FieldType, string> = {
  text: "Short answer", textarea: "Paragraph", email: "Email",
  tel: "Phone", url: "URL", number: "Number", select: "Dropdown",
  radio: "Radio input", checkbox: "Checkbox", date: "Date",
  time: "Time", file: "File Upload", page_break: "Page Break"
};

const ALL_TYPES = Object.keys(TYPE_LABELS).filter(t => t !== "page_break") as FieldType[];

const LEGACY_FIELD_PLACEHOLDERS: Partial<Record<FieldType, string>> = {
  textarea: "Long answer text",
};

function isDefaultFieldPlaceholder(
  type: FieldType,
  placeholder: string | null | undefined,
) {
  if (!placeholder?.trim()) return true;

  const trimmed = placeholder.trim();
  const currentDefault = getDefaultFieldPlaceholder(type);
  if (currentDefault && trimmed === currentDefault) return true;

  const legacy = LEGACY_FIELD_PLACEHOLDERS[type];
  if (legacy && trimmed === legacy) return true;

  return trimmed === `${TYPE_LABELS[type]} answer`;
}

function slugifyTitle(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeSlugInput(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+/, "");
}

function normalizeOptionValue(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function createOptionValue(label: string, fallback: string) {
  return normalizeOptionValue(label) || fallback;
}

function isChoiceFieldType(type: FieldType) {
  return type === "select" || type === "radio" || type === "checkbox";
}

function normalizeFieldDraft(field: FieldDefinition): FieldDefinition {
  if (field.type === "page_break") {
    return {
      ...field,
      scope: field.scope === "member" ? "member" : "submission",
      required: false,
      options: [],
      placeholder: null,
      helpText: null,
      isUnique: false,
      uniqueCaseSensitive: false,
      validationPattern: null,
      validationPatternMessage: null,
    };
  }

  const isUniqueSupported = fieldTypeSupportsUnique(field.type);
  const isCaseSensitiveSupported = fieldTypeSupportsCaseSensitiveUnique(field.type);
  const patternFields = normalizeFieldPatternInput(
    field.type,
    field.validationPattern,
    field.validationPatternMessage,
    { trimMessage: false },
  );

  return {
    ...field,
    placeholder: fieldTypeSupportsPlaceholder(field.type)
      ? field.placeholder ?? null
      : null,
    helpText: field.helpText ?? null,
    options:
      isChoiceFieldType(field.type)
        ? field.options.length > 0
          ? field.options
          : [{ label: "Option 1", value: "option_1" }]
        : field.options,
    isUnique: isUniqueSupported ? field.isUnique : false,
    uniqueCaseSensitive:
      isUniqueSupported && isCaseSensitiveSupported && field.isUnique
        ? field.uniqueCaseSensitive
        : false,
    ...patternFields,
  };
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function Toast({ state, onClose }: { state: ActionResult; onClose: () => void }) {
  if (state.status === "idle" || !state.message) return null;
  const ok = state.status === "success";
  return (
    <div role="status" className={`fixed left-4 right-4 top-4 z-[9999] mx-auto flex w-auto max-w-sm items-start gap-3 rounded-lg border px-4 py-3 text-sm shadow-xl sm:left-auto sm:right-6 ${ok ? "border-emerald-500/30 bg-emerald-50 text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-100" : "border-rose-500/30 bg-rose-50 text-rose-900 dark:bg-rose-500/10 dark:text-rose-100"}`}>
      {ok ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" /> : <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />}
      <p className="flex-1 pr-2 leading-tight">{state.message}</p>
      <button type="button" onClick={onClose} aria-label="Close notification" className="flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-md transition hover:bg-black/5 dark:hover:bg-white/10"><X className="h-4 w-4" /></button>
    </div>
  );
}

function useToast(state: ActionResult) {
  const [key, setKey] = useState<number | null>(null);
  const visible = state.status !== "idle" && state.message && state.toastKey !== key ? state : null;
  return { visible, dismiss: () => setKey(state.toastKey ?? null) };
}

function CreateFormButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-2 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200 dark:focus:ring-zinc-300"
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {pending ? "Creating form..." : "Create form"}
    </button>
  );
}


// ─── Create Form Panel ────────────────────────────────────────────────────────
function CreateFormPanel({ formCount, maxForms, publicFormBaseUrl, createForm, onCancel }: { formCount: number; maxForms: number; publicFormBaseUrl: string; createForm: FormBuilderActions["createForm"]; onCancel: () => void }) {
  const [state, dispatch] = useActionState(createForm, IDLE);
  const toast = useToast(state);
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");

  function handleTitleChange(value: string) {
    const previousGeneratedSlug = slugifyTitle(title);
    const nextGeneratedSlug = slugifyTitle(value);

    setTitle(value);
    setSlug((currentSlug) => {
      const normalizedCurrentSlug = normalizeSlugInput(currentSlug);
      if (!normalizedCurrentSlug || normalizedCurrentSlug === previousGeneratedSlug) {
        return nextGeneratedSlug;
      }
      return currentSlug;
    });
  }

  return (
    <>
      {toast.visible && <Toast state={toast.visible} onClose={toast.dismiss} />}
      <div className="mx-auto max-w-xl px-4 sm:px-0 mt-8">
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="h-2 w-full bg-zinc-900 dark:bg-zinc-100" />
          <div className="p-4 sm:p-6 md:p-8">
            <h2 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Create registration form</h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{formCount} of {maxForms} forms used</p>
            <form action={dispatch} className="mt-6 space-y-5">
              <div>
                <input name="title" type="text" placeholder="Form title" value={title} required
                  onChange={e => handleTitleChange(e.target.value)}
                  className="block w-full border-0 border-b-2 border-zinc-200 bg-transparent px-0 py-2 text-xl font-bold text-zinc-900 placeholder-zinc-400 focus:border-zinc-900 focus:ring-0 dark:border-zinc-800 dark:text-zinc-50 dark:placeholder-zinc-600 dark:focus:border-zinc-400" />
              </div>
              <div>
                <select name="kind" className="block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 sm:text-sm dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-400 dark:focus:ring-zinc-400">
                  <option value="competition">Registration</option>
                </select>
              </div>
              <div>
                 <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Slug - <span className="font-normal normal-case tracking-normal">{publicFormBaseUrl}/{slug || "…"}</span>
                </label>
                <input name="slug" type="text" value={slug} required
                  onChange={e => setSlug(normalizeSlugInput(e.target.value))}
                   className="block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 sm:text-sm dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-400 dark:focus:ring-zinc-400" />
              </div>
              {state.status === "error" && <p className="text-sm text-rose-600 dark:text-rose-400">{state.message}</p>}
              <div className="flex gap-3 pt-2">
                <CreateFormButton />
                <button type="button" onClick={onCancel} className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900 dark:focus:ring-zinc-300 transition-colors">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Banner upload ────────────────────────────────────────────────────────────
const BANNER_MAX_BYTES = 5 * 1024 * 1024;
const BANNER_ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/avif"];

function BannerArea({ form, bannerUrl, uploadBanner, deleteBanner }: { form: FormDefinition; bannerUrl: string | null; uploadBanner: FormBuilderActions["uploadBanner"]; deleteBanner: FormBuilderActions["deleteBanner"]; }) {
  const [uploadState, uploadDispatch] = useActionState(uploadBanner, IDLE);
  const [, deleteDispatch] = useActionState(deleteBanner, IDLE);
  const fileRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [clientError, setClientError] = useState<string | null>(null);

  const uploadToast = useToast(uploadState);

  function handleFileChange() {
    setClientError(null);
    const file = fileRef.current?.files?.[0];
    if (!file) return;

    if (!BANNER_ALLOWED_TYPES.includes(file.type)) {
      setClientError("Only PNG, JPEG, WebP, or AVIF images are accepted.");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    if (file.size > BANNER_MAX_BYTES) {
      setClientError(`Image is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 5 MB.`);
      if (fileRef.current) fileRef.current.value = "";
      return;
    }

    formRef.current?.requestSubmit();
  }

  return (
    <div className="relative overflow-hidden w-full border-b border-zinc-200 dark:border-zinc-800">
      {uploadToast.visible && <Toast state={uploadToast.visible} onClose={uploadToast.dismiss} />}
      {clientError && (
        <div className="flex items-center gap-2 bg-rose-50 px-4 py-2 text-xs text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
          <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
          {clientError}
          <button type="button" onClick={() => setClientError(null)} className="ml-auto"><X className="h-3.5 w-3.5" /></button>
        </div>
      )}
      {bannerUrl ? (
        <div className="relative aspect-[3/1] w-full group">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={bannerUrl} alt="Banner" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-black/40 opacity-0 transition-opacity group-hover:opacity-100" />
          <div className="absolute top-3 left-3 opacity-0 transition-opacity group-hover:opacity-100">
            <span className="rounded-md bg-black/50 px-2 py-1 text-[0.6875rem] font-medium text-white backdrop-blur-md">
              Recommended: 3:1
            </span>
          </div>
          <div className="absolute bottom-3 right-3 flex gap-2 opacity-0 transition-opacity group-hover:opacity-100">
            <form action={uploadDispatch} ref={formRef}>
              <input type="hidden" name="formId" value={form.id} />
              <input ref={fileRef} type="file" name="banner" accept="image/*" className="hidden"
                onChange={handleFileChange} />
              <button type="button" onClick={() => { setClientError(null); fileRef.current?.click(); }}
                className="rounded-md bg-white/20 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-md hover:bg-white/30 transition-colors border border-white/20">
                Replace banner
              </button>
            </form>
            <form action={deleteDispatch}>
              <input type="hidden" name="formId" value={form.id} />
              <button type="submit" className="rounded-md bg-rose-500/80 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-md hover:bg-rose-500 transition-colors border border-rose-500/20">Remove</button>
            </form>
          </div>
        </div>
      ) : (
        <form action={uploadDispatch} ref={formRef} className="w-full aspect-[3/1]">
          <input type="hidden" name="formId" value={form.id} />
          <input ref={fileRef} type="file" name="banner" accept="image/*" className="hidden"
            onChange={handleFileChange} />
          <button type="button" onClick={() => { setClientError(null); fileRef.current?.click(); }}
             className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-zinc-50 text-sm font-medium text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:bg-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100">
            <span className="flex items-center gap-2"><FileImage className="h-4 w-4" /> Add banner image</span>
            <span className="text-[0.6875rem] font-normal text-zinc-400 dark:text-zinc-500">Recommended aspect ratio: 3:1 · Max 5 MB</span>
          </button>
        </form>
      )}
    </div>
  );
}

function SaveSettingsButton({ disabled }: { disabled?: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="inline-flex items-center gap-2 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200 dark:focus:ring-zinc-300"
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {pending ? "Saving settings..." : "Save settings"}
    </button>
  );
}

function getSyncableGoogleSheetsFieldIds(form: FormWithFields) {
  return new Set(
    form.fields
      .filter((field) => fieldTypeSupportsGoogleSheetsSync(field.type))
      .map((field) => field.id),
  );
}

function FieldSelectionDropdown({
  fields,
  selectedFieldIds,
  onToggleField,
  isFieldSelectable,
  disabled = false,
  emptyLabel,
  noFieldsLabel,
  unavailableLabel,
}: {
  fields: FieldDefinition[];
  selectedFieldIds: string[];
  onToggleField: (fieldId: string) => void;
  isFieldSelectable: (field: FieldDefinition) => boolean;
  disabled?: boolean;
  emptyLabel: string;
  noFieldsLabel: string;
  unavailableLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [menuPosition, setMenuPosition] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
    placement: "top" | "bottom";
  } | null>(null);
  const canUseDom = typeof document !== "undefined";

  const selectableCount = fields.filter(isFieldSelectable).length;

  useEffect(() => {
    if (!open || !canUseDom) return;

    function updatePosition() {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const viewportPadding = 16;
      const gap = 8;
      const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
      const spaceAbove = rect.top - viewportPadding;
      const placement = spaceBelow < 220 && spaceAbove > spaceBelow ? "top" : "bottom";
      const availableSpace = placement === "bottom" ? spaceBelow : spaceAbove;
      const width = Math.min(rect.width, window.innerWidth - viewportPadding * 2);
      const maxLeft = window.innerWidth - viewportPadding - width;

      setMenuPosition({
        top: placement === "bottom" ? rect.bottom + gap : rect.top - gap,
        left: Math.min(Math.max(viewportPadding, rect.left), maxLeft),
        width,
        maxHeight: Math.min(360, Math.max(availableSpace - gap, 0)),
        placement,
      });
    }

    updatePosition();
    const frameId = window.requestAnimationFrame(updatePosition);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, canUseDom]);

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    if (open) {
      document.addEventListener("keydown", handleEscape);
      return () => document.removeEventListener("keydown", handleEscape);
    }
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled || selectableCount === 0}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 rounded-md border border-zinc-300 bg-white px-3 py-2 text-left shadow-sm transition-colors hover:border-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm dark:border-zinc-700 dark:bg-zinc-950 dark:hover:border-zinc-600 dark:focus:border-zinc-400 dark:focus:ring-zinc-400"
      >
        <span className="min-w-0 flex-1 truncate text-zinc-900 dark:text-zinc-50 font-medium">
          {selectedFieldIds.length > 0
            ? `${selectedFieldIds.length} field${selectedFieldIds.length === 1 ? "" : "s"} selected`
            : selectableCount > 0
              ? emptyLabel
              : noFieldsLabel}
        </span>
        <span className="flex items-center gap-2 shrink-0">
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[0.625rem] font-bold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
            {selectedFieldIds.length} / {selectableCount}
          </span>
          <ChevronDown
            className={`h-4 w-4 text-zinc-400 transition-transform duration-200 ${
              open ? "rotate-180" : ""
            }`}
          />
        </span>
      </button>

      {open && canUseDom && menuPosition
        ? createPortal(
            <>
              <div
                className="fixed inset-0 z-[110]"
                aria-hidden="true"
                onClick={() => setOpen(false)}
              />
              <div
                className={`fixed z-[120] overflow-hidden rounded-md border border-zinc-200 bg-white shadow-xl animate-in fade-in duration-200 dark:border-zinc-800 dark:bg-zinc-900 ${
                  menuPosition.placement === "top"
                    ? "-translate-y-full slide-in-from-bottom-2"
                    : "slide-in-from-top-2"
                }`}
                style={{
                  top: menuPosition.top,
                  left: menuPosition.left,
                  width: menuPosition.width,
                }}
              >
                <div
                  className="space-y-1 overflow-y-auto p-1.5 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-zinc-200 hover:scrollbar-thumb-zinc-300 dark:scrollbar-thumb-zinc-800 dark:hover:scrollbar-thumb-zinc-700"
                  style={{ maxHeight: menuPosition.maxHeight }}
                >
                  {fields.map((field) => {
                    const selectable = isFieldSelectable(field);
                    const checked = selectedFieldIds.includes(field.id);

                    return (
                      <label
                        key={field.id}
                        className={`flex cursor-pointer select-none items-center gap-3 rounded px-2.5 py-2 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50 ${
                          !selectable || disabled ? "cursor-not-allowed opacity-50" : ""
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={!selectable || disabled}
                          onChange={() => onToggleField(field.id)}
                          className="h-4 w-4 shrink-0 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 disabled:cursor-not-allowed dark:border-zinc-600 dark:bg-zinc-950 dark:checked:bg-zinc-100 dark:checked:border-zinc-100 dark:checked:text-zinc-900"
                        />
                        <div className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                            {field.label || "Untitled field"}
                          </span>
                          <span className="truncate text-[0.625rem] uppercase tracking-wider text-zinc-500">
                            {field.scope} · {TYPE_LABELS[field.type]}
                            {!selectable && ` · ${unavailableLabel}`}
                          </span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            </>,
            document.body,
          )
        : null}
    </>
  );
}

// ─── Settings Panel (popup) ───────────────────────────────────────────────────
function SettingsPanel({
  form,
  googleSheetsConnection,
  googleSheetsOAuthConfigured,
  linkedResourceTitle,
  publicFormBaseUrl,
  updateSettings,
  deleteForm,
  onNavigate,
  googleSheetsSettingsHref = "/admin/settings#google-sign-in",
}: {
  form: FormWithFields;
  googleSheetsConnection: SheetsConnection | null;
  googleSheetsOAuthConfigured: boolean;
  linkedResourceTitle: string | null;
  publicFormBaseUrl: string;
  updateSettings: FormBuilderActions["updateSettings"];
  deleteForm: FormBuilderActions["deleteForm"];
  onNavigate?: (url: string) => void;
  googleSheetsSettingsHref?: string;
}) {
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [slug, setSlug] = useState(form.slug);
  const [kind, setKind] = useState(form.kind);
  const [confirmationEmailEnabled, setConfirmationEmailEnabled] = useState(
    form.confirmationEmailEnabled,
  );
  const [confirmationEmailTemplate, setConfirmationEmailTemplate] = useState(
    form.confirmationEmailTemplate ?? "",
  );
  const [confirmationEmailFieldId, setConfirmationEmailFieldId] = useState(
    () => form.confirmationEmailFieldId ?? ""
  );
  const [confirmationNameFieldId, setConfirmationNameFieldId] = useState(
    () => form.confirmationNameFieldId ?? ""
  );
  const [confirmationEmailSelectedFieldIds, setConfirmationEmailSelectedFieldIds] = useState<string[]>(() => {
    const emailSelectableFieldIds = new Set(
      form.fields
        .filter((field) => field.type !== "page_break")
        .map((field) => field.id),
    );
    const selectedFieldIds =
      form.confirmationEmailSelectedFieldIds ??
      form.fields.filter((field) => field.type !== "page_break").map((field) => field.id);

    return selectedFieldIds.filter((fieldId) => emailSelectableFieldIds.has(fieldId));
  });
  const [googleSheetsSyncEnabled, setGoogleSheetsSyncEnabled] = useState(
    form.googleSheetsSyncEnabled,
  );
  const [googleSheetsSelectedFieldIds, setGoogleSheetsSelectedFieldIds] = useState<string[]>(() => {
    const syncableFieldIds = getSyncableGoogleSheetsFieldIds(form);
    return form.googleSheetsSelectedFieldIds.filter((fieldId) => syncableFieldIds.has(fieldId));
  });
  const [openAtValue, setOpenAtValue] = useState(() => form.openAt ?? "");
  const [closeAtValue, setCloseAtValue] = useState(() => form.closeAt ?? "");
  const [settingsState, settingsDispatch] = useActionState(updateSettings, IDLE);
  const [deleteState, deleteDispatch] = useActionState(deleteForm, IDLE);
  const st = useToast(settingsState);
  const dt = useToast(deleteState);
  const toast = st.visible ?? dt.visible;
  const emailFieldOptions = form.fields.filter(
    (field) => field.scope === "submission" && field.type === "email",
  );
  const nameFieldOptions = form.fields.filter(
    (field) => field.scope === "submission" && field.type === "text",
  );
  const confirmationEmailFieldOptions = form.fields.filter(
    (field) => field.type !== "page_break",
  );
  const googleSheetsFieldOptions = form.fields.filter((field) => field.type !== "page_break");
  const hasGoogleSheetsConnection = Boolean(googleSheetsConnection?.connected);
  const canUseDom = typeof document !== "undefined";
  const settingsTitleId = `form-settings-title-${form.id}`;

  function openGoogleSheetsSettings() {
    navigateTo(googleSheetsSettingsHref, onNavigate);
  }

  function closeSettingsPanel() {
    setOpen(false);
    setConfirmDelete(false);
  }

  function toggleGoogleSheetsField(fieldId: string) {
    const field = googleSheetsFieldOptions.find((candidate) => candidate.id === fieldId);
    if (!field || !fieldTypeSupportsGoogleSheetsSync(field.type)) {
      return;
    }

    setGoogleSheetsSelectedFieldIds((current) =>
      current.includes(fieldId)
        ? current.filter((currentFieldId) => currentFieldId !== fieldId)
        : [...current, fieldId],
    );
  }

  function toggleConfirmationEmailField(fieldId: string) {
    const field = confirmationEmailFieldOptions.find((candidate) => candidate.id === fieldId);
    if (!field || field.type === "page_break") {
      return;
    }

    setConfirmationEmailSelectedFieldIds((current) =>
      current.includes(fieldId)
        ? current.filter((currentFieldId) => currentFieldId !== fieldId)
        : [...current, fieldId],
    );
  }

  function handleGoogleSheetsSyncToggle() {
    if (!hasGoogleSheetsConnection) {
      openGoogleSheetsSettings();
      return;
    }

    setGoogleSheetsSyncEnabled((value) => !value);
  }

  const settingsFormKey = [
    form.id,
    form.title,
    form.slug,
    form.kind,
    form.status,
    form.description ?? "",
    form.openAt ?? "",
    form.closeAt ?? "",
    form.successMessage ?? "",
    String(form.teamMinMembers),
    String(form.teamMaxMembers),
    form.confirmationEmailEnabled ? "1" : "0",
    form.confirmationEmailTemplate ?? "",
    form.confirmationEmailFieldId ?? "",
    form.confirmationNameFieldId ?? "",
    form.confirmationEmailSelectedFieldIds?.join(",") ?? "__all__",
    form.googleSheetsSyncEnabled ? "1" : "0",
    form.googleSheetsSelectedFieldIds.join(","),
    form.googleSheetsAdminUserId ?? "",
    form.googleSheetsSheetTitle ?? "",
  ].join(":");

  const missingEmailFields = confirmationEmailEnabled && (emailFieldOptions.length === 0 || nameFieldOptions.length === 0);
  const emailNotSelected = confirmationEmailEnabled && !confirmationEmailFieldId;
  const nameNotSelected = confirmationEmailEnabled && !confirmationNameFieldId;
  const hasConfirmationEmailIssue = missingEmailFields || emailNotSelected || nameNotSelected;
  const hasGoogleSheetsSyncIssue = googleSheetsSyncEnabled && googleSheetsFieldOptions.length === 0;

  const colomboToday = getStoredDateFromIso(new Date().toISOString());

  const checkPastDateIssue = (val: string, orig: string | null) => {
    if (!val || !colomboToday) return false;
    const parsed = parseDisplayDateInput(val);
    if (!parsed) return false;
    const origParsed = orig ? (parseDisplayDateInput(orig) ?? orig) : null;
    if (parsed === origParsed) return false; 
    return parsed < colomboToday;
  };

  const hasOpenAtPastIssue = checkPastDateIssue(openAtValue, form.openAt);
  const hasCloseAtPastIssue = checkPastDateIssue(closeAtValue, form.closeAt);

  const hasSettingsIssue = hasConfirmationEmailIssue || hasGoogleSheetsSyncIssue || hasOpenAtPastIssue || hasCloseAtPastIssue;

  useEffect(() => {
    if (!open || !canUseDom) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        setConfirmDelete(false);
      }
    }

    document.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = originalOverflow;
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open, canUseDom]);

  return (
    <>
      {toast && <Toast state={toast} onClose={st.visible ? st.dismiss : dt.dismiss} />}
      <div className="border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50">
        <div className="flex flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              <Settings2 className="h-4 w-4 shrink-0" />
              Form settings
            </p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Configure sync, emails, and rules
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center justify-center gap-2 rounded-md border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900 dark:focus:ring-zinc-300 sm:w-auto"
          >
            <Settings2 className="h-4 w-4" />
            Open settings
          </button>
        </div>

        {open && canUseDom
          ? createPortal(
              <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
                <button
                  type="button"
                  aria-label="Close settings"
                  onClick={closeSettingsPanel}
                  className="absolute inset-0 bg-zinc-950/55 backdrop-blur-sm"
                />
                <div
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby={settingsTitleId}
                  className="relative z-[110] flex max-h-[calc(100vh-2rem)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-[0_1.875rem_5rem_-1.875rem_rgba(0,0,0,0.45)] dark:border-zinc-800 dark:bg-zinc-900 sm:max-h-[calc(100vh-3rem)]"
                >
                  <div className="flex items-start justify-between gap-4 border-b border-zinc-200 px-5 py-4 dark:border-zinc-800 sm:px-6">
                    <div>
                      <h3
                        id={settingsTitleId}
                        className="text-lg font-semibold text-zinc-900 dark:text-zinc-50"
                      >
                        Form settings
                      </h3>
                      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                        Update how {form.title} behaves without leaving the builder.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={closeSettingsPanel}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 dark:focus:ring-zinc-300"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>

                  <form
                    key={settingsFormKey}
                    action={settingsDispatch}
                    className="flex min-h-0 flex-1 flex-col"
                  >
                    <input type="hidden" name="formId" value={form.id} />
                    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
                      <div className="grid gap-5 pb-6 sm:grid-cols-2">
              <div className="sm:col-span-2">
                 <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Form Title</label>
                 <input name="title" defaultValue={form.title} required
                  className="block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 sm:text-sm dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-400 dark:focus:ring-zinc-400" />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Slug - <span className="font-normal normal-case">{publicFormBaseUrl}/{slug || "…"}</span>
                  <a href={`/${slug}`} target="_blank" className="ml-2 inline-flex text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300"><ExternalLink className="h-3 w-3" /></a>
                </label>
                <input name="slug" value={slug} onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+/, ""))}
                   className="block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 sm:text-sm dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-400 dark:focus:ring-zinc-400" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Form type</label>
                {linkedResourceTitle ? (
                  <>
                    <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 dark:border-amber-500/40 dark:bg-amber-500/10">
                      <ShieldAlert className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                      <p className="text-xs leading-snug text-amber-700 dark:text-amber-300">
                        Linked to <span className="font-semibold">{linkedResourceTitle}</span>. Unlink it from Events to change the type.
                      </p>
                    </div>
                    <input type="hidden" name="kind" value={form.kind} />
                  </>
                ) : (
                  <select
                    name="kind"
                    value={kind}
                    onChange={e => setKind(e.target.value as typeof kind)}
                    className="block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 sm:text-sm dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-400 dark:focus:ring-zinc-400"
                  >
                    <option value="competition">Registration</option>
                  </select>
                )}
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Status</label>
                 <select name="status" defaultValue={form.status} className="block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 sm:text-sm dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-400 dark:focus:ring-zinc-400">
                  <option value="draft">Draft</option><option value="open">Open</option><option value="closed">Closed</option>
                </select>
              </div>
               <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Min / Max team size (including leader)</label>
                <div className="flex gap-2">
                  <input name="teamMinMembers" type="number" min={1} max={50} defaultValue={form.teamMinMembers} disabled={kind !== "competition"}
                     className="block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 sm:text-sm disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-400 dark:focus:ring-zinc-400" />
                  <input name="teamMaxMembers" type="number" min={1} max={50} defaultValue={form.teamMaxMembers} disabled={kind !== "competition"}
                     className="block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 sm:text-sm disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-400 dark:focus:ring-zinc-400" />
                </div>
                <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                  Total participants including the team leader. Existing forms configured under the old member-only count may need values increased by 1.
                </p>
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Open date</label>
                  {hasOpenAtPastIssue && (
                    <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                      <ShieldAlert className="h-3 w-3 shrink-0" />
                      Past date not allowed
                    </span>
                  )}
                </div>
                <FormattedPickerInput
                  key={`openAt:${form.openAt ?? ""}`}
                  name="openAt"
                  mode="date"
                  defaultValue={form.openAt}
                  onValueChange={setOpenAtValue}
                  placeholder="yyyy/mm/dd"
                  inputMode="numeric"
                  ariaLabel={`Select the open date for ${form.title}`}
                  className="block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 sm:text-sm dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-400 dark:focus:ring-zinc-400" />
              </div>
              <div>
                 <div className="mb-1 flex items-center justify-between">
                   <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Close date</label>
                   {hasCloseAtPastIssue && (
                    <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                      <ShieldAlert className="h-3 w-3 shrink-0" />
                      Past date not allowed
                    </span>
                   )}
                 </div>
                <FormattedPickerInput
                  key={`closeAt:${form.closeAt ?? ""}`}
                  name="closeAt"
                  mode="date"
                  defaultValue={form.closeAt}
                  onValueChange={setCloseAtValue}
                  placeholder="yyyy/mm/dd"
                  inputMode="numeric"
                  ariaLabel={`Select the close date for ${form.title}`}
                  className="block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 sm:text-sm dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-400 dark:focus:ring-zinc-400" />
              </div>
              {kind === "competition" ? (
                <p className="sm:col-span-2 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                  If this form is linked in Events, these opening and closing dates
                  stay synced with its event card.
                </p>
              ) : null}
              <div className="sm:col-span-2">
                 <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Description</label>
                <input name="description" type="text" defaultValue={form.description ?? ""}
                  className="block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 sm:text-sm dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-400 dark:focus:ring-zinc-400" />
              </div>
              <div className="sm:col-span-2">
                 <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Success message</label>
                <textarea name="successMessage" rows={3} defaultValue={form.successMessage ?? ""}
                  className="block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 sm:text-sm dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-400 dark:focus:ring-zinc-400" />
              </div>
              <div className="sm:col-span-2 rounded-lg border border-zinc-200 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-950/50">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                      Confirmation email
                    </label>
                    <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                      Queue an Appwrite confirmation email after a successful submission and save the registrant as a synced contact.
                    </p>
                  </div>
                  <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    <span>{confirmationEmailEnabled ? "Enabled" : "Disabled"}</span>
                    <button
                      type="button"
                      onClick={() => setConfirmationEmailEnabled((value) => !value)}
                      className={`relative inline-flex h-5 w-9 rounded-full transition-colors ${confirmationEmailEnabled ? "bg-zinc-900 dark:bg-zinc-100" : "bg-zinc-300 dark:bg-zinc-700"}`}
                    >
                      <span className={`inline-block h-4 w-4 translate-y-0.5 rounded-full bg-white shadow transition-transform ${confirmationEmailEnabled ? "translate-x-4 dark:bg-zinc-900" : "translate-x-0.5"}`} />
                    </button>
                  </label>
                </div>
                <input
                  type="checkbox"
                  name="confirmationEmailEnabled"
                  checked={confirmationEmailEnabled}
                  onChange={(event) => setConfirmationEmailEnabled(event.target.checked)}
                  className="sr-only"
                />
                <input
                  type="hidden"
                  name="confirmationEmailFieldIdsJson"
                  value={JSON.stringify(confirmationEmailSelectedFieldIds)}
                />
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                        Recipient email field
                      </label>
                      {confirmationEmailEnabled && emailFieldOptions.length > 0 && !confirmationEmailFieldId && (
                        <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                          <ShieldAlert className="h-3 w-3 shrink-0" />
                          Selection required
                        </span>
                      )}
                    </div>
                    <select
                      name="confirmationEmailFieldId"
                      value={confirmationEmailFieldId}
                      onChange={(e) => setConfirmationEmailFieldId(e.target.value)}
                      disabled={!confirmationEmailEnabled || emailFieldOptions.length === 0}
                      className="block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 sm:text-sm disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-400 dark:focus:ring-zinc-400"
                    >
                      <option value="">Select submission email field</option>
                      {emailFieldOptions.map((field) => (
                        <option key={field.id} value={field.id}>
                          {field.label}
                        </option>
                      ))}
                    </select>
                    {emailFieldOptions.length === 0 && (
                      <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                        Add a submission email field before enabling confirmation emails.
                      </p>
                    )}
                  </div>
                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                        Recipient name field
                      </label>
                      {confirmationEmailEnabled && nameFieldOptions.length > 0 && !confirmationNameFieldId && (
                        <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                          <ShieldAlert className="h-3 w-3 shrink-0" />
                          Selection required
                        </span>
                      )}
                    </div>
                    <select
                      name="confirmationNameFieldId"
                      value={confirmationNameFieldId}
                      onChange={(e) => setConfirmationNameFieldId(e.target.value)}
                      disabled={!confirmationEmailEnabled || nameFieldOptions.length === 0}
                      className="block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 sm:text-sm disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-400 dark:focus:ring-zinc-400"
                    >
                      <option value="">Select submission short answer field</option>
                      {nameFieldOptions.map((field) => (
                        <option key={field.id} value={field.id}>
                          {field.label}
                        </option>
                      ))}
                    </select>
                    {nameFieldOptions.length === 0 && (
                      <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                        Add a submission short answer field for the recipient name.
                      </p>
                    )}
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                      Fields included in email
                    </label>
                    {confirmationEmailFieldOptions.length > 0 ? (
                      <FieldSelectionDropdown
                        fields={confirmationEmailFieldOptions}
                        selectedFieldIds={confirmationEmailSelectedFieldIds}
                        onToggleField={toggleConfirmationEmailField}
                        isFieldSelectable={(field) => field.type !== "page_break"}
                        disabled={!confirmationEmailEnabled}
                        emptyLabel="No fields selected"
                        noFieldsLabel="No email fields"
                        unavailableLabel="Not emailable"
                      />
                    ) : (
                      <p className="text-sm text-amber-600 dark:text-amber-400">
                        Add form fields before selecting confirmation email details.
                      </p>
                    )}
                    <p className="mt-2 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                      Only selected answers are appended below the confirmation message.
                    </p>
                  </div>
                  <div className="sm:col-span-2 mt-2">
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                      Email Template Text
                    </label>
                    <textarea
                      name="confirmationEmailTemplate"
                      rows={5}
                      value={confirmationEmailTemplate}
                      onChange={(e) => setConfirmationEmailTemplate(e.target.value)}
                      disabled={!confirmationEmailEnabled}
                      placeholder="Optional. Add custom text to appear before the user's answers in the email. Leaves it blank to use the default message."
                      className="block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 sm:text-sm disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-400 dark:focus:ring-zinc-400"
                    />
                    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                      The user&apos;s submitted answers will automatically be appended below this text.
                    </p>
                  </div>
                </div>
              </div>
              <div className="sm:col-span-2 rounded-lg border border-zinc-200 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-950/50">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                      Google Sheets sync
                    </label>
                    <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                      Append each new registration to your connected spreadsheet. Every form syncs into its own sheet tab.
                    </p>
                  </div>
                  <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    <span>{googleSheetsSyncEnabled ? "Enabled" : "Disabled"}</span>
                    <button
                      type="button"
                      onClick={handleGoogleSheetsSyncToggle}
                      className={`relative inline-flex h-5 w-9 rounded-full transition-colors ${googleSheetsSyncEnabled ? "bg-zinc-900 dark:bg-zinc-100" : "bg-zinc-300 dark:bg-zinc-700"}`}
                    >
                      <span className={`inline-block h-4 w-4 translate-y-0.5 rounded-full bg-white shadow transition-transform ${googleSheetsSyncEnabled ? "translate-x-4 dark:bg-zinc-900" : "translate-x-0.5"}`} />
                    </button>
                  </label>
                </div>
                <input
                  type="checkbox"
                  name="googleSheetsSyncEnabled"
                  checked={googleSheetsSyncEnabled}
                  onChange={(event) => {
                    if (!hasGoogleSheetsConnection && event.target.checked) {
                      openGoogleSheetsSettings();
                      return;
                    }

                    setGoogleSheetsSyncEnabled(event.target.checked);
                  }}
                  className="sr-only"
                />
                <input
                  type="hidden"
                  name="googleSheetsSelectedFieldIdsJson"
                  value={JSON.stringify(googleSheetsSelectedFieldIds)}
                />
                <div className="mt-4 space-y-4">
                  <div className="rounded-md border border-dashed border-zinc-300 bg-white/80 p-4 dark:border-zinc-700 dark:bg-zinc-950/60">
                    {googleSheetsConnection?.connected ? (
                      <>
                        <p className="text-sm text-zinc-700 dark:text-zinc-300">
                          Google sign-in is managed from Settings. Connected as{" "}
                          <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                            {googleSheetsConnection.accountLabel ?? "Google account"}
                          </span>
                          .
                        </p>
                        <div className="mt-3 flex flex-wrap items-center gap-3">
                          <a href={googleSheetsSettingsHref}
                            className="inline-flex items-center gap-2 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                          >
                            Manage Google sign in
                          </a>
                          {googleSheetsConnection.spreadsheetUrl ? (
                            <a
                              href={googleSheetsConnection.spreadsheetUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 transition-colors hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300"
                            >
                              Open spreadsheet
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          ) : null}
                        </div>
                      </>
                    ) : form.googleSheetsAdminUserId ? (
                      <>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                          This form is already linked to a stored Google Sheets connection. Use Settings if you need to reconnect or refresh Google access.
                        </p>
                        <a href={googleSheetsSettingsHref}
                          className="mt-3 inline-flex items-center gap-2 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                        >
                          Open Settings
                        </a>
                      </>
                    ) : googleSheetsOAuthConfigured ? (
                      <>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                          Connect a Google account in Settings before enabling sync.
                        </p>
                        <a href={googleSheetsSettingsHref}
                          className="mt-3 inline-flex items-center gap-2 rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                        >
                          Go to Google sign in
                        </a>
                      </>
                    ) : (
                      <>
                        <p className="text-sm text-amber-600 dark:text-amber-400">
                          Google OAuth is not configured yet. Add `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET` before using Sheets sync.
                        </p>
                        <a href={googleSheetsSettingsHref}
                          className="mt-3 inline-flex items-center gap-2 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                        >
                          Open Settings
                        </a>
                      </>
                    )}

                    {form.googleSheetsSheetTitle ? (
                      <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
                        Sheet tab: <span className="font-medium">{form.googleSheetsSheetTitle}</span>
                      </p>
                    ) : null}
                  </div>

                  <div>
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                      Synced fields
                    </label>
                    {googleSheetsFieldOptions.length > 0 ? (
                      <FieldSelectionDropdown
                        fields={googleSheetsFieldOptions}
                        selectedFieldIds={googleSheetsSelectedFieldIds}
                        onToggleField={toggleGoogleSheetsField}
                        isFieldSelectable={(field) =>
                          fieldTypeSupportsGoogleSheetsSync(field.type)
                        }
                        emptyLabel="Select fields to sync..."
                        noFieldsLabel="No syncable fields"
                        unavailableLabel="Not syncable"
                      />
                    ) : (
                      <p className="text-sm text-amber-600 dark:text-amber-400">
                        Add form fields before enabling Google Sheets sync.
                      </p>
                    )}
                    <p className="mt-2 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                      Submission fields sync directly. Member fields are grouped together into one cell per selected column so each registration stays on a single row.
                    </p>
                  </div>

                  {settingsState.status === "error" ? (
                    <p className="text-sm text-rose-600 dark:text-rose-400">
                      {settingsState.message}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

                <div className="sticky bottom-0 border-t border-zinc-200 bg-white/95 px-5 py-4 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95 sm:px-6">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    {confirmDelete ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-rose-600 dark:text-rose-400">
                          Delete form data?
                        </span>
                        <button
                          type="submit"
                          formAction={deleteDispatch}
                          formNoValidate
                          className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-rose-500"
                        >
                          Yes, delete
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(false)}
                          className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(true)}
                        className="flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-rose-600 transition-colors hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete form
                      </button>
                    )}

                    <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                      <button
                        type="button"
                        onClick={closeSettingsPanel}
                        className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900 dark:focus:ring-zinc-300"
                      >
                        Cancel
                      </button>
                      <SaveSettingsButton disabled={hasSettingsIssue} />
                    </div>
                  </div>
                </div>
              </form>
            </div>
          </div>,
          document.body,
        )
      : null}
      </div>
    </>
  );
}

// ─── Option input list (for select/radio cards) ───────────────────────────────
type Opt = { id: string; label: string; value: string };
function OptionList({ type, options, onChange }: {
  type: FieldType; options: Opt[]; onChange: (opts: Opt[]) => void;
}) {
  const icon = type === "radio" ? "○" : type === "checkbox" ? "□" : "☰";

  function update(id: string, label: string) {
    const value = createOptionValue(label, id);
    onChange(options.map(o => o.id === id ? { ...o, label, value } : o));
  }

  function add() {
    const n = options.length + 1;
    const id = `opt-${Date.now()}`;
    onChange([...options, { id, label: `Option ${n}`, value: `option_${n}` }]);
  }

  function remove(id: string) {
    onChange(options.filter(o => o.id !== id));
  }

  return (
    <div className="mt-4 space-y-2">
      {options.map(o => (
        <div key={o.id} className="flex items-center gap-3 group">
          <span className="w-4 shrink-0 text-center text-zinc-400 dark:text-zinc-500 font-medium">{icon}</span>
          <input value={o.label} onChange={e => update(o.id, e.target.value)}
            className="flex-1 border-0 border-b border-transparent bg-transparent px-0 py-1 text-sm text-zinc-900 focus:border-zinc-900 focus:ring-0 group-hover:border-zinc-300 dark:text-zinc-50 dark:focus:border-zinc-400 dark:group-hover:border-zinc-700 transition-colors" />
          <button type="button" onClick={() => remove(o.id)} className="opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-rose-500 transition-all">
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
      <button type="button" onClick={add} className="flex items-center gap-3 text-sm font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300 transition-colors mt-2">
        <span className="w-4 text-center font-medium text-zinc-400">{icon}</span>
        <span>Add option</span>
      </button>
    </div>
  );
}

function FieldLabelFormattingHelp({ fieldType }: { fieldType: FieldType }) {
  const isChoice = fieldType === "radio" || fieldType === "checkbox";

  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-950/60">
      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Label formatting</p>
      <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        {isChoice
          ? "Question labels, help text, and radio/checkbox option labels support basic markdown:"
          : "Question labels and help text support basic markdown:"}
      </p>
      <ul className="mt-3 space-y-1.5 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        <li><code className="rounded bg-zinc-200/80 px-1 py-0.5 text-xs dark:bg-zinc-800">**bold**</code></li>
        <li><code className="rounded bg-zinc-200/80 px-1 py-0.5 text-xs dark:bg-zinc-800">*italic*</code></li>
        <li><code className="rounded bg-zinc-200/80 px-1 py-0.5 text-xs dark:bg-zinc-800">__underline__</code></li>
        <li><code className="rounded bg-zinc-200/80 px-1 py-0.5 text-xs dark:bg-zinc-800">[link text](url)</code></li>
      </ul>
    </div>
  );
}

function parseBulkOptionsInput(value: string): FieldOption[] {
  const seenValues = new Set<string>();

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((label, index) => {
      const optionValue = createOptionValue(label, `option_${index + 1}`);
      const normalizedValue = optionValue.toLowerCase();

      if (seenValues.has(normalizedValue)) {
        return null;
      }

      seenValues.add(normalizedValue);
      return { label, value: optionValue };
    })
    .filter((option): option is FieldOption => option !== null);
}

function appendUniqueOptions(
  existingOptions: FieldOption[],
  nextOptions: FieldOption[],
) {
  const seenValues = new Set(
    existingOptions.map((option) => option.value.trim().toLowerCase()).filter(Boolean),
  );
  const merged = [...existingOptions];
  let addedCount = 0;

  for (const option of nextOptions) {
    const normalizedValue = option.value.trim().toLowerCase();
    if (!normalizedValue || seenValues.has(normalizedValue)) {
      continue;
    }

    seenValues.add(normalizedValue);
    merged.push(option);
    addedCount += 1;
  }

  return { options: merged, addedCount };
}

function FieldSettingsModal({
  field,
  onChange,
  onClose,
}: {
  field: FieldDefinition;
  onChange: (field: FieldDefinition) => void;
  onClose: () => void;
}) {
  const placeholderSupported = fieldTypeSupportsPlaceholder(field.type);
  const uniqueSupported = fieldTypeSupportsUnique(field.type);
  const caseSensitiveSupported = fieldTypeSupportsCaseSensitiveUnique(field.type);
  const patternSupported = fieldTypeSupportsPattern(field.type);
  const patternInvalid =
    patternSupported &&
    Boolean(field.validationPattern?.trim()) &&
    !isValidFieldPattern(field.validationPattern ?? "");
  const isChoiceType = isChoiceFieldType(field.type);
  const [bulkOptionsText, setBulkOptionsText] = useState("");
  const [bulkOptionsMessage, setBulkOptionsMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const canUseDom = typeof document !== "undefined";

  function getBulkOptionsOrShowError() {
    const parsedOptions = parseBulkOptionsInput(bulkOptionsText);
    if (parsedOptions.length === 0) {
      setBulkOptionsMessage({
        type: "error",
        text: "Paste at least one comma-separated option.",
      });
      return null;
    }

    return parsedOptions;
  }

  function handleAppendBulkOptions() {
    const parsedOptions = getBulkOptionsOrShowError();
    if (!parsedOptions) return;

    const result = appendUniqueOptions(field.options, parsedOptions);
    if (result.addedCount === 0) {
      setBulkOptionsMessage({
        type: "error",
        text: "All pasted options already exist.",
      });
      return;
    }

    onChange(normalizeFieldDraft({ ...field, options: result.options }));
    setBulkOptionsText("");
    setBulkOptionsMessage({
      type: "success",
      text: `Added ${result.addedCount} option${result.addedCount === 1 ? "" : "s"}.`,
    });
  }

  function handleReplaceBulkOptions() {
    const parsedOptions = getBulkOptionsOrShowError();
    if (!parsedOptions) return;

    onChange(normalizeFieldDraft({ ...field, options: parsedOptions }));
    setBulkOptionsText("");
    setBulkOptionsMessage({
      type: "success",
      text: `Replaced with ${parsedOptions.length} option${parsedOptions.length === 1 ? "" : "s"}.`,
    });
  }

  useEffect(() => {
    if (!canUseDom) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [canUseDom, onClose]);

  if (!canUseDom) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
      <button
        type="button"
        aria-label="Close field settings"
        onClick={onClose}
        className="absolute inset-0 bg-zinc-950/70 backdrop-blur-sm"
      />

      <div className="relative z-[101] w-full max-w-xl overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-start justify-between gap-4 border-b border-zinc-200 px-5 py-4 dark:border-zinc-800 sm:px-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
              Field Settings
            </p>
            <h3 className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              {field.label || "Untitled question"}
            </h3>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              {TYPE_LABELS[field.type]}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto space-y-6 px-5 py-6 sm:px-6">
          {/* Basic Controls (Mobile optimization: moved from footer) */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white p-3.5 dark:border-zinc-800 dark:bg-zinc-900/50">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100">
                  <CheckSquare className="h-4 w-4" />
                </div>
                <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Required</span>
              </div>
              <button
                type="button"
                onClick={() => onChange(normalizeFieldDraft({ ...field, required: !field.required }))}
                className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${field.required ? "bg-zinc-900 dark:bg-zinc-100" : "bg-zinc-300 dark:bg-zinc-700"}`}
              >
                <span className={`inline-block h-5 w-5 translate-y-0.5 rounded-full bg-white shadow transition-transform ${field.required ? "translate-x-5 dark:bg-zinc-900" : "translate-x-0.5"}`} />
              </button>
            </div>

            <div className={`flex items-center justify-between rounded-xl border border-zinc-200 bg-white p-3.5 dark:border-zinc-800 dark:bg-zinc-900/50 ${uniqueSupported ? "opacity-100" : "opacity-30 pointer-events-none"}`}>
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100">
                  <Fingerprint className="h-4 w-4" />
                </div>
                <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Unique</span>
              </div>
              <button
                type="button"
                disabled={!uniqueSupported}
                onClick={() => onChange(normalizeFieldDraft({ ...field, isUnique: !field.isUnique }))}
                className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${field.isUnique ? "bg-zinc-900 dark:bg-zinc-100" : "bg-zinc-300 dark:bg-zinc-700"}`}
              >
                <span className={`inline-block h-5 w-5 translate-y-0.5 rounded-full bg-white shadow transition-transform ${field.isUnique ? "translate-x-5 dark:bg-zinc-900" : "translate-x-0.5"}`} />
              </button>
            </div>

            {field.type !== "page_break" && (
              <div className="col-span-full flex items-center justify-between rounded-xl border border-zinc-200 bg-white p-3.5 dark:border-zinc-800 dark:bg-zinc-900/50">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100">
                    <UserSquare2 className="h-4 w-4" />
                  </div>
                  <div>
                    <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Per-member field</span>
                    <p className="text-[0.625rem] text-zinc-500 dark:text-zinc-400 uppercase tracking-wider font-bold">Scope</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onChange(normalizeFieldDraft({ ...field, scope: field.scope === "member" ? "submission" : "member" }))}
                  className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${field.scope === "member" ? "bg-zinc-900 dark:bg-zinc-100" : "bg-zinc-300 dark:bg-zinc-700"}`}
                >
                  <span className={`inline-block h-5 w-5 translate-y-0.5 rounded-full bg-white shadow transition-transform ${field.scope === "member" ? "translate-x-5 dark:bg-zinc-900" : "translate-x-0.5"}`} />
                </button>
              </div>
            )}
          </div>
          <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-950/60">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                  Unique matching
                </p>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  {uniqueSupported
                    ? "Choose whether matching should respect letter casing when this field is marked unique."
                    : "This field type does not support unique matching."}
                </p>
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                <span>
                  {field.isUnique && caseSensitiveSupported ? "Case sensitive" : "Case insensitive"}
                </span>
                <button
                  type="button"
                  disabled={!uniqueSupported || !field.isUnique || !caseSensitiveSupported}
                  onClick={() =>
                    onChange(
                      normalizeFieldDraft({
                        ...field,
                        uniqueCaseSensitive: !field.uniqueCaseSensitive,
                      }),
                    )
                  }
                  className={`relative inline-flex h-5 w-9 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                    field.isUnique && field.uniqueCaseSensitive && caseSensitiveSupported
                      ? "bg-zinc-900 dark:bg-zinc-100"
                      : "bg-zinc-300 dark:bg-zinc-700"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 translate-y-0.5 rounded-full bg-white shadow transition-transform ${
                      field.isUnique && field.uniqueCaseSensitive && caseSensitiveSupported
                        ? "translate-x-4 dark:bg-zinc-900"
                        : "translate-x-0.5"
                    }`}
                  />
                </button>
              </label>
            </div>
          </div>

          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Placeholder
            </label>
            {placeholderSupported ? (
              <input
                type="text"
                value={field.placeholder ?? ""}
                onChange={(event) =>
                  onChange(
                    normalizeFieldDraft({
                      ...field,
                      placeholder: event.target.value,
                    }),
                  )
                }
                placeholder="Type the hint shown inside the input"
                className="block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-400 dark:focus:ring-zinc-400"
              />
            ) : (
              <p className="rounded-md border border-dashed border-zinc-300 px-3 py-2 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                Placeholder text is only available for short text, paragraph, number, date, time, email, phone, and dropdown fields.
              </p>
            )}
          </div>

          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Help text
            </label>
            <textarea
              rows={4}
              value={field.helpText ?? ""}
              onChange={(event) =>
                onChange(
                  normalizeFieldDraft({
                    ...field,
                    helpText: event.target.value,
                  }),
                )
              }
              placeholder="Add extra guidance below the field label"
              className="block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-400 dark:focus:ring-zinc-400"
            />
          </div>

          {isChoiceType ? (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-950/60">
              <label
                htmlFor={`bulk-options-${field.id}`}
                className="block text-sm font-semibold text-zinc-900 dark:text-zinc-50"
              >
                Bulk options
              </label>
              <textarea
                id={`bulk-options-${field.id}`}
                rows={3}
                value={bulkOptionsText}
                onChange={(event) => {
                  setBulkOptionsText(event.target.value);
                  setBulkOptionsMessage(null);
                }}
                placeholder="Beginner, Intermediate, Advanced"
                className="mt-3 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-400 dark:focus:ring-zinc-400"
              />
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={handleAppendBulkOptions}
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  <ListPlus className="h-4 w-4" />
                  Append
                </button>
                <button
                  type="button"
                  onClick={handleReplaceBulkOptions}
                  className="inline-flex items-center justify-center gap-2 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
                >
                  <RefreshCw className="h-4 w-4" />
                  Replace
                </button>
              </div>
              {bulkOptionsMessage ? (
                <p
                  className={`mt-3 text-sm font-medium ${
                    bulkOptionsMessage.type === "success"
                      ? "text-emerald-700 dark:text-emerald-300"
                      : "text-rose-600 dark:text-rose-400"
                  }`}
                >
                  {bulkOptionsMessage.text}
                </p>
              ) : (
                <p className="mt-3 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
                  Values are separated by commas.
                </p>
              )}
            </div>
          ) : null}

          {patternSupported ? (
            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Pattern (regex)
                </label>
                <input
                  type="text"
                  value={field.validationPattern ?? ""}
                  onChange={(event) =>
                    onChange(
                      normalizeFieldDraft({
                        ...field,
                        validationPattern: event.target.value,
                        validationPatternMessage:
                          event.target.value.trim() ? field.validationPatternMessage : null,
                      }),
                    )
                  }
                  placeholder="Example: ^[0-9]{8}$ or /^[a-z]+@uom\\.lk$/i"
                  className="block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-sm text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-400 dark:focus:ring-zinc-400"
                />
                <p className="mt-2 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
                  Use JavaScript regex syntax. Leave empty to disable pattern matching.
                </p>
                {patternInvalid ? (
                  <p className="mt-2 text-sm font-medium text-rose-600 dark:text-rose-400">
                    This pattern is not a valid regular expression.
                  </p>
                ) : null}
              </div>

              {field.validationPattern?.trim() ? (
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Pattern error message
                  </label>
                  <input
                    type="text"
                    value={field.validationPatternMessage ?? ""}
                    onChange={(event) =>
                      onChange(
                        normalizeFieldDraft({
                          ...field,
                          validationPatternMessage: event.target.value,
                        }),
                      )
                    }
                    placeholder="Message shown when the input does not match the pattern"
                    className="block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-400 dark:focus:ring-zinc-400"
                  />
                </div>
              ) : null}
            </div>
          ) : null}

          {field.type !== "page_break" ? (
            <FieldLabelFormattingHelp fieldType={field.type} />
          ) : null}
        </div>

        <div className="flex justify-end border-t border-zinc-200 px-5 py-4 dark:border-zinc-800 sm:px-6">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ─── Field Preview (non-choice types) ────────────────────────────────────────
function FieldPreview({ field }: { field: FieldDefinition }) {
  const { type, placeholder } = field;
  const previewPlaceholder = placeholder?.trim() || getDefaultFieldPlaceholder(type);
  if (type === "text" || type === "email" || type === "tel" || type === "url" || type === "number" || type === "date" || type === "time") {
    return <div className="mt-4 border-b border-dashed border-zinc-300 pb-2 dark:border-zinc-700 w-[60%]"><span className="text-sm font-medium text-zinc-400 dark:text-zinc-500">{previewPlaceholder || TYPE_LABELS[type]}</span></div>;
  }
  if (type === "textarea") {
    return <div className="mt-4 border-b border-dashed border-zinc-300 pb-6 dark:border-zinc-700 w-full"><span className="text-sm font-medium text-zinc-400 dark:text-zinc-500">{previewPlaceholder || "Long answer"}</span></div>;
  }
  if (type === "file") {
    return (
      <div className="mt-4 flex items-center justify-center rounded-lg border-2 border-dashed border-zinc-200 bg-zinc-50 p-6 dark:border-zinc-800 dark:bg-zinc-900/50">
        <span className="text-sm font-medium text-zinc-400 dark:text-zinc-500">Click to upload file</span>
      </div>
    );
  }

  if (type === "page_break") {
    return (
      <div className="mt-4 flex items-center gap-4">
        <div className="flex-1 h-px border-t border-dashed border-zinc-300 dark:border-zinc-700"></div>
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 bg-zinc-50 px-2 dark:bg-zinc-900">Page Break</span>
        <div className="flex-1 h-px border-t border-dashed border-zinc-300 dark:border-zinc-700"></div>
      </div>
    );
  }

  return null;
}

// ─── Google-style Field Card ──────────────────────────────────────────────────
function FieldCard({ field, onChange, onDuplicate, onDelete }: {
  field: FieldDefinition;
  onChange: (field: FieldDefinition) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const { label, type, scope, required, options } = field;
  const isChoiceType = type === "select" || type === "radio" || type === "checkbox";
  const isUniqueSupported = fieldTypeSupportsUnique(type);
  const [showSettings, setShowSettings] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const update = (updates: Partial<FieldDefinition>) => {
    onChange(normalizeFieldDraft({ ...field, ...updates }));
  };

  return (
    <>
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm transition-all focus-within:ring-2 focus-within:ring-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:focus-within:ring-zinc-400">

        {/* Drag handle */}
        <div className="flex cursor-grab justify-center bg-zinc-50 py-2 opacity-30 transition-opacity hover:opacity-100 active:cursor-grabbing dark:bg-zinc-950/50">
          <GripHorizontal className="h-4 w-4 text-zinc-500" />
        </div>

        {/* Question row */}
        {type !== "page_break" && (
          <div className="flex flex-col items-start gap-3 px-4 pb-4 sm:px-6 sm:pt-2 sm:flex-row">
            <div className="flex-1 w-full">
              <input value={label} onChange={e => {
                const newLabel = e.target.value;
                const newKey = newLabel.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "field";
                update({ label: newLabel, key: newKey });
              }}
              className="w-full border-0 border-b-2 border-zinc-100 bg-transparent px-0 pb-2 text-base font-medium text-zinc-900 focus:border-zinc-900 focus:ring-0 dark:border-zinc-800 dark:text-zinc-50 dark:focus:border-zinc-400"
              placeholder="Untitled question" />
            </div>

            {/* Type selector */}
            <div className="relative mt-2 w-full shrink-0 sm:mt-0 sm:w-48">
              <select value={type} onChange={e => {
                const newType = e.target.value as FieldType;
                update({
                  type: newType,
                  placeholder: isDefaultFieldPlaceholder(field.type, field.placeholder)
                    ? getDefaultFieldPlaceholder(newType)
                    : field.placeholder,
                });
              }}
                className="block w-full appearance-none rounded-md border border-zinc-300 bg-white py-2 pl-3 pr-8 text-sm text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-400 dark:focus:ring-zinc-400">
                {ALL_TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 h-4 w-4 text-zinc-500" />
            </div>
          </div>
        )}

        {type !== "page_break" && field.helpText && (
          <p className="-mt-1 px-4 text-sm leading-6 text-zinc-500 dark:text-zinc-400 sm:px-6">
            {field.helpText}
          </p>
        )}

        {/* Body: options or preview */}
        <div className="px-4 pb-4 sm:px-6 sm:pb-6">
          {isChoiceType
            ? <OptionList type={type} options={(options || []).map((o, i) => ({ id: `o${i}`, ...o }))} onChange={(o) => update({ options: o.map((opt) => ({ label: opt.label, value: opt.value })) })} />
            : <FieldPreview field={field} />
          }
        </div>

        {/* Bottom bar */}
        <div className="border-t border-zinc-100 bg-zinc-50 px-4 py-3 dark:border-zinc-800/80 dark:bg-zinc-950 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
            <div className={`hidden flex-wrap items-center gap-x-6 gap-y-2 sm:flex ${type === "page_break" ? "hidden" : "flex"}`}>
              <label className="flex cursor-pointer items-center gap-2 text-[0.625rem] font-bold uppercase tracking-wider text-zinc-500 transition-colors hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200">
                <span>Per member</span>
                <button type="button" onClick={() => update({ scope: scope === "member" ? "submission" : "member" })}
                  className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${scope === "member" ? "bg-zinc-900 dark:bg-zinc-100" : "bg-zinc-300 dark:bg-zinc-700"}`}>
                  <span className={`inline-block h-4 w-4 translate-y-0.5 rounded-full bg-white shadow transition-transform ${scope === "member" ? "translate-x-4 dark:bg-zinc-900" : "translate-x-0.5"}`} />
                </button>
              </label>

              {type !== "page_break" && (
                <>
                  <label className="flex cursor-pointer items-center gap-2 text-[0.625rem] font-bold uppercase tracking-wider text-zinc-500 transition-colors hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200">
                    Required
                    <button type="button" onClick={() => update({ required: !required })}
                      className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${required ? "bg-zinc-900 dark:bg-zinc-100" : "bg-zinc-300 dark:bg-zinc-700"}`}>
                      <span className={`inline-block h-4 w-4 translate-y-0.5 rounded-full bg-white shadow transition-transform ${required ? "translate-x-4 dark:bg-zinc-900" : "translate-x-0.5"}`} />
                    </button>
                  </label>

                  <label className="flex cursor-pointer items-center gap-2 text-[0.625rem] font-bold uppercase tracking-wider text-zinc-500 transition-colors hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200">
                    Unique
                    <button
                      type="button"
                      disabled={!isUniqueSupported}
                      onClick={() => update({ isUnique: !field.isUnique })}
                      className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                        field.isUnique ? "bg-zinc-900 dark:bg-zinc-100" : "bg-zinc-300 dark:bg-zinc-700"
                      }`}
                      title={
                        isUniqueSupported
                          ? "Prevent duplicate values for this field"
                          : "Unique validation is not supported for this field type"
                      }
                    >
                      <span className={`inline-block h-4 w-4 translate-y-0.5 rounded-full bg-white shadow transition-transform ${field.isUnique ? "translate-x-4 dark:bg-zinc-900" : "translate-x-0.5"}`} />
                    </button>
                  </label>
                </>
              )}
            </div>

            <div className="flex w-full items-center justify-between gap-5 sm:ml-auto sm:w-auto">
              <span className="text-[0.625rem] font-bold uppercase tracking-wider text-zinc-400 sm:hidden">
                Question controls
              </span>
              <div className="flex items-center gap-4">
                {type !== "page_break" && (
                  <button
                    type="button"
                    onClick={() => setShowSettings(true)}
                    className="inline-flex items-center gap-2 rounded-full border border-zinc-300 px-3 py-1.5 text-[0.625rem] font-bold uppercase tracking-wider text-zinc-600 transition-colors hover:border-zinc-400 hover:text-zinc-900 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-500 dark:hover:text-zinc-50"
                    title="Edit field settings"
                  >
                    <Settings2 className="h-3.5 w-3.5 shrink-0" />
                    Settings
                  </button>
                )}

                <button
                  type="button"
                  onClick={onDuplicate}
                  className="text-zinc-400 transition-colors hover:text-zinc-900 dark:hover:text-zinc-100"
                  title={type === "page_break" ? "Duplicate Page Break" : "Duplicate Question"}
                >
                  <Copy className="h-4 w-4 shrink-0" />
                </button>

                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="text-zinc-400 transition-colors hover:text-rose-500"
                  title={type === "page_break" ? "Delete Page Break" : "Delete Question"}
                >
                  <Trash2 className="h-4 w-4 shrink-0" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showSettings && type !== "page_break" && (
        <FieldSettingsModal
          field={field}
          onChange={onChange}
          onClose={() => setShowSettings(false)}
        />
      )}

      {showDeleteConfirm && (
        <ConfirmDeleteFieldDialog
          field={field}
          onCancel={() => setShowDeleteConfirm(false)}
          onConfirm={() => {
            setShowDeleteConfirm(false);
            onDelete();
          }}
        />
      )}
    </>
  );
}

function ConfirmDeleteFieldDialog({
  field,
  onCancel,
  onConfirm,
}: {
  field: FieldDefinition;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const canUseDom = typeof document !== "undefined";

  useEffect(() => {
    if (!canUseDom) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [canUseDom, onCancel]);

  if (!canUseDom) return null;

  const isPageBreak = field.type === "page_break";
  const title = isPageBreak ? "Delete this page break?" : "Delete this question?";
  const trimmedLabel = field.label?.trim();
  const description = isPageBreak
    ? "Subsequent fields will move back onto the previous page."
    : trimmedLabel
      ? `"${trimmedLabel}" and any answers gathered from it will be removed once you save the form.`
      : "This question and any answers gathered from it will be removed once you save the form.";

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
      <button
        type="button"
        aria-label="Cancel delete"
        onClick={onCancel}
        className="absolute inset-0 bg-zinc-950/70 backdrop-blur-sm"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-delete-field-title"
        className="relative z-[101] w-full max-w-md overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900"
      >
        <div className="flex items-start gap-4 px-5 py-5 sm:px-6">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h3
              id="confirm-delete-field-title"
              className="text-base font-semibold text-zinc-900 dark:text-zinc-50"
            >
              {title}
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
              {description}
            </p>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-zinc-200 px-5 py-4 dark:border-zinc-800 sm:flex-row sm:justify-end sm:gap-3 sm:px-6">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-md bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2 dark:focus:ring-offset-zinc-900"
          >
            Delete
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ─── Field Builder ────────────────────────────────────────────────────────────
function FieldBuilder({ form, bulkSaveFields }: { form: FormWithFields; bulkSaveFields: FormBuilderActions["bulkSaveFields"]; }) {
  const [fields, setFields] = useState<FieldDefinition[]>(
    [...form.fields].map(normalizeFieldDraft).sort((a, b) =>
      a.sortOrder !== b.sortOrder ? a.sortOrder - b.sortOrder : a.label.localeCompare(b.label)
    )
  );
  const [fieldsVersion, setFieldsVersion] = useState(form.fields);
  const [isSaving, setIsSaving] = useState(false);
  const [toastMsg, setToastMsg] = useState<{ type: "success" | "error", message: string } | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const localEmailFieldOptions = fields.filter((field) => field.scope === "submission" && field.type === "email");
  const localNameFieldOptions = fields.filter((field) => field.scope === "submission" && field.type === "text");
  const localGoogleSheetsFieldOptions = fields.filter((field) => field.type !== "page_break");
  const hasSettingsIssueInFields = 
    (form.confirmationEmailEnabled && (localEmailFieldOptions.length === 0 || localNameFieldOptions.length === 0)) ||
    (form.googleSheetsSyncEnabled && localGoogleSheetsFieldOptions.length === 0);

  if (form.fields !== fieldsVersion) {
    setFieldsVersion(form.fields);
    if (!isDirty) {
      setFields(
        [...form.fields].map(normalizeFieldDraft).sort((a, b) =>
          a.sortOrder !== b.sortOrder ? a.sortOrder - b.sortOrder : a.label.localeCompare(b.label)
        )
      );
    }
  }

  useEffect(() => {
    if (toastMsg) {
      const timeout = setTimeout(() => setToastMsg(null), 5000);
      return () => clearTimeout(timeout);
    }
  }, [toastMsg]);

  function addQuestion() {
    setFields((prev) => [
      ...prev,
      {
        id: `draft-${Date.now()}`,
        formId: form.id,
        sortOrder: prev.length,
        label: "Untitled question",
        key: `untitled_question_${Date.now()}`,
        type: "text",
        scope: "submission",
        required: false,
        options: [{ label: "Option 1", value: "option_1" }],
        placeholder: getDefaultFieldPlaceholder("text"),
        helpText: null,
        isUnique: false,
        uniqueCaseSensitive: false,
        validationPattern: null,
        validationPatternMessage: null,
      }
    ]);
    setIsDirty(true);
  }

  function addPageBreak() {
    setFields((prev) => [
      ...prev,
      {
        id: `draft-${Date.now()}`,
        formId: form.id,
        sortOrder: prev.length,
        label: "Page Break",
        key: `page_break_${Date.now()}`,
        type: "page_break",
        scope: "submission",
        required: false,
        options: [],
        placeholder: null,
        helpText: null,
        isUnique: false,
        uniqueCaseSensitive: false,
        validationPattern: null,
        validationPatternMessage: null,
      }
    ]);
    setIsDirty(true);
  }

  function duplicateField(fieldId: string) {
    setFields((prev) => {
      const sourceIndex = prev.findIndex((f) => f.id === fieldId);
      if (sourceIndex < 0) return prev;

      const source = prev[sourceIndex];
      const usedKeys = new Set(prev.map((f) => `${f.scope}:${f.key}`));

      const baseKey = source.key || "field";
      let candidate = `${baseKey}_copy`;
      let suffix = 2;
      while (usedKeys.has(`${source.scope}:${candidate}`)) {
        candidate = `${baseKey}_copy_${suffix}`;
        suffix += 1;
      }

      const isPageBreak = source.type === "page_break";
      const duplicated: FieldDefinition = {
        ...source,
        id: `draft-${Date.now()}`,
        key: isPageBreak ? `page_break_${Date.now()}` : candidate,
        label: isPageBreak ? source.label : `${source.label} (copy)`,
        options: source.options.map((option) => ({ ...option })),
        sortOrder: source.sortOrder + 1,
      };

      const next = [
        ...prev.slice(0, sourceIndex + 1),
        duplicated,
        ...prev.slice(sourceIndex + 1),
      ];

      return next.map((f, i) => ({ ...f, sortOrder: i }));
    });
    setIsDirty(true);
  }

  function handleReorder(newOrder: FieldDefinition[]) {
    // Sync the local order internally first
    setFields(newOrder.map((f, i) => ({ ...f, sortOrder: i })));
    setIsDirty(true);
  }

  async function handleBulkSave() {
    setIsSaving(true);
    setToastMsg(null);
    try {
      const payload = fields.map((f, i) => ({ ...normalizeFieldDraft(f), sortOrder: i }));
      const res = await bulkSaveFields(form.id, payload);
      if (res.status === "error") {
        setToastMsg({ type: "error", message: res.message || "Failed to save." });
      } else {
        setToastMsg({ type: "success", message: res.message || "Form fields saved successfully." });
        setIsDirty(false);
      }
    } catch (e) {
      setToastMsg({ type: "error", message: (e as Error).message || "Failed to save." });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="mt-6 space-y-4">
      {toastMsg && (
        <div className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-sm font-medium ${toastMsg.type === "success" ? "border-emerald-500/30 bg-emerald-50 text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-100" : "border-rose-500/30 bg-rose-50 text-rose-900 dark:bg-rose-500/10 dark:text-rose-100"}`}>
          {toastMsg.type === "success" ? <CheckCircle2 className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4" />}
          {toastMsg.message}
        </div>
      )}

      {isMounted && (
        <Reorder.Group axis="y" values={fields} onReorder={handleReorder} className="space-y-4">
          {fields.map((field) => (
            <Reorder.Item key={field.id} value={field}>
              <FieldCard 
                field={field} 
                onChange={(updated) => { setFields(fs => fs.map(f => f.id === field.id ? normalizeFieldDraft(updated) : f)); setIsDirty(true); }}
                onDuplicate={() => duplicateField(field.id)}
                onDelete={() => { setFields(fs => fs.filter(f => f.id !== field.id)); setIsDirty(true); }}
              />
            </Reorder.Item>
          ))}
        </Reorder.Group>
      )}

      {isMounted && fields.length === 0 && (
        <div className="rounded-xl border-2 border-dashed border-zinc-200 bg-white py-12 text-center dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
            No questions yet - click below to add your first
          </p>
        </div>
      )}

       <div className="flex flex-col sm:flex-row gap-4">
         <button
          type="button"
          onClick={addQuestion}
          className="flex w-full flex-1 items-center justify-center gap-2 rounded-xl border-2 border-dashed border-zinc-300 bg-white py-4 text-sm font-semibold text-zinc-600 transition-colors hover:border-zinc-400 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:border-zinc-500 dark:hover:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-400"
        >
          <Plus className="h-4 w-4" /> Add question
        </button>
        <button
          type="button"
          onClick={addPageBreak}
          className="flex w-full flex-1 items-center justify-center gap-2 rounded-xl border-2 border-dashed border-zinc-300 bg-white py-4 text-sm font-semibold text-zinc-600 transition-colors hover:border-zinc-400 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:border-zinc-500 dark:hover:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-400"
        >
          <Plus className="h-4 w-4" /> Add page break
        </button>
       </div>

      {/* Global Save Button */}
      <div className={`sticky bottom-6 z-20 mx-auto flex w-[95%] max-w-xl flex-col items-center justify-between gap-4 rounded-2xl border border-zinc-200 bg-white/95 p-4 shadow-2xl backdrop-blur-md transition-all duration-300 dark:border-zinc-700 dark:bg-zinc-800/95 sm:w-[90%] sm:flex-row sm:gap-3 sm:rounded-xl sm:p-3 sm:pr-4 ${isMounted && (isDirty || hasSettingsIssueInFields) ? "translate-y-0 opacity-100" : "translate-y-20 opacity-0 pointer-events-none"}`}>
        <p className="flex items-center gap-2 text-sm font-semibold text-zinc-600 dark:text-zinc-300 sm:pl-3 sm:font-medium">
          <ShieldAlert className={`h-4 w-4 ${hasSettingsIssueInFields ? "text-rose-500" : "text-amber-500"} sm:hidden`} />
          {hasSettingsIssueInFields ? "Save to resolve form settings issue." : "You have unsaved changes."}
        </p>
        <button
          type="button"
          onClick={handleBulkSave}
          disabled={isSaving}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-zinc-900 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200 dark:focus:ring-zinc-300 dark:focus:ring-offset-zinc-800 sm:w-auto sm:py-2.5"
        >
          {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
          {isSaving ? "Saving..." : "Save changes"}
        </button>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export function FormBuilder({
  forms,
  selectedForm,
  bannerUrl,
  googleSheetsConnection,
  googleSheetsOAuthConfigured,
  linkedResourceTitle = null,
  publicFormBaseUrl,
  maxForms = DEFAULT_MAX_FORMS,
  actions,
  onNavigate,
  googleSheetsSettingsHref,
}: FormBuilderProps) {
  const [showCreate, setShowCreate] = useState(false);
  const { createForm, updateSettings, deleteForm, uploadBanner, deleteBanner, bulkSaveFields } = actions;
  const canCreate = forms.length < maxForms;

  if (showCreate || (forms.length === 0 && !selectedForm)) {
    return (
      <CreateFormPanel
        formCount={forms.length}
        maxForms={maxForms}
        publicFormBaseUrl={publicFormBaseUrl}
        createForm={createForm}
        onCancel={() => setShowCreate(false)}
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl pb-20">
      {/* Form selector dropdown */}
      <FormSelectorDropdown
        items={forms.map((f) => ({
          id: f.id,
          title: f.title,
          href: `/admin/form-builder?form=${f.slug}`,
          status: f.status,
          kind: f.kind,
        }))}
        selectedId={selectedForm?.id}
        canCreate={canCreate}
        onNew={() => setShowCreate(true)}
      />

      {selectedForm ? (
        <div className="mt-4 flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          {/* Banner */}
          <BannerArea form={selectedForm} bannerUrl={bannerUrl} uploadBanner={uploadBanner} deleteBanner={deleteBanner} />

           {/* Form title & kind */}
          <div className="px-4 py-8 pb-6 sm:px-6">
            <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                 <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 truncate sm:text-3xl">
                  {selectedForm.title}
                </h2>
                <div className="mt-3 flex flex-wrap items-center gap-2.5">
                  <span className="inline-flex items-center rounded-md bg-zinc-100 px-2.5 py-0.5 text-[0.625rem] font-bold uppercase tracking-widest text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
                     {selectedForm.kind}
                  </span>
                  <span className={`inline-flex items-center rounded-md px-2.5 py-0.5 text-[0.625rem] font-bold uppercase tracking-widest ${selectedForm.status === "open" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300" : selectedForm.status === "draft" ? "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300" : "bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300"}`}>
                    {selectedForm.status}
                  </span>
                  <div className="flex items-center gap-1.5 text-sm font-medium text-zinc-500 dark:text-zinc-400">
                    <span className="hidden sm:inline">/</span>
                    <span className="truncate max-w-[12rem]">{selectedForm.slug}</span>
                     <a href={`/${selectedForm.slug}`} target="_blank" className="text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300 transition-colors" title="View live form">
                      <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                    </a>
                  </div>
                </div>
              </div>
              <a href={`/admin/registrations?form=${selectedForm.slug}`}
                className="inline-flex w-full items-center justify-center rounded-md border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:focus:ring-zinc-300 sm:w-auto">
                View responses
              </a>
            </div>
          </div>

          {/* Settings */}
          <SettingsPanel
            key={[
              selectedForm.id,
              selectedForm.slug,
              selectedForm.kind,
              selectedForm.confirmationEmailEnabled ? "1" : "0",
              selectedForm.confirmationEmailTemplate ?? "",
              selectedForm.confirmationEmailFieldId ?? "",
              selectedForm.confirmationNameFieldId ?? "",
              selectedForm.confirmationEmailSelectedFieldIds?.join(",") ?? "__all__",
              selectedForm.googleSheetsSyncEnabled ? "1" : "0",
              selectedForm.googleSheetsSelectedFieldIds.join(","),
              selectedForm.googleSheetsAdminUserId ?? "",
              selectedForm.googleSheetsSheetTitle ?? "",
              selectedForm.fields.map((field) => `${field.id}:${field.type}`).join(","),
            ].join(":")}
            form={selectedForm}
            googleSheetsConnection={googleSheetsConnection}
            googleSheetsOAuthConfigured={googleSheetsOAuthConfigured}
            linkedResourceTitle={linkedResourceTitle}
            publicFormBaseUrl={publicFormBaseUrl}
            updateSettings={updateSettings}
            deleteForm={deleteForm}
            onNavigate={onNavigate}
            googleSheetsSettingsHref={googleSheetsSettingsHref}
          />
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-dashed border-zinc-300 bg-white p-12 text-center dark:border-zinc-700 dark:bg-zinc-900/50">
          <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Select a form above to edit it.</p>
        </div>
      )}

      {/* Questions */}
      {selectedForm && <FieldBuilder key={selectedForm.id} form={selectedForm} bulkSaveFields={bulkSaveFields} />}
    </div>
  );
}
