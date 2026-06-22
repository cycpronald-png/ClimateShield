import { BarChart3, CloudDownload, CloudSun, Flame, ShieldAlert, Bell, CalendarDays, AlertTriangle, Sun, type LucideIcon } from 'lucide-react';

interface MetricsPanelProps {
    metrics: Record<string, number> | null;
    loading: boolean;
    lastResetAt: string | null;
}

const METRIC_KEYS = [
    'hko_fetches',
    'weather_readings',
    'wbt_calculations',
    'risk_scores',
    'alerts_generated',
    'forecast_days',
    'warnings',
    'hne_checks',
] as const;

type MetricKey = (typeof METRIC_KEYS)[number];

const METRIC_LABELS: Record<MetricKey, string> = {
    hko_fetches: 'HKO Data Fetches',
    weather_readings: 'Weather Readings',
    wbt_calculations: 'WBT Calculations',
    risk_scores: 'Risk Scores',
    alerts_generated: 'Alerts Generated',
    forecast_days: 'Forecast Days',
    warnings: 'Warnings',
    hne_checks: 'HNE Checks',
};

const METRIC_ICONS: Record<MetricKey, LucideIcon> = {
    hko_fetches: CloudDownload,
    weather_readings: CloudSun,
    wbt_calculations: Flame,
    risk_scores: ShieldAlert,
    alerts_generated: Bell,
    forecast_days: CalendarDays,
    warnings: AlertTriangle,
    hne_checks: Sun,
};

export function MetricsPanel({ metrics, loading, lastResetAt }: MetricsPanelProps) {
    // Build a stable, deduplicated, number-only map. We iterate in the
    // declared METRIC_KEYS order so the grid layout doesn't shuffle
    // when the backend returns keys in a different order, and we
    // silently drop any key whose value isn't a finite number.
    const display: Array<[MetricKey, number]> = METRIC_KEYS.map((key) => [
        key,
        typeof metrics?.[key] === 'number' && Number.isFinite(metrics![key])
            ? (metrics![key] as number)
            : 0,
    ]);
    // ponytail: hard-coded alerts_generated === warnings (backend counter unused); wire backend when real alerts needed
    const warningsValue = display.find(([k]) => k === 'warnings')?.[1] ?? 0;

    return (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className="text-lg font-semibold">Impact Metrics</h2>
                    <p className="text-sm text-zinc-500">Cumulative lifetime totals for KPI reporting.</p>
                </div>
                <BarChart3 className="w-5 h-5 text-zinc-400" />
            </div>

            {loading ? (
                <div className="flex items-center justify-center h-32">
                    <div className="w-6 h-6 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
                </div>
            ) : metrics ? (
                <div className="space-y-4">
                    {lastResetAt && (
                        <div className="text-xs text-zinc-500 dark:text-zinc-400 text-right">
                            Last reset: {new Date(lastResetAt).toLocaleString()}
                        </div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                        {display.map(([key, value]) => {
                            const v = key === 'alerts_generated' ? warningsValue : value;
                            const Icon = METRIC_ICONS[key];
                            return (
                                <div key={key} className="bg-white dark:bg-zinc-800 rounded-lg p-4 border border-zinc-200 dark:border-zinc-700 shadow-sm flex items-start gap-3">
                                    {Icon && <Icon className="w-5 h-5 text-zinc-400 dark:text-zinc-500 mt-0.5 shrink-0" />}
                                    <div className="min-w-0">
                                        <div className="text-xs text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-1">{METRIC_LABELS[key]}</div>
                                        <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{v.toLocaleString()}</div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            ) : (
                <p className="text-sm text-zinc-500">No metrics available.</p>
            )}
        </div>
    );
}
