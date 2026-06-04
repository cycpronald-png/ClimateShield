import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import type { WeatherReading } from '../types';

interface StationDataTableProps {
    readings: WeatherReading[];
}

const riskBadgeVariant = (level: string) => {
    const l = (level || '').toLowerCase();
    if (l.includes('critical') || l === 'purple') return 'destructive';
    if (l.includes('high') || l === 'red') return 'secondary'; // orange-ish in dark
    if (l.includes('moderate') || l === 'yellow') return 'default';
    return 'outline';
};

export function StationDataTable({ readings }: StationDataTableProps) {
    if (!readings || readings.length === 0) {
        return (
            <div className="p-6 text-center text-muted-foreground bg-zinc-900/50 rounded-xl border border-zinc-800">
                No station data available yet.
            </div>
        );
    }

    // Sort by WBT descending
    const sorted = [...readings].sort(
        (a, b) => (b.wet_bulb_temp_c ?? 0) - (a.wet_bulb_temp_c ?? 0)
    );

    return (
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-card">
            <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                <h3 className="font-semibold text-sm">HKO Station Data — All Districts</h3>
                <span className="text-xs text-muted-foreground">Sorted by WBT (desc)</span>
            </div>
            <ScrollArea className="h-[400px]">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[160px]">Station</TableHead>
                            <TableHead>Temp</TableHead>
                            <TableHead>RH</TableHead>
                            <TableHead>Rain</TableHead>
                            <TableHead>Wind</TableHead>
                            <TableHead>UV</TableHead>
                            <TableHead>WBT</TableHead>
                            <TableHead className="text-right">Risk</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {sorted.map((r) => (
                            <TableRow key={r.station}>
                                <TableCell className="font-medium text-xs">{r.station}</TableCell>
                                <TableCell className="text-xs">{r.temp_c?.toFixed(1) ?? '—'}°C</TableCell>
                                <TableCell className="text-xs">{r.humidity_pct?.toFixed(0) ?? '—'}%</TableCell>
                                <TableCell className="text-xs">{r.rainfall_mm?.toFixed(1) ?? '—'} mm</TableCell>
                                <TableCell className="text-xs">
                                    {r.wind_kmh?.toFixed(0) ?? '—'} km/h {r.wind_direction ?? ''}
                                </TableCell>
                                <TableCell className="text-xs">{r.uv_index?.toFixed(1) ?? '—'}</TableCell>
                                <TableCell className="text-xs font-bold">
                                    {r.wet_bulb_temp_c?.toFixed(1) ?? '—'}°C
                                </TableCell>
                                <TableCell className="text-right">
                                    <Badge variant={riskBadgeVariant(r.risk_level ?? 'Safe')} className="text-[10px] h-5">
                                        {r.risk_level}
                                    </Badge>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </ScrollArea>
        </div>
    );
}
