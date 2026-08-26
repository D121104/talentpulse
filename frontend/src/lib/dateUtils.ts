/**
 * Utility functions for date and time formatting across TalentPulse frontend.
 * Ensures consistent timezone handling (local browser time, e.g. GMT+7 in Vietnam).
 */

/**
 * Parses any date representation (ISO string, Date instance, or timestamp) safely.
 * If the string is a UTC ISO timestamp missing 'Z' or timezone offset, it normalizes it to UTC.
 */
export function parseDate(date?: string | Date | number | null): Date | null {
  if (!date) return null;
  if (date instanceof Date) {
    return isNaN(date.getTime()) ? null : date;
  }
  if (typeof date === 'number') {
    const d = new Date(date);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof date === 'string') {
    let normalized = date.trim();
    if (!normalized) return null;

    // If it's a numeric timestamp string (e.g. "1724687100000" or seconds "1724687100")
    if (/^\d{10,13}$/.test(normalized)) {
      const num = Number(normalized);
      const d = new Date(normalized.length === 10 ? num * 1000 : num);
      return isNaN(d.getTime()) ? null : d;
    }

    // Date-only string "YYYY-MM-DD" -> parse in local timezone to avoid UTC midnight rollback
    if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
      const [y, m, d] = normalized.split('-').map(Number);
      return new Date(y, m - 1, d);
    }

    // Vietnamese format "DD/MM/YYYY" or "DD/MM/YYYY HH:mm:ss"
    if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(normalized)) {
      const parts = normalized.split(' ');
      const dateParts = parts[0].split('/').map(Number);
      const day = dateParts[0];
      const month = dateParts[1];
      const year = dateParts[2];
      if (parts[1]) {
        const timeParts = parts[1].split(':').map(Number);
        return new Date(
          year,
          month - 1,
          day,
          timeParts[0] || 0,
          timeParts[1] || 0,
          timeParts[2] || 0
        );
      }
      return new Date(year, month - 1, day);
    }

    // Standard datetime string with space "YYYY-MM-DD HH:mm:ss" -> convert space to 'T'
    // Do NOT append 'Z' because un-suffixed datetime strings represent local time.
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2}(\.\d+)?)?/.test(normalized)) {
      normalized = normalized.replace(' ', 'T');
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

/**
 * Returns human-friendly relative time in Vietnamese (e.g. "Vừa xong", "4 ngày trước", "11 tháng trước")
 */
export function formatTimeAgo(date?: string | Date | null): string {
  const d = parseDate(date);
  if (!d) return '--';

  const now = new Date();
  const diffMs = now.getTime() - d.getTime();

  if (diffMs < 0) return 'Vừa xong';

  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'Vừa xong';

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} phút trước`;

  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} giờ trước`;

  const diffDays = Math.floor(diffHour / 24);
  if (diffDays < 30) return `${diffDays} ngày trước`;

  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) return `${diffMonths} tháng trước`;

  const diffYears = Math.floor(diffDays / 365);
  return `${diffYears} năm trước`;
}
