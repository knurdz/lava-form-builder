import type { FieldDefinition, ActionResult } from "../types";

export type FormBuilderFieldDraft = FieldDefinition;

export type FormBuilderActions = {
  createForm: (prev: ActionResult, formData: FormData) => Promise<ActionResult>;
  updateSettings: (prev: ActionResult, formData: FormData) => Promise<ActionResult>;
  deleteForm: (prev: ActionResult, formData: FormData) => Promise<ActionResult>;
  uploadBanner: (prev: ActionResult, formData: FormData) => Promise<ActionResult>;
  deleteBanner: (prev: ActionResult, formData: FormData) => Promise<ActionResult>;
  bulkSaveFields: (
    formId: string,
    fields: Array<
      Omit<FieldDefinition, "formId"> & {
        id: string;
      }
    >,
  ) => Promise<ActionResult>;
};

export type FormSubmissionsActions = {
  deleteSubmission: (prev: ActionResult, formData: FormData) => Promise<ActionResult>;
};
