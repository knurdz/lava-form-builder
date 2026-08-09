export const DISPLAY_TIME_ZONE = "Asia/Colombo";
export const COLOMBO_OFFSET = "+05:30";

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function isValidCalendarDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function parseDateParts(value: string) {
  const trimmed = value.trim();

  let match = trimmed.match(/^(\d{4})[\/.-](\d{1,2})[\/.-](\d{1,2})$/);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    return isValidCalendarDate(year, month, day)
      ? { year, month, day }
      : null;
  }

  // Keep supporting the legacy day-first format when reading old values.
  match = trimmed.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
  if (match) {
    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = Number(match[3]);
    return isValidCalendarDate(year, month, day)
      ? { year, month, day }
      : null;
  }

  match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    return isValidCalendarDate(year, month, day)
      ? { year, month, day }
      : null;
  }

  return null;
}

function getFormatterParts(value: string | Date, withTime: boolean) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(withTime
      ? {
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        }
      : {}),
    timeZone: DISPLAY_TIME_ZONE,
  });

  const parts = formatter.formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";

  return {
    day: part("day"),
    month: part("month"),
    year: part("year"),
    hour: withTime ? part("hour") : "",
    minute: withTime ? part("minute") : "",
    dayPeriod: withTime ? part("dayPeriod").toUpperCase() : "",
  };
}

export function formatDateDisplay(value: string | Date) {
  try {
    const { day, month, year } = getFormatterParts(value, false);
    return `${year}/${month}/${day}`;
  } catch {
    return String(value);
  }
}

export function formatDateTimeDisplay(value: string | Date) {
  try {
    const { day, month, year, hour, minute, dayPeriod } = getFormatterParts(value, true);
    return `${year}/${month}/${day} ${hour}:${minute}${dayPeriod ? ` ${dayPeriod}` : ""}`;
  } catch {
    return String(value);
  }
}

export function parseDisplayDateInput(value: string) {
  const parts = parseDateParts(value);
  if (!parts) return null;

  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
}

export function formatStoredDateForInput(value: string | null | undefined) {
  if (!value) return "";

  const stored = parseDisplayDateInput(value) ?? getStoredDateFromIso(value);
  if (!stored) return value;

  const [, year, month, day] = stored.match(/^(\d{4})-(\d{2})-(\d{2})$/) ?? [];
  if (!year || !month || !day) return value;
  return `${year}/${month}/${day}`;
}

export function formatStoredDateForPicker(value: string | null | undefined) {
  if (!value) return "";
  return parseDisplayDateInput(value) ?? getStoredDateFromIso(value) ?? "";
}

export function parseDisplayDateTimeInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  let match = trimmed.match(
    /^(\d{4})[\/.-](\d{1,2})[\/.-](\d{1,2})\s+(\d{1,2}):(\d{2})$/,
  );
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const hour = Number(match[4]);
    const minute = Number(match[5]);

    if (
      !isValidCalendarDate(year, month, day) ||
      hour < 0 ||
      hour > 23 ||
      minute < 0 ||
      minute > 59
    ) {
      return null;
    }

    return new Date(
      `${year}-${pad2(month)}-${pad2(day)}T${pad2(hour)}:${pad2(minute)}:00${COLOMBO_OFFSET}`,
    ).toISOString();
  }

  match = trimmed.match(
    /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})\s+(\d{1,2}):(\d{2})$/,
  );
  if (match) {
    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = Number(match[3]);
    const hour = Number(match[4]);
    const minute = Number(match[5]);

    if (
      !isValidCalendarDate(year, month, day) ||
      hour < 0 ||
      hour > 23 ||
      minute < 0 ||
      minute > 59
    ) {
      return null;
    }

    return new Date(
      `${year}-${pad2(month)}-${pad2(day)}T${pad2(hour)}:${pad2(minute)}:00${COLOMBO_OFFSET}`,
    ).toISOString();
  }

  match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const hour = Number(match[4]);
    const minute = Number(match[5]);

    if (!isValidCalendarDate(year, month, day)) {
      return null;
    }

    return new Date(
      `${year}-${pad2(month)}-${pad2(day)}T${pad2(hour)}:${pad2(minute)}:00${COLOMBO_OFFSET}`,
    ).toISOString();
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }

  return null;
}

export function parseDisplayDateBoundaryInput(
  value: string,
  endOfDay = false,
) {
  const stored = parseDisplayDateInput(value);
  if (!stored) return null;

  const suffix = endOfDay ? "T23:59:59.999" : "T00:00:00.000";
  return new Date(`${stored}${suffix}${COLOMBO_OFFSET}`).toISOString();
}

export function formatIsoDateTimeForInput(value: string | null | undefined) {
  if (!value) return "";
  return formatDateTimeDisplay(value);
}

export function getStoredDateFromIso(value: string | Date | null | undefined) {
  if (!value) return null;

  try {
    const { day, month, year } = getFormatterParts(value, false);
    if (!year || !month || !day) return null;
    return `${year}-${month}-${day}`;
  } catch {
    return null;
  }
}

export function getStoredTimeFromIso(value: string | Date | null | undefined) {
  if (!value) return null;

  try {
    const { hour, minute } = getFormatterParts(value, true);
    if (!hour || !minute) return null;
    return `${hour}:${minute}`;
  } catch {
    return null;
  }
}

export function formatIsoDateTimeForPicker(value: string | null | undefined) {
  if (!value) return "";

  try {
    const { day, month, year, hour, minute } = getFormatterParts(value, true);
    return `${year}-${month}-${day}T${hour}:${minute}`;
  } catch {
    return "";
  }
}

export function formatPickerDateForInput(value: string | null | undefined) {
  if (!value) return "";
  return formatStoredDateForInput(value);
}

export function formatPickerDateTimeForInput(value: string | null | undefined) {
  if (!value) return "";

  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (match) {
    return `${match[1]}/${match[2]}/${match[3]} ${match[4]}:${match[5]}`;
  }

  const parsed = parseDisplayDateTimeInput(value);
  return parsed ? formatIsoDateTimeForInput(parsed) : value;
}

export function formatDateTimeForPicker(value: string | null | undefined) {
  if (!value) return "";
  const parsed = parseDisplayDateTimeInput(value);
  return parsed ? formatIsoDateTimeForPicker(parsed) : "";
}

export function normalizeDateFilterInput(
  value: string | null | undefined,
  endOfDay = false,
) {
  if (!value?.trim()) return null;
  return parseDisplayDateBoundaryInput(value, endOfDay);
}
