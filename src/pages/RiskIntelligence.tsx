import { useState, useEffect, useCallback } from 'react';
import { api } from '@/services/api';
import { useOfflineCache } from '@/hooks/useOfflineCache';
import { OfflineBanner } from '@/components/OfflineBanner';
import { useRetry } from '@/context/RetryContext';
import type { WeatherReading, WeatherForecastDay, TrendPoint } from '@/sections/risk-intelligence/types';
import { HotNightMonitor } from '@/sections/risk-intelligence/components/HotNightMonitor';
import { RiskGrid } from '@/sections/risk-intelligence/components/RiskGrid';
import { WBTTimeSeriesGraph } from '@/sections/risk-intelligence/components/WBTTimeSeriesGraph';
import { ForecastDashboard } from '@/sections/risk-intelligence/components/ForecastDashboard';
import { RiskScoreGauge } from '@/sections/risk-intelligence/components/RiskScoreGauge';
import { RiskHistoryModal } from '@/sections/risk-intelligence/components/RiskHistoryModal';
import { StationDetailModal } from '@/sections/risk-intelligence/components/StationDetailModal';
import { StationDataTable } from '@/sections/risk-intelligence/components/StationDataTable';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { WarningsCard } from '@/sections/risk-intelligence/components/WarningsCard';
import { AlertTriangle, RefreshCw, Info,  } from 'lucide-react';

export default function RiskIntelligence() {
    const { read, write } = useOfflineCache();
    const { retryKey, triggerRetry } = useRetry();
    const [readings, setReadings] = useState<WeatherReading[]>(() => read<WeatherReading[]>("risk_intelligence")?.data ?? []);
    const [forecast, setForecast] = useState<WeatherForecastDay[]>([]);
    const [trends, setTrends] = useState<TrendPoint[]>([]);
    const [riskConfig, setRiskConfig] = useState<any>(null);
    const [selectedStation, setSelectedStation] = useState<string>('Hong Kong Observatory');
    const [modalOpen, setModalOpen] = useState(false);
    const [detailModalOpen, setDetailModalOpen] = useState(false);
    const [detailStation, setDetailStation] = useState<WeatherReading | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isOffline, setIsOffline] = useState(false);
    const [lastSuccessfulFetch, setLastSuccessfulFetch] = useState<number | null>(
        () => read<WeatherReading[]>("risk_intelligence")?.timestamp ?? null
    );
    // Open-Meteo beta flag for extended 14-day forecast (shared with Settings page)
    const [openMeteoBeta] = useState<boolean>(() => {
        try {
            return localStorage.getItem("climateshield_openmeteo_beta") === "true";
        } catch {
            return false;
        }
    });

    const fetchAll = useCallback(async () => {
        setLoading(true);
        setError(null);
        setIsOffline(false);
        try {
            const [currentData, forecastData, trendsData, riskCfg] = await Promise.all([
                api.weather.getCurrent().catch(() => []),
                api.weather.getForecast(openMeteoBeta).catch(() => []),
                api.weather.getTrends(openMeteoBeta).catch(() => ({ backward: [], forward: [] })),
                api.weather.getRiskConfig().catch(() => null),
            ]);
            const ALLOWED_STATIONS = [
                'Hong Kong Observatory',
                'Kai Tak Runway Park',
                "King's Park",
                'Kowloon City',
                'Sham Shui Po',
            ];
            const filteredReadings = (currentData || []).filter((r: any) =>
                ALLOWED_STATIONS.includes(r.station)
            );
            setReadings(filteredReadings);
            write("risk_intelligence", filteredReadings);
            setLastSuccessfulFetch(Date.now());
            setForecast(Array.isArray(forecastData) ? forecastData : []);
            const backward = (trendsData?.backward || []).map((t: any) => ({ ...t, type: 'history' as const }));
            const forward = (trendsData?.forward || []).map((t: any) => ({ ...t, type: 'forecast' as const }));
            setTrends([...backward, ...forward]);
            if (riskCfg) setRiskConfig(riskCfg);
        } catch (e) {
            console.error('RiskIntelligence fetch error:', e);
            const cached = read<WeatherReading[]>("risk_intelligence");
            if (cached && cached.data.length > 0) {
                setReadings(cached.data);
                setLastSuccessfulFetch(cached.timestamp);
                setIsOffline(true);
            } else {
                setError(e instanceof Error ? e.message : 'Failed to load risk intelligence data');
            }
        } finally {
            setLoading(false);
        }
    }, [read, write, openMeteoBeta]);

    useEffect(() => {
        fetchAll();
        const iv = setInterval(fetchAll, 300000); // 5 minutes
        return () => clearInterval(iv);
    }, [fetchAll, retryKey]);

    // Check if extended forecast data is actually available when beta is enabled
    const hasExtendedData = forecast.some(d => d.source === 'open_meteo');
    const showExtendedWarning = openMeteoBeta && !hasExtendedData && !loading && forecast.length > 0;

    return (
        <div className="space-y-6 pb-12">
            {isOffline && (
                <OfflineBanner lastSuccessfulFetch={lastSuccessfulFetch} onRetry={triggerRetry} />
            )}
            {/* Page Header */}
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-heading font-bold tracking-tight">Risk Intelligence</h1>
                    <p className="text-muted-foreground mt-2">
                        Live HKO weather data, wet-bulb analysis, and AI-enhanced risk forecasting powered by ClimateShield.
                    </p>
                </div>
            </div>

            {/* Error Banner */}
            {error && (
                <div className="flex items-center gap-3 p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive">
                    <AlertTriangle className="h-5 w-5 shrink-0" />
                    <div className="flex-1">
                        <p className="text-sm font-medium">{error}</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={fetchAll}>
                        <RefreshCw className="w-4 h-4 mr-1" />
                        Retry
                    </Button>
                </div>
            )}

            {/* Empty State */}
            {!loading && !error && readings.length === 0 && (
                <div className="flex flex-col items-center justify-center p-8 text-center space-y-4 border rounded-lg">
                    <p className="text-muted-foreground font-medium">No weather data available</p>
                    <p className="text-sm text-muted-foreground">Try refreshing to fetch the latest readings from HKO.</p>
                    <Button onClick={fetchAll} variant="outline">
                        <RefreshCw className="w-4 h-4 mr-1" />
                        Refresh
                    </Button>
                </div>
            )}

            {/* Desktop: District Risk Map at top */}
            <div className="hidden lg:block">
                <h2 className="text-lg font-semibold mb-3">District Risk Map</h2>
                {loading && readings.length === 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {Array.from({ length: 5 }).map((_, i) => (
                            <Skeleton key={i} className="h-40 w-full rounded-lg" />
                        ))}
                    </div>
                ) : (
                    <RiskGrid
                        readings={readings}
                        selectedStationId={selectedStation}
                        onStationSelect={setSelectedStation}
                        onStationDetail={(reading) => { setDetailStation(reading); setDetailModalOpen(true); }}
                    />
                )}
            </div>

            {/* Desktop: Risk Score Gauge + WBT Timeline + Forecast Dashboard */}
            <div className="hidden lg:grid grid-cols-1 lg:grid-cols-2 gap-6">
                {loading && readings.length === 0 ? (
                    <>
                        <Skeleton className="h-64 w-full rounded-lg" />
                        <Skeleton className="h-64 w-full rounded-lg" />
                    </>
                ) : (
                    <>
                        <div className="space-y-6">
                            <RiskScoreGauge
                                readings={readings}
                                selectedStation={selectedStation}
                                onStationSelect={setSelectedStation}
                            />
                                            <WBTTimeSeriesGraph forecastDays={forecast} selectedStation={selectedStation} riskConfig={riskConfig} />
                        </div>
                        <div className="space-y-4">
                            {showExtendedWarning && (
                                <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-700 dark:text-yellow-400 text-sm">
                                    <Info className="w-4 h-4 shrink-0 mt-0.5" />
                                    <span>Extended forecast (days 10-14) not yet available. Enable Open-Meteo beta in Settings, then refresh.</span>
                                </div>
                            )}
                            <ForecastDashboard forecast={forecast} onScoreClick={() => setModalOpen(true)} riskConfig={riskConfig} />
                        </div>
                    </>
                )}
            </div>

            {/* Phase 5.1: Night Heat Stress Monitor */}
            <HotNightMonitor />

            {/* Phase B: HKO Weather Warnings */}
            <WarningsCard />

            {/* Mobile: District Risk Map stays in original position */}
            <div className="lg:hidden">
                <h2 className="text-lg font-semibold mb-3">District Risk Map</h2>
                {loading && readings.length === 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {Array.from({ length: 5 }).map((_, i) => (
                            <Skeleton key={i} className="h-40 w-full rounded-lg" />
                        ))}
                    </div>
                ) : (
                    <RiskGrid
                        readings={readings}
                        selectedStationId={selectedStation}
                        onStationSelect={setSelectedStation}
                        onStationDetail={(reading) => { setDetailStation(reading); setDetailModalOpen(true); }}
                    />
                )}
            </div>

            {/* Mobile: Risk Score Gauge + WBT Timeline + Forecast Dashboard */}
            <div className="lg:hidden grid grid-cols-1 gap-6">
                {loading && readings.length === 0 ? (
                    <>
                        <Skeleton className="h-64 w-full rounded-lg" />
                        <Skeleton className="h-64 w-full rounded-lg" />
                    </>
                ) : (
                    <>
                        <RiskScoreGauge
                            readings={readings}
                            selectedStation={selectedStation}
                            onStationSelect={setSelectedStation}
                        />
                        <WBTTimeSeriesGraph forecastDays={forecast} selectedStation={selectedStation} riskConfig={riskConfig} />
                        {showExtendedWarning && (
                            <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-700 dark:text-yellow-400 text-sm">
                                <Info className="w-4 h-4 shrink-0 mt-0.5" />
                                <span>Extended forecast (days 10-14) not yet available. Enable Open-Meteo beta in Settings, then refresh.</span>
                            </div>
                        )}
                        <ForecastDashboard forecast={forecast} onScoreClick={() => setModalOpen(true)} riskConfig={riskConfig} />
                    </>
                )}
            </div>

            {/* Phase 5.4: Risk History Modal */}
            <RiskHistoryModal open={modalOpen} onClose={() => setModalOpen(false)} trends={trends} riskConfig={riskConfig} />

            {/* Phase 4: Station Detail Modal */}
            <StationDetailModal open={detailModalOpen} station={detailStation} onClose={() => setDetailModalOpen(false)} />

            {/* Phase 5.5: Station Data Table (bottom section) */}
            <StationDataTable readings={readings} />
        </div>
    );
}
