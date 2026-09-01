export function getDateKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export function parseDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number);

  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

export function addDays(dateKey: string, amount: number): string {
  const date = parseDateKey(dateKey);
  date.setDate(date.getDate() + amount);
  return getDateKey(date);
}

export function differenceInDays(startDateKey: string, endDateKey: string): number {
  const start = parseDateKey(startDateKey).getTime();
  const end = parseDateKey(endDateKey).getTime();
  const millisecondsPerDay = 24 * 60 * 60 * 1000;

  return Math.round((end - start) / millisecondsPerDay);
}

export function formatDate(
  dateKey: string,
  options: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    month: 'long',
    day: 'numeric'
  }
): string {
  return new Intl.DateTimeFormat(undefined, options).format(parseDateKey(dateKey));
}

export function formatDateShort(dateKey: string): string {
  return formatDate(dateKey, {
    month: 'short',
    day: 'numeric'
  });
}

export function formatMonthYear(dateKey: string): string {
  return formatDate(dateKey, {
    month: 'long',
    year: 'numeric'
  });
}

export function formatTimestampMonthYear(timestamp: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'long',
    year: 'numeric'
  }).format(new Date(timestamp));
}

export function isToday(dateKey: string): boolean {
  return dateKey === getDateKey();
}

export function sortDateKeysDescending(dateKeys: string[]): string[] {
  return [...dateKeys].sort((left, right) => right.localeCompare(left));
}

export function getStatusDateLabel(dateKey: string): string {
  if (isToday(dateKey)) {
    return 'Today';
  }

  return formatDate(dateKey);
}
