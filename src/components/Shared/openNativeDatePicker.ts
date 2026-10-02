import type { MouseEvent } from "react";

/**
 * Opens the browser's own picker on a native `type="date"` field.
 *
 * Pages that keep their native date input but adopt the shared calendar-in-
 * input visuals from `DatePickerInput.css` (same `calendar` image, wrapper and
 * styles as the `DatePickerInput` component) hide
 * `::-webkit-calendar-picker-indicator`, so the custom image inside
 * `.date-picker-toggle` becomes the click target. Wired up as the toggle's
 * `onClick`, it resolves the input from the sibling position defined by the
 * shared wrapper markup and reuses the existing native picker — no additional
 * date-picker library or duplicate calendar is introduced.
 */
export const openNativeDatePicker = (event: MouseEvent<HTMLButtonElement>) => {
  const field = event.currentTarget.previousElementSibling;

  if (!(field instanceof HTMLInputElement)) {
    return;
  }

  try {
    field.showPicker();
  } catch {
    // Browsers without `showPicker()` (or without user activation) still let
    // the user type the date manually, so fall back to focusing the field.
    field.focus();
  }
};
