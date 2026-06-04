/**
 * Frontend API client.
 *
 * Modes:
 *  - Default (live): calls the FastAPI backend over ``VITE_API_BASE_URL``
 *    (proxied by Vite to :8000 in dev, or served from the same origin in prod).
 *  - Static (``VITE_STATIC_MODE=1``): reads bundled JSON files under
 *    ``public/data/`` — useful for GitHub Pages previews where there is no
 *    backend. Off by default so production deployments hit the live API.
 */
import { getLocalDateKey, normalizeForecastDates } from '@/lib/localDates';
import type {
  DonationPledge,
  DonationPledgeResponse,
  LiveRiskScore,
  RiskConfig,
  StateName,
  SystemAlert,
  WeatherForecastDay,
  WeatherReading,
  WeatherWarning,
} from '@/types/api';

const STATIC_MODE = import.meta.env.VITE_STATIC_MODE === '1';
const API_BASE: string =
  import.meta.env.VITE_API_BASE_URL ?? import.meta.env.BASE_URL ?? '/';
const STATIC_BASE = (import.meta.env.BASE_URL ?? '/') + 'data/';

function withDailyCacheBust(path: string): string {
    const separator = path.includes('?') ? '&' : '?';
    return `${path}${separator}day=${getLocalDateKey()}`;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
    const url = path.startsWith('http') ? path : `${API_BASE.replace(/\/$/, '')}${path}`;
    const res = await fetch(url, init);
    if (!res.ok) {
        throw new Error(`API ${res.status} ${res.statusText} for ${url}`);
    }
    return (await res.json()) as T;
}

// --------------------------------------------------------------------------- //
// Pure functions (live-backend parity)                                       //
// --------------------------------------------------------------------------- //

/** Client-side WBT calculator — matches backend/services/climate/wbt.py */
export function calculateWbt(
    t_air_c: number,
    rh_percent: number,
    p_station_hpa: number = 1013.25,
): number {
    if (t_air_c === undefined || rh_percent === undefined) return 0;
    const T = t_air_c;
    const RH = rh_percent;
    const P = p_station_hpa;
    const e_s = 6.112 * Math.exp((17.67 * T) / (T + 243.5));
    const e = (RH / 100.0) * e_s;
    const gamma = 0.00066 * P;
    let Tw = T;
    for (let i = 0; i < 15; i++) {
        const e_w = 6.112 * Math.exp((17.67 * Tw) / (Tw + 243.5));
        const de_w_dTw = (e_w * 17.67 * 243.5) / Math.pow(Tw + 243.5, 2);
        const f = e_w - gamma * (T - Tw) - e;
        const df_dTw = de_w_dTw + gamma;
        Tw = Tw - f / df_dTw;
    }
    return Number(Tw.toFixed(2));
}

// Word-boundary regexes mirror backend scoring_v2.py
const T8_TYPE_RE = /\b(?:signal no\.?\s*8|gale or storm signal no\.?\s*8)\b/i;
const T8_SIGNAL_RE = /^t8$/i;

function isT8(warning: { warning_type?: string; signal?: string }): boolean {
    const wt = String(warning.warning_type ?? '').toLowerCase();
    const sig = String(warning.signal ?? '').toLowerCase();
    return T8_TYPE_RE.test(wt) || T8_SIGNAL_RE.test(sig);
}

const STATE_PRIORITY: StateName[] = ['Purple', 'Red', 'Yellow', 'Low', 'Safe'];

/**
 * Client-side risk scoring calculator — must match
 * backend/services/climate/scoring_v2.py exactly.
 *
 * Single source of truth: the backend. The frontend recomputes locally
 * for the static-mode bundle; the values it produces must equal what
 * the backend would return for the same inputs (the cross-test in
 * test_score_divergence.py enforces this).
 */
export function computeRiskScoreV2(
    wbt: number,
    consecutive: number,
    activeWarnings: ReadonlyArray<{ warning_type?: string; signal?: string }>,
    config: RiskConfig,
): {
    value: number;
    state: StateName;
    w: number;
    h: number;
    v: number;
    m: number;
    t8_applied: boolean;
    breakdown: string;
} {
    // Step 1: W from wet-bulb temperature
    let w = 0;
    for (const band of config.wbt_thresholds) {
        let inBand = true;
        if (band.min_temp !== undefined && wbt < band.min_temp) inBand = false;
        if (band.max_temp !== undefined && wbt > band.max_temp) inBand = false;
        if (inBand) {
            w = Number(band.score);
            break;
        }
    }

    // Step 2: H from consecutive hot nights
    let h = 0;
    for (const band of config.hne_thresholds) {
        let inBand = true;
        if (band.min_nights !== undefined && consecutive < band.min_nights) inBand = false;
        if (band.max_nights !== undefined && consecutive > band.max_nights) inBand = false;
        if (inBand) {
            h = Number(band.score);
            break;
        }
    }

    // Step 3: V — vulnerability bonus triggered by H
    const v = h >= config.vulnerability_config.trigger_h_score
        ? config.vulnerability_config.bonus
        : 0;

    // Step 4: M — highest-priority warning multiplier
    let m = config.warning_multipliers.none ?? 1.0;
    if (activeWarnings.length > 0) {
        const priority: (keyof RiskConfig['warning_multipliers'])[] = [
            't8',
            'black_rain',
            't3',
            't1_or_red_rain',
            'thunderstorm_or_amber_rain',
        ];
        for (const w of activeWarnings) {
            const wt = String(w.warning_type ?? '').toLowerCase();
            for (const key of priority) {
                if (key === 't8' && isT8(w)) {
                    m = config.warning_multipliers.t8 ?? m;
                    break;
                }
                if (key === 'black_rain' && wt.includes('black rainstorm')) {
                    m = config.warning_multipliers.black_rain ?? m;
                    break;
                }
                if (key === 't3' && (wt.includes('signal no. 3') || wt.includes('strong wind'))) {
                    m = config.warning_multipliers.t3 ?? m;
                    break;
                }
                if (key === 't1_or_red_rain' && (wt.includes('standby signal no. 1') || wt.includes('signal no. 1') || wt.includes('red rainstorm'))) {
                    m = config.warning_multipliers.t1_or_red_rain ?? m;
                    break;
                }
                if (key === 'thunderstorm_or_amber_rain' && (wt.includes('thunderstorm') || wt.includes('amber rainstorm'))) {
                    m = config.warning_multipliers.thunderstorm_or_amber_rain ?? m;
                    break;
                }
            }
            if (m > 1.0) break;
        }
    }

    // Step 5: Base
    const base = w + h + v;
    let rawScore = base * m;

    // Step 6: T8 floor rule
    let t8Applied = false;
    if (config.t8_floor.enabled && activeWarnings.some(isT8)) {
        if (rawScore < config.t8_floor.min_score) {
            rawScore = config.t8_floor.min_score;
            t8Applied = true;
        }
    }

    // Step 7: Cap at 30
    const riskScore = Math.min(30.0, rawScore);

    // Step 8: Map to state
    let state: StateName = 'Safe';
    const rounded = Math.round(riskScore);
    outer: for (const pName of STATE_PRIORITY) {
        for (const s of config.state_ranges) {
            if (s.name === pName && rounded >= s.min && rounded <= s.max) {
                state = s.name;
                break outer;
            }
        }
    }

    return {
        value: Number(riskScore.toFixed(1)),
        state,
        w,
        h,
        v,
        m,
        t8_applied: t8Applied,
        breakdown: `(${w} + ${h} + ${v}) × ${m} = ${(base * m).toFixed(1)}` + (t8Applied ? ' → T8 floor applied' : ''),
    };
}

// --------------------------------------------------------------------------- //
// Config fetching (live + static)                                            //
// --------------------------------------------------------------------------- //

let _configCache: RiskConfig | null = null;

export async function getActiveRiskConfig(): Promise<RiskConfig> {
    if (_configCache) return _configCache;
    if (STATIC_MODE) {
        const res = await fetch(withDailyCacheBust(`${STATIC_BASE}state.json`));
        if (!res.ok) throw new Error(`Failed to fetch static state.json: ${res.status}`);
        const data = await res.json();
        _configCache = {
            wbt_thresholds: data.wbt_thresholds,
            hne_thresholds: data.hne_thresholds,
            vulnerability_config: data.vulnerability_config,
            warning_multipliers: data.warning_multipliers,
            t8_floor: data.t8_floor,
            state_ranges: data.state_ranges,
        };
        return _configCache;
    }
    _configCache = await apiFetch<RiskConfig>('/api/weather/risk-config');
    return _configCache;
}

export function invalidateRiskConfigCache() {
    _configCache = null;
}

// --------------------------------------------------------------------------- //
// Public API surface                                                          //
// --------------------------------------------------------------------------- //

export const api = {
    isStatic: STATIC_MODE,
    apiBase: API_BASE,

    /**
     * Admin operations. The ``password`` argument is sent to the backend
     * which validates it via ``_check_admin_password``. The client does
     * NOT compare it locally — that check used to be a hard-coded
     * string and was a serious security hole (deferred for future work).
     */
    admin: {
        async getRiskConfig(password: string): Promise<RiskConfig> {
            return apiFetch<RiskConfig>('/api/admin/risk-config', {
                headers: { 'X-Admin-Password': password },
            });
        },
        async updateRiskConfig(password: string, config: RiskConfig): Promise<{ success: boolean; message: string }> {
            return apiFetch('/api/admin/risk-config', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'X-Admin-Password': password },
                body: JSON.stringify({ password, config }),
            });
        },
        async resetRiskConfig(password: string): Promise<{ success: boolean; message: string }> {
            return apiFetch('/api/admin/risk-config/reset', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password }),
            });
        },
        async testRiskConfig(password: string, config: RiskConfig): Promise<{ valid: boolean; scenarios: unknown[] }> {
            return apiFetch('/api/admin/risk-config/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password, config }),
            });
        },
    },

    donate: {
        async createPledge(data: DonationPledge): Promise<DonationPledgeResponse | { success: true }> {
            if (STATIC_MODE) {
                // Static-mode fallback: persist locally so admins can still see it
                try {
                    const current = JSON.parse(localStorage.getItem('climateshield_donations') ?? '[]');
                    current.push({ ...data, id: Date.now() });
                    localStorage.setItem('climateshield_donations', JSON.stringify(current));
                } catch (e) {
                    console.warn('Failed to persist pledge to localStorage', e);
                }
                return { success: true };
            }
            return apiFetch<DonationPledgeResponse>('/api/donor/pledge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
        },
    },

    weather: {
        async getCurrent(): Promise<WeatherReading[]> {
            if (STATIC_MODE) {
                const res = await fetch(withDailyCacheBust(`${STATIC_BASE}current.json`));
                if (!res.ok) throw new Error('Failed to fetch current weather');
                return (await res.json()) as WeatherReading[];
            }
            return apiFetch<WeatherReading[]>('/api/weather/current');
        },

        async getForecast(): Promise<WeatherForecastDay[]> {
            if (STATIC_MODE) {
                const res = await fetch(withDailyCacheBust(`${STATIC_BASE}forecast.json`));
                if (!res.ok) throw new Error('Failed to fetch forecast');
                const days = normalizeForecastDates(await res.json()) as WeatherForecastDay[];
                const config = await getActiveRiskConfig();
                const [currentSnap, warningsSnap] = await Promise.all([
                    fetch(withDailyCacheBust(`${STATIC_BASE}current.json`))
                        .then((r) => (r.ok ? r.json() : []))
                        .catch(() => [] as WeatherReading[]),
                    fetch(withDailyCacheBust(`${STATIC_BASE}warnings.json`))
                        .then((r) => (r.ok ? r.json() : []))
                        .catch(() => [] as WeatherWarning[]),
                ]);
                const wbtValues = (currentSnap ?? [])
                    .map((r: WeatherReading): number | null => r.wet_bulb_temp_c)
                    .filter((v: number | null): v is number => typeof v === 'number');
                const scoreValues = (currentSnap ?? [])
                    .map((r: WeatherReading): number | null => r.composite_risk_score)
                    .filter((v: number | null): v is number => typeof v === 'number');
                const median = (xs: number[]): number | null => {
                    if (xs.length === 0) return null;
                    const sorted = [...xs].sort((a, b) => a - b);
                    const mid = Math.floor(sorted.length / 2);
                    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
                };
                const todayWbt = median(wbtValues);
                const todayScore = median(scoreValues);
                const todayKey = getLocalDateKey();
                const activeWarnings = (Array.isArray(warningsSnap) ? warningsSnap : []).map(
                    (w): { warning_type?: string; signal?: string } => ({
                        warning_type: w.warning_type,
                        signal: w.signal ?? undefined,
                    }),
                );
                let projStreak = 0;

                return days.map((f) => {
                    const isToday = f.forecast_date === todayKey;
                    let wbtVal: number;
                    if (isToday && todayWbt != null) {
                        wbtVal = todayWbt;
                    } else {
                        wbtVal = f.wet_bulb_peak ?? calculateWbt(f.max_temp ?? 25, f.max_rh ?? f.min_rh ?? 70);
                    }
                    if (f.min_temp != null && f.min_temp >= 28.0) projStreak += 1;
                    else projStreak = 0;

                    let scoreValue: number;
                    let stateName: StateName;
                    if (isToday && todayScore != null) {
                        scoreValue = todayScore;
                        stateName = 'Safe';
                        const rounded = Math.round(scoreValue);
                        for (const pName of STATE_PRIORITY) {
                            const r = config.state_ranges.find((s) => s.name === pName);
                            if (r && rounded >= r.min && rounded <= r.max) {
                                stateName = r.name;
                                break;
                            }
                        }
                    } else {
                        const result = computeRiskScoreV2(wbtVal, projStreak, activeWarnings, config);
                        scoreValue = result.value;
                        stateName = result.state;
                    }
                    return { ...f, wet_bulb_peak: wbtVal, composite_risk_score: scoreValue, risk_level: stateName };
                });
            }
            return apiFetch<WeatherForecastDay[]>('/api/weather/forecast');
        },

        async getRisks(): Promise<{ risk_7_day: unknown; risk_9_day: unknown; hne: number | null }> {
            if (STATIC_MODE) {
                const res = await fetch(withDailyCacheBust(`${STATIC_BASE}current.json`));
                if (!res.ok) throw new Error('Failed to fetch risk outlook');
                return res.json();
            }
            return apiFetch('/api/weather/risks');
        },

        async getWarnings(): Promise<WeatherWarning[]> {
            if (STATIC_MODE) {
                const res = await fetch(withDailyCacheBust(`${STATIC_BASE}warnings.json`));
                if (!res.ok) throw new Error('Failed to fetch warnings');
                return res.json();
            }
            return apiFetch<WeatherWarning[]>('/api/weather/warnings');
        },

        async getHistory(): Promise<{ history: Array<{ date: string; station: string; hne?: number; nightly_hne?: number; risk_level?: string; peak_temp?: number; peak_wbt?: number; peak_rh?: number; avg_rh?: number; composite_risk_score?: { value: number; state: string } | null }> }> {
            if (STATIC_MODE) {
                const res = await fetch(withDailyCacheBust(`${STATIC_BASE}history.json`));
                if (!res.ok) throw new Error('Failed to fetch weather history');
                return res.json();
            }
            return apiFetch('/api/weather/history?days=7');
        },

        async getHistoricalReadings(station: string, hours: number = 12): Promise<{ readings: Array<{ wet_bulb_temp_c: number; recorded_at: string }>; count: number }> {
            // Server-only: real historical aggregation lives on the backend.
            return apiFetch(`/api/weather/history/readings?station=${encodeURIComponent(station)}&hours=${hours}`);
        },

        async getLiveScore(station: string): Promise<LiveRiskScore> {
            if (STATIC_MODE) {
                const res = await fetch(withDailyCacheBust(`${STATIC_BASE}current.json`));
                if (!res.ok) throw new Error('Failed to fetch live risk score');
                const all: WeatherReading[] = await res.json();
                const found = all.find((r) => r.station === station);
                const config = await getActiveRiskConfig();
                const warningsRes = await fetch(withDailyCacheBust(`${STATIC_BASE}warnings.json`)).catch(() => null);
                const warningsRaw: WeatherWarning[] = warningsRes && warningsRes.ok ? await warningsRes.json() : [];
                const warnings = warningsRaw.map(
                    (w): { warning_type?: string; signal?: string } => ({
                        warning_type: w.warning_type,
                        signal: w.signal ?? undefined,
                    }),
                );
                const stateRes = await fetch(withDailyCacheBust(`${STATIC_BASE}state.json`)).catch(() => null);
                const stateData = stateRes && stateRes.ok ? await stateRes.json() : {};
                const consecutive = stateData.consecutive_hot_nights ?? 0;
                const wbt = found?.wet_bulb_temp_c ?? calculateWbt(found?.temp_c ?? 25, found?.humidity_pct ?? 80);
                const result = computeRiskScoreV2(wbt, consecutive, warnings, config);
                return {
                    station,
                    value: result.value,
                    state: result.state,
                    w: result.w,
                    h: result.h,
                    v: result.v,
                    m: result.m,
                    t8_applied: result.t8_applied,
                    breakdown: result.breakdown,
                    theoretical_max: 30,
                    warnings_active: warnings.map((w: { warning_type?: string }) => w.warning_type ?? ''),
                    hot_nights_consecutive: consecutive,
                    wet_bulb_temp_c: wbt,
                    recorded_at: found?.recorded_at ?? new Date().toISOString(),
                };
            }
            return apiFetch<LiveRiskScore>(
                `/api/weather/live-score?station=${encodeURIComponent(station)}`,
                { method: 'POST' },
            );
        },

        async getTrends(): Promise<{ backward: unknown[]; forward: unknown[] }> {
            if (STATIC_MODE) {
                // Minimal static-mode shape so the chart can still render.
                return { backward: [], forward: [] };
            }
            return apiFetch('/api/weather/trends');
        },

        async getRiskConfig(): Promise<RiskConfig> {
            return getActiveRiskConfig();
        },

        async getUnreadAlerts(): Promise<SystemAlert[]> {
            if (STATIC_MODE) {
                const res = await fetch(withDailyCacheBust(`${STATIC_BASE}warnings.json`));
                if (!res.ok) return [];
                const all: WeatherWarning[] = await res.json();
                return all.map((w, i) => ({ ...w, id: i, status: 'pending', acknowledged_at: null } as unknown as SystemAlert));
            }
            return apiFetch<SystemAlert[]>('/api/weather/alerts/unread');
        },

        async ackAlert(_id: number): Promise<{ success: true }> {
            if (STATIC_MODE) return { success: true };
            return apiFetch<{ success: true }>(`/api/weather/alerts/${_id}/ack`, { method: 'POST' });
        },

        async getMetrics(): Promise<Record<string, number>> {
            if (STATIC_MODE) {
                // Build a clean object containing ONLY the 8 counter keys.
                // The previous implementation spread the entire state.json
                // which leaked 8 non-numeric fields (wbt_thresholds, etc.)
                // into the panel and visually hid the real metrics.
                const counters: Record<string, number> = {
                    hko_fetches: 0,
                    weather_readings: 0,
                    wbt_calculations: 0,
                    risk_scores: 0,
                    alerts_generated: 0,
                    forecast_days: 0,
                    warnings: 0,
                    hne_checks: 0,
                };
                try {
                    const res = await fetch(withDailyCacheBust(`${STATIC_BASE}state.json`));
                    if (res.ok) {
                        const data = await res.json();
                        for (const k of Object.keys(counters)) {
                            if (typeof data[k] === 'number' && Number.isFinite(data[k])) {
                                counters[k] = data[k];
                            }
                        }
                    }
                } catch {
                    /* ignore */
                }
                try {
                    const local = JSON.parse(localStorage.getItem('climateshield_metrics') ?? '{}');
                    for (const k of Object.keys(counters)) {
                        if (typeof local[k] === 'number' && Number.isFinite(local[k])) {
                            counters[k] += local[k];
                        }
                    }
                } catch {
                    /* ignore */
                }
                return counters;
            }
            return apiFetch<Record<string, number>>('/api/weather/metrics', { method: 'POST' });
        },

        async getLastReset(): Promise<{ last_reset_at: string | null }> {
            if (STATIC_MODE) {
                return { last_reset_at: localStorage.getItem('climateshield_metrics_reset') };
            }
            return apiFetch<{ last_reset_at: string | null }>('/api/weather/metrics/last-reset', { method: 'POST' });
        },
    },

    agents: {
        async getStatus(): Promise<{ status: string; message?: string }> {
            return { status: 'offline', message: 'Agents not available in static mode' };
        },
        getStreamUrl: (): string => '',
    },
};
