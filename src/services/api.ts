const API_BASE = "/api";
const DATA_BASE = import.meta.env.BASE_URL + 'data/';

export const api = {
    donate: {
        createPledge: async (data: any) => {
            const response = await fetch(`${API_BASE}/donor/pledge`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(data),
            });
            if (!response.ok) throw new Error("Failed to submit pledge");
            return response.json();
        },
    },
    admin: {
        getDonations: async () => {
            const response = await fetch(`${API_BASE}/admin/donations`);
            if (!response.ok) throw new Error("Failed to fetch donations");
            return response.json();
        },
        getRiskConfig: async (password: string) => {
            const response = await fetch(`${API_BASE}/admin/risk-config`, {
                headers: {
                    "X-Admin-Password": password,
                },
            });
            if (!response.ok) throw new Error("Failed to fetch risk config");
            return response.json();
        },
        updateRiskConfig: async (password: string, config: any) => {
            const response = await fetch(`${API_BASE}/admin/risk-config`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ password, config }),
            });
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.detail || "Failed to update risk config");
            }
            return response.json();
        },
        resetRiskConfig: async (password: string) => {
            const response = await fetch(`${API_BASE}/admin/risk-config/reset`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ password }),
            });
            if (!response.ok) throw new Error("Failed to reset risk config");
            return response.json();
        },
        testRiskConfig: async (password: string, config: any) => {
            const response = await fetch(`${API_BASE}/admin/risk-config/test`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ password, config }),
            });
            if (!response.ok) throw new Error("Failed to test risk config");
            return response.json();
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
            return response.json();
        },
        getRisks: async () => {
            const response = await fetch(`${API_BASE}/weather/risks`);
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
            // Filter by station and limit to requested hours
            return (all || []).filter((r: any) => r.station === station).slice(0, hours);
        },
        getLiveScore: async (station: string) => {
            const response = await fetch(`${DATA_BASE}current.json`);
            if (!response.ok) throw new Error("Failed to fetch live risk score");
            const all = await response.json();
            const found = (all || []).find((r: any) => r.station === station);
            return found || { station, composite_risk_score: 0, risk_level: "Safe" };
        },
        getTrends: async () => {
            const response = await fetch(`${DATA_BASE}current.json`);
            if (!response.ok) return { backward: [], forward: [] };
            const all = await response.json();
            // Mock trends from current data
            const backward = (all || []).map((r: any) => ({
                date: r.recorded_at,
                score: r.composite_risk_score,
                type: 'history'
            }));
            return { backward, forward: [] };
        },
        getRiskConfig: async () => {
            const response = await fetch(`${DATA_BASE}state.json`);
            if (!response.ok) throw new Error("Failed to fetch risk config");
            return response.json();
        },
        getUnreadAlerts: async () => {
            const response = await fetch(`${DATA_BASE}warnings.json`);
            if (!response.ok) return [];
            const all = await response.json();
            return (all || []).map((w: any, i: number) => ({ ...w, id: i, acknowledged: false }));
        },
        ackAlert: async (_id: number) => {
            // No-op in static mode
            return { success: true };
        },
        getMetrics: async () => {
            const response = await fetch(`${DATA_BASE}current.json`);
            if (!response.ok) return { stations: 0, avg_score: 0 };
            const all = await response.json();
            const stations = (all || []).length;
            const avg = stations > 0 ? (all as any[]).reduce((s, r) => s + (r.composite_risk_score || 0), 0) / stations : 0;
            return { stations, avg_score: Math.round(avg * 10) / 10 };
        },
        resetMetrics: async (_password?: string) => {
            // No-op in static mode
            return { success: true };
        },
        getLastReset: async () => {
            return { last_reset_at: null };
        },
        verifyPassword: async (_password?: string) => {
            // No-op in static mode (no admin features)
            return { valid: true };
        }
    },
    agents: {
        getStatus: async () => {
            return { status: "offline", message: "Agents not available in static mode" };
        },
        getStreamUrl: () => "",
    }
};
