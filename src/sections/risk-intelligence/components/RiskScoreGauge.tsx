import { useState, useMemo, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Users, User, AlertTriangle } from "lucide-react";
import { api } from '@/services/api';
import type { WeatherReading } from '../types';
import {
    STATE_META,
    MAX_RISK_SCORE,
    resolveRiskState,
} from '../utils/riskStates';
import type { RiskConfig } from '@/types/api';

interface RiskScoreGaugeProps {
    readings: WeatherReading[];
    selectedStation: string;
    onStationSelect?: (station: string) => void;
    riskConfig?: RiskConfig | null;
}

interface LiveScoreData {
    value: number;
    state: string;
    w: number;
    h: number;
    v: number;
    m: number;
    breakdown: string;
    theoretical_max: number;
    warnings_active: string[];
    hot_nights_consecutive: number;
    wet_bulb_temp_c: number;
}

function scoreToPercent(score: number): number {
    return Math.max(3, Math.min(100, (score / MAX_RISK_SCORE) * 100));
}

function getFriendlyMessage(score: number, riskConfig?: RiskConfig | null): string {
    const meta = resolveRiskState(score, riskConfig?.state_ranges);
    if (meta.name === 'Safe') return 'Safe — No Immediate Risk';
    if (meta.name === 'Low') return 'Low Risk — Continue Monitoring';
    if (meta.name === 'Yellow') return 'Yellow Alert — Outreach Team Notified';
    if (meta.name === 'Red') return 'Red Alert — Emergency Mobilization';
    if (meta.name === 'Purple') return 'Purple Alert — Full Mobilization';
    return 'Safe — No Immediate Risk';
}

function SingleGauge({
    reading,
    liveScore,
    activeBands,
    riskConfig
}: {
    reading: WeatherReading;
    liveScore: LiveScoreData | null;
    activeBands: any[];
    riskConfig?: RiskConfig | null;
}) {
    const persistedScore = reading.composite_risk_score;
    const persistedState = reading.risk_level;
    const hasPersistedScore = persistedScore != null;
    const score: number = persistedScore ?? liveScore?.value ?? 0;
    const scoreKnown = hasPersistedScore || liveScore != null;
    const pct = scoreToPercent(score);
    const stateMeta = resolveRiskState(score, riskConfig?.state_ranges);
    const stateName = persistedState ?? stateMeta.name;
    const message = scoreKnown ? getFriendlyMessage(score, riskConfig) : 'Computing risk score…';
    const theoreticalMax = MAX_RISK_SCORE;
    const maxPct = scoreToPercent(theoreticalMax);

    return (
        <div className="space-y-3">
            {/* Score header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Badge className={`${scoreKnown ? stateMeta.bg : 'bg-zinc-400'} text-white font-bold text-sm px-3 py-1`}>
                        {scoreKnown ? stateName : '---'}
                    </Badge>
                    <span className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                        {scoreKnown ? score.toFixed(1) : '—'}
                        <span className="text-sm font-normal text-zinc-500 ml-1">/ {MAX_RISK_SCORE}</span>
                    </span>
                </div>
                <div className="text-xs text-zinc-500 text-right">
                    <div className="font-medium">{reading.station}</div>
                    <div>
                        WBT {liveScore?.wet_bulb_temp_c?.toFixed(1) ?? reading.wet_bulb_temp_c?.toFixed(1) ?? '—'}°C
                    </div>
                </div>
            </div>

            {/* Friendly status message */}
            <div className={`text-xs font-medium ${stateMeta.text} dark:${stateMeta.text}`}>
                {message}
            </div>

            {/* Main gauge bar */}
            <div className="relative h-10 w-full rounded-lg overflow-hidden flex">
                {activeBands.map((s) => {
                    const widthPct = ((s.max - s.min + 1) / 31) * 100;
                    return (
                        <div
                            key={s.name}
                            className={`${s.bg} h-full flex items-center justify-center text-[10px] font-bold text-white/90 border-r border-white/20 last:border-r-0`}
                            style={{ width: `${widthPct}%` }}
                            title={`${s.name}: ${s.min}–${s.max}`}
                        >
                            {widthPct > 8 ? s.name : ''}
                        </div>
                    );
                })}

                {/* Marker */}
                <div
                    className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_4px_rgba(0,0,0,0.5)] z-10 transition-all duration-500"
                    style={{ left: `${pct}%` }}
                >
                    <div className="absolute -top-1 -left-1.5 w-3 h-3 rounded-full bg-white border-2 border-zinc-800 shadow-md" />
                </div>
            </div>

            {/* Scale labels */}
            <div className="flex justify-between text-[10px] text-zinc-400 px-0.5">
                <span>0</span>
                <span>{activeBands.find(b => b.name === 'Safe')?.name || 'Safe'}</span>
                <span>{activeBands.find(b => b.name === 'Yellow')?.min || 15}</span>
                <span>{activeBands.find(b => b.name === 'Yellow')?.name || 'Yellow'}</span>
                <span>{activeBands.find(b => b.name === 'Purple')?.min || 25}</span>
                <span>30</span>
            </div>

            {/* Theoretical max progress bar */}
            <div className="space-y-1">
                <div className="flex justify-between text-[10px] text-zinc-500">
                    <span className="font-medium">Theoretical Maximum</span>
                    <span>{theoreticalMax.toFixed(0)}</span>
                </div>
                <div className="h-2 w-full bg-zinc-100 dark:bg-zinc-700 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-zinc-400 dark:bg-zinc-500 rounded-full"
                        style={{ width: `${maxPct}%` }}
                    />
                </div>
            </div>

            {/* Active warnings (if any) */}
            {liveScore && liveScore.warnings_active.length > 0 && (
                <div className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400 mt-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Active warnings: {[...new Set(liveScore.warnings_active)].join(', ')}</span>
                </div>
            )}
        </div>
    );
}

function AllStationsGrid({ readings, selectedStation, onStationSelect, activeBands, riskConfig }: {
    readings: WeatherReading[];
    selectedStation: string;
    onStationSelect?: (station: string) => void;
    activeBands: any[];
    riskConfig?: RiskConfig | null;
}) {
    // AllStationsGrid displays cached composite_risk_scores from main page data (refreshes every 5 minutes).
    // SingleGauge below fetches live scores when a station is selected.
    // This design balances efficiency (avoiding N API calls) with responsiveness.
    const ALLOWED_STATIONS = [
        'Hong Kong Observatory',
        'Kai Tak Runway Park',
        "King's Park",
        'Kowloon City',
        'Sham Shui Po',
    ];

    const filtered = readings.filter(r => ALLOWED_STATIONS.includes(r.station));

    return (
        <div className="space-y-2">
            {filtered.map((r) => {
                const persistedScore = r.composite_risk_score;
                const hasPersistedScore = persistedScore != null;
                const score: number = hasPersistedScore ? persistedScore : 0;
                const meta = resolveRiskState(score, riskConfig?.state_ranges);
                const pct = scoreToPercent(score);
                const isSelected = r.station === selectedStation;

                return (
                    <button
                        key={r.station}
                        onClick={() => onStationSelect?.(r.station)}
                        className={`w-full text-left p-2 rounded-lg border transition-all ${
                            isSelected
                                ? 'border-zinc-400 bg-zinc-50 dark:bg-zinc-800 shadow-sm'
                                : 'border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                        }`}
                    >
                        <div className="flex items-center gap-3">
                            {/* Mini gauge */}
                            <div className="flex-1 h-4 rounded-md overflow-hidden flex relative">
                                {activeBands.map((s) => {
                                    const widthPct = ((s.max - s.min + 1) / 31) * 100;
                                    return (
                                        <div
                                            key={s.name}
                                            className={`${s.bg} h-full border-r border-white/20 last:border-r-0`}
                                            style={{ width: `${widthPct}%` }}
                                        />
                                    );
                                })}
                                {hasPersistedScore && (
                                    <div
                                        className="absolute top-0 bottom-0 w-0.5 bg-white shadow z-10"
                                        style={{ left: `${pct}%` }}
                                    >
                                        <div className="absolute -top-0.5 -left-1 w-2 h-2 rounded-full bg-white border border-zinc-600" />
                                    </div>
                                )}
                            </div>

                            {/* Station info */}
                            <div className="w-32 shrink-0">
                                <div className={`text-xs font-semibold truncate ${isSelected ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-600 dark:text-zinc-400'}`}>
                                    {r.station}
                                </div>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${hasPersistedScore ? meta.bg : 'bg-zinc-400'} text-white`}>
                                        {hasPersistedScore ? meta.name : '---'}
                                    </span>
                                    {hasPersistedScore && (
                                        <span className="text-[10px] text-zinc-500">{score.toFixed(0)}</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </button>
                );
            })}
        </div>
    );
}

export function RiskScoreGauge({ readings, selectedStation, onStationSelect, riskConfig }: RiskScoreGaugeProps) {
    // NOTE: Live Risk Score includes active warning multipliers (T8=3x, typhoon=3x, black rain=2x, etc.)
    // This represents current real-time risk accounting for active HKO warnings. Compare against
    // "Forecast Risk Score" (14-Day Forecast Risk Outlook) to see baseline risk without warnings.
    const [viewMode, setViewMode] = useState<'single' | 'all'>('single');
    const [liveScore, setLiveScore] = useState<LiveScoreData | null>(null);
    const [liveError, setLiveError] = useState<string | null>(null);

    const selectedReading = useMemo(() =>
        readings.find(r => r.station === selectedStation),
        [readings, selectedStation]
    );

    const fetchLiveScore = useCallback(async () => {
        if (!selectedStation) return;
        try {
            const data = await api.weather.getLiveScore(selectedStation);
            setLiveScore(data);
            setLiveError(null);
        } catch (e) {
            console.error('Live score fetch error:', e);
            setLiveError(e instanceof Error ? e.message : 'Live score unavailable');
        }
    }, [selectedStation]);

    // Initial fetch + poll every 5 minutes (synchronized with main page refresh)
    useEffect(() => {
        fetchLiveScore();
        const interval = setInterval(fetchLiveScore, 300000);
        return () => clearInterval(interval);
    }, [fetchLiveScore]);

    const activeBands = useMemo(() => {
        const ranges = riskConfig?.state_ranges;
        if (!ranges || ranges.length === 0) {
            return STATE_META.map(s => ({
                name: s.name,
                min: s.min,
                max: s.max,
                bg: s.bg
            }));
        }

        const bgMap: Record<string, string> = {
            'Safe': 'bg-emerald-500',
            'Low': 'bg-blue-500',
            'Yellow': 'bg-yellow-500',
            'Red': 'bg-red-500',
            'Purple': 'bg-purple-500'
        };

        return ranges.map((r) => ({
            name: r.name,
            min: r.min,
            max: r.max,
            bg: bgMap[r.name] || 'bg-zinc-500'
        }));
    }, [riskConfig]);

    return (
        <Card className="border-zinc-200 dark:border-zinc-800">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                    <span className="text-lg">🎯</span>
                    ClimateShield Risk Assessment (Live)
                </CardTitle>
                <div className="flex gap-1">
                    <Button
                        size="sm"
                        variant={viewMode === 'single' ? 'default' : 'outline'}
                        onClick={() => setViewMode('single')}
                        className="h-7 text-xs px-2"
                    >
                        <User className="w-3 h-3 mr-1" />
                        Single
                    </Button>
                    <Button
                        size="sm"
                        variant={viewMode === 'all' ? 'default' : 'outline'}
                        onClick={() => setViewMode('all')}
                        className="h-7 text-xs px-2"
                    >
                        <Users className="w-3 h-3 mr-1" />
                        All Stations
                    </Button>
                </div>
            </CardHeader>
            <CardContent>
                {liveError && (
                    <div className="text-[10px] text-amber-600 dark:text-amber-400 mb-2">
                        {liveError}
                    </div>
                )}
                {viewMode === 'single' ? (
                    selectedReading ? (
                        <SingleGauge reading={selectedReading} liveScore={liveScore} activeBands={activeBands} riskConfig={riskConfig} />
                    ) : (
                        <div className="text-sm text-zinc-500 text-center py-4">
                            No data available for {selectedStation}
                        </div>
                    )
                ) : (
                    <AllStationsGrid
                        readings={readings}
                        selectedStation={selectedStation}
                        onStationSelect={onStationSelect}
                        activeBands={activeBands}
                        riskConfig={riskConfig}
                    />
                )}
            </CardContent>
        </Card>
    );
}
