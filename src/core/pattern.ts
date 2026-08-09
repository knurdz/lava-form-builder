import type { FieldDefinition, FieldType } from "../types";
import { fieldTypeSupportsPattern } from "../types";

const MAX_PATTERN_LENGTH = 512;

export function compileFieldPattern(pattern: string): RegExp | null {
  const trimmed = pattern.trim();
  if (!trimmed || trimmed.length > MAX_PATTERN_LENGTH) return null;

  try {
    if (trimmed.startsWith("/")) {
      const lastSlash = trimmed.lastIndexOf("/");
      if (lastSlash > 0) {
        const body = trimmed.slice(1, lastSlash);
        const flags = trimmed.slice(lastSlash + 1);
        return new RegExp(body, flags);
      }
    }

    return new RegExp(trimmed);
  } catch {
    return null;
  }
}

export function isValidFieldPattern(pattern: string): boolean {
  const trimmed = pattern.trim();
  if (!trimmed) return true;
  if (trimmed.length > MAX_PATTERN_LENGTH) return false;
  return compileFieldPattern(trimmed) !== null;
}

export function getFieldPatternError(field: FieldDefinition, value: string | number): string | null {
  if (!fieldTypeSupportsPattern(field.type)) return null;

  const pattern = field.validationPattern?.trim();
  if (!pattern) return null;

  const regex = compileFieldPattern(pattern);
  if (!regex) return null;

  const stringValue = typeof value === "number" ? String(value) : value;
  if (regex.test(stringValue)) return null;

  const customMessage = field.validationPatternMessage?.trim();
  return customMessage || `${field.label} format is invalid.`;
}

export function matchesFieldPattern(field: FieldDefinition, value: string | number): boolean {
  return getFieldPatternError(field, value) === null;
}

export function normalizeFieldPatternInput(
  type: FieldType,
  validationPattern: string | null | undefined,
  validationPatternMessage: string | null | undefined,
  options?: { trimMessage?: boolean },
): { validationPattern: string | null; validationPatternMessage: string | null } {
  if (!fieldTypeSupportsPattern(type)) {
    return { validationPattern: null, validationPatternMessage: null };
  }

  const pattern = validationPattern?.trim() || null;
  if (!pattern) {
    return { validationPattern: null, validationPatternMessage: null };
  }

  const trimMessage = options?.trimMessage !== false;
  const rawMessage = validationPatternMessage ?? null;
  const message = trimMessage ? rawMessage?.trim() || null : rawMessage;

  return {
    validationPattern: pattern.slice(0, MAX_PATTERN_LENGTH),
    validationPatternMessage:
      message === null
        ? null
        : message.slice(0, MAX_PATTERN_LENGTH),
  };
}

export function getHtmlPatternAttribute(pattern: string | null | undefined): string | undefined {
  const trimmed = pattern?.trim();
  if (!trimmed) return undefined;

  if (trimmed.startsWith("/")) {
    const lastSlash = trimmed.lastIndexOf("/");
    if (lastSlash > 0) {
      return trimmed.slice(1, lastSlash);
    }
  }

  return trimmed;
}
