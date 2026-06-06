import type { StateName } from '@/types/api';

export type RiskLevel = StateName;
export type TrendDirection = 'up' | 'down' | 'stable';

export interface AgentMessage {
    agent: string;
    avatar: string;
    role: string;
    message: string;
}

export interface ReportSnapshot {
    generatedAt: string;
    consensus: string;
    actionItems: string[];
}

export interface District {
    id: string;
    name: string;
    riskScore: number;
    riskLevel: RiskLevel;
    trend: TrendDirection;
    primaryDriver: string;
    lastUpdated: string;
    history: number[];
    hne: number | null;
    hneTrend: TrendDirection;
    agentDiscussion?: AgentMessage[];
    reportSnapshot?: ReportSnapshot | null;
}

export interface DashboardProps {
    districts: District[];
    viewMode: 'grid' | 'list';
    onViewModeChange: (mode: 'grid' | 'list') => void;
    onDistrictClick: (id: string) => void;
}

export interface RiskDetailProps {
    district: District;
    onClose: () => void;
    onViewReport: () => void;
}
