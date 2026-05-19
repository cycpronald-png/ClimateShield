import { useState, useMemo } from 'react';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
    ReferenceArea, ResponsiveContainer,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TrendingUp, AlertTriangle, Droplets, Users, CalendarDays, ChevronDown, ChevronUp } from 'lucide-react';
import type { WeatherForecastDay } from '../types';
import { STATE_META, stateFromScore, ACTION_MAP, RESOURCE_MAP, MAX_RISK_SCORE } from '../utils/riskStates';

interface ForecastDashboardProps {
    forecast: WeatherForecastDay[];
    onScoreClick?: () => void;
}

function formatDate(d: string): string {
    if (!d || d.length < 8) return d;
    return `${d.slice(4, 6)}/${d.slice(6, 8)}`;
}

export function ForecastDashboard({ forecast, onScoreClick }: ForecastDashboardProps) {
    const [viewMode, setViewMode] = useState<'full' | 'chart' | 'actions'>('full');
    const [actionsExpanded, setActionsExpanded] = useState(true);

    const chartData = useMemo(() => {
        return forecast.map((day) => {
            const score = day.composite_risk_score ?? 0;
            const meta = stateFromScore(score);
            return {
                date: formatDate(day.forecast_date),
                rawDate: day.forecast_date,
                score,
                state: meta.name,
                color: meta.color,
                wbt: day.wet_bulb_peak,
                minTemp: day.min_temp,
                maxTemp: day.max_temp,
                source: day.source || 'hko',
                isExtended: (day.source || 'hko') === 'open_meteo',
                action: ACTION_MAP[meta.name],
                resources: RESOURCE_MAP[meta.name],
            };
        });
    }, [forecast]);

    const stats = useMemo(() => {
        if (chartData.length === 0) return null;
        const highRiskDays = chartData.filter(d => d.score >= 17); // Yellow+
        const peakDay = chartData.reduce((max, d) => (d.score > max.score ? d : max), chartData[0]);
        const actionDays = chartData.filter(d => d.score >= 13); // Low+

        // Find consecutive high-risk windows
        let windows: { start: string; end: string; days: number; maxScore: number }[] = [];
        let currentWindow: typeof windows[0] | null = null;
        for (const d of chartData) {
            if (d.score >= 17) {
                if (!currentWindow) {
                    currentWindow = { start: d.date, end: d.date, days: 1, maxScore: d.score };
                } else {
                    currentWindow.end = d.date;
                    currentWindow.days += 1;
                    currentWindow.maxScore = Math.max(currentWindow.maxScore, d.score);
                }
            } else {
                if (currentWindow) {
                    windows.push(currentWindow);
                    currentWindow = null;
                }
            }
        }
        if (currentWindow) windows.push(currentWindow);

        const longestWindow = windows.length > 0
            ? windows.reduce((max, w) => (w.days > max.days ? w : max), windows[0])
            : null;

        return {
            totalDays: chartData.length,
            highRiskDays: highRiskDays.length,
            peakDay,
            actionDays: actionDays.length,
            longestWindow,
        };
    }, [chartData]);

    if (forecast.length === 0) {
        return (
            <Card className="border-zinc-200 dark:border-zinc-800">
                <CardContent className="p-6 text-center text-sm text-zinc-500">
                    No forecast data available.
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="border-zinc-200 dark:border-zinc-800">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                    <TrendingUp className="w-5 h-5" />
                    14-Day Risk Outlook
                </CardTitle>
                <div className="flex gap-1">
                    {(['full', 'chart', 'actions'] as const).map((mode) => (
                        <Button
                            key={mode}
                            size="sm"
                            variant={viewMode === mode ? 'default' : 'outline'}
                            onClick={() => setViewMode(mode)}
                            className="h-7 text-xs px-2"
                        >
                            {mode === 'full' && 'Full'}
                            {mode === 'chart' && 'Chart'}
                            {mode === 'actions' && 'Actions'}
                        </Button>
                    ))}
                </div>
            </CardHeader>

            <CardContent className="space-y-4">
                {/* Layer 1: Trend Chart */}
                {(viewMode === 'full' || viewMode === 'chart') && (
                    <div className="h-[240px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                                <YAxis domain={[0, 30]} tick={{ fontSize: 10 }} />
                                <RechartsTooltip
                                    formatter={(_value: any, _name: any, item: any) => {
                                        const d = item?.payload;
                                        return [
                                            `Score: ${d.score} — ${d.state}`,
                                            `${d.action}`,
                                        ];
                                    }}
                                />

                                {/* State band backgrounds */}
                                {STATE_META.map((s) => (
                                    <ReferenceArea
                                        key={s.name}
                                        y1={s.min}
                                        y2={s.max + 0.5}
                                        fill={s.fill}
                                        stroke="none"
                                    />
                                ))}

                                <Line
                                    type="monotone"
                                    dataKey="score"
                                    stroke="#8884d8"
                                    strokeWidth={2}
                                    dot={{ r: 3, fill: '#8884d8' }}
                                    activeDot={{ r: 5 }}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                )}

                {/* Layer 2: Summary Cards */}
                {(viewMode === 'full' || viewMode === 'actions') && stats && (
                    <div className="grid grid-cols-3 gap-3">
                        <div className="bg-zinc-50 dark:bg-zinc-900 rounded-lg p-3 border border-zinc-200 dark:border-zinc-800">
                            <div className="flex items-center gap-1.5 mb-1">
                                <AlertTriangle className="w-4 h-4 text-red-500" />
                                <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Peak Risk</span>
                            </div>
                            <Badge className={`${stats.peakDay.color === '#22c55e' ? 'bg-emerald-500' : stats.peakDay.color === '#3b82f6' ? 'bg-blue-500' : stats.peakDay.color === '#eab308' ? 'bg-yellow-500 text-black' : stats.peakDay.color === '#ef4444' ? 'bg-red-500' : 'bg-purple-500'} text-white text-xs`}>
                                {stats.peakDay.state}
                            </Badge>
                            <div className="text-[10px] text-zinc-500 mt-1">
                                {stats.peakDay.date} — {stats.peakDay.score}/{MAX_RISK_SCORE}
                            </div>
                            <div className="text-[10px] text-zinc-600 dark:text-zinc-400 mt-0.5 leading-tight">
                                {ACTION_MAP[stats.peakDay.state]}
                            </div>
                        </div>

                        <div className="bg-zinc-50 dark:bg-zinc-900 rounded-lg p-3 border border-zinc-200 dark:border-zinc-800">
                            <div className="flex items-center gap-1.5 mb-1">
                                <CalendarDays className="w-4 h-4 text-amber-500" />
                                <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">High-Risk Window</span>
                            </div>
                            {stats.longestWindow ? (
                                <>
                                    <div className="text-sm font-bold text-zinc-800 dark:text-zinc-200">
                                        {stats.longestWindow.days} days
                                    </div>
                                    <div className="text-[10px] text-zinc-500">
                                        {stats.longestWindow.start} → {stats.longestWindow.end}
                                    </div>
                                    <div className="text-[10px] text-zinc-600 dark:text-zinc-400 mt-0.5">
                                        Max score: {stats.longestWindow.maxScore}/{MAX_RISK_SCORE}
                                    </div>
                                </>
                            ) : (
                                <div className="text-[10px] text-zinc-500">No consecutive high-risk period</div>
                            )}
                        </div>

                        <div className="bg-zinc-50 dark:bg-zinc-900 rounded-lg p-3 border border-zinc-200 dark:border-zinc-800">
                            <div className="flex items-center gap-1.5 mb-1">
                                <Droplets className="w-4 h-4 text-blue-500" />
                                <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Action Days</span>
                            </div>
                            <div className="text-sm font-bold text-zinc-800 dark:text-zinc-200">
                                {stats.actionDays} / {stats.totalDays}
                            </div>
                            <div className="text-[10px] text-zinc-500">
                                Days needing outreach response
                            </div>
                            <div className="text-[10px] text-zinc-600 dark:text-zinc-400 mt-0.5">
                                {RESOURCE_MAP[stateFromScore(stats.peakDay?.score || 0).name]}
                            </div>
                        </div>
                    </div>
                )}

                {/* Layer 3: Daily Action List */}
                {(viewMode === 'full' || viewMode === 'actions') && (
                    <div className="border rounded-lg overflow-hidden">
                        <button
                            onClick={() => setActionsExpanded(!actionsExpanded)}
                            className="w-full flex items-center justify-between px-3 py-2 bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 text-xs font-semibold text-zinc-700 dark:text-zinc-300"
                        >
                            <span className="flex items-center gap-1.5">
                                <Users className="w-3.5 h-3.5" />
                                Daily Action Plan
                            </span>
                            {actionsExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>

                        {actionsExpanded && (
                            <div className="max-h-[280px] overflow-y-auto">
                                {chartData.map((day, i) => {
                                    const meta = stateFromScore(day.score);
                                    return (
                                        <div
                                            key={day.rawDate}
                                            className={`flex items-center gap-3 px-3 py-2 text-sm border-b border-zinc-100 dark:border-zinc-800 last:border-b-0 ${i % 2 === 0 ? 'bg-white dark:bg-zinc-950' : 'bg-zinc-50/50 dark:bg-zinc-900/30'}`}
                                            onClick={onScoreClick}
                                            role="button"
                                        >
                                            {/* Date */}
                                            <div className="w-14 shrink-0 text-xs text-zinc-500">
                                                {day.date}
                                            </div>

                                            {/* Temp range */}
                                            <div className="w-20 shrink-0 text-xs text-zinc-600 dark:text-zinc-400">
                                                {day.minTemp?.toFixed(0) ?? '—'}°–{day.maxTemp?.toFixed(0) ?? '—'}°
                                            </div>

                                            {/* Risk badge */}
                                            <Badge
                                                className={`shrink-0 text-[10px] px-1.5 py-0.5 ${meta.bg} text-white`}
                                            >
                                                {meta.name}
                                            </Badge>

                                            {/* Action text */}
                                            <div className="flex-1 min-w-0">
                                                <div className="text-xs text-zinc-700 dark:text-zinc-300 truncate">
                                                    {day.action}
                                                </div>
                                                <div className="text-[10px] text-zinc-500 truncate">
                                                    {day.resources}
                                                </div>
                                            </div>

                                            {/* Score */}
                                            <div className="w-12 shrink-0 text-right text-xs font-bold text-zinc-600 dark:text-zinc-400">
                                                {day.score}/{MAX_RISK_SCORE}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
