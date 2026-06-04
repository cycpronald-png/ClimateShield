/**
 * TanStack Query client + query-option factories.
 *
 * Replaces the hand-rolled ``useControlPlaneData`` / ``useOfflineCache`` /
 * ``RetryContext`` trio with a single, well-tested async-state primitive
 * (per Context7/TanStack Query v5 best practices).
 */
import {
    QueryClient,
    queryOptions,
    useMutation,
    useQuery,
    useQueryClient,
} from '@tanstack/react-query';
import { api } from '@/services/api';
import type {
    DonationPledge,
    DonationPledgeResponse,
    LiveRiskScore,
    RiskConfig,
    SystemAlert,
    WeatherForecastDay,
    WeatherReading,
    WeatherWarning,
} from '@/types/api';

export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            // Live data is updated by the backend every 10 min; keep data
            // fresh for 60s before refetching on mount.
            staleTime: 60_000,
            gcTime: 5 * 60_000,
            retry: 2,
            refetchOnWindowFocus: false,
        },
    },
});

// --------------------------------------------------------------------------- //
// Query option factories                                                      //
// --------------------------------------------------------------------------- //

export const controlPlaneQuery = () =>
    queryOptions({
        queryKey: ['control-plane'] as const,
        queryFn: api.weather.getCurrent,
        refetchInterval: 5 * 60_000,
    });

export const warningsQuery = () =>
    queryOptions({
        queryKey: ['warnings'] as const,
        queryFn: api.weather.getWarnings,
        refetchInterval: 5 * 60_000,
    });

export const forecastQuery = () =>
    queryOptions({
        queryKey: ['forecast'] as const,
        queryFn: api.weather.getForecast,
        refetchInterval: 30 * 60_000,
    });

export const risksQuery = () =>
    queryOptions({
        queryKey: ['risks'] as const,
        queryFn: api.weather.getRisks,
        refetchInterval: 10 * 60_000,
    });

export const historyQuery = () =>
    queryOptions({
        queryKey: ['history'] as const,
        queryFn: api.weather.getHistory,
        refetchInterval: 30 * 60_000,
    });

export const trendsQuery = () =>
    queryOptions({
        queryKey: ['trends'] as const,
        queryFn: api.weather.getTrends,
        refetchInterval: 10 * 60_000,
    });

export const unreadAlertsQuery = () =>
    queryOptions({
        queryKey: ['alerts', 'unread'] as const,
        queryFn: api.weather.getUnreadAlerts,
        refetchInterval: 2 * 60_000,
    });

export const riskConfigQuery = () =>
    queryOptions({
        queryKey: ['risk-config'] as const,
        queryFn: api.weather.getRiskConfig,
        staleTime: 5 * 60_000,
    });

export function liveScoreQuery(station: string) {
    return queryOptions({
        queryKey: ['live-score', station] as const,
        queryFn: () => api.weather.getLiveScore(station),
        enabled: !!station,
    });
}

// --------------------------------------------------------------------------- //
// Typed hooks (thin wrappers, see Context7/TanStack overview)                 //
// --------------------------------------------------------------------------- //

export const useControlPlane = () => useQuery(controlPlaneQuery());
export const useWarnings = () => useQuery(warningsQuery());
export const useForecast = () => useQuery(forecastQuery());
export const useRisks = () => useQuery(risksQuery());
export const useHistory = () => useQuery(historyQuery());
export const useTrends = () => useQuery(trendsQuery());
export const useUnreadAlerts = () => useQuery(unreadAlertsQuery());
export const useRiskConfig = () => useQuery(riskConfigQuery());
export const useLiveScore = (station: string) => useQuery(liveScoreQuery(station));

// --------------------------------------------------------------------------- //
// Mutations                                                                   //
// --------------------------------------------------------------------------- //

export function useCreatePledge() {
    const qc = useQueryClient();
    return useMutation<DonationPledgeResponse | { success: true }, Error, DonationPledge>({
        mutationFn: (data) => api.donate.createPledge(data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['donations'] });
        },
    });
}

export function useAckAlert() {
    const qc = useQueryClient();
    return useMutation<{ success: true }, Error, number>({
        mutationFn: (id) => api.weather.ackAlert(id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['alerts', 'unread'] });
        },
    });
}

// --------------------------------------------------------------------------- //
// Re-exports for callers that want the underlying primitives                   //
// --------------------------------------------------------------------------- //

export type {
    DonationPledge,
    DonationPledgeResponse,
    LiveRiskScore,
    RiskConfig,
    SystemAlert,
    WeatherForecastDay,
    WeatherReading,
    WeatherWarning,
};
