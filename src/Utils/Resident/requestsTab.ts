export type RequestsTab = "all" | "active" | "history" | "ready";

const STORAGE_KEY = "lagabe-requests-tab";
const EVENT_NAME = "lagabe:requests-tab";

export const isRequestsTab = (value: unknown): value is RequestsTab =>
  value === "all" ||
  value === "active" ||
  value === "history" ||
  value === "ready";

/** Last selected filter in this browser tab (defaults to "all"). */
export const readRequestsTab = (): RequestsTab => {
  try {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (isRequestsTab(saved)) return saved;
  } catch {
    /* storage unavailable: fall back to "all" */
  }
  return "all";
};

/** Saves the filter and tells every listener (sidebar and page) about it. */
export const selectRequestsTab = (tab: RequestsTab) => {
  try {
    sessionStorage.setItem(STORAGE_KEY, tab);
  } catch {
    /* ignore: the choice just won't persist */
  }
  window.dispatchEvent(
    new CustomEvent<RequestsTab>(EVENT_NAME, { detail: tab }),
  );
};

/** Returns an unsubscribe function, so it can be used directly in useEffect. */
export const subscribeRequestsTab = (listener: (tab: RequestsTab) => void) => {
  const handler = (event: Event) => {
    const tab = (event as CustomEvent<unknown>).detail;
    if (isRequestsTab(tab)) listener(tab);
  };

  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
};
