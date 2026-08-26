/**
 * Utility functions for date and time formatting across TalentPulse frontend.
 * Ensures consistent timezone handling (local browser time, e.g. GMT+7 in Vietnam).
 */

/**
 * Parses any date representation (ISO string, Date instance, or timestamp) safely.
 * If the string is a UTC ISO timestamp missing 'Z' or timezone offset, it normalizes it to UTC.
 */
export function parseDate(date?: string | Date | null): Date | null {
  if (!date) return null;
  if (date instanceof Date) {
    return isNaN(date.getTime()) ? null : date;
  }
  if (typeof date === 'string') {
    let normalized = date.trim();
    if (!normalized) return null;

    // If string format is "YYYY-MM-DD HH:mm:ss" or "YYYY-MM-DDTHH:mm:ss" without trailing Z/offset
    if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(normalized)) {
      normalized = normalized.replace(' ', 'T') + 'Z';
    }
    const d = new Date(normalized);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/**
 * Formats date and time into Vietnamese locale format: "HH:mm DD/MM/YYYY" (e.g. "00:14 26/08/2026")
 */
export function formatDateTime(
  date?: string | Date | null,
  options?: Intl.DateTimeFormatOptions
): string {
  const d = parseDate(date);
  if (!d) return '--';

  const defaultOptions: Intl.DateTimeFormatOptions = {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...options,
  };

  return d.toLocaleString('vi-VN', defaultOptions);
}

/**
 * Formats date into Vietnamese locale format: "DD/MM/YYYY" (e.g. "26/08/2026")
 */
export function formatDate(
  date?: string | Date | null,
  options?: Intl.DateTimeFormatOptions
): string {
  const d = parseDate(date);
  if (!d) return '--';

  const defaultOptions: Intl.DateTimeFormatOptions = {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...options,
  };

  return d.toLocaleDateString('vi-VN', defaultOptions);
}

/**
 * Formats time into Vietnamese locale format: "HH:mm" (e.g. "00:14")
 */
export function formatTime(
  date?: string | Date | null,
  options?: Intl.DateTimeFormatOptions
): string {
  const d = parseDate(date);
  if (!d) return '--';

  const defaultOptions: Intl.DateTimeFormatOptions = {
    hour: '2-digit',
    minute: '2-digit',
    ...options,
  };

  return d.toLocaleTimeString('vi-VN', defaultOptions);
}
