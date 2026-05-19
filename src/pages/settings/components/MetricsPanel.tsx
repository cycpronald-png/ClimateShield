import { BarChart3, Trash2, CloudDownload, CloudSun, Flame, ShieldAlert, Bell, CalendarDays, AlertTriangle, Sun, type LucideIcon } from 'lucide-react';

interface MetricsPanelProps {
    metrics: Record<string, number> | null;
    loading: boolean;
    lastResetAt: string | null;
    onResetClick: () => void;
}

const METRIC_LABELS: Record<string, string> = {
    hko_fetches: 'HKO Data Fetches',
    weather_readings: 'Weather Readings',
    wbt_calculations: 'WBT Calculations',
    risk_scores: 'Risk Scores',
    alerts_generated: 'Alerts Generated',
    forecast_days: 'Forecast Days',
    warnings: 'Warnings',
    hne_checks: 'HNE Checks',
};

const METRIC_ICONS: Record<string, LucideIcon> = {
    hko_fetches: CloudDownload,
    weather_readings: CloudSun,
    wbt_calculations: Flame,
    risk_scores: ShieldAlert,
    alerts_generated: Bell,
    forecast_days: CalendarDays,
    warnings: AlertTriangle,
    hne_checks: Sun,
};

export function MetricsPanel({ metrics, loading, lastResetAt, onResetClick }: MetricsPanelProps) {
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
                        {Object.entries(metrics).map(([key, value]) => {
                            const Icon = METRIC_ICONS[key];
                            return (
                                <div key={key} className="bg-white dark:bg-zinc-800 rounded-lg p-4 border border-zinc-200 dark:border-zinc-700 shadow-sm flex items-start gap-3">
                                    {Icon && <Icon className="w-5 h-5 text-zinc-400 dark:text-zinc-500 mt-0.5 shrink-0" />}
                                    <div className="min-w-0">
                                        <div className="text-xs text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-1">{METRIC_LABELS[key] || key}</div>
                                        <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{value.toLocaleString()}</div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    <div className="flex justify-end">
                        <button
                            onClick={onResetClick}
                            className="flex items-center gap-2 px-4 py-2 border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-sm font-medium transition-colors"
                        >
                            <Trash2 className="w-4 h-4" />
                            Reset Statistics
                        </button>
                    </div>
                </div>
            ) : (
                <p className="text-sm text-zinc-500">No metrics available.</p>
            )}
        </div>
    );
}
