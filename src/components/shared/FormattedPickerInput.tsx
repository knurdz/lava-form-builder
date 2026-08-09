"use client";

import { useRef, useState, type HTMLAttributes } from "react";
import { CalendarDays } from "lucide-react";
import {
  formatDateTimeForPicker,
  formatPickerDateForInput,
  formatPickerDateTimeForInput,
  formatStoredDateForPicker,
} from "../../core/date-format";

type FormattedPickerInputProps = {
  id?: string;
  name: string;
  mode: "date" | "datetime";
  defaultValue?: string | null;
  placeholder: string;
  className: string;
  inputMode?: HTMLAttributes<HTMLInputElement>["inputMode"];
  ariaLabel?: string;
  disabled?: boolean;
  required?: boolean;
  pattern?: string;
  onValueChange?: (value: string) => void;
};

type PickerElement = HTMLInputElement & {
  showPicker?: () => void;
};

function toPickerValue(mode: "date" | "datetime", value: string | null | undefined) {
  return mode === "date"
    ? formatStoredDateForPicker(value)
    : formatDateTimeForPicker(value);
}

function toDisplayValue(mode: "date" | "datetime", value: string | null | undefined) {
  return mode === "date"
    ? formatPickerDateForInput(value)
    : formatPickerDateTimeForInput(value);
}

export default function FormattedPickerInput({
  id,
  name,
  mode,
  defaultValue,
  placeholder,
  className,
  inputMode = "numeric",
  ariaLabel,
  disabled = false,
  required = false,
  pattern,
  onValueChange,
}: FormattedPickerInputProps) {
  const pickerRef = useRef<PickerElement | null>(null);
  const [textValue, setTextValue] = useState(() =>
    toDisplayValue(mode, defaultValue),
  );
  const [pickerValue, setPickerValue] = useState(() =>
    toPickerValue(mode, defaultValue),
  );

  const openPicker = () => {
    const input = pickerRef.current;
    if (!input || disabled) return;

    if (typeof input.showPicker === "function") {
      input.showPicker();
      return;
    }

    input.focus();
    input.click();
  };

  return (
    <div className="relative">
      <input
        id={id}
        name={name}
        type="text"
        value={textValue}
        onChange={(event) => {
          const nextValue = event.target.value;
          setTextValue(nextValue);
          onValueChange?.(nextValue);

          const nextPickerValue = toPickerValue(mode, nextValue);
          if (nextPickerValue || !nextValue.trim()) {
            setPickerValue(nextPickerValue);
          }
        }}
        placeholder={placeholder}
        inputMode={inputMode}
        disabled={disabled}
        required={required}
        pattern={pattern}
        className={`${className} pr-11`}
      />

      <button
        type="button"
        onClick={openPicker}
        disabled={disabled}
        aria-label={ariaLabel ?? (mode === "date" ? "Open calendar" : "Open date and time picker")}
        className="absolute inset-y-0 right-0 z-10 inline-flex w-11 items-center justify-center rounded-r-md text-zinc-500 transition hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-50 dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        <CalendarDays className="h-4.5 w-4.5" />
      </button>

      <input
        ref={pickerRef}
        type={mode === "date" ? "date" : "datetime-local"}
        value={pickerValue}
        disabled={disabled}
        onChange={(event) => {
          const nextPickerValue = event.target.value;
          setPickerValue(nextPickerValue);
          const displayVal = toDisplayValue(mode, nextPickerValue);
          setTextValue(displayVal);
          onValueChange?.(displayVal);
        }}
        tabIndex={-1}
        aria-label={ariaLabel ?? (mode === "date" ? "Select date" : "Select date and time")}
        className="pointer-events-none absolute right-0 top-1/2 h-px w-px -translate-y-1/2 opacity-0"
      />
    </div>
  );
}
