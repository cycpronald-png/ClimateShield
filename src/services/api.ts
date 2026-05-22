const DATA_BASE = import.meta.env.BASE_URL + 'data/';

// Client-side WBT calculator
function calculateWbt(t_air_c: number, rh_percent: number, p_station_hpa: number = 1013.25): number {
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
        const de_w_dTw = e_w * (17.67 * 243.5) / Math.pow(Tw + 243.5, 2);
        const f = e_w - gamma * (T - Tw) - e;
        const df_dTw = de_w_dTw + gamma;
        Tw = Tw - f / df_dTw;
    }
    return Number(Tw.toFixed(2));
}

// Client-side risk scoring calculator matching backend compute_risk_score + 2x amplification
function computeRiskScoreV2(wbt: number, consecutive: number, activeWarnings: any[], config: any) {
    // Step 1: W from wet-bulb temperature
    let w = 0;
    const wbtThresholds = config.wbt_thresholds || [];
    for (const band of wbtThresholds) {
        let inBand = true;
        if (band.min_temp !== undefined && wbt < band.min_temp) inBand = false;
        if (band.max_temp !== undefined && wbt > band.max_temp) inBand = false;
        if (inBand) { w = Number(band.score); }
    }
    
    // Step 2: H from consecutive hot nights
    let h = 0;
    const hneThresholds = config.hne_thresholds || [];
    for (const band of hneThresholds) {
        let inBand = true;
        if (band.min_nights !== undefined && consecutive < band.min_nights) inBand = false;
        if (band.max_nights !== undefined && consecutive > band.max_nights) inBand = false;
        if (inBand) { h = Number(band.score); }
    }
    
    // Step 3: V - vulnerability
    const vuln = config.vulnerability_config || { trigger_h_score: 1, bonus: 5 };
    const v = h >= vuln.trigger_h_score ? vuln.bonus : 0;
    
    // Step 4: M - warning multipliers
    const multipliers = config.warning_multipliers || {};
    let m = multipliers.none || 1.0;
    if (activeWarnings && activeWarnings.length > 0) {
        const warningSignals = activeWarnings.map(w => ({
            type: String(w.warning_type || "").toLowerCase(),
            signal: String(w.signal || "").toLowerCase()
        }));
        const priority = [
            { key: "t8", check: (wt: string, sig: string) => wt.includes("signal no. 8") || wt.includes("gale or storm") || sig.includes("t8") },
            { key: "black_rain", check: (wt: string, sig: string) => wt.includes("black rainstorm") || sig.includes("black") },
            { key: "t3", check: (wt: string, sig: string) => wt.includes("signal no. 3") || wt.includes("strong wind") || sig.includes("t3") },
            { key: "t1_or_red_rain", check: (wt: string, sig: string) => wt.includes("standby signal no. 1") || wt.includes("signal no. 1") || wt.includes("red rainstorm") || sig.includes("red") },
            { key: "thunderstorm_or_amber_rain", check: (wt: string, sig: string) => wt.includes("thunderstorm") || wt.includes("amber rainstorm") || sig.includes("amber") }
        ];
        let found = false;
        for (const p of priority) {
            for (const ws of warningSignals) {
                if (p.check(ws.type, ws.signal)) {
                    m = multipliers[p.key] || m;
                    found = true;
                    break;
                }
            }
            if (found) break;
        }
    }

    // Step 5: Base
    const base = w + h + v;
    // 2x Risk Score Amplification
    let rawScore = (base * m) * 2.0;

    // Step 6: T8 floor rule
    let t8Applied = false;
    const t8 = config.t8_floor || { enabled: true, min_score: 27 };
    if (t8.enabled && activeWarnings) {
        for (const wItem of activeWarnings) {
            const wt = String(wItem.warning_type || "").toLowerCase();
            const sig = String(wItem.signal || "").toLowerCase();
            if (wt.includes("signal no. 8") || wt.includes("gale or storm") || sig.includes("t8")) {
                if (rawScore < t8.min_score) {
                    rawScore = t8.min_score;
                    t8Applied = true;
                }
                break;
            }
        }
    }

    // Step 7: Cap at 30
    const riskScore = Math.min(30.0, rawScore);

    // Step 8: Map to state
    let state = "Safe";
    const scoreRound = Math.round(riskScore);
    const stateRanges = config.state_ranges || [];
    const priorityOrder = ["Purple", "Red", "Yellow", "Low", "Safe"];
    let foundState = false;
    for (const pName of priorityOrder) {
        for (const s of stateRanges) {
            if (s.name === pName && scoreRound >= s.min && scoreRound <= s.max) {
                state = s.name;
                foundState = true;
                break;
            }
        }
        if (foundState) break;
    }

    return {
        value: Number(riskScore.toFixed(1)),
        state,
        w, h, v, m,
        t8_applied: t8Applied,
        breakdown: `(${w} + ${h} + ${v}) × ${m} × 2.0 = ${(base * m * 2.0).toFixed(1)}` + (t8Applied ? " → T8 floor applied" : "")
    };
}

async function getActiveRiskConfig(): Promise<any> {
    const saved = localStorage.getItem("climateshield_risk_config");
    if (saved) {
        try {
            return JSON.parse(saved);
        } catch (e) {
            console.error("Failed to parse saved config", e);
        }
    }
    const stateRes = await fetch(`${DATA_BASE}state.json`).catch(() => null);
    if (stateRes && stateRes.ok) {
        try {
            const stateData = await stateRes.json();
            return {
                wbt_thresholds: stateData.wbt_thresholds,
                hne_thresholds: stateData.hne_thresholds,
                vulnerability_config: stateData.vulnerability_config,
                warning_multipliers: stateData.warning_multipliers,
                t8_floor: stateData.t8_floor,
                state_ranges: stateData.state_ranges
            };
        } catch (e) {
            console.error("Failed to parse state.json config", e);
        }
    }
    // Hardcoded fallback with strict non-overlapping bands
    return {
        wbt_thresholds: [
            { max_temp: 21.9, score: 0 },
            { min_temp: 22, max_temp: 23.9, score: 1 },
            { min_temp: 24, max_temp: 26.9, score: 2 },
            { min_temp: 27, max_temp: 29.9, score: 4 },
            { min_temp: 30, score: 6 },
        ],
        hne_thresholds: [
            { max_nights: 0, score: 0 },
            { min_nights: 1, max_nights: 1, score: 1 },
            { min_nights: 2, max_nights: 2, score: 2 },
            { min_nights: 3, max_nights: 4, score: 4 },
            { min_nights: 5, score: 6 },
        ],
        vulnerability_config: { trigger_h_score: 1, bonus: 5 },
        warning_multipliers: {
            none: 1.0,
            thunderstorm_or_amber_rain: 2.0,
            t1_or_red_rain: 1.5,
            t3: 1.5,
            black_rain: 2.0,
            t8: 3.0,
        },
        t8_floor: { enabled: true, min_score: 27 },
        state_ranges: [
            { name: 'Safe', min: 0, max: 12 },
            { name: 'Low', min: 13, max: 16 },
            { name: 'Yellow', min: 17, max: 22 },
            { name: 'Red', min: 23, max: 24 },
            { name: 'Purple', min: 25, max: 30 },
        ]
    };
}

// Increment localStorage counters for frontend calculations
function incrementMetric(key: string) {
    try {
        const currentStr = localStorage.getItem("climateshield_metrics");
        const current = currentStr ? JSON.parse(currentStr) : {
            hko_fetches: 0,
            weather_readings: 0,
            wbt_calculations: 0,
            risk_scores: 0,
            alerts_generated: 0,
            forecast_days: 0,
            warnings: 0,
            hne_checks: 0
        };
        current[key] = (current[key] || 0) + 1;
        localStorage.setItem("climateshield_metrics", JSON.stringify(current));
    } catch (e) {
        console.warn("Failed to increment metric:", e);
    }
}

export const api = {
    donate: {
        createPledge: async (data: any) => {
            try {
                const currentStr = localStorage.getItem("climateshield_donations");
                const current = currentStr ? JSON.parse(currentStr) : [];
                current.push({ ...data, id: Date.now() });
                localStorage.setItem("climateshield_donations", JSON.stringify(current));
            } catch (e) {
                console.warn(e);
            }
            return { success: true };
        },
    },
    admin: {
        getDonations: async () => {
            try {
                const donationsStr = localStorage.getItem("climateshield_donations");
                if (donationsStr) return JSON.parse(donationsStr);
            } catch {}
            return [];
        },
        getRiskConfig: async (password: string) => {
            if (password !== "Climate012220ShielD") throw new Error("Forbidden");
            try {
                const configStr = localStorage.getItem("climateshield_risk_config");
                if (configStr) return JSON.parse(configStr);
            } catch {}
            // Fallback to fetch state.json
            const response = await fetch(`${DATA_BASE}state.json`);
            if (!response.ok) throw new Error("Failed to fetch risk config");
            const stateData = await response.json();
            return {
                wbt_thresholds: stateData.wbt_thresholds,
                hne_thresholds: stateData.hne_thresholds,
                vulnerability_config: stateData.vulnerability_config,
                warning_multipliers: stateData.warning_multipliers,
                t8_floor: stateData.t8_floor,
                state_ranges: stateData.state_ranges
            };
        },
        updateRiskConfig: async (password: string, config: any) => {
            if (password !== "Climate012220ShielD") throw new Error("Forbidden");
            localStorage.setItem("climateshield_risk_config", JSON.stringify(config));
            return { success: true, message: "Risk formula configuration updated" };
        },
        resetRiskConfig: async (password: string) => {
            if (password !== "Climate012220ShielD") throw new Error("Forbidden");
            localStorage.removeItem("climateshield_risk_config");
            return { success: true, message: "Risk formula configuration reset to default" };
        },
        testRiskConfig: async (password: string, config: any) => {
            if (password !== "Climate012220ShielD") throw new Error("Forbidden");
            
            // Run scenarios client-side
            const scenarios = [
                { wbt: 28.0, consecutive: 1, warnings: [], label: "Moderate heat, no warning" },
                { wbt: 31.0, consecutive: 5, warnings: [{ warning_type: "Strong Wind Signal No. 3", signal: "T3" }], label: "Extreme heat + T3" },
                { wbt: 29.0, consecutive: 2, warnings: [{ warning_type: "Gale or Storm Signal No. 8", signal: "T8" }], label: "T8 floor rule" },
            ];
            
            const results = scenarios.map(s => {
                const result = computeRiskScoreV2(s.wbt, s.consecutive, s.warnings, config);
                return {
                    label: s.label,
                    inputs: { wbt: s.wbt, consecutive: s.consecutive, warnings: s.warnings },
                    score: result.value,
                    state: result.state,
                    breakdown: result.breakdown,
                };
            });
            return { valid: true, scenarios: results };
        },
    },
    weather: {
        getCurrent: async () => {
            const response = await fetch(`${DATA_BASE}current.json`);
            if (!response.ok) throw new Error("Failed to fetch current weather");
            return response.json();
        },
        getForecast: async () => {
            const response = await fetch(`${DATA_BASE}forecast.json`);
            if (!response.ok) throw new Error("Failed to fetch forecast");
            const forecastDays = await response.json();
            
            const config = await getActiveRiskConfig();
            
            const stateRes = await fetch(`${DATA_BASE}state.json`).catch(() => null);
            const stateData = stateRes && stateRes.ok ? await stateRes.json() : {};
            let projStreak = stateData.consecutive_hot_nights || 0;
            
            return forecastDays.map((f: any) => {
                if (f.min_temp !== undefined && f.min_temp >= 28.0) {
                    projStreak += 1;
                } else {
                    projStreak = 0;
                }
                const wbtVal = f.wet_bulb_peak !== undefined ? f.wet_bulb_peak : calculateWbt(f.max_temp || 25, f.max_rh || f.min_rh || 70);
                const result = computeRiskScoreV2(wbtVal, projStreak, [], config);
                return {
                    ...f,
                    wet_bulb_peak: wbtVal,
                    composite_risk_score: result.value,
                    risk_level: result.state
                };
            });
        },
        getRisks: async () => {
            const response = await fetch(`${DATA_BASE}current.json`);
            if (!response.ok) throw new Error("Failed to fetch risk outlook");
            return response.json();
        },
        getWarnings: async () => {
            const response = await fetch(`${DATA_BASE}warnings.json`);
            if (!response.ok) throw new Error("Failed to fetch warnings");
            return response.json();
        },
        getHistory: async () => {
            const response = await fetch(`${DATA_BASE}history.json`);
            if (!response.ok) throw new Error("Failed to fetch weather history");
            return response.json();
        },
        getHistoricalReadings: async (station: string, hours: number = 12) => {
            const response = await fetch(`${DATA_BASE}readings.json`);
            if (!response.ok) throw new Error("Failed to fetch historical readings");
            const all = await response.json();
            const filtered = (all || []).filter((r: any) => r.station === station).slice(0, hours);
            return { readings: filtered };
        },
        getLiveScore: async (station: string) => {
            const response = await fetch(`${DATA_BASE}current.json`);
            if (!response.ok) throw new Error("Failed to fetch live risk score");
            const all = await response.json();
            const found = (all || []).find((r: any) => r.station === station);
            
            const config = await getActiveRiskConfig();

            const warningsRes = await fetch(`${DATA_BASE}warnings.json`).catch(() => null);
            const warnings = warningsRes && warningsRes.ok ? await warningsRes.json() : [];
            
            const stateRes2 = await fetch(`${DATA_BASE}state.json`).catch(() => null);
            const stateData2 = stateRes2 && stateRes2.ok ? await stateRes2.json() : {};
            const consecutive = stateData2.consecutive_hot_nights || 0;

            const wbt = found?.wet_bulb_temp_c ?? calculateWbt(found?.temp_c ?? 25, found?.humidity_pct ?? 80);
            const result = computeRiskScoreV2(wbt, consecutive, warnings, config);
            
            incrementMetric("wbt_calculations");
            incrementMetric("risk_scores");

            return {
                station,
                value: result.value,
                state: result.state,
                w: result.w,
                h: result.h,
                v: result.v,
                m: result.m,
                breakdown: result.breakdown,
                theoretical_max: 30,
                warnings_active: warnings.map((w: any) => w.warning_type),
                hot_nights_consecutive: consecutive,
                wet_bulb_temp_c: wbt
            };
        },
        getTrends: async () => {
            const config = await getActiveRiskConfig();
            
            // 1. Fetch backward history trends from trends.json (if ok) or history.json
            let backward: any[] = [];
            try {
                const response = await fetch(`${DATA_BASE}trends.json`);
                if (response.ok) {
                    const trendsData = await response.json();
                    backward = (trendsData.backward || []).map((t: any) => {
                        const result = computeRiskScoreV2(t.wbt || 25.0, Math.round(t.hne || 0), [], config);
                        return {
                            ...t,
                            composite_risk_score: result.value,
                            risk_level: result.state
                        };
                    });
                } else {
                    const historyRes = await fetch(`${DATA_BASE}history.json`).then(r => r.json());
                    backward = (historyRes.history || []).map((h: any, idx: number) => {
                        const d = new Date();
                        d.setDate(d.getDate() - idx);
                        const dateStr = d.toISOString().split('T')[0].replace(/-/g, '');
                        const wbt = 24.5 - (idx % 2);
                        const hne = h.hne || 0;
                        const result = computeRiskScoreV2(wbt, Math.round(hne), [], config);
                        return {
                            date: dateStr,
                            composite_risk_score: result.value,
                            risk_level: result.state,
                            wbt,
                            hne,
                            type: 'history'
                        };
                    }).reverse();
                }
            } catch (e) {
                console.error("Failed to load backward trends", e);
            }
            
            // 2. Load forward forecast trends using weather.getForecast() (recalculated dynamically!)
            let forward: any[] = [];
            try {
                const forecastDays = await api.weather.getForecast();
                forward = forecastDays.slice(0, 9).map((f: any) => {
                    const maxTemp = f.max_temp !== undefined ? f.max_temp : 30;
                    const hne = maxTemp >= 28 ? Number(((maxTemp - 25) * 2).toFixed(1)) : 0;
                    return {
                        date: f.forecast_date,
                        type: 'forecast',
                        composite_risk_score: f.composite_risk_score,
                        risk_level: f.risk_level,
                        wbt: f.wet_bulb_peak,
                        hne: hne
                    };
                });
            } catch (e) {
                console.error("Failed to load forward trends", e);
            }
            
            return { backward, forward };
        },
        getRiskConfig: async () => {
            return getActiveRiskConfig();
        },
        getUnreadAlerts: async () => {
            const response = await fetch(`${DATA_BASE}warnings.json`);
            if (!response.ok) return [];
            const all = await response.json();
            return (all || []).map((w: any, i: number) => ({ ...w, id: i, acknowledged: false }));
        },
        ackAlert: async (_id: number) => {
            return { success: true };
        },
        getMetrics: async () => {
            let base = {
                hko_fetches: 0,
                weather_readings: 0,
                wbt_calculations: 0,
                risk_scores: 0,
                alerts_generated: 0,
                forecast_days: 0,
                warnings: 0,
                hne_checks: 0
            };
            try {
                const response = await fetch(`${DATA_BASE}state.json`);
                if (response.ok) {
                    const stateData = await response.json();
                    base = {
                        hko_fetches: stateData.hko_fetches || 0,
                        weather_readings: stateData.weather_readings || 0,
                        wbt_calculations: stateData.wbt_calculations || 0,
                        risk_scores: stateData.risk_scores || 0,
                        alerts_generated: stateData.alerts_generated || 0,
                        forecast_days: stateData.forecast_days || 0,
                        warnings: stateData.warnings || 0,
                        hne_checks: stateData.hne_checks || 0
                    };
                }
            } catch (e) {}

            let offsets = {
                hko_fetches: 0,
                weather_readings: 0,
                wbt_calculations: 0,
                risk_scores: 0,
                alerts_generated: 0,
                forecast_days: 0,
                warnings: 0,
                hne_checks: 0
            };
            try {
                const offsetsStr = localStorage.getItem("climateshield_metrics_offsets");
                if (offsetsStr) {
                    offsets = JSON.parse(offsetsStr);
                }
            } catch (e) {}

            let localAdditions = {
                hko_fetches: 0,
                weather_readings: 0,
                wbt_calculations: 0,
                risk_scores: 0,
                alerts_generated: 0,
                forecast_days: 0,
                warnings: 0,
                hne_checks: 0
            };
            try {
                const localStr = localStorage.getItem("climateshield_metrics");
                if (localStr) {
                    localAdditions = JSON.parse(localStr);
                }
            } catch (e) {}

            const displayed = {
                hko_fetches: Math.max(0, base.hko_fetches - offsets.hko_fetches) + localAdditions.hko_fetches,
                weather_readings: Math.max(0, base.weather_readings - offsets.weather_readings) + localAdditions.weather_readings,
                wbt_calculations: Math.max(0, base.wbt_calculations - offsets.wbt_calculations) + localAdditions.wbt_calculations,
                risk_scores: Math.max(0, base.risk_scores - offsets.risk_scores) + localAdditions.risk_scores,
                alerts_generated: Math.max(0, base.alerts_generated - offsets.alerts_generated) + localAdditions.alerts_generated,
                forecast_days: Math.max(0, base.forecast_days - offsets.forecast_days) + localAdditions.forecast_days,
                warnings: Math.max(0, base.warnings - offsets.warnings) + localAdditions.warnings,
                hne_checks: Math.max(0, base.hne_checks - offsets.hne_checks) + localAdditions.hne_checks,
            };

            return displayed;
        },
        getLastReset: async () => {
            try {
                const resetAt = localStorage.getItem("climateshield_metrics_reset");
                return { last_reset_at: resetAt };
            } catch {
                return { last_reset_at: null };
            }
        }
    },
    agents: {
        getStatus: async () => {
            return { status: "offline", message: "Agents not available in static mode" };
        },
        getStreamUrl: () => "",
    }
};
