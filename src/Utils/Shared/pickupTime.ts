/**
 * Pickup times for document requests.
 *
 * The API sends a plain time of day ("09:30:00", Philippine office hours, no
 * time zone) next to `pickup_date`, or null when the office has not set one.
 */

/** "09:30:00" -> "09:30", the value an `<input type="time">` expects. */
export const toTimeInputValue = (value: string | null | undefined): string => {
  const match = /^(\d{2}):(\d{2})/.exec(value ?? "");
  return match ? `${match[1]}:${match[2]}` : "";
};

/** "09:30:00" or "14:05" -> "9:30 AM" / "2:05 PM"; "" when not set. */
export const formatPickupTime = (value: string | null | undefined): string => {
  const match = /^(\d{1,2}):(\d{2})/.exec(value ?? "");
  if (!match) return "";

  const hour = Number(match[1]);
  const minute = match[2];
  if (hour > 23 || Number(minute) > 59) return "";

  return `${hour % 12 || 12}:${minute} ${hour < 12 ? "AM" : "PM"}`;
};

/** "Nov 12, 2026" + "09:30:00" -> "Nov 12, 2026 at 9:30 AM". */
export const withPickupTime = (
  dateText: string,
  time: string | null | undefined,
): string => {
  const timeText = formatPickupTime(time);
  return timeText ? `${dateText} at ${timeText}` : dateText;
};
