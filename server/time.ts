/**
 * All competitive periods use UTC so a score is placed on exactly the same
 * day for every pilot, regardless of the database or browser timezone.
 */
export function utcDayString(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function nextUtcMidnight(date: Date = new Date()): string {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1)
  ).toISOString();
}

export function utcDayStart(day: string): string {
  return `${day}T00:00:00.000Z`;
}
