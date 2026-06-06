/**
 * Backwards-compatible facade over the TanStack Query hooks.
 *
 * Existing pages import this and get a hook that:
 *  - subscribes to ``useControlPlane`` + ``useWarnings``
 *  - re-derives the legacy ``District[]`` shape with risk-level strings
 *  - pulls a live risk score per station (matching the prior behaviour)
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
    liveScoreQuery,
    useControlPlane,
    useLiveScore,
    useWarnings,
} from '@/services/queryClient';
import { getActiveRiskConfig } from '@/services/api';
import type { District, TrendDirection } from '@/sections/control-plane/types';
import type { RiskConfig } from '@/types/api';
import { resolveRiskState } from '@/sections/risk-intelligence/utils/riskStates';

interface UseControlPlaneDataResult {
    districts: District[];
    activeWarnings: Array<{ warning_type: string; signal: string | null }>;
    loading: boolean;
    error: string | null;
    isOffline: boolean;
    lastSuccessfulFetch: number | null;
    refetch: () => Promise<unknown>;
    riskConfig: RiskConfig | null;
}

export function useControlPlaneData(): UseControlPlaneDataResult {
    const control = useControlPlane();
    const warnings = useWarnings();
    const queryClient = useQueryClient();

    const [districts, setDistricts] = useState<District[]>([]);
    const [riskConfig, setRiskConfig] = useState<RiskConfig | null>(null);
    const prevHneRef = useRef<Record<string, number | null>>({});
    const [lastSuccessfulFetch, setLastSuccessfulFetch] = useState<number | null>(null);

    // Per-station live score (kept for backwards compatibility with the
    // old hook surface; in a future iteration we can replace this with
    // useQueries({ queries: stations.map(liveScoreQuery) })
    useEffect(() => {
        let cancelled = false;
        async function prime() {
            let cfg: RiskConfig | null = null;
            try {
                cfg = await getActiveRiskConfig();
            } catch {
                // Config fetch failure is non-fatal; fall back to defaults
            }
            if (cancelled) return;
            setRiskConfig(cfg);

            const next: District[] = [];
            for (const r of control.data ?? []) {
                try {
                    const live = await queryClient.fetchQuery(liveScoreQuery(r.station));
                    if (cancelled) return;
                    const id = r.station || `station-${r.id}`;
                    const prevHne = prevHneRef.current[id] ?? null;
                    let hneTrend: TrendDirection = 'stable';
                    if (r.hne !== null && prevHne !== null) {
                        const delta = r.hne - prevHne;
                        if (delta > 0.5) hneTrend = 'up';
                        else if (delta < -0.5) hneTrend = 'down';
                    }
                    prevHneRef.current[id] = r.hne ?? null;

                    const resolved = resolveRiskState(live.value, cfg?.state_ranges);
                    next.push({
                        id,
                        name: r.station,
                        riskScore: live.value,
                        riskLevel: resolved.name,
                        trend: 'stable',
                        primaryDriver:
                            live.breakdown ||
                            (r.wet_bulb_temp_c && r.wet_bulb_temp_c > 31.5
                                ? `Wet-Bulb ${r.wet_bulb_temp_c.toFixed(1)}°C`
                                : `Temp ${r.temp_c}°C / RH ${r.humidity_pct}%`),
                        lastUpdated: r.recorded_at,
                        // Real history would come from /api/weather/history/readings;
                        // until then, surface a single-point array so consumers
                        // don't crash on a synthetic sine wave.
                        history: [live.value],
                        hne: r.hne ?? null,
                        hneTrend,
                    });
                } catch (err) {
                    // Station-level failures shouldn't fail the whole hook
                    console.warn(`useControlPlaneData: failed to load live score for ${r.station}`, err);
                }
            }
            if (!cancelled) {
                setDistricts(next);
                setLastSuccessfulFetch(Date.now());
            }
        }
        prime();
        return () => {
            cancelled = true;
        };
    }, [control.data, queryClient]);

    const isOffline = control.isError || (control.data?.length ?? 0) === 0;
    const error = control.error instanceof Error ? control.error.message : null;
    const activeWarnings = useMemo(
        () =>
            (warnings.data ?? [])
                .filter((w) => w.status === 'active')
                .map((w) => ({ warning_type: w.warning_type, signal: w.signal })),
        [warnings.data],
    );

    return {
        districts,
        activeWarnings,
        loading: control.isLoading || districts.length === 0,
        error,
        isOffline,
        lastSuccessfulFetch,
        riskConfig,
        refetch: async () => {
            await Promise.all([control.refetch(), warnings.refetch()]);
        },
    };
}

// Re-export so call sites that import ``useLiveScore`` from this file
// keep working without an extra import.
export { useLiveScore };
