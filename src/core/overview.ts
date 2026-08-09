import type {
  FormDefinition,
  FormOverview,
  FormOverviewAnalytics,
  FormOverviewCategoryBreakdownPoint,
  FormOverviewFormBreakdownPoint,
  FormOverviewItem,
  FormOverviewTrendPoint,
  SubmissionDetail,
} from "../types";
import {
  COLOMBO_OFFSET,
  DISPLAY_TIME_ZONE,
  getStoredDateFromIso,
} from "./date-format";
import { getFormAvailability } from "./availability";
import type { LavaFormStore } from "../store";

const ANALYTICS_TREND_DAYS = 14;
const ANALYTICS_WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function shiftDisplayDate(dateKey: string, deltaDays: number) {
  const anchor = new Date(`${dateKey}T12:00:00${COLOMBO_OFFSET}`);
  anchor.setUTCDate(anchor.getUTCDate() + deltaDays);
  return getStoredDateFromIso(anchor);
}

function formatAnalyticsDateLabel(dateKey: string) {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      timeZone: DISPLAY_TIME_ZONE,
    }).format(new Date(`${dateKey}T12:00:00${COLOMBO_OFFSET}`));
  } catch {
    return dateKey;
  }
}

function getAnalyticsWeekdayLabel(value: string | Date) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      timeZone: DISPLAY_TIME_ZONE,
    }).format(new Date(value));
  } catch {
    return "Mon";
  }
}

function createTrendSeed(days: number): FormOverviewTrendPoint[] {
  const todayKey = getStoredDateFromIso(new Date());
  if (!todayKey) return [];

  return Array.from({ length: days }, (_, index) =>
    shiftDisplayDate(todayKey, index - (days - 1)),
  )
    .filter((value): value is string => Boolean(value))
    .map((date) => ({
      date,
      label: formatAnalyticsDateLabel(date),
      total: 0,
      byKind: {},
    }));
}

type SubmissionDocLike = {
  formId: string;
  createdAt: string;
};

export function buildFormOverviewAnalytics(
  items: FormOverviewItem[],
  submissionDocs: SubmissionDocLike[],
  kindLabels: Record<string, string> = {},
): FormOverviewAnalytics {
  const trend = createTrendSeed(ANALYTICS_TREND_DAYS);
  const trendByDate = new Map(trend.map((point) => [point.date, point] as const));
  const formsById = new Map(items.map((item) => [item.form.id, item.form] as const));

  const formBreakdown: FormOverviewFormBreakdownPoint[] = [...items]
    .map((item) => ({
      formId: item.form.id,
      label: item.form.title,
      kind: item.form.kind,
      availabilityState: item.availability.state,
      submissions: item.submissionCount,
    }))
    .sort((a, b) => b.submissions - a.submissions || a.label.localeCompare(b.label));

  const kindCounts = new Map<string, number>();
  for (const item of formBreakdown) {
    kindCounts.set(item.kind, (kindCounts.get(item.kind) ?? 0) + item.submissions);
  }

  const weekdayCounts = new Map<string, number>(
    ANALYTICS_WEEKDAY_LABELS.map((label) => [label, 0] as const),
  );

  for (const doc of submissionDocs) {
    const form = formsById.get(doc.formId.trim());
    if (!form) continue;

    const dateKey = getStoredDateFromIso(doc.createdAt);
    const trendPoint = dateKey ? trendByDate.get(dateKey) : null;
    if (trendPoint) {
      trendPoint.total += 1;
      trendPoint.byKind[form.kind] = (trendPoint.byKind[form.kind] ?? 0) + 1;
    }

    const weekday = getAnalyticsWeekdayLabel(doc.createdAt);
    if (weekdayCounts.has(weekday)) {
      weekdayCounts.set(weekday, (weekdayCounts.get(weekday) ?? 0) + 1);
    }
  }

  const kindBreakdown: FormOverviewCategoryBreakdownPoint[] = [...kindCounts.entries()]
    .map(([key, value]) => ({
      key,
      label: kindLabels[key] ?? key,
      value,
    }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));

  const last7 = trend.slice(-7);
  const prev7 = trend.slice(-14, -7);
  const last7DaysSubmissions = last7.reduce((t, p) => t + p.total, 0);
  const previous7DaysSubmissions = prev7.reduce((t, p) => t + p.total, 0);
  const topForm = formBreakdown[0];
  const peakDay = [...trend].sort((a, b) => b.total - a.total)[0];
  const weekdayBreakdown = ANALYTICS_WEEKDAY_LABELS.map((weekday) => ({
    weekday,
    submissions: weekdayCounts.get(weekday) ?? 0,
  }));
  const busiestWeekday = [...weekdayBreakdown].sort(
    (a, b) => b.submissions - a.submissions,
  )[0];

  return {
    trend,
    formBreakdown,
    kindBreakdown,
    weekdayBreakdown,
    summary: {
      last7DaysSubmissions,
      previous7DaysSubmissions,
      averageSubmissionsPerForm:
        items.length > 0
          ? Math.round(
              (items.reduce((t, i) => t + i.submissionCount, 0) / items.length) * 10,
            ) / 10
          : 0,
      topFormTitle: topForm?.submissions ? topForm.label : null,
      topFormCount: topForm?.submissions ?? 0,
      peakDayLabel: peakDay?.total ? peakDay.label : null,
      peakDayCount: peakDay?.total ?? 0,
      busiestWeekday:
        busiestWeekday && busiestWeekday.submissions > 0 ? busiestWeekday.weekday : null,
      busiestWeekdayCount: busiestWeekday?.submissions ?? 0,
    },
  };
}

export async function buildFormOverview(
  store: LavaFormStore,
  options?: {
    kindLabels?: Record<string, string>;
    recentPageSize?: number;
  },
): Promise<FormOverview> {
  const recentPageSize = options?.recentPageSize ?? 6;
  const [forms, recentPage, allSubmissions] = await Promise.all([
    store.listForms(),
    store.listSubmissions({ page: 1, pageSize: recentPageSize }),
    store.listAllSubmissionDetails({}),
  ]);

  const submissionCounts = new Map<string, number>();
  for (const submission of allSubmissions) {
    submissionCounts.set(
      submission.formId,
      (submissionCounts.get(submission.formId) ?? 0) + 1,
    );
  }

  const items: FormOverviewItem[] = forms.map((form) => ({
    form,
    availability: getFormAvailability(form),
    submissionCount: submissionCounts.get(form.id) ?? 0,
  }));

  const submissionDocs = allSubmissions.map((s) => ({
    formId: s.formId,
    createdAt: s.createdAt,
  }));

  return {
    forms: items,
    totalSubmissions: items.reduce((t, i) => t + i.submissionCount, 0),
    recentSubmissions: recentPage.submissions,
    analytics: buildFormOverviewAnalytics(
      items,
      submissionDocs,
      options?.kindLabels,
    ),
  };
}

export function mapSubmissionToOverviewDoc(submission: SubmissionDetail) {
  return { formId: submission.formId, createdAt: submission.createdAt };
}
