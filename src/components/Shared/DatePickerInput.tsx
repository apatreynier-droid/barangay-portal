import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  ChangeEvent as ReactChangeEvent,
  FocusEvent as ReactFocusEvent,
  KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  DEFAULT_DATE_PLACEHOLDER,
  MONTH_SHORT_NAMES,
  WEEKDAY_FULL_NAMES,
  WEEKDAY_SHORT_NAMES,
  YEAR_RANGE_SIZE,
  addMonths,
  buildCalendarWeeks,
  formatDayAriaLabel,
  formatIsoToDisplay,
  formatMonthYear,
  formatYearRange,
  getIsoWeekday,
  getPreferredDayIso,
  getTodayIso,
  getViewMonthFromIso,
  getYearRangeStart,
  moveIsoByDays,
  moveIsoByMonths,
  parseDateText,
} from "../../Utils/DatePickerLogic";
import "./DatePickerInput.css";

/* -------------------------------------------------------------------------- */
/*  Types and icons                                                           */
/* -------------------------------------------------------------------------- */

type DatePickerView = "days" | "months" | "years";
type FocusTarget = "grid" | "months" | "years" | null;
type PanelAlignment = "left" | "right";
type PanelPlacement = "above" | "below";

export type DatePickerInputProps = {
  /** ISO `yyyy-mm-dd` value, or "" when the field is empty. */
  value: string;
  /** Receives the ISO `yyyy-mm-dd` value, or "" when the field is cleared. */
  onChange: (value: string) => void;
  disabled?: boolean;
  /** Accessible name for the text input (the visible label lives outside). */
  ariaLabel?: string;
  placeholder?: string;
  id?: string;
};

const CalendarIcon = () => (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <rect x="3" y="5" width="18" height="16" rx="2.5" />
    <path d="M3 10h18" />
    <path d="M8 3v4" />
    <path d="M16 3v4" />
  </svg>
);

const ChevronIcon = ({
  direction,
}: {
  direction: "previous" | "next";
}) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path d={direction === "previous" ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} />
  </svg>
);

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

const DatePickerInput = ({
  value,
  onChange,
  disabled = false,
  ariaLabel,
  placeholder = DEFAULT_DATE_PLACEHOLDER,
  id,
}: DatePickerInputProps) => {
  const reactId = useId();
  const panelId = `${id ?? "date-picker"}-calendar-${reactId}`;

  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);

  const todayIso = useMemo(() => getTodayIso(), []);

  const [text, setText] = useState(() => formatIsoToDisplay(value));
  const [isOpen, setIsOpen] = useState(false);
  const [view, setView] = useState<DatePickerView>("days");
  const [viewMonth, setViewMonth] = useState(() => getViewMonthFromIso(value));
  const [activeIso, setActiveIso] = useState(() =>
    /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : todayIso,
  );
  const [error, setError] = useState("");
  const [focusTarget, setFocusTarget] = useState<FocusTarget>(null);
  const [placement, setPlacement] = useState<PanelPlacement>("below");
  const [alignment, setAlignment] = useState<PanelAlignment>("left");

  const selectedIso = /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : "";
  const weeks = useMemo(
    () => buildCalendarWeeks(viewMonth.year, viewMonth.month, todayIso),
    [viewMonth, todayIso],
  );
  const yearRangeStart = getYearRangeStart(viewMonth.year, YEAR_RANGE_SIZE);

  // Keep the typed text aligned when the parent value changes (for example
  // when a different request is opened).
  useEffect(() => {
    setText((previous) => {
      const parsed = parseDateText(previous);
      if (!value) {
        return parsed.status === "empty" ? previous : "";
      }
      if (parsed.status === "valid" && parsed.iso === value) {
        return previous;
      }
      return formatIsoToDisplay(value);
    });
    setError("");
  }, [value]);

  const closeCalendar = useCallback(
    (restoreFocus = false) => {
      setIsOpen(false);
      setView("days");
      setFocusTarget(null);
      setError("");
      setText((previous) => {
        const parsed = parseDateText(previous);
        if (parsed.status === "valid") {
          return formatIsoToDisplay(parsed.iso);
        }
        // Invalid typing is gracefully reverted to the saved value.
        if (parsed.status === "invalid") {
          return formatIsoToDisplay(value);
        }
        return previous;
      });
      if (restoreFocus) {
        inputRef.current?.focus();
      }
    },
    [value],
  );

  const openCalendar = useCallback(
    (target: FocusTarget = null) => {
      const parsed = parseDateText(text);
      const typedIso = parsed.status === "valid" ? parsed.iso : "";
      const anchorIso = selectedIso || typedIso || todayIso;
      const nextView = getViewMonthFromIso(anchorIso);

      setViewMonth(nextView);
      setActiveIso(
        getPreferredDayIso(nextView.year, nextView.month, anchorIso, todayIso),
      );
      setView("days");
      setError("");
      setFocusTarget(target);
      setIsOpen(true);
    },
    [selectedIso, text, todayIso],
  );

  const toggleCalendar = () => {
    if (isOpen) {
      closeCalendar();
    } else {
      openCalendar();
    }
  };

  // Close when the field gets disabled (for example while saving).
  useEffect(() => {
    if (disabled && isOpen) {
      closeCalendar();
    }
  }, [disabled, isOpen, closeCalendar]);

  // Close when the user interacts outside of the picker.
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const root = rootRef.current;
      if (root && !root.contains(event.target as Node)) {
        closeCalendar();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    return () =>
      document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [isOpen, closeCalendar]);

  // Keep the dropdown inside the viewport: flip above the field when there is
  // no room below and align to the right edge when it would overflow.
  const updatePanelPosition = useCallback(() => {
    const root = rootRef.current;
    const panel = panelRef.current;
    if (!root || !panel) return;

    const rect = root.getBoundingClientRect();
    const panelWidth = panel.offsetWidth;
    const panelHeight = panel.offsetHeight;
    const margin = 12;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;

    setPlacement(
      spaceBelow < panelHeight + margin && spaceAbove > spaceBelow
        ? "above"
        : "below",
    );
    setAlignment(
      rect.left + panelWidth > window.innerWidth - margin &&
        rect.right - panelWidth > margin
        ? "right"
        : "left",
    );
  }, []);

  useLayoutEffect(() => {
    if (isOpen) {
      updatePanelPosition();
    }
  }, [isOpen, view, updatePanelPosition]);

  useEffect(() => {
    if (!isOpen) return;

    const handleViewportChange = () => updatePanelPosition();

    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);

    return () => {
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [isOpen, updatePanelPosition]);

  // Roving focus: only the active day is tabbable, arrow keys move it.
  useEffect(() => {
    if (!isOpen || focusTarget !== "grid") return;
    gridRef.current
      ?.querySelector<HTMLButtonElement>(`[data-date="${activeIso}"]`)
      ?.focus();
    setFocusTarget(null);
  }, [isOpen, focusTarget, activeIso, view]);

  useEffect(() => {
    if (!isOpen || (focusTarget !== "months" && focusTarget !== "years")) {
      return;
    }
    const selector =
      focusTarget === "months"
        ? `[data-month="${viewMonth.month}"]`
        : `[data-year="${viewMonth.year}"]`;
    panelRef.current?.querySelector<HTMLButtonElement>(selector)?.focus();
    setFocusTarget(null);
  }, [isOpen, focusTarget, viewMonth]);

  const handleRootBlur = (event: ReactFocusEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget as Node | null;
    if (nextTarget && rootRef.current?.contains(nextTarget)) {
      return;
    }
    // Clicking a non-focusable spot inside the panel moves focus to <body>;
    // only close once focus really left the picker.
    window.requestAnimationFrame(() => {
      const active = document.activeElement;
      const root = rootRef.current;
      if (!root) return;
      if (active && active !== document.body && !root.contains(active)) {
        closeCalendar();
      }
    });
  };

  const handleInputChange = (event: ReactChangeEvent<HTMLInputElement>) => {
    const nextText = event.target.value;
    setText(nextText);

    const parsed = parseDateText(nextText);
    if (parsed.status === "empty") {
      setError("");
      if (value !== "") {
        onChange("");
      }
      return;
    }

    if (parsed.status === "valid") {
      setError("");
      const nextView = getViewMonthFromIso(parsed.iso);
      setViewMonth(nextView);
      setActiveIso(
        getPreferredDayIso(nextView.year, nextView.month, parsed.iso, todayIso),
      );
      if (parsed.iso !== value) {
        onChange(parsed.iso);
      }
      return;
    }

    setError(`Enter a valid date as ${placeholder}.`);
  };

  const handleInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (isOpen) {
        setFocusTarget("grid");
      } else {
        openCalendar("grid");
      }
      return;
    }

    if (event.key === "Escape") {
      if (isOpen) {
        event.preventDefault();
        closeCalendar();
      }
      return;
    }

    if (event.key === "Enter") {
      const parsed = parseDateText(text);
      if (parsed.status === "valid") {
        onChange(parsed.iso);
        setText(formatIsoToDisplay(parsed.iso));
        setError("");
        if (isOpen) {
          closeCalendar();
        }
      } else if (parsed.status === "invalid") {
        setError(`Enter a valid date as ${placeholder}.`);
      }
    }
  };

  const handlePanelKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeCalendar(true);
    }
  };


  const handleGridKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const { key } = event;
    if (key === "Tab") return;

    let nextIso: string | null = null;
    if (key === "ArrowLeft") {
      nextIso = moveIsoByDays(activeIso, -1);
    } else if (key === "ArrowRight") {
      nextIso = moveIsoByDays(activeIso, 1);
    } else if (key === "ArrowUp") {
      nextIso = moveIsoByDays(activeIso, -7);
    } else if (key === "ArrowDown") {
      nextIso = moveIsoByDays(activeIso, 7);
    } else if (key === "Home") {
      nextIso = moveIsoByDays(activeIso, -getIsoWeekday(activeIso));
    } else if (key === "End") {
      nextIso = moveIsoByDays(activeIso, 6 - getIsoWeekday(activeIso));
    } else if (key === "PageUp") {
      nextIso = moveIsoByMonths(activeIso, -1);
    } else if (key === "PageDown") {
      nextIso = moveIsoByMonths(activeIso, 1);
    }

    if (!nextIso) return;

    event.preventDefault();
    setViewMonth(getViewMonthFromIso(nextIso));
    setActiveIso(nextIso);
    setFocusTarget("grid");
  };

  // Month/year grids: arrow keys move focus between the option buttons.
  const handleOptionsKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const { key } = event;
    if (
      key !== "ArrowLeft" &&
      key !== "ArrowRight" &&
      key !== "ArrowUp" &&
      key !== "ArrowDown"
    ) {
      return;
    }

    const container = event.currentTarget;
    const focused = document.activeElement;
    if (!(focused instanceof HTMLElement) || !container.contains(focused)) {
      return;
    }

    const buttons = Array.from(
      container.querySelectorAll<HTMLButtonElement>("[data-option-index]"),
    );
    const currentIndex = buttons.indexOf(focused as HTMLButtonElement);
    if (currentIndex === -1) return;

    const columns = 3;
    const delta =
      key === "ArrowLeft"
        ? -1
        : key === "ArrowRight"
          ? 1
          : key === "ArrowUp"
            ? -columns
            : columns;
    const nextIndex = currentIndex + delta;
    if (nextIndex < 0 || nextIndex >= buttons.length) {
      return;
    }

    event.preventDefault();
    buttons[nextIndex].focus();
  };

  const handleSelectDay = (iso: string) => {
    onChange(iso);
    setText(formatIsoToDisplay(iso));
    setError("");
    closeCalendar();
    inputRef.current?.focus();
  };

  const handleSelectToday = () => {
    handleSelectDay(todayIso);
  };

  const handleClear = () => {
    onChange("");
    setText("");
    setError("");
    closeCalendar();
    inputRef.current?.focus();
  };

  const handleSelectMonth = (month: number) => {
    const nextViewMonth = { year: viewMonth.year, month };
    setViewMonth(nextViewMonth);
    setView("days");
    setActiveIso(
      getPreferredDayIso(
        nextViewMonth.year,
        nextViewMonth.month,
        selectedIso || todayIso,
        todayIso,
      ),
    );
    setFocusTarget("grid");
  };

  const handleSelectYear = (year: number) => {
    setViewMonth((previous) => ({ ...previous, year }));
    setView("months");
    setFocusTarget("months");
  };

  const goToPrevious = () => {
    if (view === "days") {
      const next = addMonths(viewMonth.year, viewMonth.month, -1);
      setViewMonth(next);
      setActiveIso(
        getPreferredDayIso(next.year, next.month, selectedIso || todayIso, todayIso),
      );
      return;
    }

    const step = view === "months" ? 1 : YEAR_RANGE_SIZE;
    setViewMonth((previous) => ({ ...previous, year: previous.year - step }));
  };

  const goToNext = () => {
    if (view === "days") {
      const next = addMonths(viewMonth.year, viewMonth.month, 1);
      setViewMonth(next);
      setActiveIso(
        getPreferredDayIso(next.year, next.month, selectedIso || todayIso, todayIso),
      );
      return;
    }

    const step = view === "months" ? 1 : YEAR_RANGE_SIZE;
    setViewMonth((previous) => ({ ...previous, year: previous.year + step }));
  };

  const previousLabel =
    view === "days"
      ? "Previous month"
      : view === "months"
        ? "Previous year"
        : "Previous years";
  const nextLabel =
    view === "days"
      ? "Next month"
      : view === "months"
        ? "Next year"
        : "Next years";
  const monthTitle = formatMonthYear(viewMonth.year, viewMonth.month);


  return (
    <div className="date-picker" ref={rootRef} onBlur={handleRootBlur}>
      <div className="date-picker-control">
        <input
          ref={inputRef}
          id={id}
          type="text"
          className="date-picker-input"
          value={text}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          spellCheck={false}
          maxLength={10}
          aria-label={ariaLabel}
          aria-invalid={error ? true : undefined}
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          aria-controls={isOpen ? panelId : undefined}
          onChange={handleInputChange}
          onKeyDown={handleInputKeyDown}
        />

        <button
          type="button"
          className="date-picker-toggle"
          aria-label={isOpen ? "Close calendar" : "Open calendar"}
          aria-expanded={isOpen}
          disabled={disabled}
          onClick={toggleCalendar}
        >
          <CalendarIcon />
        </button>
      </div>

      {isOpen && (
        <div
          id={panelId}
          ref={panelRef}
          className={`date-picker-panel date-picker-panel--${placement} date-picker-panel--${alignment}`}
          role="dialog"
          aria-label="Choose a date"
          onKeyDown={handlePanelKeyDown}
        >
          <div className="date-picker-header">
            <button
              type="button"
              className="date-picker-nav"
              aria-label={previousLabel}
              title={previousLabel}
              onClick={goToPrevious}
            >
              <ChevronIcon direction="previous" />
            </button>

            {view === "days" && (
              <button
                type="button"
                className="date-picker-header-title"
                title="Choose month and year"
                aria-live="polite"
                aria-label={`${monthTitle}. Choose month and year`}
                onClick={() => {
                  setView("months");
                  setFocusTarget("months");
                }}
              >
                {monthTitle}
              </button>
            )}

            {view === "months" && (
              <button
                type="button"
                className="date-picker-header-title"
                title="Choose year"
                aria-live="polite"
                aria-label={`${viewMonth.year}. Choose year`}
                onClick={() => {
                  setView("years");
                  setFocusTarget("years");
                }}
              >
                {viewMonth.year}
              </button>
            )}

            {view === "years" && (
              <span className="date-picker-header-label" aria-live="polite">
                {formatYearRange(viewMonth.year)}
              </span>
            )}

            <button
              type="button"
              className="date-picker-nav"
              aria-label={nextLabel}
              title={nextLabel}
              onClick={goToNext}
            >
              <ChevronIcon direction="next" />
            </button>
          </div>

          {view === "days" && (
            <div
              ref={gridRef}
              className="date-picker-grid"
              role="grid"
              aria-label={`${monthTitle} calendar`}
              onKeyDown={handleGridKeyDown}
            >
              <div className="date-picker-week" role="row">
                {WEEKDAY_SHORT_NAMES.map((weekday, index) => (
                  <div
                    key={weekday}
                    className="date-picker-weekday"
                    role="columnheader"
                    aria-label={WEEKDAY_FULL_NAMES[index]}
                  >
                    {weekday}
                  </div>
                ))}
              </div>

              {weeks.map((week) => (
                <div className="date-picker-week" role="row" key={week[0].iso}>
                  {week.map((day) => (
                    <button
                      key={day.iso}
                      type="button"
                      role="gridcell"
                      data-date={day.iso}
                      className={[
                        "date-picker-day",
                        day.inCurrentMonth ? "" : "is-outside",
                        day.isToday ? "is-today" : "",
                        day.iso === selectedIso ? "is-selected" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      tabIndex={day.iso === activeIso ? 0 : -1}
                      aria-selected={day.iso === selectedIso}
                      aria-current={day.isToday ? "date" : undefined}
                      aria-label={formatDayAriaLabel(day.iso)}
                      onClick={() => handleSelectDay(day.iso)}
                    >
                      {day.day}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}


          {view === "months" && (
            <div
              className="date-picker-options"
              role="grid"
              aria-label={`Months of ${viewMonth.year}`}
              onKeyDown={handleOptionsKeyDown}
            >
              {[0, 1, 2, 3].map((rowIndex) => (
                <div className="date-picker-options-row" role="row" key={rowIndex}>
                  {MONTH_SHORT_NAMES.slice(
                    rowIndex * 3,
                    rowIndex * 3 + 3,
                  ).map((monthName, columnIndex) => {
                    const monthIndex = rowIndex * 3 + columnIndex;
                    const isSelected =
                      selectedIso !== "" &&
                      Number(selectedIso.slice(0, 4)) === viewMonth.year &&
                      Number(selectedIso.slice(5, 7)) - 1 === monthIndex;

                    return (
                      <button
                        key={monthName}
                        type="button"
                        role="gridcell"
                        data-month={monthIndex}
                        data-option-index={rowIndex * 3 + columnIndex}
                        className={`date-picker-option${
                          isSelected ? " is-selected" : ""
                        }`}
                        tabIndex={viewMonth.month === monthIndex ? 0 : -1}
                        aria-selected={isSelected}
                        onClick={() => handleSelectMonth(monthIndex)}
                      >
                        {monthName}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}

          {view === "years" && (
            <div
              className="date-picker-options"
              role="grid"
              aria-label={`Years ${formatYearRange(viewMonth.year)}`}
              onKeyDown={handleOptionsKeyDown}
            >
              {[0, 1, 2, 3].map((rowIndex) => (
                <div className="date-picker-options-row" role="row" key={rowIndex}>
                  {[0, 1, 2].map((columnIndex) => {
                    const year =
                      yearRangeStart + rowIndex * 3 + columnIndex;
                    const isSelected =
                      selectedIso !== "" &&
                      Number(selectedIso.slice(0, 4)) === year;

                    return (
                      <button
                        key={year}
                        type="button"
                        role="gridcell"
                        data-year={year}
                        data-option-index={rowIndex * 3 + columnIndex}
                        className={`date-picker-option${
                          isSelected ? " is-selected" : ""
                        }`}
                        tabIndex={viewMonth.year === year ? 0 : -1}
                        aria-selected={isSelected}
                        onClick={() => handleSelectYear(year)}
                      >
                        {year}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}

          <div className="date-picker-footer">
            <button
              type="button"
              className="date-picker-footer-button"
              onClick={handleSelectToday}
            >
              Today
            </button>
            <button
              type="button"
              className="date-picker-footer-button date-picker-footer-button--muted"
              onClick={handleClear}
              disabled={!value && !text}
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="date-picker-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
};

export default DatePickerInput;

