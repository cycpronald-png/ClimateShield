import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { api } from '@/services/api';
import { AlertTriangle, ShieldCheck } from 'lucide-react';

interface WeatherWarning {
    id: number;
    warning_type: string;
    signal: string | null;
    description: string | null;
    issue_time: string | null;
    update_time: string | null;
    status: string;
    fetched_at: string;
}

function formatTimestamp(ts: string | null): string {
    if (!ts) return '—';
    const d = new Date(ts);
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hour = String(d.getHours()).padStart(2, '0');
    const minute = String(d.getMinutes()).padStart(2, '0');
    return `${month}-${day} ${hour}:${minute}`;
}

function getWarningSeverity(warning: WeatherWarning): 'critical' | 'high' | 'moderate' | 'low' {
    const signal = (warning.signal || '').toLowerCase();
    // HKO typhoon signals T8/T9/T10 are highest severity
    if (signal.includes('t10') || signal.includes('t9') || signal.includes('t8')) return 'critical';
    // T3, Red Rainstorm, Black Rainstorm
    if (signal.includes('t3') || signal.includes('black') || signal.includes('red')) return 'high';
    // T1, Yellow Rainstorm
    if (signal.includes('t1') || signal.includes('yellow')) return 'moderate';
    return 'low';
}

function getWarningBadge(severity: ReturnType<typeof getWarningSeverity>): { text: string; className: string; dot: string } {
    switch (severity) {
        case 'critical':
            return {
                text: 'Critical',
                className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
                dot: 'bg-red-500',
            };
        case 'high':
            return {
                text: 'High',
                className: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
                dot: 'bg-orange-500',
            };
        case 'moderate':
            return {
                text: 'Moderate',
                className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
                dot: 'bg-yellow-500',
            };
        default:
            return {
                text: 'Low',
                className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
                dot: 'bg-blue-400',
            };
    }
}

export function WarningsCard() {
    const [warnings, setWarnings] = useState<WeatherWarning[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchWarnings = async () => {
        try {
            setLoading(true);
            setError(null);
            const data = await api.weather.getWarnings();
            setWarnings(data || []);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to load warnings');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchWarnings();
        // Poll every 5 minutes (HKO warnings can change rapidly during storms)
        const iv = setInterval(fetchWarnings, 300000);
        return () => clearInterval(iv);
    }, []);

    const activeWarnings = warnings.filter((w) => w.status === 'active');

    return (
        <Card className="border-zinc-200 dark:border-zinc-800">
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5 text-yellow-500" />
                        <CardTitle className="text-lg font-semibold">HKO Weather Warnings</CardTitle>
                    </div>
                    {activeWarnings.length > 0 && (
                        <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
                            {activeWarnings.length} Active
                        </Badge>
                    )}
                </div>
            </CardHeader>
            <CardContent>
                {loading ? (
                    <div className="text-sm text-muted-foreground text-center py-4">
                        Loading warnings...
                    </div>
                ) : error ? (
                    <div className="text-sm text-destructive text-center py-4">
                        {error}
                    </div>
                ) : activeWarnings.length === 0 ? (
                    <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-4">
                        <ShieldCheck className="w-4 h-4 text-emerald-500" />
                        No active warnings from HKO.
                    </div>
                ) : (
                    <ScrollArea className="h-[200px]">
                        <ul role="list" className="space-y-2">
                            {activeWarnings.map((warning) => {
                                const severity = getWarningSeverity(warning);
                                const badge = getWarningBadge(severity);
                                return (
                                    <li
                                        key={warning.id}
                                        role="listitem"
                                        aria-label={`${warning.warning_type}: ${warning.signal || 'No signal'}`}
                                    >
                                        <div className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                                            <div className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${badge.dot}`} />
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="text-xs text-zinc-500">
                                                        {formatTimestamp(warning.issue_time)}
                                                    </span>
                                                    {warning.signal && (
                                                        <Badge className="text-[10px] bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                                                            {warning.signal}
                                                        </Badge>
                                                    )}
                                                    <Badge className={`text-[10px] ${badge.className}`}>
                                                        {badge.text}
                                                    </Badge>
                                                </div>
                                                <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                                                    {warning.warning_type}
                                                </div>
                                                {warning.description && (
                                                    <div className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2">
                                                        {warning.description}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    </ScrollArea>
                )}
            </CardContent>
        </Card>
    );
}
