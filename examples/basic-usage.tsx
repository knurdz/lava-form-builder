/**
 * Reference wiring for @knurdz/lava-form-builder (not a runnable app).
 */
import {
  FormAnalyticsCharts,
  FormBuilder,
  FormRenderer,
  FormSubmissions,
  buildFormOverview,
  createMemoryStore,
  createSubmitAction,
  getFormAvailability,
  type ActionResult,
  type FormBuilderActions,
  type FormSubmissionsActions,
  type LavaFormPlugins,
} from "../src/index";

const store = createMemoryStore();

const plugins: LavaFormPlugins = {
  email: {
    async onSubmissionCreated() {
      // Send SMTP / provider email when enabled on the form.
    },
  },
  sheets: {
    isOAuthConfigured: () => false,
    async getConnection() {
      return { connected: false };
    },
    async onSubmissionCreated() {
      // Append row to Google Sheet when enabled.
    },
  },
};

const builderActions: FormBuilderActions = {
  createForm: async (_prev, formData) => stubSuccess("Form created."),
  updateSettings: async (_prev) => stubSuccess("Settings saved."),
  deleteForm: async (_prev) => stubSuccess("Form deleted."),
  uploadBanner: async (_prev) => stubSuccess("Banner uploaded."),
  deleteBanner: async (_prev) => stubSuccess("Banner removed."),
  bulkSaveFields: async () => stubSuccess("Fields saved."),
};

const submissionActions: FormSubmissionsActions = {
  deleteSubmission: async (_prev) => stubSuccess("Submission deleted."),
};

function stubSuccess(message: string): ActionResult {
  return { status: "success", message, toastKey: Date.now() };
}

export async function ExampleAdminPage() {
  const forms = await store.listForms();
  const selectedForm = forms[0] ? await store.getFormBySlug(forms[0].slug) : null;
  const overview = await buildFormOverview(store, { kindLabels: { default: "General" } });

  const submit =
    selectedForm &&
    (await createSubmitAction(store, async () => selectedForm, plugins));

  return (
    <div className="lfb-root space-y-12 p-6">
      <FormBuilder
        forms={forms}
        selectedForm={selectedForm}
        bannerUrl={null}
        googleSheetsConnection={(await plugins.sheets?.getConnection()) ?? null}
        googleSheetsOAuthConfigured={plugins.sheets?.isOAuthConfigured() ?? false}
        publicFormBaseUrl="forms.example.com"
        actions={builderActions}
      />

      {selectedForm && submit ? (
        <FormRenderer
          form={selectedForm}
          availability={getFormAvailability(selectedForm)}
          slug={selectedForm.slug}
          submit={submit}
        />
      ) : null}

      <FormSubmissions
        forms={forms}
        formsWithFields={selectedForm ? [selectedForm] : []}
        form={selectedForm}
        submissionPage={{ submissions: [], total: 0, page: 1, pageSize: 20 }}
        selectedSubmission={null}
        onDeleteSubmission={submissionActions.deleteSubmission}
        submissionsBasePath="/responses"
      />

      <FormAnalyticsCharts analytics={overview.analytics} kindLabels={{ default: "General" }} />
    </div>
  );
}
