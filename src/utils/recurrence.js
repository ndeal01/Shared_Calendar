// Pure functions for expanding a recurring event into concrete occurrence
// dates. No React/Supabase dependencies so this can be unit-tested in
// isolation and reused by month/week/day views.

function parseDateKey(dateKey) {
  return new Date(`${dateKey}T12:00:00`);
}

function toDateKey(date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Safety cap so an open-ended recurrence rule (no end date) can never loop
// forever if it's ever asked about an absurdly large date range.
const MAX_OCCURRENCE_ITERATIONS = 1000;

/**
 * Returns an array of date-key strings (YYYY-MM-DD) where `event` occurs,
 * clipped to the inclusive [rangeStartKey, rangeEndKey] window.
 *
 * Supported recurrence shapes on `event`:
 *   recurrenceFreq: 'none' | 'daily' | 'weekly' | 'monthly'
 *   recurrenceInterval: repeat every N units (default 1)
 *   recurrenceDaysOfWeek: for 'weekly' only — array of 0 (Sun) .. 6 (Sat)
 *   recurrenceEndDate: last date an occurrence may fall on (inclusive), or null
 */
export function getEventOccurrences(event, rangeStartKey, rangeEndKey) {
  const freq = event.recurrenceFreq || 'none';
  const anchor = parseDateKey(event.date);
  const rangeStart = parseDateKey(rangeStartKey);
  const rangeEnd = parseDateKey(rangeEndKey);
  const endLimit = event.recurrenceEndDate ? parseDateKey(event.recurrenceEndDate) : null;

  if (freq === 'none') {
    return anchor >= rangeStart && anchor <= rangeEnd ? [event.date] : [];
  }

  const interval = Math.max(1, event.recurrenceInterval || 1);
  const occurrences = [];

  if (freq === 'daily') {
    const cursor = new Date(anchor);
    for (let iter = 0; iter < MAX_OCCURRENCE_ITERATIONS && cursor <= rangeEnd; iter += 1) {
      if (endLimit && cursor > endLimit) break;
      if (cursor >= rangeStart) occurrences.push(toDateKey(cursor));
      cursor.setDate(cursor.getDate() + interval);
    }
    return occurrences;
  }

  if (freq === 'weekly') {
    const daysOfWeek = event.recurrenceDaysOfWeek?.length ? event.recurrenceDaysOfWeek : [anchor.getDay()];
    const anchorWeekStart = new Date(anchor);
    anchorWeekStart.setDate(anchor.getDate() - anchor.getDay());

    const weekCursor = new Date(anchorWeekStart);
    for (let iter = 0; iter < MAX_OCCURRENCE_ITERATIONS && weekCursor <= rangeEnd; iter += 1) {
      daysOfWeek.forEach((dow) => {
        const occurrence = new Date(weekCursor);
        occurrence.setDate(weekCursor.getDate() + dow);
        if (occurrence < anchor) return;
        if (endLimit && occurrence > endLimit) return;
        if (occurrence >= rangeStart && occurrence <= rangeEnd) occurrences.push(toDateKey(occurrence));
      });
      weekCursor.setDate(weekCursor.getDate() + 7 * interval);
    }
    return occurrences.sort();
  }

  if (freq === 'monthly') {
    const cursor = new Date(anchor);
    for (let iter = 0; iter < MAX_OCCURRENCE_ITERATIONS && cursor <= rangeEnd; iter += 1) {
      if (endLimit && cursor > endLimit) break;
      if (cursor >= rangeStart) occurrences.push(toDateKey(cursor));
      cursor.setMonth(cursor.getMonth() + interval);
    }
    return occurrences;
  }

  return [];
}

/** Convenience check for "does this event occur on this single date?" */
export function eventOccursOnDate(event, dateKey) {
  return getEventOccurrences(event, dateKey, dateKey).length > 0;
}

export const WEEKDAY_LABELS = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' }
];
