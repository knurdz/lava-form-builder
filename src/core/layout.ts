import type { FieldDefinition } from "../types";

export function sortFormFieldsByBuilderOrder(fields: FieldDefinition[]) {
  return [...fields].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.label.localeCompare(b.label);
  });
}

export type FormPageLayout = {
  leading: FieldDefinition[];
  memberFields: FieldDefinition[];
  deferred: FieldDefinition[];
  trailing: FieldDefinition[];
};

export type MemberPaginationStart = "fromFirst" | "afterFirst";

export type FormLayoutItem =
  | { kind: "submission"; field: FieldDefinition }
  | { kind: "teamSize" }
  | {
      kind: "memberRoster";
      fields: FieldDefinition[];
      paginatePerMember?: boolean;
      memberPaginationStart?: MemberPaginationStart;
      memberIndex?: number;
    };

type RawFormPage = {
  fields: FieldDefinition[];
  memberBreakBeforeMemberFieldCounts: number[];
};

function isSandwichedSubmission(index: number, fields: FieldDefinition[]): boolean {
  const field = fields[index];
  if (field.scope !== "submission") return false;
  const hasMemberBefore = fields.slice(0, index).some((f) => f.scope === "member");
  const hasMemberAfter = fields.slice(index + 1).some((f) => f.scope === "member");
  return hasMemberBefore && hasMemberAfter;
}

export function classifyPageFields(fieldsOnPage: FieldDefinition[]): FormPageLayout {
  const leading: FieldDefinition[] = [];
  const memberFields: FieldDefinition[] = [];
  const deferred: FieldDefinition[] = [];
  const trailing: FieldDefinition[] = [];

  const firstMemberIndex = fieldsOnPage.findIndex((f) => f.scope === "member");

  for (let i = 0; i < fieldsOnPage.length; i++) {
    const field = fieldsOnPage[i];
    if (field.scope === "member") {
      memberFields.push(field);
      continue;
    }

    if (isSandwichedSubmission(i, fieldsOnPage)) {
      deferred.push(field);
    } else if (firstMemberIndex === -1 || i < firstMemberIndex) {
      leading.push(field);
    } else {
      trailing.push(field);
    }
  }

  return { leading, memberFields, deferred, trailing };
}

export function resolveMemberPaginationStart(
  memberBreakBeforeMemberFieldCounts: number[],
): MemberPaginationStart | null {
  if (memberBreakBeforeMemberFieldCounts.length === 0) return null;

  // Break before any member field → each member on its own page (after team size / leader).
  if (memberBreakBeforeMemberFieldCounts.some((count) => count === 0)) {
    return "fromFirst";
  }

  // Break after one or more member fields (middle / last) → Member 1 stays on the first page.
  return "afterFirst";
}

export function flattenPageLayout(
  layout: FormPageLayout,
  options: { memberPaginationStart?: MemberPaginationStart | null } = {},
): FormLayoutItem[] {
  const items: FormLayoutItem[] = [];
  const memberPaginationStart = options.memberPaginationStart ?? null;

  if (layout.memberFields.length > 0) {
    items.push({ kind: "teamSize" });
  }

  for (const field of layout.leading) {
    items.push({ kind: "submission", field });
  }

  if (layout.memberFields.length > 0) {
    items.push({
      kind: "memberRoster",
      fields: layout.memberFields,
      ...(memberPaginationStart
        ? { paginatePerMember: true, memberPaginationStart }
        : {}),
    });
  }

  for (const field of layout.deferred) {
    items.push({ kind: "submission", field });
  }

  for (const field of layout.trailing) {
    items.push({ kind: "submission", field });
  }

  return items;
}

export function getParticipantLabel(index: number): string {
  return `Member ${index + 1}`;
}

export function getAdditionalMemberCount(teamSize: number): number {
  return Math.max(0, teamSize - 1);
}

function buildRawFormPages(fields: FieldDefinition[]): RawFormPage[] {
  const sorted = sortFormFieldsByBuilderOrder(fields);
  const rawPages: RawFormPage[] = [{ fields: [], memberBreakBeforeMemberFieldCounts: [] }];

  for (const field of sorted) {
    if (field.type === "page_break") {
      if (field.scope === "member") {
        const currentPage = rawPages[rawPages.length - 1];
        const memberFieldsBeforeBreak = currentPage.fields.filter(
          (pageField) => pageField.scope === "member",
        ).length;
        currentPage.memberBreakBeforeMemberFieldCounts.push(memberFieldsBeforeBreak);
        continue;
      }

      rawPages.push({ fields: [], memberBreakBeforeMemberFieldCounts: [] });
      continue;
    }

    rawPages[rawPages.length - 1].fields.push(field);
  }

  return rawPages.filter((page) => page.fields.length > 0);
}

export function buildFormPages(fields: FieldDefinition[]): FormLayoutItem[][] {
  return buildRawFormPages(fields).map((page) =>
    flattenPageLayout(classifyPageFields(page.fields), {
      memberPaginationStart: resolveMemberPaginationStart(
        page.memberBreakBeforeMemberFieldCounts,
      ),
    }),
  );
}

export function expandPagesForMemberPagination(
  pages: FormLayoutItem[][],
  memberIndexes: number[],
): FormLayoutItem[][] {
  const safeIndexes = memberIndexes.length > 0 ? memberIndexes : [0];

  const result: FormLayoutItem[][] = [];

  for (const page of pages) {
    const rosterIndex = page.findIndex(
      (item) => item.kind === "memberRoster" && item.paginatePerMember,
    );

    if (rosterIndex < 0) {
      result.push(page);
      continue;
    }

    const roster = page[rosterIndex];
    if (roster.kind !== "memberRoster") {
      result.push(page);
      continue;
    }

    const before = page.slice(0, rosterIndex);
    const after = page.slice(rosterIndex + 1);
    const startMode = roster.memberPaginationStart ?? "afterFirst";

    if (safeIndexes.length === 1) {
      if (startMode === "fromFirst" && before.length > 0) {
        result.push(before);
        result.push([{ ...roster, memberIndex: safeIndexes[0] }, ...after]);
      } else {
        result.push([
          ...before,
          { ...roster, memberIndex: safeIndexes[0] },
          ...after,
        ]);
      }
      continue;
    }

    if (startMode === "fromFirst") {
      if (before.length > 0) {
        result.push(before);
      }

      safeIndexes.forEach((memberIdx, position) => {
        const isLast = position === safeIndexes.length - 1;
        const pageItems: FormLayoutItem[] = [{ ...roster, memberIndex: memberIdx }];
        if (isLast) {
          pageItems.push(...after);
        }
        result.push(pageItems);
      });
      continue;
    }

    // afterFirst: Member 1 shares the first page with team size / leader fields.
    safeIndexes.forEach((memberIdx, position) => {
      const isFirst = position === 0;
      const isLast = position === safeIndexes.length - 1;
      const pageItems: FormLayoutItem[] = [];

      if (isFirst) {
        pageItems.push(...before);
      }

      pageItems.push({ ...roster, memberIndex: memberIdx });

      if (isLast) {
        pageItems.push(...after);
      }

      result.push(pageItems);
    });
  }

  return result;
}

export function getMemberFieldsFromPages(pages: FormLayoutItem[][]): FieldDefinition[] {
  const seen = new Set<string>();
  const memberFields: FieldDefinition[] = [];

  for (const page of pages) {
    for (const item of page) {
      if (item.kind !== "memberRoster") continue;
      for (const field of item.fields) {
        if (seen.has(field.id)) continue;
        seen.add(field.id);
        memberFields.push(field);
      }
    }
  }

  return memberFields;
}

export function pageHasMemberRoster(pages: FormLayoutItem[][], pageIndex: number): boolean {
  return (pages[pageIndex] ?? []).some((item) => item.kind === "memberRoster");
}

export function findPageIndexForFieldError(
  pages: FormLayoutItem[][],
  errorKey: string,
): number {
  if (errorKey === "memberCount") {
    for (let i = 0; i < pages.length; i++) {
      if (pages[i].some((item) => item.kind === "teamSize")) return i;
    }
    return 0;
  }

  if (errorKey.startsWith("submission__")) {
    const key = errorKey.slice("submission__".length);
    for (let i = 0; i < pages.length; i++) {
      if (
        pages[i].some(
          (item) => item.kind === "submission" && item.field.key === key,
        )
      ) {
        return i;
      }
    }
    return 0;
  }

  if (errorKey.startsWith("member__")) {
    const parts = errorKey.split("__");
    const memberIndexFromKey = parts[1] ? Number(parts[1]) : Number.NaN;
    const fieldKey = parts[2];
    if (fieldKey) {
      for (let i = 0; i < pages.length; i++) {
        const match = pages[i].some((item) => {
          if (item.kind !== "memberRoster") return false;
          if (!item.fields.some((field) => field.key === fieldKey)) return false;
          if (
            item.memberIndex !== undefined &&
            Number.isFinite(memberIndexFromKey) &&
            item.memberIndex !== memberIndexFromKey
          ) {
            return false;
          }
          return true;
        });
        if (match) return i;
      }
    }
  }

  return 0;
}
