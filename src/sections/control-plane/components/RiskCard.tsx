import type { District } from "@/sections/control-plane/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Sparkline } from "./Sparkline";
import { ArrowUpRight, ArrowDownRight, Minus, Activity, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface RiskCardProps {
    district: District;
    activeWarnings?: Array<{ warning_type: string; signal: string | null }>;
    onClick: () => void;
    selected?: boolean;
}

export function RiskCard({ district, activeWarnings = [], onClick, selected }: RiskCardProps) {
    const isCritical = district.riskLevel === 'critical';

    // Color logic
    let statusColor = "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300";
    let sparklineColor = "#a1a1aa"; // zinc-400

    if (district.riskLevel === 'critical') {
        statusColor = "bg-destructive text-destructive-foreground animate-pulse";
        sparklineColor = "#ef4444"; // red-500
    } else if (district.riskLevel === 'high') {
        statusColor = "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200";
        sparklineColor = "#f97316"; // orange-500
    } else if (district.riskLevel === 'moderate') {
        statusColor = "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
        sparklineColor = "#eab308"; // yellow-500
    } else if (district.riskLevel === 'low') {
        statusColor = "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
        sparklineColor = "#22c55e"; // green-500
    }

    return (
        <Card
            className={cn(
                "cursor-pointer transition-all hover:shadow-lg dark:hover:shadow-primary/10 hover:border-primary/50",
                selected && "border-primary ring-1 ring-primary",
                isCritical && "border-destructive/50 dark:border-destructive/50"
            )}
            onClick={onClick}
        >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                    {district.name}
                </CardTitle>
                <div className="flex items-center gap-1">
                    {activeWarnings.length > 0 && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <AlertTriangle className="h-4 w-4 text-yellow-500 cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent side="top">
                                <ul className="text-xs space-y-1">
                                    {activeWarnings.map((w, i) => (
                                        <li key={i}>{w.warning_type}{w.signal ? ` (${w.signal})` : ''}</li>
                                    ))}
                                </ul>
                            </TooltipContent>
                        </Tooltip>
                    )}
                    <Badge variant="outline" className={statusColor}>
                        {district.riskLevel.toUpperCase()}
                    </Badge>
                </div>
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold flex items-center gap-2">
                    {district.riskScore}
                    {district.trend === 'up' && <ArrowUpRight className="h-4 w-4 text-destructive" />}
                    {district.trend === 'down' && <ArrowDownRight className="h-4 w-4 text-green-500" />}
                    {district.trend === 'stable' && <Minus className="h-4 w-4 text-muted-foreground" />}
                </div>
                <p className="text-xs text-muted-foreground mb-4">
                    {district.primaryDriver}
                </p>
                <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                    {district.hne !== null ? `HNE: ${district.hne.toFixed(1)} °C·h` : 'HNE: —'}
                    {district.hne !== null && district.hneTrend === 'up' && (
                        <ArrowUpRight className="h-3 w-3 text-destructive" aria-label="HNE trending up" />
                    )}
                    {district.hne !== null && district.hneTrend === 'down' && (
                        <ArrowDownRight className="h-3 w-3 text-green-500" aria-label="HNE trending down" />
                    )}
                    {district.hne !== null && district.hneTrend === 'stable' && (
                        <Minus className="h-3 w-3 text-muted-foreground" aria-label="HNE trending stable" />
                    )}
                </p>
                {district.hne !== null && district.hne >= 17.7 && (
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Badge variant="destructive" className="text-xs mb-2">
                                Extreme Night Heat
                            </Badge>
                        </TooltipTrigger>
                        <TooltipContent side="top">
                            <p className="max-w-[200px] text-xs">
                                HNE ≥ 17.7 °C·h indicates severe nighttime heat stress.
                                Last night&apos;s HNE was {district.hne.toFixed(1)} °C·h.
                            </p>
                        </TooltipContent>
                    </Tooltip>
                )}
                <div className="h-[40px] w-full mt-2">
                    <Sparkline data={district.history} color={sparklineColor} />
                </div>
                {isCritical && (
                    <div className="mt-4 flex items-center gap-2 text-xs text-destructive font-semibold">
                        <Activity className="h-3 w-3 animate-bounce" />
                        <span>Immediate Action Required</span>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
