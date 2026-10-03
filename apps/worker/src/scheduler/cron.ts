// =============================================================================
// Worker — Minimal Cron Expression Parser
// =============================================================================
// Supports standard 5-field cron expressions:
//   minute hour day-of-month month day-of-week
//
// Field formats:
//   *        any value
//   5        specific value
//   1,3,5    list of values
//   1-5      range of values
//   * /15     every N values (step)
//
// Special characters in day-of-week: 0-7 (0 and 7 = Sunday)
// =============================================================================

/**
 * Parsed representation of a cron expression.
 */
interface CronFields {
  minutes: number[];
  hours: number[];
  daysOfMonth: number[];
  months: number[];
  daysOfWeek: number[];
}

/**
 * Parse a single cron field into an array of valid values.
 */
function parseField(field: string, min: number, max: number): number[] {
  const values = new Set<number>();

  for (const part of field.split(",")) {
    const trimmed = part.trim();

    // Step value: */N or range/N
    if (trimmed.includes("/")) {
      const [rangePart, stepStr] = trimmed.split("/");
      const step = parseInt(stepStr!, 10);
      if (isNaN(step) || step <= 0) continue;

      let start = min;
      let end = max;
      if (rangePart && rangePart !== "*") {
        if (rangePart.includes("-")) {
          const [s, e] = rangePart.split("-");
          start = parseInt(s!, 10);
          end = parseInt(e!, 10);
        } else {
          start = parseInt(rangePart, 10);
        }
      }

      for (let i = start; i <= end; i += step) {
        if (i >= min && i <= max) values.add(i);
      }
      continue;
    }

    // Wildcard
    if (trimmed === "*") {
      for (let i = min; i <= max; i++) values.add(i);
      continue;
    }

    // Range: N-M
    if (trimmed.includes("-")) {
      const [startStr, endStr] = trimmed.split("-");
      const start = parseInt(startStr!, 10);
      const end = parseInt(endStr!, 10);
      if (!isNaN(start) && !isNaN(end)) {
        for (let i = start; i <= end; i++) {
          if (i >= min && i <= max) values.add(i);
        }
      }
      continue;
    }

    // Single value
    const val = parseInt(trimmed, 10);
    if (!isNaN(val) && val >= min && val <= max) {
      values.add(val);
    }
  }

  return Array.from(values).sort((a, b) => a - b);
}

/**
 * Parse a 5-field cron expression string into structured fields.
 * Returns null if the expression is invalid.
 */
export function parseCronExpression(expression: string): CronFields | null {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) return null;

  const [minuteField, hourField, domField, monthField, dowField] = parts;
  if (!minuteField || !hourField || !domField || !monthField || !dowField) {
    return null;
  }

  const minutes = parseField(minuteField, 0, 59);
  const hours = parseField(hourField, 0, 23);
  const daysOfMonth = parseField(domField, 1, 31);
  const months = parseField(monthField, 1, 12);
  // Day of week: 0-7 where 0 and 7 are Sunday
  let daysOfWeek = parseField(dowField, 0, 7);
  // Normalize: convert 7 to 0 (both mean Sunday)
  daysOfWeek = [...new Set(daysOfWeek.map((d) => (d === 7 ? 0 : d)))].sort(
    (a, b) => a - b
  );

  if (
    minutes.length === 0 ||
    hours.length === 0 ||
    daysOfMonth.length === 0 ||
    months.length === 0 ||
    daysOfWeek.length === 0
  ) {
    return null;
  }

  return { minutes, hours, daysOfMonth, months, daysOfWeek };
}

/**
 * Check whether a given Date matches a cron expression.
 * Returns true if the date falls on a scheduled time.
 */
export function cronMatches(expression: string, date: Date): boolean {
  const fields = parseCronExpression(expression);
  if (!fields) return false;

  const minute = date.getMinutes();
  const hour = date.getHours();
  const dayOfMonth = date.getDate();
  const month = date.getMonth() + 1; // JS months are 0-based
  const dayOfWeek = date.getDay(); // 0 = Sunday

  return (
    fields.minutes.includes(minute) &&
    fields.hours.includes(hour) &&
    fields.daysOfMonth.includes(dayOfMonth) &&
    fields.months.includes(month) &&
    fields.daysOfWeek.includes(dayOfWeek)
  );
}

/**
 * Determine if a source is due for ingestion based on its cron expression
 * and the last time it was run.
 *
 * Uses minute-level granularity: a source is due if the cron expression
 * matches any minute between lastRunAt and now (exclusive of lastRunAt minute).
 */
export function isSourceDue(
  cronExpression: string,
  lastRunAt: Date | null,
  now: Date = new Date()
): boolean {
  const fields = parseCronExpression(cronExpression);
  if (!fields) return false;

  // Never run before — always due
  if (!lastRunAt) return true;

  // Walk minute-by-minute from lastRunAt+1 to now (capped at 1440 minutes = 24h)
  // to check if any minute matches the cron expression.
  const check = new Date(lastRunAt);
  check.setSeconds(0, 0);
  check.setMinutes(check.getMinutes() + 1);

  const maxCheck = new Date(now);
  const cap = new Date(lastRunAt);
  cap.setMinutes(cap.getMinutes() + 1440); // Cap at 24h lookback
  if (maxCheck > cap) maxCheck.setTime(cap.getTime());

  while (check <= maxCheck) {
    if (cronMatches(cronExpression, check)) {
      return true;
    }
    check.setMinutes(check.getMinutes() + 1);
  }

  return false;
}
