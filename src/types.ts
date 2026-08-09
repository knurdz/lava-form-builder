export const FORM_STATUSES = ["draft", "open", "closed"] as const;
export const FIELD_SCOPES = ["submission", "member"] as const;
export const FIELD_TYPES = [
  "text",
  "textarea",
  "email",
  "tel",
  "url",
  "number",
  "select",
  "radio",
  "checkbox",
  "date",
  "time",
  "file",
  "page_break",
] as const;
export const FIELD_PLACEHOLDER_TYPES = [
  "text",
  "textarea",
  "email",
  "tel",
  "url",
  "number",
  "select",
  "date",
  "time",
] as const;
export const FIELD_UNIQUE_TYPES = [
  "text",
  "textarea",
  "email",
  "tel",
  "url",
  "number",
  "select",
  "radio",
  "date",
  "time",
] as const;
export const FIELD_CASE_SENSITIVE_UNIQUE_TYPES = [
  "text",
  "textarea",
  "email",
  "tel",
  "url",
  "select",
  "radio",
] as const;
export const FIELD_PATTERN_TYPES = [
  "text",
  "textarea",
  "email",
  "tel",
  "url",
  "number",
  "date",
  "time",
] as const;

export type FormKind = string;
export type FormStatus = (typeof FORM_STATUSES)[number];
export type FieldScope = (typeof FIELD_SCOPES)[number];
export type FieldType = (typeof FIELD_TYPES)[number];

export type FieldOption = {
  label: string;
  value: string;
};

export type FieldDefinition = {
  id: string;
  formId: string;
  scope: FieldScope;
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  sortOrder: number;
  options: FieldOption[];
  placeholder: string | null;
  helpText: string | null;
  isUnique: boolean;
  uniqueCaseSensitive: boolean;
  validationPattern: string | null;
  validationPatternMessage: string | null;
};

export type FormDefinition = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  kind: FormKind;
  status: FormStatus;
  openAt: string | null;
  closeAt: string | null;
  successMessage: string | null;
  confirmationEmailEnabled: boolean;
  confirmationEmailTemplate: string | null;
  confirmationEmailFieldId: string | null;
  confirmationNameFieldId: string | null;
  confirmationEmailSelectedFieldIds: string[] | null;
  googleSheetsSyncEnabled: boolean;
  googleSheetsSelectedFieldIds: string[];
  googleSheetsAdminUserId: string | null;
  googleSheetsSheetTitle: string | null;
  teamMinMembers: number;
  teamMaxMembers: number;
  bannerFileId: string | null;
  sortOrder: number;
};

export type FormWithFields = FormDefinition & {
  fields: FieldDefinition[];
};

export type FormAvailabilityState = "open" | "upcoming" | "closed";

export type FormAvailability = {
  state: FormAvailabilityState;
  label: string;
  description: string | null;
  isAcceptingSubmissions: boolean;
};

export type FormCard = FormDefinition & {
  availability: FormAvailability;
};

export type SubmissionAnswerValue = string | number | boolean | null | string[] | File;
export type SubmissionAnswers = Record<string, SubmissionAnswerValue>;

export type SubmissionPayload = {
  formId: string;
  answers: SubmissionAnswers;
  memberAnswers: SubmissionAnswers[];
  teamName: string | null;
};

export type SubmissionCommonMatch = {
  formId: string;
  formSlug: string | null;
  formTitle: string | null;
  submissionId: string;
  createdAt: string;
};

export type SubmissionSummary = {
  id: string;
  formId: string;
  formSlug: string | null;
  formTitle: string | null;
  createdAt: string;
  displayTitle: string;
  displaySubtitle: string | null;
  teamName: string | null;
  commonMatches?: SubmissionCommonMatch[];
};

export type SubmissionDetail = SubmissionSummary & {
  answers: SubmissionAnswers;
  memberAnswers: SubmissionAnswers[];
};

export type FormOverviewItem = {
  form: FormDefinition;
  availability: FormAvailability;
  submissionCount: number;
};

export type FormOverviewTrendPoint = {
  date: string;
  label: string;
  total: number;
  byKind: Record<string, number>;
};

export type FormOverviewFormBreakdownPoint = {
  formId: string;
  label: string;
  kind: FormKind;
  availabilityState: FormAvailabilityState;
  submissions: number;
};

export type FormOverviewCategoryBreakdownPoint = {
  key: string;
  label: string;
  value: number;
};

export type FormOverviewWeekdayPoint = {
  weekday: string;
  submissions: number;
};

export type FormOverviewAnalyticsSummary = {
  last7DaysSubmissions: number;
  previous7DaysSubmissions: number;
  averageSubmissionsPerForm: number;
  topFormTitle: string | null;
  topFormCount: number;
  peakDayLabel: string | null;
  peakDayCount: number;
  busiestWeekday: string | null;
  busiestWeekdayCount: number;
};

export type FormOverviewAnalytics = {
  trend: FormOverviewTrendPoint[];
  formBreakdown: FormOverviewFormBreakdownPoint[];
  kindBreakdown: FormOverviewCategoryBreakdownPoint[];
  weekdayBreakdown: FormOverviewWeekdayPoint[];
  summary: FormOverviewAnalyticsSummary;
};

export type FormOverview = {
  forms: FormOverviewItem[];
  totalSubmissions: number;
  recentSubmissions: SubmissionDetail[];
  analytics: FormOverviewAnalytics;
};

export type SubmissionFilters = {
  formId?: string;
  commonFormIds?: string[] | null;
  commonFieldKey?: string | null;
  from?: string | null;
  to?: string | null;
  page?: number;
  pageSize?: number | "all";
  searchField?: string | null;
  searchQuery?: string | null;
};

export type SubmissionPage = {
  submissions: SubmissionDetail[];
  total: number;
  page: number;
  pageSize: number | "all";
};

export type ActionResult = {
  status: "idle" | "success" | "error";
  message: string | null;
  toastKey?: number;
};

export type SubmitFormState = {
  status: "idle" | "success" | "error";
  message: string | null;
  fieldErrors: Record<string, string>;
  fields?: Record<string, string | string[]>;
  toastKey: number;
};

export const DEFAULT_MAX_FORMS = 5;

export const DEFAULT_RESERVED_SLUGS = new Set([
  "admin",
  "api",
  "login",
  "signin",
  "_next",
]);

export const DEFAULT_FIELD_PLACEHOLDERS: Record<
  (typeof FIELD_PLACEHOLDER_TYPES)[number],
  string
> = {
  text: "Short answer",
  textarea: "Long answer",
  email: "Email address",
  tel: "Phone number",
  url: "https://example.com",
  number: "Number",
  select: "Select an option",
  date: "yyyy/mm/dd",
  time: "hh:mm",
};

export function getDefaultFieldPlaceholder(type: FieldType): string | null {
  if (!fieldTypeSupportsPlaceholder(type)) return null;
  return DEFAULT_FIELD_PLACEHOLDERS[
    type as (typeof FIELD_PLACEHOLDER_TYPES)[number]
  ];
}

export function fieldTypeSupportsPlaceholder(type: FieldType) {
  return FIELD_PLACEHOLDER_TYPES.includes(
    type as (typeof FIELD_PLACEHOLDER_TYPES)[number],
  );
}

export function fieldTypeSupportsUnique(type: FieldType) {
  return FIELD_UNIQUE_TYPES.includes(
    type as (typeof FIELD_UNIQUE_TYPES)[number],
  );
}

export function fieldTypeSupportsCaseSensitiveUnique(type: FieldType) {
  return FIELD_CASE_SENSITIVE_UNIQUE_TYPES.includes(
    type as (typeof FIELD_CASE_SENSITIVE_UNIQUE_TYPES)[number],
  );
}

export function fieldTypeSupportsPattern(type: FieldType) {
  return FIELD_PATTERN_TYPES.includes(
    type as (typeof FIELD_PATTERN_TYPES)[number],
  );
}

export function fieldTypeSupportsGoogleSheetsSync(type: FieldType) {
  return type !== "page_break" && type !== "file";
}

export type SheetsConnection = {
  connected: boolean;
  accountLabel?: string | null;
  spreadsheetUrl?: string | null;
};
