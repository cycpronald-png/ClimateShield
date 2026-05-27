const LOCAL_NOON_HOUR = 12;

function pad2(value: number): string {
  return value.toString().padStart(2, "0");
}

export function getLocalDateKey(reference: Date = new Date()): string {
  return `${reference.getFullYear()}${pad2(reference.getMonth() + 1)}${pad2(reference.getDate())}`;
}

export function parseDateKey(dateKey: string): Date | null {
  if (!/^\d{8}$/.test(dateKey)) {
    return null;
  }

  const year = Number(dateKey.slice(0, 4));
  const month = Number(dateKey.slice(4, 6));
  const day = Number(dateKey.slice(6, 8));

  return new Date(year, month - 1, day, LOCAL_NOON_HOUR, 0, 0, 0);
}

export function shiftDateKey(dateKey: string, offsetDays: number): string | null {
  const date = parseDateKey(dateKey);
  if (!date) {
    return null;
  }

  date.setDate(date.getDate() + offsetDays);
  return getLocalDateKey(date);
}

export function formatDateKey(dateKey: string, locale?: string): string {
  const date = parseDateKey(dateKey);
  if (!date) {
    return dateKey;
  }

  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
  }).format(date);
}

export function normalizeForecastDates<T extends { forecast_date: string }>(
  forecast: T[],
  reference: Date = new Date(),
): T[] {
  const todayKey = getLocalDateKey(reference);

  return forecast.map((entry, index) => ({
    ...entry,
    forecast_date: shiftDateKey(todayKey, index) ?? entry.forecast_date,
  }));
}

export function normalizeTrendDates<T extends { date: string; type?: string }>(
  trends: T[],
  reference: Date = new Date(),
): T[] {
  const todayKey = getLocalDateKey(reference);
  const forecastStartIndex = trends.findIndex((entry) => entry.type === "forecast");
  const anchorIndex = forecastStartIndex >= 0 ? forecastStartIndex : trends.length - 1;

  return trends.map((entry, index) => ({
    ...entry,
    date: shiftDateKey(todayKey, index - anchorIndex) ?? entry.date,
  }));
}
