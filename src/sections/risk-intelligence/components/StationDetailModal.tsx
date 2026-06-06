import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/Modal';
import { api } from '@/services/api';
import type { WeatherReading, WeatherHistoryItem } from '../types';
import { STATE_COLORS } from '../utils/riskStates';

interface StationDetailModalProps {
    open: boolean;
    station: WeatherReading | null;
    onClose: () => void;
}

export function StationDetailModal({ open, station, onClose }: StationDetailModalProps) {
    const [history, setHistory] = useState<WeatherHistoryItem[]>([]);
    const [loading, setLoading] = useState(false);

    // Fetch history when modal opens with a valid station
    useEffect(() => {
        if (!open || !station) return;
        let mounted = true;
        async function load() {
            setLoading(true);
            try {
                const data = await api.weather.getHistory();
                if (!mounted) return;
                const items: WeatherHistoryItem[] = data.history || [];
                setHistory(items);
            } catch (e) {
                console.error('Failed to load station history', e);
            } finally {
                if (mounted) setLoading(false);
            }
        }
        load();
        return () => { mounted = false; };
    }, [open, station]);

    if (!open) return null;

    return (
        <Modal
            open={open}
            onClose={onClose}
            title={station?.station ?? 'Station Detail'}
            description="Station details and night heat history"
            maxWidth="2xl"
        >
            {/* Current Reading */}
            {station && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/30 border border-zinc-200 dark:border-zinc-700 mb-4">
                    <div>
                        <div className="text-xs text-muted-foreground uppercase tracking-wide">Temperature</div>
                        <div className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                            {station.temp_c != null ? `${station.temp_c}°C` : '--'}
                        </div>
                    </div>
                    <div>
                        <div className="text-xs text-muted-foreground uppercase tracking-wide">Humidity</div>
                        <div className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                            {station.humidity_pct != null ? `${station.humidity_pct}%` : '--'}
                        </div>
                    </div>
                    <div>
                        <div className="text-xs text-muted-foreground uppercase tracking-wide">WBT</div>
                        <div className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                            {station.wet_bulb_temp_c != null ? `${station.wet_bulb_temp_c}°C` : '--'}
                        </div>
                    </div>
                    <div>
                        <div className="text-xs text-muted-foreground uppercase tracking-wide">Risk Level</div>
                        <div className="text-lg font-bold">
                            <Badge className={STATE_COLORS[station.risk_level ?? 'Safe'] || 'bg-zinc-400 text-white'}>
                                {station.risk_level}
                            </Badge>
                        </div>
                    </div>
                </div>
            )}

            {/* HNE History */}
            <div>
                <h4 className="text-sm font-semibold">Night Heat History</h4>
                <p className="text-xs text-muted-foreground mb-2">Last 7 nights (20:00–07:59 window)</p>

                {loading ? (
                    <div className="text-sm text-muted-foreground py-4">Loading night heat data...</div>
                ) : history.length === 0 ? (
                    <div className="text-sm text-muted-foreground text-center py-4">
                        No night heat data available for this station. Data appears after the first daily check at 08:30 HK time.
                    </div>
                ) : (
                    <div className="space-y-2">
                        {history.map((item) => {
                            const displayHne = item.nightly_hne ?? item.hne ?? 0;
                            const isExtreme = displayHne >= 17.7;
                            return (
                                <div
                                    key={item.date}
                                    className="flex items-center justify-between p-3 rounded-lg bg-secondary/20"
                                    aria-label={`HNE for ${item.date}: ${displayHne} degrees Celsius hours`}
                                >
                                    <div className="text-sm font-medium">{item.date}</div>
                                    <div className="flex items-center gap-2">
                                        <span
                                            className={`text-sm font-bold ${isExtreme ? 'text-red-500' : 'text-muted-foreground'}`}
                                        >
                                            HNE: {displayHne.toFixed(1)} °C·h
                                        </span>
                                        {isExtreme && (
                                            <Badge
                                                variant="destructive"
                                                className="text-[10px] h-5"
                                                aria-label="Exceeds extreme threshold of 17.7 degrees Celsius hours"
                                            >
                                                {'≥'} 17.7
                                            </Badge>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                        <div className="text-xs text-muted-foreground mt-2">
                            Threshold: 17.7 °C·h (90th percentile). Source: Guo et al. 2024, CUHK / Lancet Western Pacific.
                        </div>
                    </div>
                )}
            </div>
        </Modal>
    );
}
