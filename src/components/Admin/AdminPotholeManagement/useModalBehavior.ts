import { useEffect, useRef } from "react";
import type { RefObject } from "react";

const FOCUSABLE_SELECTOR =
  'a[href], button:not(:disabled), textarea:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])';

/**
 * Keyboard behaviour shared by the pothole dialogs: moves focus into the
 * dialog, keeps Tab inside it, closes on Escape, and gives focus back on close.
 *
 * Pass `isActive = false` while another dialog is open on top of this one, so
 * Escape and Tab only act on the top dialog.
 */
const useModalBehavior = (
  dialogRef: RefObject<HTMLElement | null>,
  onClose: () => void,
  isActive = true,
) => {
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();

    return () => previouslyFocused?.focus?.();
  }, [dialogRef]);

  useEffect(() => {
    if (!isActive) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      const dialog = dialogRef.current;
      if (event.key !== "Tab" || !dialog) {
        return;
      }

      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (!first || !dialog.contains(active)) {
        event.preventDefault();
        first?.focus();
      } else if (event.shiftKey && (active === first || active === dialog)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [dialogRef, isActive]);
};

export default useModalBehavior;
