export interface RiskStateMeta {
    name: 'Safe' | 'Low' | 'Yellow' | 'Red' | 'Purple';
    min: number;
    max: number;
    color: string;
    bg: string;
    text: string;
    fill: string;
}

export const STATE_META: RiskStateMeta[] = [
    { name: 'Safe', min: 0, max: 12, color: '#22c55e', bg: 'bg-emerald-500', text: 'text-emerald-700', fill: 'rgba(34, 197, 94, 0.10)' },
    { name: 'Low', min: 13, max: 16, color: '#3b82f6', bg: 'bg-blue-500', text: 'text-blue-700', fill: 'rgba(59, 130, 246, 0.10)' },
    { name: 'Yellow', min: 17, max: 22, color: '#eab308', bg: 'bg-yellow-500', text: 'text-yellow-800', fill: 'rgba(234, 179, 8, 0.12)' },
    { name: 'Red', min: 23, max: 24, color: '#ef4444', bg: 'bg-red-500', text: 'text-red-700', fill: 'rgba(239, 68, 68, 0.12)' },
    { name: 'Purple', min: 25, max: 30, color: '#a855f7', bg: 'bg-purple-500', text: 'text-purple-700', fill: 'rgba(168, 85, 247, 0.12)' },
];

export function stateFromScore(score: number): RiskStateMeta {
    const purple = STATE_META.find(s => s.name === 'Purple');
    if (purple && score >= purple.min) return purple;
    return STATE_META.filter(s => s.name !== 'Purple').find(s => score >= s.min && score <= s.max) ?? STATE_META[0];
}

export const ACTION_MAP: Record<string, string> = {
    Safe: 'Continue standard outreach patrols',
    Low: 'Alert outreach team — check vulnerable individuals',
    Yellow: 'Deploy mobile cooling stations — increase water distribution',
    Red: 'Emergency response protocol — all teams mobilized',
    Purple: 'Full mobilization + hospital alert + extended shelter hours',
};

export const RESOURCE_MAP: Record<string, string> = {
    Safe: 'Standard kit',
    Low: '+1 water team, +10 bottles',
    Yellow: '+2 water teams, +20 bottles',
    Red: '+4 water teams, +40 bottles, +2 medical kits',
    Purple: '+6 water teams, +60 bottles, +4 medical kits, cooling bus',
};

export const STATE_COLORS: Record<string, string> = {
    Safe: 'bg-emerald-400 text-white',
    Low: 'bg-blue-500 text-white',
    Yellow: 'bg-yellow-500 text-black',
    Red: 'bg-red-600 text-white',
    Purple: 'bg-purple-600 text-white',
};

export const MAX_RISK_SCORE = 30;