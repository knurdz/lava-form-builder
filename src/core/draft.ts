export type FormDraft = {
  fields: Record<string, string | string[]>;
  teamSize: number;
  currentPage: number;
};

const SKIP_FIELD_NAMES = new Set(["formId", "slug", "registration_url", "memberCount"]);

export function getFormDraftStorageKey(formId: string) {
  return `lava-form-draft:${formId}`;
}

export function readFormDraft(formId: string): FormDraft | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(getFormDraftStorageKey(formId));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as FormDraft;
    if (!parsed || typeof parsed !== "object") return null;
    if (!parsed.fields || typeof parsed.fields !== "object") return null;
    if (typeof parsed.teamSize !== "number" || !Number.isFinite(parsed.teamSize)) return null;
    if (typeof parsed.currentPage !== "number" || !Number.isFinite(parsed.currentPage)) return null;

    return parsed;
  } catch {
    return null;
  }
}

export function writeFormDraft(formId: string, draft: FormDraft) {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(
      getFormDraftStorageKey(formId),
      JSON.stringify(draft),
    );
  } catch {
    // Ignore quota or privacy mode errors.
  }
}

export function clearFormDraft(formId: string) {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.removeItem(getFormDraftStorageKey(formId));
  } catch {
    // Ignore storage errors.
  }
}

function setScalarFieldValue(
  record: Record<string, string | string[]>,
  name: string,
  value: string,
) {
  const existing = record[name];
  if (existing === undefined || typeof existing === "string") {
    if (existing === undefined) {
      record[name] = value;
      return;
    }

    if (value.trim()) {
      record[name] = value;
      return;
    }

    if (!existing.trim()) {
      record[name] = value;
    }
  }
}

function appendFieldValue(
  record: Record<string, string | string[]>,
  name: string,
  value: string,
) {
  const existing = record[name];
  if (existing === undefined) {
    record[name] = value;
    return;
  }

  if (Array.isArray(existing)) {
    existing.push(value);
    return;
  }

  record[name] = [existing, value];
}

export function collectFormFieldValues(
  formEl: HTMLFormElement,
): Record<string, string | string[]> {
  const record: Record<string, string | string[]> = {};

  for (const element of formEl.elements) {
    if (
      !(element instanceof HTMLInputElement) &&
      !(element instanceof HTMLTextAreaElement) &&
      !(element instanceof HTMLSelectElement)
    ) {
      continue;
    }

    const name = element.name;
    if (!name || SKIP_FIELD_NAMES.has(name)) continue;

    if (element instanceof HTMLInputElement && element.type === "file") continue;

    if (element instanceof HTMLInputElement && element.type === "checkbox") {
      if (!element.checked) continue;
      appendFieldValue(record, name, element.value);
      continue;
    }

    if (element instanceof HTMLInputElement && element.type === "radio") {
      if (!element.checked) continue;
      record[name] = element.value;
      continue;
    }

    setScalarFieldValue(record, name, element.value);
  }

  return record;
}

export function mergeFieldRecords(
  base: Record<string, string | string[]>,
  incoming: Record<string, string | string[]>,
): Record<string, string | string[]> {
  return { ...base, ...incoming };
}

export function buildFormSubmitData(
  formEl: HTMLFormElement,
  options: {
    formId: string;
    slug: string;
    teamSize?: number;
    fields: Record<string, string | string[]>;
  },
): FormData {
  const formData = new FormData();

  formData.set("formId", options.formId);
  formData.set("slug", options.slug);

  if (options.teamSize !== undefined) {
    formData.set("memberCount", String(options.teamSize));
  }

  const honeypot = formEl.elements.namedItem("registration_url");
  if (honeypot instanceof HTMLInputElement) {
    formData.set("registration_url", honeypot.value);
  }

  for (const [key, value] of Object.entries(options.fields)) {
    if (SKIP_FIELD_NAMES.has(key)) continue;

    if (Array.isArray(value)) {
      for (const entry of value) {
        formData.append(key, entry);
      }
      continue;
    }

    formData.set(key, value);
  }

  for (const element of formEl.elements) {
    if (
      element instanceof HTMLInputElement &&
      element.type === "file" &&
      element.files?.[0]
    ) {
      formData.set(element.name, element.files[0]);
    }
  }

  return formData;
}
