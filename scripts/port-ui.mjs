#!/usr/bin/env node
/**
 * Ports Deploy Sprint form UI into lava-form-builder with library-friendly imports.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ds = join(root, "..", "deploy-sprint", "src");

const replacements = [
  [/import Link from "next\/link";?\n/g, ""],
  [/import \{ useRouter \} from "next\/navigation";?\n/g, ""],
  [
    /import \{[\s\S]*?\} from "@\/app\/admin\/registrations\/actions";?\n/g,
    "",
  ],
  [/import \{ deleteRegistrationSubmissionAction \} from "@\/app\/admin\/registrations\/actions";?\n/g, ""],
  [/from "@\/lib\/registration-types"/g, 'from "../../types"'],
  [/from "@\/lib\/registration-field-pattern"/g, 'from "../../core/pattern"'],
  [/from "@\/lib\/registration-form-layout"/g, 'from "../../core/layout"'],
  [/from "@\/lib\/registration-form-draft"/g, 'from "../../core/draft"'],
  [/from "@\/lib\/registration-common-fields"/g, 'from "../../core/common-fields"'],
  [/from "@\/lib\/date-format"/g, 'from "../../core/date-format"'],
  [/from "@\/lib\/inline-markdown"/g, 'from "../shared/InlineMarkdown"'],
  [/from "@\/lib\/registrations"/g, 'from "../../core/validate"'],
  [/from "@\/lib\/google-sheets"/g, 'from "../../types"'],
  [/from "@\/components\/FormattedPickerInput"/g, 'from "../shared/FormattedPickerInput"'],
  [/from "@\/components\/icons\/WhatsAppIcon"/g, 'from "../shared/WhatsAppIcon"'],
  [/from "@\/components\/admin\/FormSelectorDropdown"/g, 'from "../shared/FormSelectorDropdown"'],
  [/from "@\/components\/admin\/OptimisticSubmissionDrawer"/g, 'from "../shared/OptimisticSubmissionDrawer"'],
  [/from "@\/components\/admin\/SubmissionRowInteractive"/g, 'from "../shared/SubmissionRowInteractive"'],
  [/from "@\/components\/registration\/FormOpenCountdown"/g, 'from "../shared/FormOpenCountdown"'],
  [/RegistrationAdminActionState/g, "ActionResult"],
  [/GoogleSheetsConnection/g, "SheetsConnection"],
  [/MAX_REGISTRATION_FORMS/g, "maxForms"],
  [/linkedEventTitle/g, "linkedResourceTitle"],
  [/buildRegistrationFormPages/g, "buildFormPages"],
  [/readRegistrationDraft/g, "readFormDraft"],
  [/writeRegistrationDraft/g, "writeFormDraft"],
  [/clearRegistrationDraft/g, "clearFormDraft"],
  [/buildRegistrationFormData/g, "buildFormSubmitData"],
  [/RegistrationOverviewAnalytics/g, "FormOverviewAnalytics"],
  [/RegistrationOverviewTrendPoint/g, "FormOverviewTrendPoint"],
  [/<Link(\s)/g, "<a$1"],
  [/href=\{([^}]+)\}/g, "href={$1}"],
  [/<\/Link>/g, "</a>"],
  [/const FORM_HOST = "[^"]+";/g, ""],
  [/createRegistrationFormAction/g, "actions.createForm"],
  [/updateRegistrationFormSettingsAction/g, "actions.updateSettings"],
  [/deleteRegistrationFormAction/g, "actions.deleteForm"],
  [/uploadFormBannerAction/g, "actions.uploadBanner"],
  [/deleteFormBannerAction/g, "actions.deleteBanner"],
  [/bulkSaveRegistrationFieldsAction/g, "actions.bulkSaveFields"],
  [/deleteRegistrationSubmissionAction/g, "onDeleteSubmission"],
  [/const router = useRouter\(\);[\s\S]*?router\.refresh\(\);[\s\S]*?\}, \[settingsState\.toastKey, router\]\);/m, ""],
];

function portFile(sourceRel, destRel, extra = "") {
  const source = join(ds, sourceRel);
  let content = readFileSync(source, "utf8");
  for (const [pattern, replacement] of replacements) {
    content = content.replace(pattern, replacement);
  }
  content = extra + content;
  const dest = join(root, "src", "components", destRel);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, content);
  console.log("Wrote", destRel);
}

const builderHeader = `import type { FormBuilderActions } from "./host-props";
import type { ActionResult, FormDefinition, FormWithFields, SheetsConnection } from "../../types";
import { DEFAULT_MAX_FORMS } from "../../types";

export type FormBuilderProps = {
  forms: FormDefinition[];
  selectedForm: FormWithFields | null;
  bannerUrl: string | null;
  googleSheetsConnection: SheetsConnection | null;
  googleSheetsOAuthConfigured: boolean;
  linkedResourceTitle?: string | null;
  publicFormBaseUrl: string;
  maxForms?: number;
  actions: FormBuilderActions;
  formEditorHref?: (slug: string) => string;
  responsesHref?: (slug: string) => string;
  liveFormHref?: (slug: string) => string;
};

`;

portFile(
  "components/admin/AdminRegistrationsManager.tsx",
  "FormBuilder.tsx",
  builderHeader,
);

let builder = readFileSync(join(root, "src/components/FormBuilder.tsx"), "utf8");
builder = builder.replace(
  /export default function AdminRegistrationsManager\(\{([\s\S]*?)linkedResourceTitle,\n\}: \{[\s\S]*?\}\) \{/,
  `export function FormBuilder({
$1linkedResourceTitle,
  publicFormBaseUrl,
  maxForms = DEFAULT_MAX_FORMS,
  actions,
  formEditorHref = (slug) => \`?form=\${slug}\`,
  responsesHref = (slug) => \`/responses?form=\${slug}\`,
  liveFormHref = (slug) => \`/\${slug}\`,
}: FormBuilderProps) {`,
);
builder = builder.replace(/FORM_HOST/g, "publicFormBaseUrl");
builder = builder.replace(
  /function CreateFormPanel\(\{ formCount, onCancel \}/,
  "function CreateFormPanel({ formCount, onCancel, actions }: { formCount: number; onCancel: () => void; actions: FormBuilderActions })",
);
builder = builder.replace(
  /<CreateFormPanel formCount=\{formCount\} onCancel=\{\(\) => setShowCreate\(false\)\} \/>/,
  "<CreateFormPanel formCount={formCount} onCancel={() => setShowCreate(false)} actions={actions} />",
);
writeFileSync(join(root, "src/components/FormBuilder.tsx"), builder);

portFile("components/registration/PublicRegistrationForm.tsx", "FormRenderer.tsx");
portFile(
  "components/admin/AdminRegistrationSubmissionsPanel.tsx",
  "FormSubmissions.tsx",
);
portFile(
  "components/admin/AdminRegistrationAnalyticsCharts.tsx",
  "FormAnalyticsCharts.tsx",
);

console.log("Port complete. Manual fixes may still be required.");
