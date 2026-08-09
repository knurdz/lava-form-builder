<p align="center">
  <img
    src="https://raw.githubusercontent.com/knurdz/lava-form-builder/main/assets/lava-form-builder-icon.png"
    alt="lava-form-builder icon"
    width="128"
    height="128"
  />
</p>

<h1 align="center">lava-form-builder</h1>

<p align="center">
  <strong>Google Forms-like React UI: builder, renderer, submissions, and analytics, powered by your own database.</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@knurdz/lava-form-builder"><img src="https://img.shields.io/npm/v/@knurdz/lava-form-builder?style=flat-square&label=npm&color=CB3837" alt="npm version" /></a>
  <a href="https://github.com/knurdz/lava-form-builder/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="MIT license" /></a>
  <a href="https://github.com/knurdz/lava-form-builder"><img src="https://img.shields.io/badge/React-18%20%7C%2019-61DAFB?style=flat-square&logo=react&logoColor=white" alt="React 18 | 19" /></a>
</p>

<p align="center">
  <code>@knurdz/lava-form-builder</code> · plug-in components · optional Sheets / email / analytics plugins
</p>

---

## Overview

**lava-form-builder** extracts the Deploy Sprint-style registration experience into a reusable library:

| Surface | Export | What it does |
|--------|--------|----------------|
| Admin builder | `FormBuilder` | Drag-reorder fields, settings, banners, integrations toggles |
| Public fill | `FormRenderer` | Multi-page forms, team roster, drafts, file uploads |
| Responses | `FormSubmissions` | Filter, paginate, optimistic detail drawer |
| Insights | `FormAnalyticsCharts` | Trends, breakdowns, summary stats |

Persistence is **your job**: implement [`LavaFormStore`](src/store.ts) against Postgres, Appwrite, Firebase, or anything else. The library ships [`createMemoryStore()`](src/memory-store.ts) for demos and tests.

---

## Install

```bash
npm install @knurdz/lava-form-builder
```

**Peers:** `react` and `react-dom` (^18.2 or ^19).

Styles **auto-inject** when you import the package. To load CSS yourself:

```tsx
import "@knurdz/lava-form-builder/styles.css";
```

---

## Quick start

```tsx
import {
  FormBuilder,
  FormRenderer,
  createMemoryStore,
  createSubmitAction,
  getFormAvailability,
} from "@knurdz/lava-form-builder";

const store = createMemoryStore({ publicFileBaseUrl: "https://cdn.example.com" });

const actions = {
  createForm: async (_prev, formData) => {
    await store.createForm({
      slug: String(formData.get("slug")),
      title: String(formData.get("title")),
      description: null,
      kind: "default",
      sortOrder: 0,
    });
    return { status: "success", message: "Form created.", toastKey: Date.now() };
  },
  // updateSettings, deleteForm, uploadBanner, deleteBanner, bulkSaveFields …
};

export function AdminForms({ form, forms }) {
  const submit = createSubmitAction(store, async () => form);

  return (
    <>
      <FormBuilder
        forms={forms}
        selectedForm={form}
        bannerUrl={null}
        googleSheetsConnection={null}
        googleSheetsOAuthConfigured={false}
        publicFormBaseUrl="forms.example.com"
        actions={actions}
      />
      {form ? (
        <FormRenderer
          form={form}
          availability={getFormAvailability(form)}
          slug={form.slug}
          submit={submit}
        />
      ) : null}
    </>
  );
}
```

Full wiring sketch: [`examples/basic-usage.tsx`](examples/basic-usage.tsx).

---

## Architecture

```text
┌─────────────────────────────────────────────────────────┐
│  Host app (auth, routes, revalidation)                  │
│  └── LavaFormStore implementation (your database)       │
└───────────────────────────┬─────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────┐
│  @knurdz/lava-form-builder                              │
│  FormBuilder · FormRenderer · FormSubmissions · Charts  │
│  submitForm() · buildFormOverview() · validation/layout │
└─────────────────────────────────────────────────────────┘
```

### Optional plugins

```ts
type LavaFormPlugins = {
  sheets?: LavaFormSheetsPlugin;   // Google Sheets sync after submit
  email?: LavaFormEmailPlugin;     // Confirmation email + contacts
  analytics?: LavaFormAnalyticsPlugin;
};
```

Pass plugins to **`submitForm(store, form, formData, plugins)`** or **`createSubmitAction`**. If a plugin is missing, related builder UI stays disabled or hidden.

---

## Theming

Wrap surfaces in **`.lfb-root`** and override CSS variables:

| Variable | Role |
|----------|------|
| `--lfb-bg` | Surface background |
| `--lfb-fg` | Primary text |
| `--lfb-border` | Borders |
| `--lfb-muted` | Secondary text |
| `--lfb-accent` | Focus / links |

Internal Tailwind utilities are compiled into **`styles.css`**; hosts do **not** need Tailwind installed.

The submission drawer creates **`#lava-form-builder-drawer-portal`** on `document.body` when needed (full-viewport overlay).

---

## Publishing

1. Bump **`version`** in `package.json` on `main`.
2. **Draft Release** workflow opens/updates a draft GitHub Release.
3. Publish the release → **Publish Package** ships to [npm](https://www.npmjs.com/package/@knurdz/lava-form-builder) (OIDC, public) and [GitHub Packages](https://github.com/orgs/knurdz/packages) (`npm publish --access public`).

If a GitHub Packages version was already published as **private**, open the package on GitHub → **Package settings** → **Change visibility** → **Public** (one-time for that package).

Repo: **[github.com/knurdz/lava-form-builder](https://github.com/knurdz/lava-form-builder)**

---

## License

MIT · [Knurdz](https://github.com/knurdz)
