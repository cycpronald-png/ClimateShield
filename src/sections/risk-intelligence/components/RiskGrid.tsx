import type { WeatherReading } from '../types';
import { cn } from '@/lib/utils';

interface RiskGridProps {
    readings: WeatherReading[];
    selectedStationId?: string;
    onStationSelect: (id: string) => void;
    onStationDetail?: (station: WeatherReading) => void;
}

const riskColorMap: Record<string, string> = {
    'Safe': 'bg-emerald-500',
    'Low': 'bg-emerald-400',
    'Yellow': 'bg-yellow-500',
    'Red': 'bg-red-500',
    'Purple': 'bg-purple-500',
};

export function RiskGrid({ readings, selectedStationId, onStationSelect, onStationDetail }: RiskGridProps) {
    if (!readings || readings.length === 0) {
        return (
            <div className="p-8 text-center text-muted-foreground bg-zinc-900/50 rounded-xl border border-zinc-800">
                No real-time weather data available yet. The scheduler is fetching HKO data...
            </div>
        );
    }

    return (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {readings.map((r) => {
                const riskColor = riskColorMap[r.risk_level ?? 'Safe'] || 'bg-zinc-600';
                const isSelected = selectedStationId === r.station;
                return (
                    <button
                        key={r.station}
                        onClick={() => {
                            onStationSelect(r.station);
                            onStationDetail?.(r);
                        }}
                        className={cn(
                            "relative p-3 rounded-xl border-2 transition-all duration-200 text-left",
                            isSelected
                                ? 'ring-2 ring-primary border-primary bg-primary/10'
                                : 'border-zinc-700 bg-zinc-800/50 hover:bg-zinc-800 hover:border-zinc-600'
                        )}
                    >
                        <div className={`absolute top-2 right-2 w-2.5 h-2.5 rounded-full ${riskColor}`} />
                        <div className="text-xs font-medium text-zinc-200 leading-tight">{r.station}</div>
                        <div className="text-[10px] text-zinc-400 mt-1">
                            WB: {r.wet_bulb_temp_c?.toFixed(1) ?? '--'}°C
                        </div>
                        <div className={`text-[9px] font-bold uppercase mt-1 ${riskColor.replace('bg-', 'text-')}`}>
                            {r.risk_level}
                        </div>
                    </button>
                );
            })}
        </div>
    );
}
