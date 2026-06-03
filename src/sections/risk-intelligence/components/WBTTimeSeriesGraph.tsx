import { useMemo, useState, useEffect, useCallback } from 'react';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
    ReferenceArea, ResponsiveContainer, ReferenceLine, ReferenceDot,
} from 'recharts';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { WeatherForecastDay } from '../types';
import { api } from '@/services/api';

interface WBTTimeSeriesGraphProps {
    selectedStation: string;
    forecastDays: WeatherForecastDay[];
    riskConfig?: any;
}

interface HistoricalReading {
    recorded_at: string;
    station: string;
    wet_bulb_temp_c: number;
    temp_c?: number;
    humidity_pct?: number;
    composite_risk_score?: number;
}

/* ---------- Risk bands — finalized framework boundaries --------------- */
const MAIN_BANDS = [
    { label: 'Safe',   min: -10,  max: 25.9,  color: '#90EE90', opacity: 0.40 },
    { label: 'Low',    min: 26,   max: 27,    color: '#3CB371', opacity: 0.40 },
    { label: 'Yellow', min: 28,   max: 29,    color: '#FFD700', opacity: 0.45 },
    { label: 'Red',    min: 30,   max: 34.4,  color: '#FF6347', opacity: 0.45 },
    { label: 'Purple', min: 34.5, max: 40,    color: '#DA70D6', opacity: 0.45 },
];

/* Overlap zones (0.5-1°C wide) — soft blend between adjacent bands (Option B) */
const OVERLAP_ZONES = [
    { y1: 25.5, y2: 26.4, color: '#90EE90', opacity: 0.15 }, /* Safe→Low  */
    { y1: 26.5, y2: 27.5, color: '#3CB371', opacity: 0.15 }, /* Low blend  */
    { y1: 27.0, y2: 28.5, color: '#3CB371', opacity: 0.15 }, /* Low→Yellow */
    { y1: 27.5, y2: 28.5, color: '#FFD700', opacity: 0.15 }, /* Yellow blend */
    { y1: 28.5, y2: 29.5, color: '#FFD700', opacity: 0.15 }, /* Yellow→Red  */
    { y1: 29.5, y2: 30.5, color: '#FFD700', opacity: 0.15 }, /* Red blend   */
    { y1: 29.5, y2: 30.5, color: '#FF6347', opacity: 0.15 }, /* Yellow→Red  */
    { y1: 34.0, y2: 35.0, color: '#FF6347', opacity: 0.15 }, /* Red→Purple  */
    { y1: 34.0, y2: 35.0, color: '#DA70D6', opacity: 0.15 }, /* Purple blend */
];

/* ---------- helpers --------------------------------------------------- */
function pad2(n: number) { return n.toString().padStart(2, '0'); }

function formatHHMM(iso: string): string {
    const d = new Date(iso);
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function formatDateDDMM(yyyymmdd: string): string {
    return `${yyyymmdd.slice(4, 6)}/${yyyymmdd.slice(6, 8)}`;
}

/* ---------- custom tooltip ------------------------------------------- */
function CustomTooltip({ active, payload }: any) {
    if (!active || !payload?.length) return null;
    const p = payload[0]?.payload;
    if (!p) return null;
    const label = p.type === 'history'
        ? `Actual — ${p.time}`
        : `Forecast — ${p.time}`;
    return (
        <div className="bg-black/90 text-white text-xs rounded px-2.5 py-1.5 border border-white/20 shadow-lg">
            <div className="font-semibold mb-0.5">{label}</div>
            <div>WBT: <span className="font-bold text-white">{p.wbt.toFixed(1)}°C</span></div>
        </div>
    );
}

/* ---------- legend ---------------------------------------------------- */
function ChartLegend() {
    return (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] mt-2">
            <span className="font-semibold text-zinc-400 mr-1">Risk Bands:</span>
            {MAIN_BANDS.map(b => (
                <span key={b.label} className="flex items-center gap-1">
                    <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: b.color, opacity: 0.7 }} />
                    <span className="text-zinc-400">{b.label}</span>
                </span>
            ))}
            <span className="mx-1 text-zinc-600">|</span>
            <span className="flex items-center gap-1">
                <span className="inline-block w-5 h-0.5 bg-white" />
                <span className="text-zinc-400">Actual (past 12h)</span>
            </span>
            <span className="flex items-center gap-1">
                <span className="inline-block w-5 h-0 border-t-2 border-dashed border-emerald-400" />
                <span className="text-zinc-400">Forecast</span>
            </span>
        </div>
    );
}

export function WBTTimeSeriesGraph({ selectedStation, forecastDays, riskConfig }: WBTTimeSeriesGraphProps) {
    const [history, setHistory] = useState<HistoricalReading[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchHistory = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await api.weather.getHistoricalReadings(selectedStation, 12);
            setHistory(data.readings ?? []);
        } catch (e) {
            console.error('Failed to fetch historical readings:', e);
            setError('Could not load historical data');
        } finally {
            setLoading(false);
        }
    }, [selectedStation]);

    useEffect(() => {
        fetchHistory();
        const interval = setInterval(fetchHistory, 300000);
        return () => clearInterval(interval);
    }, [fetchHistory]);

    /* Build chart data with separate fields for history vs forecast lines */
    const chartData = useMemo(() => {
        const historyPoints = history
            .filter(r => r.wet_bulb_temp_c != null)
            .sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime())
            .map(r => ({
                time: formatHHMM(r.recorded_at),
                wbt: r.wet_bulb_temp_c,
                historyWbt: r.wet_bulb_temp_c,
                forecastWbt: null as number | null,
                type: 'history' as const,
            }));

        const fc = forecastDays
            .filter(f => f.wet_bulb_peak != null)
            .sort((a, b) => a.forecast_day_index - b.forecast_day_index);

        const now = Date.now();
        const next72 = now + 72 * 60 * 60 * 1000;
        const forecastPoints = fc
            .filter(day => {
                if (!day.forecast_date || day.forecast_date.length !== 8) return false;
                const dStr = day.forecast_date;
                const forecastTime = new Date(`${dStr.substring(0, 4)}-${dStr.substring(4, 6)}-${dStr.substring(6, 8)}T14:00:00+08:00`).getTime();
                return forecastTime >= now - 12 * 60 * 60 * 1000 && forecastTime <= next72;
            })
            .map(day => ({
                time: formatDateDDMM(day.forecast_date) + ' 14:00',
                wbt: day.wet_bulb_peak!,
                historyWbt: null as number | null,
                forecastWbt: day.wet_bulb_peak!,
                type: 'forecast' as const,
            }));

        if (historyPoints.length > 0) {
            historyPoints[historyPoints.length - 1].forecastWbt = historyPoints[historyPoints.length - 1].wbt;
        }

        return [...historyPoints, ...forecastPoints];
    }, [history, forecastDays]);

    /* Derive visual bands from riskConfig */
    const bands = useMemo(() => {
        if (!riskConfig?.wbt_thresholds?.length) return MAIN_BANDS;
        const cfg = riskConfig.wbt_thresholds;
        const scoreToState = (s: number) => {
            switch (s) {
                case 0: return 'Safe';
                case 1: return 'Safe';
                case 2: return 'Low';
                case 4: return 'Yellow';
                case 6: return 'Red';
                default: return 'Purple';
            }
        };
        const states = [
            { label: 'Safe',   color: '#90EE90' },
            { label: 'Low',    color: '#3CB371' },
            { label: 'Yellow', color: '#FFD700' },
            { label: 'Red',    color: '#FF6347' },
            { label: 'Purple', color: '#DA70D6' },
        ];
        const out: typeof MAIN_BANDS = [];
        let prevMax = -10;
        for (let i = 0; i < cfg.length; i++) {
            const bandMax = cfg[i].max_temp ?? 40;
            const stateName = scoreToState(cfg[i].score ?? 0);
            const meta = states.find(s => s.label === stateName) ?? states[0];
            const baseBand = MAIN_BANDS.find(b => b.label === stateName) ?? MAIN_BANDS[0];
            out.push({
                label: stateName,
                min: prevMax,
                max: bandMax,
                color: meta.color,
                opacity: baseBand.opacity,
            });
            prevMax = bandMax;
        }
        if (out.length) out[out.length - 1].max = 40;
        return out;
    }, [riskConfig]);

    const currentPoint = [...chartData].reverse().find((d: { type: string }) => d.type === 'history');

    if (loading) {
        return (
            <Card className="p-4 border-zinc-200 dark:border-zinc-800">
                <Skeleton className="h-72 w-full rounded-lg" />
            </Card>
        );
    }

    if (!chartData.length) {
        return (
            <Card className="p-4 border-zinc-200 dark:border-zinc-800">
                <h3 className="font-semibold mb-3 text-sm">WBT Risk Timeline — {selectedStation}</h3>
                <div className="text-sm text-zinc-500 text-center py-8">
                    {error ?? `No WBT data available for ${selectedStation}`}
                </div>
            </Card>
        );
    }

    return (
        <Card className="p-4 border-zinc-200 dark:border-zinc-800">
            <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-sm">WBT Risk Timeline — {selectedStation}</h3>
                {currentPoint && (
                    <div className="flex items-center gap-2 bg-black/70 px-2.5 py-1 rounded-full">
                        <span className="relative flex h-2.5 w-2.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-current opacity-75" style={{ color: '#ef4444' }} />
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
                        </span>
                        <span className="text-[10px] font-bold text-white">
                            {currentPoint.time} — WBT: {currentPoint.wbt.toFixed(1)}°C
                        </span>
                    </div>
                )}
            </div>

            <div style={{ width: '100%', height: 320 }}>
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 5, right: 15, left: 0, bottom: 5 }}>
                        {/* Cartesian grid */}
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />

                        {/* Y-axis: fixed 15 → 40 °C */}
                        <YAxis
                            domain={[15, 40]}
                            ticks={[15, 20, 25, 30, 33, 35, 40]}
                            allowDataOverflow
                            stroke="#71717a"
                            tick={{ fill: '#71717a', fontSize: 10 }}
                            label={{ value: 'WBT (°C)', angle: -90, position: 'insideLeft', offset: 5, style: { fill: '#a1a1aa', fontSize: 11 } }}
                        />

                        {/* X-axis */}
                        <XAxis
                            dataKey="time"
                            stroke="#71717a"
                            tick={{ fill: '#71717a', fontSize: 10 }}
                            angle={-30}
                            textAnchor="end"
                            height={50}
                            interval="preserveStartEnd"
                        />

                        {/* Tooltip */}
                        <Tooltip content={<CustomTooltip />} />

                        {/* Main risk bands */}
                        {bands.map((b, i) => (
                            <ReferenceArea
                                key={`band-${b.label}-${i}`}
                                y1={Math.max(b.min, 15)}
                                y2={Math.min(b.max, 40)}
                                fill={b.color}
                                fillOpacity={b.opacity}
                            />
                        ))}

                        {/* Overlap blend zones between adjacent bands (Option B) */}
                        {OVERLAP_ZONES.map((z, i) => (
                            <ReferenceArea
                                key={`overlap-${i}`}
                                y1={Math.max(z.y1, 15)}
                                y2={Math.min(z.y2, 40)}
                                fill={z.color}
                                fillOpacity={z.opacity}
                            />
                        ))}

                        {/* Threshold reference lines at key boundaries */}
                        {[25, 28, 30, 34.5].map(t => (
                            <ReferenceLine
                                key={`ref-${t}`}
                                y={t}
                                stroke="rgba(255,255,255,0.12)"
                                strokeDasharray="4 4"
                                strokeWidth={0.8}
                                label={{
                                    value: `${t}°C`,
                                    position: 'right',
                                    fill: 'rgba(255,255,255,0.3)',
                                    fontSize: 9,
                                }}
                            />
                        ))}

                        {/* Historical line — solid white */}
                        <Line
                            type="monotone"
                            dataKey="historyWbt"
                            stroke="#ffffff"
                            strokeWidth={2.5}
                            dot={false}
                            activeDot={{ r: 5, fill: '#fff', stroke: '#ef4444', strokeWidth: 2 }}
                            connectNulls
                            isAnimationActive={false}
                        />

                        {/* Forecast line — dashed emerald */}
                        <Line
                            type="monotone"
                            dataKey="forecastWbt"
                            stroke="#34d399"
                            strokeWidth={2.5}
                            strokeDasharray="8 5"
                            dot={{ r: 4, fill: '#34d399', stroke: '#fff', strokeWidth: 1.5 }}
                            activeDot={{ r: 6, fill: '#34d399', stroke: '#fff', strokeWidth: 2 }}
                            connectNulls
                            isAnimationActive={false}
                        />

                        {/* Current dot */}
                        {currentPoint && (
                            <ReferenceDot
                                x={currentPoint.time}
                                y={currentPoint.wbt}
                                r={6}
                                fill="#ef4444"
                                stroke="#fff"
                                strokeWidth={2}
                            />
                        )}
                    </LineChart>
                </ResponsiveContainer>
            </div>

            <ChartLegend />
        </Card>
    );
}
