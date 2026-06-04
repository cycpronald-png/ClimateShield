/**
 * Frontend unit test for the static-mode getMetrics() helper.
 *
 * Regression guard for the bug where getMetrics() spread the entire
 * state.json into the metrics object, leaking 8 non-numeric fields
 * (wbt_thresholds, state_ranges, t8_floor, vulnerability_config,
 * warning_multipliers, hne_thresholds, last_date, consecutive_hot_nights)
 * into the panel and visually hiding the real 8 metrics.
 */
// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

// Set the env var BEFORE importing api.ts so VITE_STATIC_MODE is true
// at module evaluation time.
vi.stubEnv("VITE_STATIC_MODE", "1");

import { api } from "@/services/api";

const EXPECTED_KEYS = [
    "hko_fetches",
    "weather_readings",
    "wbt_calculations",
    "risk_scores",
    "alerts_generated",
    "forecast_days",
    "warnings",
    "hne_checks",
] as const;

const EXPECTED_KEY_SET = new Set<string>(EXPECTED_KEYS);

const FAKE_STATE = {
    // 8 real counters (numbers)
    hko_fetches: 153,
    weather_readings: 1367,
    wbt_calculations: 3737,
    risk_scores: 2081,
    alerts_generated: 5,
    forecast_days: 714,
    warnings: 29,
    hne_checks: 51,
    // 8 leak keys (non-numbers, must be excluded)
    wbt_thresholds: [{ min_temp: 22, score: 1 }],
    hne_thresholds: [{ max_nights: 0, score: 0 }],
    vulnerability_config: { trigger_h_score: 1, bonus: 5 },
    warning_multipliers: { none: 1.0 },
    t8_floor: { enabled: true, min_score: 27 },
    state_ranges: [{ name: "Safe", min: 0, max: 12 }],
    last_date: "2026-06-04",
    consecutive_hot_nights: 4,
};

describe("api.weather.getMetrics (static mode)", () => {
    let originalFetch: typeof fetch;
    let localStorageBefore: Record<string, string>;

    beforeAll(() => {
        originalFetch = globalThis.fetch;
        // Mock fetch: only state.json exists; everything else 404s.
        globalThis.fetch = (async (url: unknown) => {
            const u = String(url);
            if (u.includes("state.json")) {
                return new Response(JSON.stringify(FAKE_STATE), { status: 200 });
            }
            return new Response("not found", { status: 404 });
        }) as typeof fetch;
        localStorageBefore = {};
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k) localStorageBefore[k] = localStorage.getItem(k) ?? "";
        }
    });

    afterAll(() => {
        globalThis.fetch = originalFetch;
        localStorage.clear();
        for (const [k, v] of Object.entries(localStorageBefore)) {
            localStorage.setItem(k, v);
        }
    });

    it("returns exactly the 8 canonical counter keys", async () => {
        const metrics = await api.weather.getMetrics();
        expect(Object.keys(metrics).sort()).toEqual([...EXPECTED_KEYS].sort());
    });

    it("does not leak non-numeric fields from state.json", async () => {
        const metrics = await api.weather.getMetrics();
        for (const k of Object.keys(metrics)) {
            expect(EXPECTED_KEY_SET.has(k), `unexpected key leaked: ${k}`).toBe(true);
        }
    });

    it("preserves the values from state.json", async () => {
        const metrics = await api.weather.getMetrics();
        for (const k of EXPECTED_KEYS) {
            expect(metrics[k]).toBe(FAKE_STATE[k as keyof typeof FAKE_STATE]);
        }
    });

    it("falls back to 0 (not undefined) when state.json is unreachable", async () => {
        const savedFetch = globalThis.fetch;
        globalThis.fetch = (async () => new Response("", { status: 503 })) as typeof fetch;
        try {
            const metrics = await api.weather.getMetrics();
            for (const k of EXPECTED_KEYS) {
                expect(metrics[k]).toBe(0);
            }
        } finally {
            globalThis.fetch = savedFetch;
        }
    });

    it("all values are finite numbers (so the panel's toLocaleString() doesn't crash)", async () => {
        const metrics = await api.weather.getMetrics();
        for (const [k, v] of Object.entries(metrics)) {
            expect(typeof v, `${k} has wrong type`).toBe("number");
            expect(Number.isFinite(v), `${k} is not finite`).toBe(true);
        }
    });
});
