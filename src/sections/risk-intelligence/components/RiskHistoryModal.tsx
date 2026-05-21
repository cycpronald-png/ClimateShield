import { useState, useMemo } from 'react';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
    ReferenceArea, ReferenceLine, ResponsiveContainer,
} from 'recharts';
import { Modal } from '@/components/ui/Modal';
import type { TrendPoint } from '../types';

interface RiskHistoryModalProps {
    open: boolean;
    onClose: () => void;
    trends: TrendPoint[];
    riskConfig?: any;
}

export function RiskHistoryModal({ open, onClose, trends, riskConfig }: RiskHistoryModalProps) {
    const [mode, setMode] = useState<'crs' | 'hne'>('crs');

    const maxHne = useMemo(() => Math.max(35, ...trends.map(t => t.hne ?? 0)), [trends]);

    const activeBandColors = useMemo(() => {
        const ranges = riskConfig?.state_ranges;
        if (!ranges || ranges.length === 0) {
            return [
                { y1: 0, y2: 12, fill: 'rgba(34, 197, 94, 0.10)', label: 'Safe' },
                { y1: 13, y2: 16, fill: 'rgba(59, 130, 246, 0.12)', label: 'Low' },
                { y1: 17, y2: 22, fill: 'rgba(234, 179, 8, 0.12)', label: 'Yellow' },
                { y1: 23, y2: 24, fill: 'rgba(239, 68, 68, 0.12)', label: 'Red' },
                { y1: 25, y2: 30, fill: 'rgba(168, 85, 247, 0.15)', label: 'Purple' },
            ];
        }

        const opacityMap: Record<string, string> = {
            'Safe': 'rgba(34, 197, 94, 0.10)',
            'Low': 'rgba(59, 130, 246, 0.12)',
            'Yellow': 'rgba(234, 179, 8, 0.12)',
            'Red': 'rgba(239, 68, 68, 0.12)',
            'Purple': 'rgba(168, 85, 247, 0.15)'
        };

        return ranges.map((r: any) => ({
            y1: r.min,
            y2: r.max,
            fill: opacityMap[r.name] || 'rgba(128,128,128,0.1)',
            label: r.name
        }));
    }, [riskConfig]);

    if (!trends || trends.length === 0) {
        return (
            <Modal open={open} onClose={onClose} title="Risk Trend" maxWidth="lg">
                <p className="text-muted-foreground">No trend data available yet.</p>
            </Modal>
        );
    }

    const forecastStartIndex = trends.findIndex((t) => t.type === 'forecast');

    return (
        <Modal open={open} onClose={onClose} title="Risk Trend (7-Day History + 9-Day Forecast)" maxWidth="lg">
            <p className="text-xs text-muted-foreground mb-4">Composite Risk Score (0–30) over time. Solid = history, dashed = forecast.</p>

            <div className="inline-flex rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden p-0.5 gap-0.5 mb-4" role="group">
                <button
                    onClick={() => setMode('crs')}
                    aria-pressed={mode === 'crs'}
                    aria-label="Show Composite Risk Score trend"
                    className={`px-3 py-1 text-xs rounded-md transition-colors ${mode === 'crs' ? 'bg-primary text-primary-foreground font-medium' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'}`}
                >
                    CRS (0–30)
                </button>
                <button
                    onClick={() => setMode('hne')}
                    aria-pressed={mode === 'hne'}
                    aria-label="Show Hot Night Excess trend"
                    className={`px-3 py-1 text-xs rounded-md transition-colors ${mode === 'hne' ? 'bg-primary text-primary-foreground font-medium' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'}`}
                >
                    HNE
                </button>
            </div>

            <div className="h-[360px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trends} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                        <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                        <YAxis domain={mode === 'crs' ? [0, 30] : [0, maxHne]} tick={{ fontSize: 10 }} />
                        <RechartsTooltip
                            portal={document.body}
                            wrapperStyle={{ pointerEvents: 'none' }}
                            formatter={(_value: any, _name: any, item: any) => {
                                if (mode === 'hne') {
                                    const hne = item?.payload?.hne;
                                    if (hne == null) return ['No data', 'HNE'];
                                    return [`HNE: ${hne} °C·h${hne >= 17.7 ? ' (Extreme)' : ''}`, 'HNE'];
                                }
                                const score = item?.payload?.composite_risk_score ?? 0;
                                const state = item?.payload?.risk_level ?? 'Safe';
                                return [`Score: ${score} — ${state}`, 'CRS'];
                            }}
                        />

                        {mode === 'crs' && activeBandColors.map((b: any) => (
                            <ReferenceArea key={b.label} y1={b.y1} y2={b.y2} fill={b.fill} stroke="none" />
                        ))}

                        {forecastStartIndex >= 0 && (
                            <ReferenceArea
                                x1={trends[forecastStartIndex]?.date}
                                x2={trends[trends.length - 1]?.date}
                                fill="rgba(255,255,255,0.03)"
                                strokeDasharray="4 4"
                                label={{ value: 'Forecast', position: 'insideTopLeft', fontSize: 10, fill: '#888' }}
                            />
                        )}

                        {mode === 'hne' && (
                            <ReferenceLine
                                y={17.7}
                                stroke="#ef4444"
                                strokeDasharray="6 4"
                                strokeWidth={2}
                                label={{ value: 'Extreme Threshold (17.7)', position: 'insideTopRight', fontSize: 10, fill: '#ef4444' }}
                            />
                        )}

                        <Area
                            type="monotone"
                            dataKey={(d: any) => (mode === 'crs' ? d.composite_risk_score : d.hne) ?? 0}
                            stroke={mode === 'crs' ? '#8884d8' : '#f97316'}
                            strokeWidth={2}
                            fill={mode === 'crs' ? 'rgba(136, 132, 216, 0.25)' : 'rgba(249, 115, 22, 0.25)'}
                            dot={{ r: 3 }}
                            activeDot={{ r: 6, style: { pointerEvents: 'auto' } }}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </Modal>
    );
}