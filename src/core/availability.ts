import type { FormDefinition, FormAvailability } from "../types";
import { formatDateTimeDisplay } from "./date-format";

export function getFormAvailability(form: FormDefinition): FormAvailability {
  const now = new Date();
  const openAt = form.openAt ? new Date(form.openAt) : null;
  const closeAt = form.closeAt ? new Date(form.closeAt) : null;

  if (openAt && now < openAt) {
    return {
      state: "upcoming",
      label: "Opens soon",
      description: `Opens ${formatDateTimeDisplay(form.openAt!)}`,
      isAcceptingSubmissions: false,
    };
  }

  if (form.status === "closed") {
    return {
      state: "closed",
      label: "Closed",
      description: closeAt ? `Closed on ${formatDateTimeDisplay(form.closeAt!)}` : null,
      isAcceptingSubmissions: false,
    };
  }

  if (form.status === "draft") {
    return {
      state: "upcoming",
      label: "Coming soon",
      description: closeAt ? `Closes ${formatDateTimeDisplay(form.closeAt!)}` : null,
      isAcceptingSubmissions: false,
    };
  }

  if (closeAt && now > closeAt) {
    return {
      state: "closed",
      label: "Closed",
      description: `Closed on ${formatDateTimeDisplay(form.closeAt!)}`,
      isAcceptingSubmissions: false,
    };
  }

  return {
    state: "open",
    label: "Open now",
    description: closeAt ? `Closes ${formatDateTimeDisplay(form.closeAt!)}` : null,
    isAcceptingSubmissions: true,
  };
}

export const DEFAULT_SUCCESS_MESSAGE =
  "Your response has been recorded successfully.";

export function getDefaultSuccessMessage(form: FormDefinition) {
  return form.successMessage || DEFAULT_SUCCESS_MESSAGE;
}
