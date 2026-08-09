import type {
  FieldDefinition,
  FormDefinition,
  FormWithFields,
  SubmissionDetail,
  SubmissionFilters,
  SubmissionPage,
  SubmissionPayload,
} from "./types";
import {
  UniqueFieldConflictError,
  type FieldUpdate,
  type FieldWrite,
  type LavaFormStore,
  type UniqueReserveEntry,
} from "./store";
import { getFormAvailability } from "./core/availability";
import { normalizeCommonUserFieldValue } from "./core/common-fields";
import { sortFormFieldsByBuilderOrder } from "./core/layout";

function createId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

function normalizeUniqueValue(
  field: FieldDefinition,
  value: SubmissionPayload["answers"][string],
) {
  return normalizeCommonUserFieldValue(field, value);
}

export type MemoryStoreOptions = {
  publicFileBaseUrl?: string;
};

export function createMemoryStore(options: MemoryStoreOptions = {}): LavaFormStore {
  const forms = new Map<string, FormDefinition>();
  const fields = new Map<string, FieldDefinition>();
  const submissions = new Map<string, SubmissionDetail>();
  const uniqueByKey = new Map<string, { id: string; submissionId: string | null }>();
  const reservations = new Map<string, { key: string; formId: string }>();
  const files = new Map<string, { name: string; type: string }>();
  const fileBase = options.publicFileBaseUrl ?? "https://files.local";

  function getFormWithFields(formId: string): FormWithFields | null {
    const form = forms.get(formId);
    if (!form) return null;
    const formFields = sortFormFieldsByBuilderOrder(
      [...fields.values()].filter((f) => f.formId === formId),
    );
    return { ...form, fields: formFields };
  }

  function buildDisplayTitle(form: FormDefinition, payload: SubmissionPayload) {
    const teamField = payload.answers.team_name ?? payload.answers.teamName;
    if (typeof teamField === "string" && teamField.trim()) return teamField.trim();
    return form.title;
  }

  return {
    async listForms() {
      return [...forms.values()].sort(
        (a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title),
      );
    },

    async getFormById(formId) {
      return getFormWithFields(formId);
    },

    async getFormBySlug(slug) {
      const form = [...forms.values()].find((f) => f.slug === slug);
      return form ? getFormWithFields(form.id) : null;
    },

    async createForm(input) {
      const id = createId("form");
      const form: FormDefinition = {
        id,
        slug: input.slug,
        title: input.title,
        description: input.description,
        kind: input.kind,
        status: "draft",
        openAt: null,
        closeAt: null,
        successMessage: null,
        confirmationEmailEnabled: false,
        confirmationEmailTemplate: null,
        confirmationEmailFieldId: null,
        confirmationNameFieldId: null,
        confirmationEmailSelectedFieldIds: null,
        googleSheetsSyncEnabled: false,
        googleSheetsSelectedFieldIds: [],
        googleSheetsAdminUserId: null,
        googleSheetsSheetTitle: null,
        teamMinMembers: 1,
        teamMaxMembers: 1,
        bannerFileId: null,
        sortOrder: input.sortOrder,
      };
      forms.set(id, form);
      return { id };
    },

    async updateFormSettings(input) {
      const existing = forms.get(input.formId);
      if (!existing) throw new Error("Form not found.");
      forms.set(input.formId, {
        ...existing,
        slug: input.slug,
        title: input.title,
        description: input.description,
        kind: input.kind,
        status: input.status,
        openAt: input.openAt,
        closeAt: input.closeAt,
        successMessage: input.successMessage,
        teamMinMembers: input.teamMinMembers,
        teamMaxMembers: input.teamMaxMembers,
        confirmationEmailEnabled: input.confirmationEmailEnabled,
        confirmationEmailTemplate: input.confirmationEmailTemplate ?? null,
        confirmationEmailFieldId: input.confirmationEmailFieldId,
        confirmationNameFieldId: input.confirmationNameFieldId,
        confirmationEmailSelectedFieldIds: input.confirmationEmailSelectedFieldIds,
        googleSheetsSyncEnabled: input.googleSheetsSyncEnabled,
        googleSheetsSelectedFieldIds: input.googleSheetsSelectedFieldIds,
        googleSheetsAdminUserId: input.googleSheetsAdminUserId,
        googleSheetsSheetTitle: input.googleSheetsSheetTitle,
      });
    },

    async deleteForm(formId) {
      forms.delete(formId);
      for (const [fieldId, field] of fields) {
        if (field.formId === formId) fields.delete(fieldId);
      }
      for (const [submissionId, submission] of submissions) {
        if (submission.formId === formId) submissions.delete(submissionId);
      }
    },

    async uploadBanner(formId, file) {
      const form = forms.get(formId);
      if (!form) throw new Error("Form not found.");
      const fileId = createId("banner");
      files.set(fileId, { name: file.name, type: file.type });
      forms.set(formId, { ...form, bannerFileId: fileId });
      return fileId;
    },

    async deleteBanner(formId) {
      const form = forms.get(formId);
      if (!form?.bannerFileId) return;
      files.delete(form.bannerFileId);
      forms.set(formId, { ...form, bannerFileId: null });
    },

    getBannerUrl(bannerFileId) {
      return `${fileBase}/banners/${bannerFileId}`;
    },

    async createField(input) {
      const id = createId("field");
      const field: FieldDefinition = {
        id,
        formId: input.formId,
        scope: input.scope,
        key: input.key,
        label: input.label,
        type: input.type,
        required: input.required,
        sortOrder: input.sortOrder,
        options: input.options,
        placeholder: input.placeholder,
        helpText: input.helpText,
        isUnique: input.isUnique,
        uniqueCaseSensitive: input.uniqueCaseSensitive,
        validationPattern: input.validationPattern,
        validationPatternMessage: input.validationPatternMessage,
      };
      fields.set(id, field);
      return { id };
    },

    async updateField(input) {
      const existing = fields.get(input.fieldId);
      if (!existing) throw new Error("Field not found.");
      fields.set(input.fieldId, {
        ...existing,
        scope: input.scope,
        key: input.key,
        label: input.label,
        type: input.type,
        required: input.required,
        sortOrder: input.sortOrder,
        options: input.options,
        placeholder: input.placeholder,
        helpText: input.helpText,
        isUnique: input.isUnique,
        uniqueCaseSensitive: input.uniqueCaseSensitive,
        validationPattern: input.validationPattern,
        validationPatternMessage: input.validationPatternMessage,
      });
    },

    async deleteField(fieldId) {
      fields.delete(fieldId);
    },

    async reorderFields(updates) {
      for (const update of updates) {
        const field = fields.get(update.id);
        if (field) fields.set(update.id, { ...field, sortOrder: update.sortOrder });
      }
    },

    async bulkSaveFields(input) {
      for (const fieldId of input.deletes) {
        fields.delete(fieldId);
      }
      for (const create of input.creates) {
        await this.createField({ ...create, formId: input.formId });
      }
      for (const update of input.updates) {
        await this.updateField({ ...update, formId: input.formId });
      }
    },

    async createSubmission(payload) {
      const form = getFormWithFields(payload.formId);
      if (!form) throw new Error("Form not found.");
      const availability = getFormAvailability(form);
      if (!availability.isAcceptingSubmissions) {
        throw new Error("Form is not accepting submissions.");
      }

      const id = createId("submission");
      const createdAt = new Date().toISOString();
      const detail: SubmissionDetail = {
        id,
        formId: form.id,
        formSlug: form.slug,
        formTitle: form.title,
        createdAt,
        displayTitle: buildDisplayTitle(form, payload),
        displaySubtitle: null,
        teamName: payload.teamName,
        answers: payload.answers,
        memberAnswers: payload.memberAnswers,
      };
      submissions.set(id, detail);
      return { id };
    },

    async listSubmissions(filters) {
      let list = [...submissions.values()].sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt),
      );
      if (filters.formId) {
        list = list.filter((s) => s.formId === filters.formId);
      }
      const page = Math.max(1, filters.page ?? 1);
      const pageSize = filters.pageSize ?? 20;
      const total = list.length;
      if (pageSize !== "all") {
        const start = (page - 1) * pageSize;
        list = list.slice(start, start + pageSize);
      }
      return { submissions: list, total, page, pageSize };
    },

    async listAllSubmissionDetails(filters) {
      const page = await this.listSubmissions({ ...filters, page: 1, pageSize: "all" });
      return page.submissions;
    },

    async getSubmissionById(submissionId) {
      return submissions.get(submissionId) ?? null;
    },

    async deleteSubmission(submissionId) {
      const submission = submissions.get(submissionId);
      if (!submission) throw new Error("Submission not found.");
      submissions.delete(submissionId);
      return submission;
    },

    async reserveUniqueValues(input) {
      const fieldErrors: Record<string, string> = {};
      const reservationIds: string[] = [];

      for (const entry of input.entries) {
        const normalized = normalizeUniqueValue(entry.field, entry.value);
        if (!normalized) continue;
        const key = `${input.formId}:${entry.field.id}:${normalized}`;
        const existing = uniqueByKey.get(key);
        if (existing?.submissionId) {
          fieldErrors[entry.errorKey] = `${entry.field.label} must be unique.`;
          continue;
        }
        const reservationId = createId("uniq");
        uniqueByKey.set(key, { id: reservationId, submissionId: null });
        reservations.set(reservationId, { key, formId: input.formId });
        reservationIds.push(reservationId);
      }

      if (Object.keys(fieldErrors).length > 0) {
        for (const reservationId of reservationIds) {
          const reservation = reservations.get(reservationId);
          if (reservation) uniqueByKey.delete(reservation.key);
          reservations.delete(reservationId);
        }
        throw new UniqueFieldConflictError(fieldErrors);
      }

      return reservationIds;
    },

    async attachUniqueReservations(reservationIds, submissionId) {
      for (const reservationId of reservationIds) {
        const reservation = reservations.get(reservationId);
        if (!reservation) continue;
        const entry = uniqueByKey.get(reservation.key);
        if (entry) uniqueByKey.set(reservation.key, { ...entry, submissionId });
        reservations.delete(reservationId);
      }
    },

    async releaseUniqueReservations(reservationIds) {
      for (const reservationId of reservationIds) {
        const reservation = reservations.get(reservationId);
        if (reservation) {
          const entry = uniqueByKey.get(reservation.key);
          if (entry && !entry.submissionId) uniqueByKey.delete(reservation.key);
          reservations.delete(reservationId);
        }
      }
    },

    async uploadFile(file) {
      const fileId = createId("file");
      files.set(fileId, { name: file.name, type: file.type });
      return fileId;
    },

    async deleteFiles(fileIds) {
      for (const fileId of fileIds) files.delete(fileId);
    },

    getFileUrl(fileId) {
      return `${fileBase}/files/${fileId}`;
    },
  };
}

export type { FieldWrite, FieldUpdate };
