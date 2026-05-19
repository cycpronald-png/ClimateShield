const API_BASE = "/api";

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
            const response = await fetch(`${API_BASE}/weather/current`);
            if (!response.ok) throw new Error("Failed to fetch current weather");
            return response.json();
        },
        getForecast: async (beta14day: boolean = false) => {
            const params = new URLSearchParams();
            if (beta14day) params.set("beta_14day", "true");
            const query = params.toString();
            const response = await fetch(`${API_BASE}/weather/forecast${query ? `?${query}` : ''}`);
            if (!response.ok) throw new Error("Failed to fetch forecast");
            return response.json();
        },
        getRisks: async () => {
            const response = await fetch(`${API_BASE}/weather/risks`);
            if (!response.ok) throw new Error("Failed to fetch risk outlook");
            return response.json();
        },
        getWarnings: async () => {
            const response = await fetch(`${API_BASE}/weather/warnings`);
            if (!response.ok) throw new Error("Failed to fetch warnings");
            return response.json();
        },
        getHistory: async (days: number = 7, station?: string, beta14day: boolean = false) => {
            const params = new URLSearchParams({ days: String(days) });
            if (station) params.set("station", station);
            if (beta14day) params.set("beta_14day", "true");
            const response = await fetch(`${API_BASE}/weather/history?${params}`);
            if (!response.ok) throw new Error("Failed to fetch weather history");
            return response.json();
        },
        getHistoricalReadings: async (station: string, hours: number = 12) => {
            const params = new URLSearchParams({ station, hours: String(hours) });
            const response = await fetch(`${API_BASE}/weather/history/readings?${params}`);
            if (!response.ok) throw new Error("Failed to fetch historical readings");
            return response.json();
        },
        getLiveScore: async (station: string) => {
            const params = new URLSearchParams({ station });
            const response = await fetch(`${API_BASE}/weather/live-score?${params}`, {
                method: "POST",
            });
            if (!response.ok) throw new Error("Failed to fetch live risk score");
            return response.json();
        },
        getTrends: async () => {
            const response = await fetch(`${API_BASE}/weather/trends`);
            if (!response.ok) throw new Error("Failed to fetch weather trends");
            return response.json();
        },
        getRiskConfig: async () => {
            const response = await fetch(`${API_BASE}/weather/risk-config`);
            if (!response.ok) throw new Error("Failed to fetch risk config");
            return response.json();
        },
        getUnreadAlerts: async () => {
            const response = await fetch(`${API_BASE}/weather/alerts/unread`);
            if (!response.ok) throw new Error("Failed to fetch unread alerts");
            return response.json();
        },
        ackAlert: async (id: number) => {
            const response = await fetch(`${API_BASE}/weather/alerts/${id}/ack`, {
                method: "POST",
            });
            if (!response.ok) throw new Error("Failed to acknowledge alert");
            return response.json();
        },
        refresh: async () => {
            const response = await fetch(`${API_BASE}/weather/refresh`, {
                method: "POST",
            });
            if (!response.ok) throw new Error("Failed to refresh HKO data");
            return response.json();
        },
        getMetrics: async () => {
            const response = await fetch(`${API_BASE}/weather/metrics`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
            });
            if (!response.ok) throw new Error("Failed to fetch metrics");
            return response.json();
        },
        resetMetrics: async (password: string) => {
            const response = await fetch(`${API_BASE}/weather/metrics/reset`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ password }),
            });
            if (!response.ok) throw new Error("Invalid password or server error");
            return response.json();
        },
        getLastReset: async () => {
            const response = await fetch(`${API_BASE}/weather/metrics/last-reset`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
            });
            if (!response.ok) throw new Error("Failed to fetch last reset");
            return response.json();
        },
        verifyPassword: async (password: string) => {
            const response = await fetch(`${API_BASE}/weather/verify-password`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ password }),
            });
            if (!response.ok) throw new Error("Invalid password or server error");
            return response.json();
        },
        getLastRefresh: async () => {
            const response = await fetch(`${API_BASE}/weather/last-refresh`);
            if (!response.ok) throw new Error("Failed to fetch last refresh timestamp");
            return response.json();
        },
    },
    agents: {
        getStatus: async () => {
            const response = await fetch(`${API_BASE}/agents/status`);
            if (!response.ok) throw new Error("Failed to fetch agent status");
            return response.json();
        },
        getStreamUrl: () => `${API_BASE}/agents/stream`,
    }
};
