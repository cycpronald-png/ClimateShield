import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '@/services/api';
import { useOfflineCache } from '@/hooks/useOfflineCache';
import { useRetry } from '@/context/RetryContext';
import type { District, TrendDirection } from '@/sections/control-plane/types';

export function useControlPlaneData() {
    const { retryKey } = useRetry();
    const { read, write } = useOfflineCache();
    const [districts, setDistricts] = useState<District[]>(() => read<District[]>("control_plane")?.data ?? []);
    const [activeWarnings, setActiveWarnings] = useState<Array<{ warning_type: string; signal: string | null }>>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isOffline, setIsOffline] = useState(false);
    const [lastSuccessfulFetch, setLastSuccessfulFetch] = useState<number | null>(
        () => read<District[]>("control_plane")?.timestamp ?? null
    );
    const attemptedRefresh = useRef(false);
    const prevHneRef = useRef<Record<string, number | null>>({});

    const fetchData = useCallback(async (allowRefresh = true) => {
        setLoading(true);
        setError(null);
        setIsOffline(false);
        try {
            const [readings, warnings] = await Promise.all([
                api.weather.getCurrent(),
                api.weather.getWarnings().catch(() => []),
            ]);
            const ALLOWED_STATIONS = [
                'Hong Kong Observatory',
                "Kai Tak Runway Park",
                "King's Park",
                'Kowloon City',
                'Sham Shui Po',
            ];
            const stations = (readings || []).filter((r: any) => ALLOWED_STATIONS.includes(r.station));

            // If no data and we haven't tried refreshing yet, trigger a manual refresh
            if (stations.length === 0 && allowRefresh && !attemptedRefresh.current) {
                attemptedRefresh.current = true;
                try {
                    // Wait a moment for DB to persist, then re-fetch without allowing another refresh
                    await new Promise(r => setTimeout(r, 1500));
                    await fetchData(false);
                    return;
                } catch (refreshErr: any) {
                    setError(refreshErr.message || 'Failed to refresh weather data from HKO. The service may be temporarily unavailable.');
                    setLoading(false);
                    return;
                }
            }

            const enriched = stations.map((r: any) => {
                const wbt = r.wet_bulb_temp_c ?? 0;
                const temp = r.temp_c ?? 0;
                const rh = r.humidity_pct ?? 0;
                const hne = r.hne ?? null;

                // Composite score sync calculation (matches backend logic)
                let baseScore = 0;
                if (wbt < 28) baseScore = (wbt / 28) * 20;
                else if (wbt <= 29) baseScore = 20 + ((wbt - 28) / 1) * 20;
                else if (wbt <= 31.5) baseScore = 40 + ((wbt - 29) / 2.5) * 30;
                else if (wbt <= 35) baseScore = 70 + ((wbt - 31.5) / 3.5) * 20;
                else baseScore = 90 + Math.min(10, (wbt - 35) * 3);

                const rhBonus = rh > 85 ? 10 : 0;
                const hneBonus = (hne !== null && hne >= 17.7) ? 10 : 0;
                const compositeScore = Math.min(100, Math.round(baseScore + rhBonus + hneBonus));

                let riskLevel: District['riskLevel'] = 'low';
                if (compositeScore >= 90) riskLevel = 'critical';
                else if (compositeScore >= 70) riskLevel = 'high';
                else if (compositeScore >= 40) riskLevel = 'moderate';

                const id = r.station || r.id || `station-${Math.random().toString(36).substr(2, 9)}`;
                const prevHne = prevHneRef.current[id] ?? null;
                let hneTrend: TrendDirection = 'stable';
                if (hne !== null && prevHne !== null) {
                    const delta = hne - prevHne;
                    if (delta > 0.5) hneTrend = 'up';
                    else if (delta < -0.5) hneTrend = 'down';
                }
                prevHneRef.current[id] = hne;

                // Generate synthetic history from current reading
                const history = Array.from({ length: 7 }, (_, i) => {
                    const variation = Math.sin(i) * 5;
                    return Math.max(0, Math.min(100, compositeScore + variation));
                });

                return {
                    id,
                    name: r.station || r.district || 'Unknown Station',
                    riskScore: compositeScore,
                    riskLevel,
                    trend: 'stable' as const,
                    primaryDriver: wbt > 31.5 ? `Wet-Bulb ${wbt.toFixed(1)}°C` : `Temp ${temp}°C / RH ${rh}%`,
                    lastUpdated: r.recorded_at || new Date().toISOString(),
                    history,
                    hne,
                    hneTrend,
                };
            });

            setDistricts(enriched);
            write("control_plane", enriched);
            setLastSuccessfulFetch(Date.now());
            setActiveWarnings((warnings || []).filter((w: any) => w.status === 'active').map((w: any) => ({
                warning_type: w.warning_type,
                signal: w.signal,
            })));
        } catch (e) {
            console.error('ControlPlane fetch error:', e);
            const cached = read<District[]>("control_plane");
            if (cached && cached.data.length > 0) {
                setDistricts(cached.data);
                setLastSuccessfulFetch(cached.timestamp);
                setIsOffline(true);
            } else {
                setError(e instanceof Error ? e.message : 'Failed to load weather data');
            }
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        attemptedRefresh.current = false;
    }, [retryKey]);

    useEffect(() => {
        fetchData();
        const iv = setInterval(() => {
            attemptedRefresh.current = false;
            fetchData();
        }, 300000); // 5 minutes
        return () => clearInterval(iv);
    }, [fetchData, retryKey]);

    return { districts, activeWarnings, loading, error, isOffline, lastSuccessfulFetch, refetch: fetchData };
}
