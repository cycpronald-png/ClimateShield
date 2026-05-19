import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Sun, Cloud, CloudRain, CloudLightning, TrendingUp, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WeatherForecastDay } from '../types';
import { stateFromScore, STATE_COLORS, MAX_RISK_SCORE } from '../utils/riskStates';

interface ForecastComparisonProps {
    forecast: WeatherForecastDay[];
    onScoreClick?: () => void;
    onRefresh?: () => void;
}

const riskScoreColor = (score: number) => {
    const name = stateFromScore(score).name;
    return STATE_COLORS[name] || 'bg-emerald-400 text-white';
};

const riskScoreText = (score: number) => stateFromScore(score).name;

function WeatherIcon({ code }: { code?: number }) {
    if (code === undefined) return <Sun className="h-6 w-6 shrink-0 text-orange-500" />;
    // HKO icon codes: sunny=50+, cloudy=60+, rain=80+, storm=90+
    if (code >= 90) return <CloudLightning className="h-6 w-6 shrink-0 text-purple-500" />;
    if (code >= 80) return <CloudRain className="h-6 w-6 shrink-0 text-blue-500" />;
    if (code >= 60) return <Cloud className="h-6 w-6 shrink-0 text-gray-500" />;
    return <Sun className="h-6 w-6 shrink-0 text-orange-500" />;
}

export function ForecastComparison({ forecast, onScoreClick, onRefresh }: ForecastComparisonProps) {

    if (!forecast || forecast.length === 0) {
        return (
            <div className="p-4 text-center space-y-3">
                <p className="text-muted-foreground text-sm">No forecast data available.</p>
                {onRefresh && (
                    <Button variant="outline" size="sm" onClick={onRefresh}>
                        <RefreshCw className="w-4 h-4 mr-1" />
                        Refresh Now
                    </Button>
                )}
            </div>
        );
    }

    return (
        <div className="rounded-md border border-zinc-200 dark:border-zinc-800 overflow-auto">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="w-[100px]">Date</TableHead>
                        <TableHead>HKO Official</TableHead>
                        <TableHead className="min-w-[180px]">ClimateShield Assessment</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {forecast.map((day) => {
                        const d = day.forecast_date;
                        const monthDay = d ? `${d.slice(4, 6)}-${d.slice(6, 8)}` : '';

                        const score = day.composite_risk_score ?? 0;
                        const wbtPeak = day.wet_bulb_peak !== undefined
                            ? `${day.wet_bulb_peak.toFixed(1)}°C`
                            : '—';

                        return (
                            <TableRow key={`${day.forecast_date}-${day.forecast_day_index ?? 0}`} className="hover:bg-secondary/30 cursor-pointer transition-colors"
                                onClick={onScoreClick}
                            >
                                <TableCell className="font-medium">{monthDay}</TableCell>

                                <TableCell>
                                    <div className="flex items-center gap-2">
                                        <div className="inline-flex items-center justify-center w-8 h-8 shrink-0">
                                            <WeatherIcon code={day.icon_code} />
                                        </div>
                                        <div>
                                            <div className="font-semibold text-sm">{day.min_temp ?? '—'}° – {day.max_temp ?? '—'}°</div>
                                            <div className="text-xs text-muted-foreground">{day.weather_desc ?? '—'}</div>
                                        </div>
                                        {(day.forecast_day_index ?? 0) > 9 && (
                                            <Badge variant="outline" className="text-xs shrink-0">🌐 O-M</Badge>
                                        )}
                                    </div>
                                </TableCell>

                                <TableCell>
                                    <div className="flex flex-col gap-1">
                                        <div className="flex items-center gap-2">
                                            <TooltipProvider>
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <Badge className={cn("px-2 py-1 rounded-full text-xs font-bold cursor-pointer flex items-center gap-1", riskScoreColor(score))}>
                                                            <TrendingUp className="w-3 h-3" />
                                                            {score}/{MAX_RISK_SCORE}
                                                        </Badge>
                                                    </TooltipTrigger>
                                                    <TooltipContent side="top">
                                                        <p className="text-xs">Click to view trend history</p>
                                                    </TooltipContent>
                                                </Tooltip>
                                            </TooltipProvider>
                                            <span className="text-xs font-medium">{riskScoreText(score)}</span>
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                            Est. WBT Peak: {wbtPeak}
                                        </div>
                                    </div>
                                </TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>
        </div>
    );
}
