import { useCallback, useEffect, useState } from "react";

/**
 * Breakpoint (px) below which the sidebars behave as slide-in drawers
 * instead of the persistent icon rail. Must match the `@media (max-width:
 * 768px)` drawer rules in src/Styles/responsive.css.
 */
export const MOBILE_DRAWER_BREAKPOINT = "(max-width: 768px)";

type ResponsiveSidebar = {
  /** Whether the drawer is currently slid in (only meaningful ≤ 768px). */
  isDrawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
};

/**
 * Shared drawer state for the Resident and Admin sidebars.
 *
 * - Tracks the `max-width: 768px` media query so state resets cleanly when
 *   the viewport crosses the breakpoint (e.g. rotating a tablet, resizing).
 * - Closes the drawer on Escape for keyboard users.
 * - Locks body scrolling while the drawer is open so the page behind the
 *   backdrop never scrolls.
 */
const useResponsiveSidebar = (): ResponsiveSidebar => {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia(MOBILE_DRAWER_BREAKPOINT);

    const handleChange = (event: MediaQueryListEvent) => {
      if (!event.matches) {
        setIsDrawerOpen(false);
      }
    };

    mediaQuery.addEventListener("change", handleChange);

    return () => {
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, []);

  useEffect(() => {
    if (!isDrawerOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsDrawerOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isDrawerOpen]);

  useEffect(() => {
    if (!isDrawerOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isDrawerOpen]);

  const closeDrawer = useCallback(() => setIsDrawerOpen(false), []);
  const openDrawer = useCallback(() => setIsDrawerOpen(true), []);
  const toggleDrawer = useCallback(
    () => setIsDrawerOpen((open) => !open),
    [],
  );

  return { isDrawerOpen, openDrawer, closeDrawer, toggleDrawer };
};

export default useResponsiveSidebar;
