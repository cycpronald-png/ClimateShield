import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle } from 'lucide-react';
import { api } from '@/services/api';
import type { HotNightEntry, WeatherHistoryItem } from '../types';

export function HotNightMonitor() {
    const [entries, setEntries] = useState<HotNightEntry[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let mounted = true;
        async function load() {
            try {
                const data = await api.weather.getHistory(7);
                if (!mounted) return;
                const items: WeatherHistoryItem[] = data.history || [];
                const mapped = items.map((h: any) => ({
                    date: h.date,
                    hne_value: h.hne ?? 0,
                    is_extreme: (h.hne ?? 0) >= 17.7,
                    threshold: 17.7,
                }));
                setEntries(mapped);
            } catch (e) {
                console.error("Failed to load HNE", e);
            } finally {
                setLoading(false);
            }
        }
        load();
        return () => { mounted = false; };
    }, []);

    const latest = entries[0];

    return (
        <Card className="border-zinc-200 dark:border-zinc-800">
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                        Night Heat Stress Monitor
                        <span className="text-xs font-normal text-muted-foreground">(Last 7 Days)</span>
                    </CardTitle>
                    {latest && latest.is_extreme && (
                        <Badge variant="destructive" className="flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            Extreme Night Detected
                        </Badge>
                    )}
                </div>
            </CardHeader>
            <CardContent>
                {loading ? (
                    <div className="text-sm text-muted-foreground">Loading historical night heat data...</div>
                ) : entries.length === 0 ? (
                    <div className="text-sm text-muted-foreground">No night heat data available yet. Data will appear after the first daily check at 08:30 HK time.</div>
                ) : (
                    <div className="space-y-2">
                        {entries.slice(0, 3).map((entry) => (
                            <div key={entry.date} className="flex items-center justify-between p-2 rounded-lg bg-secondary/20">
                                <div className="text-sm font-medium">{entry.date}</div>
                                <div className="flex items-center gap-2">
                                    <span className={`text-sm font-bold ${entry.is_extreme ? 'text-red-500' : 'text-muted-foreground'}`}>
                                        HNE: {entry.hne_value.toFixed(1)} °C·h
                                    </span>
                                    {entry.is_extreme && (
                                        <Badge variant="destructive" className="text-[10px] h-5">≥ 17.7</Badge>
                                    )}
                                </div>
                            </div>
                        ))}
                        <div className="text-xs text-muted-foreground mt-2">
                            Window: 20:00–07:59. Threshold: 17.7 °C·h (90th percentile).
                            <br />
                            Source: Guo et al. 2024, CUHK / Lancet Western Pacific.
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
