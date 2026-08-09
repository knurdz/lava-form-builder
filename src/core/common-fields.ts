import type {
  FieldDefinition,
  FieldType,
  FormWithFields,
  SubmissionAnswerValue,
} from "../types";
import { fieldTypeSupportsUnique } from "../types";

export type CommonUserFieldOption = {
  value: string;
  label: string;
  type: FieldType;
};

const EMAIL_FIELD_KEYS = new Set([
  "email",
  "email_address",
  "mail",
  "mail_address",
  "e_mail",
]);

const PHONE_FIELD_KEYS = new Set([
  "phone",
  "phone_number",
  "mobile",
  "mobile_number",
  "telephone",
  "telephone_number",
  "contact",
  "contact_number",
  "whatsapp",
  "whatsapp_number",
]);

function normalizeFieldToken(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function formatFallbackLabel(value: string) {
  return value
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function isComparableCommonUserField(
  field: Pick<FieldDefinition, "scope" | "type">,
) {
  return field.scope === "submission" && fieldTypeSupportsUnique(field.type);
}

export function getCommonUserFieldKey(
  field: Pick<FieldDefinition, "scope" | "type" | "key" | "label">,
) {
  if (!isComparableCommonUserField(field)) return null;

  if (field.type === "email") return "email";
  if (field.type === "tel") return "phone";

  const normalizedKey = normalizeFieldToken(field.key);
  const normalizedLabel = normalizeFieldToken(field.label);

  if (EMAIL_FIELD_KEYS.has(normalizedKey) || EMAIL_FIELD_KEYS.has(normalizedLabel)) {
    return "email";
  }

  if (PHONE_FIELD_KEYS.has(normalizedKey) || PHONE_FIELD_KEYS.has(normalizedLabel)) {
    return "phone";
  }

  return normalizedKey || normalizedLabel || null;
}

export function getCommonUserFieldLabel(
  field: Pick<FieldDefinition, "label" | "type" | "key" | "scope">,
  commonFieldKey?: string | null,
) {
  if (field.type === "email" || commonFieldKey === "email") return "Email";
  if (field.type === "tel" || commonFieldKey === "phone") return "Phone";

  const label = field.label.trim();
  return label || formatFallbackLabel(commonFieldKey ?? field.key);
}

function getOptionSortWeight(option: CommonUserFieldOption) {
  if (option.value === "email") return 0;
  if (option.value === "phone") return 1;
  return 2;
}

export function listCommonUserFieldOptions(
  forms: Array<Pick<FormWithFields, "id" | "fields">>,
): CommonUserFieldOption[] {
  if (forms.length === 0) return [];

  const fieldMapsByForm = forms.map((form) => {
    const fieldMap = new Map<string, FieldDefinition>();

    for (const field of form.fields) {
      const commonFieldKey = getCommonUserFieldKey(field);
      if (!commonFieldKey || fieldMap.has(commonFieldKey)) continue;
      fieldMap.set(commonFieldKey, field);
    }

    return fieldMap;
  });

  const firstFieldMap = fieldMapsByForm[0];
  const commonFieldOptions: CommonUserFieldOption[] = [];

  for (const [commonFieldKey, field] of firstFieldMap) {
    if (!fieldMapsByForm.every((fieldMap) => fieldMap.has(commonFieldKey))) continue;

    commonFieldOptions.push({
      value: commonFieldKey,
      label: getCommonUserFieldLabel(field, commonFieldKey),
      type: field.type,
    });
  }

  return commonFieldOptions.sort((left, right) => {
    const weightDifference = getOptionSortWeight(left) - getOptionSortWeight(right);
    if (weightDifference !== 0) return weightDifference;
    return left.label.localeCompare(right.label);
  });
}

export function findCommonUserFieldInForm(
  form: Pick<FormWithFields, "fields"> | null | undefined,
  commonFieldKey: string | null | undefined,
) {
  if (!form || !commonFieldKey?.trim()) return null;

  return (
    form.fields.find((field) => getCommonUserFieldKey(field) === commonFieldKey.trim()) ??
    null
  );
}

export function normalizeCommonUserFieldValue(
  field: Pick<FieldDefinition, "type" | "uniqueCaseSensitive">,
  value: SubmissionAnswerValue,
) {
  if (value === null || value === undefined || value === "") return null;
  if (Array.isArray(value) || typeof value === "boolean") return null;
  if (typeof File !== "undefined" && value instanceof File) return null;

  if (field.type === "tel") {
    const raw = String(value).trim();
    if (!raw) return null;

    const startsWithPlus = raw.startsWith("+");
    const digits = raw.replace(/\D+/g, "");
    if (!digits) return null;

    return startsWithPlus ? `+${digits}` : digits;
  }

  if (field.type === "email") {
    const raw = String(value).trim();
    return raw ? raw.toLocaleLowerCase("en-US") : null;
  }

  if (field.type === "number") {
    const raw = String(value).trim();
    if (!raw) return null;

    const numericValue = Number(raw);
    return Number.isFinite(numericValue) ? String(numericValue) : raw;
  }

  const raw = String(value).trim();
  if (!raw) return null;

  if (
    field.type === "text" ||
    field.type === "textarea" ||
    field.type === "url" ||
    field.type === "select" ||
    field.type === "radio"
  ) {
    return field.uniqueCaseSensitive ? raw : raw.toLocaleLowerCase("en-US");
  }

  return raw;
}
