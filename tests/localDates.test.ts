import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeForecastDates, normalizeTrendDates } from '../src/lib/localDates.ts';

test('normalizeForecastDates reanchors forecasts to the current local day across month boundaries', () => {
  const forecast = [
    { forecast_date: '20260527' },
    { forecast_date: '20260528' },
    { forecast_date: '20260529' },
  ];

  const normalized = normalizeForecastDates(forecast, new Date(2026, 0, 31, 9, 0, 0));

  assert.deepEqual(
    normalized.map((entry) => entry.forecast_date),
    ['20260131', '20260201', '20260202'],
  );
});

test('normalizeTrendDates keeps history before today and forecast starting today', () => {
  const trends = [
    { date: '20260524', type: 'history' },
    { date: '20260525', type: 'history' },
    { date: '20260527', type: 'forecast' },
    { date: '20260528', type: 'forecast' },
  ];

  const normalized = normalizeTrendDates(trends, new Date(2026, 4, 27, 8, 0, 0));

  assert.deepEqual(
    normalized.map((entry) => entry.date),
    ['20260525', '20260526', '20260527', '20260528'],
  );
});

test('normalizeForecastDates falls back to original values when given an invalid reference date', () => {
  const forecast = [{ forecast_date: 'stale-value' }];

  const normalized = normalizeForecastDates(forecast, new Date('invalid'));

  assert.equal(normalized[0].forecast_date, 'stale-value');
});
