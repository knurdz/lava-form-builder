import type {
  FieldDefinition,
  FormDefinition,
  FormOverview,
  FormWithFields,
  SheetsConnection,
  SubmissionDetail,
  SubmissionFilters,
  SubmissionPage,
  SubmissionPayload,
} from "./types";

export type FieldWrite = Omit<FieldDefinition, "id" | "formId">;
export type FieldUpdate = FieldWrite & { fieldId: string };

export type UniqueReserveEntry = {
  field: FieldDefinition;
  value: SubmissionPayload["answers"][string];
  errorKey: string;
};

export class UniqueFieldConflictError extends Error {
  fieldErrors: Record<string, string>;

  constructor(fieldErrors: Record<string, string>) {
    super("One or more fields must be unique.");
    this.name = "UniqueFieldConflictError";
    this.fieldErrors = fieldErrors;
  }
}

export class FormSubmissionNotAllowedError extends Error {
  formId: string | null;

  constructor(message: string, formId: string | null = null) {
    super(message);
    this.name = "FormSubmissionNotAllowedError";
    this.formId = formId;
  }
}

export type SubmissionCreatedEvent = {
  form: FormWithFields;
  submission: SubmissionDetail;
  payload: SubmissionPayload;
};

export interface LavaFormStore {
  listForms(): Promise<FormDefinition[]>;
  getFormById(formId: string): Promise<FormWithFields | null>;
  getFormBySlug(slug: string): Promise<FormWithFields | null>;
  createForm(input: {
    slug: string;
    title: string;
    description: string | null;
    kind: string;
    sortOrder: number;
  }): Promise<{ id: string }>;
  updateFormSettings(input: {
    formId: string;
    slug: string;
    title: string;
    description: string | null;
    kind: string;
    status: FormDefinition["status"];
    openAt: string | null;
    closeAt: string | null;
    successMessage: string | null;
    teamMinMembers: number;
    teamMaxMembers: number;
    confirmationEmailEnabled: boolean;
    confirmationEmailTemplate?: string | null;
    confirmationEmailFieldId: string | null;
    confirmationNameFieldId: string | null;
    confirmationEmailSelectedFieldIds: string[] | null;
    googleSheetsSyncEnabled: boolean;
    googleSheetsSelectedFieldIds: string[];
    googleSheetsAdminUserId: string | null;
    googleSheetsSheetTitle: string | null;
  }): Promise<void>;
  deleteForm(formId: string): Promise<void>;

  uploadBanner(formId: string, file: File): Promise<string>;
  deleteBanner(formId: string): Promise<void>;
  getBannerUrl(bannerFileId: string): string;

  createField(input: FieldWrite & { formId: string }): Promise<{ id: string }>;
  updateField(input: FieldUpdate & { formId: string }): Promise<void>;
  deleteField(fieldId: string): Promise<void>;
  reorderFields(updates: Array<{ id: string; sortOrder: number }>): Promise<void>;
  bulkSaveFields(input: {
    formId: string;
    creates: FieldWrite[];
    updates: FieldUpdate[];
    deletes: string[];
  }): Promise<void>;

  createSubmission(payload: SubmissionPayload): Promise<{ id: string }>;
  listSubmissions(filters: SubmissionFilters): Promise<SubmissionPage>;
  listAllSubmissionDetails(filters: SubmissionFilters): Promise<SubmissionDetail[]>;
  getSubmissionById(submissionId: string): Promise<SubmissionDetail | null>;
  deleteSubmission(submissionId: string): Promise<SubmissionDetail>;

  reserveUniqueValues(input: {
    formId: string;
    entries: UniqueReserveEntry[];
  }): Promise<string[]>;
  attachUniqueReservations(reservationIds: string[], submissionId: string): Promise<void>;
  releaseUniqueReservations(reservationIds: string[]): Promise<void>;

  uploadFile(file: File): Promise<string>;
  deleteFiles(fileIds: string[]): Promise<void>;
  getFileUrl?(fileId: string): string;
}

export interface LavaFormSheetsPlugin {
  getConnection(): Promise<SheetsConnection | null>;
  isOAuthConfigured(): boolean;
  getConnectUrl?(returnTo: string): string;
  onSubmissionCreated(event: SubmissionCreatedEvent): Promise<void>;
  ensureSheet?(form: FormDefinition): Promise<void>;
}

export interface LavaFormEmailPlugin {
  onSubmissionCreated(event: SubmissionCreatedEvent): Promise<void>;
  upsertContact?(event: SubmissionCreatedEvent): Promise<void>;
  onSubmissionDeleted?(event: {
    form: FormWithFields | null;
    submission: SubmissionDetail;
  }): Promise<void>;
}

export interface LavaFormAnalyticsPlugin {
  getOverview(): Promise<FormOverview>;
}

export type LavaFormPlugins = {
  sheets?: LavaFormSheetsPlugin;
  email?: LavaFormEmailPlugin;
  analytics?: LavaFormAnalyticsPlugin;
};

export type { SheetsConnection } from "./types";
