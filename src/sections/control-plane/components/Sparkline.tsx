import { useMemo } from 'react';

interface SparklineProps {
    data: number[];
    width?: number;
    height?: number;
    color?: string;
}

export function Sparkline({ data, width = 120, height = 40, color = "#8884d8" }: SparklineProps) {
    if (!data || data.length < 2) return null;

    const pathD = useMemo(() => {
        const min = Math.min(...data);
        const max = Math.max(...data);
        const range = max - min || 1;

        const paddingX = 2;
        const paddingY = 4;
        const chartW = width - paddingX * 2;
        const chartH = height - paddingY * 2;

        const points = data.map((d, i) => {
            const x = paddingX + (i / (data.length - 1)) * chartW;
            const y = paddingY + chartH - ((d - min) / range) * chartH;
            return [x, y];
        });

        // Catmull-Rom spline to smooth the path
        const toPath = (pts: number[][]) => {
            if (pts.length < 2) return '';
            let d = `M ${pts[0][0]} ${pts[0][1]}`;
            for (let i = 0; i < pts.length - 1; i++) {
                const p0 = pts[Math.max(i - 1, 0)];
                const p1 = pts[i];
                const p2 = pts[i + 1];
                const p3 = pts[Math.min(i + 2, pts.length - 1)];

                const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
                const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
                const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
                const cp2y = p2[1] - (p3[1] - p1[1]) / 6;

                d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2[0]} ${p2[1]}`;
            }
            return d;
        };

        return toPath(points);
    }, [data, width, height]);

    const areaD = useMemo(() => {
        if (!pathD) return '';
        const paddingX = 2;
        const paddingY = 4;
        const chartW = width - paddingX * 2;
        const chartH = height - paddingY * 2;
        const bottomY = paddingY + chartH;
        const startX = paddingX;
        const endX = paddingX + chartW;
        return `${pathD} L ${endX} ${bottomY} L ${startX} ${bottomY} Z`;
    }, [pathD, data, width, height]);

    return (
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
            <defs>
                <linearGradient id={`sparkline-gradient-${Math.random().toString(36).substr(2, 9)}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
            </defs>
            {areaD && <path d={areaD} fill={`url(#sparkline-gradient-${Math.random().toString(36).substr(2, 9)})`} />}
            <path d={pathD} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}
