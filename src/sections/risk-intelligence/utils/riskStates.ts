import type { StateName, StateRange } from '@/types/api';

export interface RiskStateMeta {
    name: StateName;
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

/** Badge / pill color pairings (background + foreground) */
export const STATE_COLORS: Record<string, string> = {
    Safe: 'bg-emerald-500 text-white',
    Low: 'bg-blue-500 text-white',
    Yellow: 'bg-yellow-500 text-black',
    Red: 'bg-red-500 text-white',
    Purple: 'bg-purple-500 text-white',
};

export const MAX_RISK_SCORE = 30;

const PRIORITY_ORDER: StateName[] = ['Purple', 'Red', 'Yellow', 'Low', 'Safe'];

/** Legacy fallback when no riskConfig is available */
export function stateFromScore(score: number): RiskStateMeta {
    const purple = STATE_META.find(s => s.name === 'Purple');
    if (purple && score >= purple.min) return purple;
    return STATE_META.filter(s => s.name !== 'Purple').find(s => score >= s.min && score <= s.max) ?? STATE_META[0];
}

/** Lookup meta by canonical state name (no score needed) */
export function getMetaByName(name: StateName): RiskStateMeta {
    return STATE_META.find(s => s.name === name) ?? STATE_META[0];
}

/**
 * Unified risk-state resolver.
 *
 * Respects optional `riskConfig.state_ranges` (admin-overridden thresholds).
 * Returns a fully populated `RiskStateMeta` including colors, fills, and
 * human-readable action text.
 */
export function resolveRiskState(score: number, ranges?: StateRange[]): RiskStateMeta {
    // No custom ranges → fallback to hard-coded defaults
    if (!ranges || ranges.length === 0) {
        return stateFromScore(score);
    }

    const rounded = Math.round(score);

    // 1. Priority scan (highest-severity first)
    for (const pName of PRIORITY_ORDER) {
        const r = ranges.find(x => x.name === pName);
        if (!r) continue;
        if (pName === 'Purple') {
            if (rounded >= r.min) return buildMeta(r);
        } else {
            if (rounded >= r.min && rounded <= r.max) return buildMeta(r);
        }
    }

    // 2. Any range that contains the score
    const fallback = ranges.find(r => rounded >= r.min && rounded <= r.max);
    if (fallback) return buildMeta(fallback);

    // 3. Absolute fallback → Safe
    return STATE_META[0];
}

function buildMeta(range: StateRange): RiskStateMeta {
    const defaults = getMetaByName(range.name);
    return {
        name: range.name,
        min: range.min,
        max: range.max,
        color: defaults.color,
        bg: defaults.bg,
        text: defaults.text,
        fill: defaults.fill,
    };
}
