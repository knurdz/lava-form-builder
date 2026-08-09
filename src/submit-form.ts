import type { FormWithFields, SubmitFormState } from "./types";
import {
  FormSubmissionNotAllowedError,
  UniqueFieldConflictError,
  type LavaFormPlugins,
  type LavaFormStore,
} from "./store";
import { getFormAvailability, getDefaultSuccessMessage } from "./core/availability";
import { coerceFieldValue, validateFieldValue } from "./core/validate";

const HONEYPOT_FIELD_NAME = "registration_url";
const MAX_TOTAL_UPLOAD_BYTES = 25 * 1024 * 1024;

const empty: Record<string, string> = {};

function buildState(
  status: SubmitFormState["status"],
  message: string | null,
  fieldErrors: Record<string, string> = empty,
  fields?: Record<string, string | string[]>,
): SubmitFormState {
  return { status, message, fieldErrors, toastKey: Date.now(), fields };
}

function getSerializedFieldRecord(formData: FormData): Record<string, string | string[]> {
  const fieldsRecord: Record<string, string | string[]> = {};

  for (const [key, val] of Array.from(formData.entries())) {
    if (typeof val !== "string") continue;

    if (fieldsRecord[key] !== undefined) {
      if (Array.isArray(fieldsRecord[key])) {
        (fieldsRecord[key] as string[]).push(val);
      } else {
        fieldsRecord[key] = [fieldsRecord[key] as string, val];
      }
    } else {
      fieldsRecord[key] = val;
    }
  }

  return fieldsRecord;
}

function getTotalUploadBytes(
  records: Array<Record<string, import("./types").SubmissionAnswerValue>>,
) {
  let total = 0;
  for (const record of records) {
    for (const value of Object.values(record)) {
      if (value instanceof File) total += value.size;
    }
  }
  return total;
}

async function uploadAnswerFiles(
  store: LavaFormStore,
  record: Record<string, import("./types").SubmissionAnswerValue>,
  uploadedFileIds: string[],
) {
  for (const [key, value] of Object.entries(record)) {
    if (!(value instanceof File)) continue;
    const fileId = await store.uploadFile(value);
    record[key] = fileId;
    uploadedFileIds.push(fileId);
  }
}

export async function submitForm(
  store: LavaFormStore,
  form: FormWithFields,
  formData: FormData,
  plugins?: LavaFormPlugins,
): Promise<SubmitFormState> {
  const fieldsRecord = getSerializedFieldRecord(formData);
  const honeypotValue = formData.get(HONEYPOT_FIELD_NAME);
  if (typeof honeypotValue === "string" && honeypotValue.trim()) {
    return buildState(
      "error",
      "Unable to submit right now. Please refresh and try again.",
      empty,
      fieldsRecord,
    );
  }

  const availability = getFormAvailability(form);
  if (!availability.isAcceptingSubmissions) {
    return buildState(
      "error",
      availability.description
        ? `This form is not accepting submissions. ${availability.description}`
        : "This form is not accepting submissions right now.",
      empty,
      fieldsRecord,
    );
  }

  const fieldErrors: Record<string, string> = {};
  const submissionFields = form.fields.filter(
    (f) => f.scope === "submission" && f.type !== "page_break",
  );
  const memberFields = form.fields.filter(
    (f) => f.scope === "member" && f.type !== "page_break",
  );
  const answers: Record<string, import("./types").SubmissionAnswerValue> = {};
  const uniqueValidationEntries: Array<{
    field: (typeof form.fields)[number];
    value: import("./types").SubmissionAnswerValue;
    errorKey: string;
  }> = [];

  for (const field of submissionFields) {
    const name = `submission__${field.key}`;
    const rawVal = field.type === "checkbox" ? formData.getAll(name) : formData.get(name);
    const value = coerceFieldValue(field, rawVal);
    const error = validateFieldValue(field, value);
    if (error) fieldErrors[name] = error;
    answers[field.key] = value;
    if (!error && field.isUnique) {
      uniqueValidationEntries.push({ field, value, errorKey: name });
    }
  }

  const memberAnswers: Array<Record<string, import("./types").SubmissionAnswerValue>> = [];

  if (memberFields.length > 0) {
    const rawCount = formData.get("memberCount");
    const teamSize = Number(typeof rawCount === "string" ? rawCount.trim() : "");

    if (
      !Number.isInteger(teamSize) ||
      teamSize < form.teamMinMembers ||
      teamSize > form.teamMaxMembers
    ) {
      fieldErrors.memberCount = `Team size must be between ${form.teamMinMembers} and ${form.teamMaxMembers} (including leader).`;
    } else {
      const additionalMembers = Math.max(0, teamSize - 1);
      for (let i = 0; i < additionalMembers; i++) {
        const memberAnswer: Record<string, import("./types").SubmissionAnswerValue> = {};
        for (const field of memberFields) {
          const name = `member__${i}__${field.key}`;
          const rawVal = field.type === "checkbox" ? formData.getAll(name) : formData.get(name);
          const value = coerceFieldValue(field, rawVal);
          const error = validateFieldValue(field, value);
          if (error) fieldErrors[name] = `Member ${i + 1}: ${error}`;
          memberAnswer[field.key] = value;
          if (!error && field.isUnique) {
            uniqueValidationEntries.push({ field, value, errorKey: name });
          }
        }
        memberAnswers.push(memberAnswer);
      }
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return buildState(
      "error",
      "Please fix the highlighted fields and try again.",
      fieldErrors,
      fieldsRecord,
    );
  }

  const totalUploadBytes = getTotalUploadBytes([answers, ...memberAnswers]);
  if (totalUploadBytes > MAX_TOTAL_UPLOAD_BYTES) {
    return buildState(
      "error",
      "Combined uploads must be 25MB or less.",
      empty,
      fieldsRecord,
    );
  }

  let reservedUniqueValueIds: string[] = [];
  try {
    reservedUniqueValueIds = await store.reserveUniqueValues({
      formId: form.id,
      entries: uniqueValidationEntries,
    });
  } catch (error) {
    if (error instanceof UniqueFieldConflictError) {
      return buildState(
        "error",
        "Please fix the highlighted fields and try again.",
        error.fieldErrors,
        fieldsRecord,
      );
    }
    return buildState(
      "error",
      "Unable to verify unique field values right now. Please try again.",
      empty,
      fieldsRecord,
    );
  }

  const uploadedFileIds: string[] = [];
  try {
    await uploadAnswerFiles(store, answers, uploadedFileIds);
    for (const member of memberAnswers) {
      await uploadAnswerFiles(store, member, uploadedFileIds);
    }

    const payload = {
      formId: form.id,
      answers,
      memberAnswers,
      teamName: null,
    };

    const { id: submissionId } = await store.createSubmission(payload);
    await store.attachUniqueReservations(reservedUniqueValueIds, submissionId);

    const submission = await store.getSubmissionById(submissionId);
    if (submission) {
      const event = { form, submission, payload };
      await plugins?.sheets?.onSubmissionCreated?.(event);
      await plugins?.email?.onSubmissionCreated?.(event);
    }

    return buildState("success", getDefaultSuccessMessage(form));
  } catch (error) {
    try {
      await store.releaseUniqueReservations(reservedUniqueValueIds);
    } catch {
      // ignore cleanup errors
    }

    try {
      await store.deleteFiles(uploadedFileIds);
    } catch {
      // ignore cleanup errors
    }

    if (error instanceof UniqueFieldConflictError) {
      return buildState(
        "error",
        "Please fix the highlighted fields and try again.",
        error.fieldErrors,
        fieldsRecord,
      );
    }

    if (error instanceof FormSubmissionNotAllowedError) {
      return buildState("error", error.message, empty, fieldsRecord);
    }

    return buildState("error", "Unable to submit right now. Please try again.", empty, fieldsRecord);
  }
}

export async function createSubmitAction(
  store: LavaFormStore,
  getForm: () => Promise<FormWithFields | null>,
  plugins?: LavaFormPlugins,
) {
  return async function submitAction(
    prev: SubmitFormState,
    formData: FormData,
  ): Promise<SubmitFormState> {
    void prev;
    const formId = String(formData.get("formId") ?? "").trim();
    const slug = String(formData.get("slug") ?? "").trim();
    const form =
      (formId ? await store.getFormById(formId) : null) ??
      (slug ? await store.getFormBySlug(slug) : null) ??
      (await getForm());
    if (!form) {
      return buildState("error", "This form was not found.", empty);
    }
    return submitForm(store, form, formData, plugins);
  };
}
