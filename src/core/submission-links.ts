export function normalizeCommonFormSlugs(value: string[] | null | undefined) {
  return Array.from(new Set((value ?? []).map((item) => item.trim()).filter(Boolean)));
}

export function normalizeCommonFieldKey(value: string | null | undefined) {
  return value?.trim() ?? "";
}

export function buildPageHref({
  slug,
  page,
  from,
  to,
  submissionId,
  pageSize,
  searchField,
  searchQuery,
  mode,
  commonFormSlugs,
  commonFieldKey,
  basePath = "/admin/registrations",
}: {
  slug?: string | null;
  page?: number;
  from?: string | null;
  to?: string | null;
  submissionId?: string | null;
  pageSize?: number | "all" | null;
  searchField?: string | null;
  searchQuery?: string | null;
  mode?: "single" | "common";
  commonFormSlugs?: string[] | null;
  commonFieldKey?: string | null;
  basePath?: string;
}) {
  const params = new URLSearchParams();
  const normalizedCommonFormSlugs = normalizeCommonFormSlugs(commonFormSlugs);
  const normalizedCommonFieldKey = normalizeCommonFieldKey(commonFieldKey);

  if (mode === "common") {
    params.set("mode", "common");
    if (normalizedCommonFormSlugs.length > 0) {
      params.set("commonForms", normalizedCommonFormSlugs.join(","));
    }
    if (normalizedCommonFieldKey) {
      params.set("commonField", normalizedCommonFieldKey);
    }
  } else if (slug) {
    params.set("form", slug);
  }

  if (page && page > 1) {
    params.set("page", String(page));
  }

  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (submissionId) params.set("submission", submissionId);
  if (pageSize && pageSize !== 15) params.set("pageSize", String(pageSize));
  if (searchField) params.set("searchField", searchField);
  if (searchQuery) params.set("searchQuery", searchQuery);

  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}
