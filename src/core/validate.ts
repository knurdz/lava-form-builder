import type { FieldDefinition, FieldOption, FieldType } from "../types";
import { getFieldPatternError } from "./pattern";
import { parseDisplayDateInput } from "./date-format";

export function isChoiceField(t: FieldType) {
  return t === "select" || t === "radio" || t === "checkbox";
}

function isValidUrlValue(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function parseOptionsFromText(value: string): FieldOption[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map<FieldOption>((line) => {
      const [rawLabel, rawValue] = line.includes("|")
        ? line.split("|", 2)
        : [line, line];
      return { label: rawLabel.trim(), value: rawValue.trim() };
    })
    .filter((o) => o.label && o.value);
}

export function formatOptionsForTextarea(options: FieldOption[]) {
  return options.map((o) => `${o.label}|${o.value}`).join("\n");
}

export function getFieldLabelMap(fields: FieldDefinition[]) {
  return new Map(fields.map((f) => [f.key, f.label] as const));
}

export function coerceFieldValue(
  field: FieldDefinition,
  rawValue: FormDataEntryValue | FormDataEntryValue[] | null,
): import("../types").SubmissionAnswerValue {
  if (field.type === "page_break") return null;
  if (field.type === "checkbox") {
    if (Array.isArray(rawValue)) return rawValue.map(String);
    return rawValue ? [String(rawValue)] : [];
  }

  if (Array.isArray(rawValue)) rawValue = rawValue[0] ?? null;

  if (field.type === "file") {
    if (rawValue instanceof File && rawValue.size > 0) return rawValue;
    return null;
  }

  if (typeof rawValue !== "string") return null;
  const value = rawValue.trim();
  if (!value) return null;
  if (field.type === "number") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : value;
  }
  if (field.type === "date") {
    const stored = parseDisplayDateInput(value);
    if (!stored) return value;
    const [year, month, day] = stored.split("-");
    return `${year}/${month}/${day}`;
  }
  return value;
}

export function validateFieldValue(
  field: FieldDefinition,
  value: import("../types").SubmissionAnswerValue,
) {
  if (field.type === "page_break") return null;
  if (field.type === "checkbox") {
    if (field.required && (!Array.isArray(value) || value.length === 0))
      return `Please select at least one option for ${field.label}.`;
    return null;
  }

  if (field.type === "file") {
    if (field.required && !(value instanceof File))
      return `${field.label} is required. Please upload a file.`;
    if (value instanceof File) {
      if (value.size > 10 * 1024 * 1024) {
        return `${field.label} must be less than 10MB.`;
      }
      const allowedTypes = [
        "image/jpeg",
        "image/png",
        "image/webp",
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ];
      if (!allowedTypes.includes(value.type)) {
        return `${field.label} format is not supported. Please upload a PDF, Word document, or image.`;
      }
    }
    return null;
  }

  if (value === null || value === "" || (Array.isArray(value) && value.length === 0)) {
    return field.required ? `${field.label} is required.` : null;
  }

  if (field.type === "number") {
    if (typeof value !== "number" || Number.isNaN(value))
      return `${field.label} must be a valid number.`;
    const patternError = getFieldPatternError(field, value);
    if (patternError) return patternError;
    return null;
  }

  if (typeof value !== "string") return `${field.label} has an invalid value.`;

  if (field.type === "date" && !parseDisplayDateInput(value)) {
    return `${field.label} must use the yyyy/mm/dd format.`;
  }

  if (field.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
    return `${field.label} must be a valid email address.`;

  if (field.type === "tel" && !/^[+()\-\s0-9.]{7,24}$/.test(value))
    return `${field.label} must be a valid phone number.`;

  if (field.type === "url" && !isValidUrlValue(value))
    return `${field.label} must be a valid URL.`;

  if (isChoiceField(field.type)) {
    const allowed = new Set(field.options.map((o) => o.value));
    if (!allowed.has(value)) return `${field.label} has an invalid option.`;
  }

  const patternError = getFieldPatternError(field, value);
  if (patternError) return patternError;

  return null;
}
