import type { MouseEvent } from "react";

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
