/**
 * Small UI helpers for stale-timestamp display.
 * Extracted from the deleted useOfflineCache so the OfflineBanner can
 * still render a "last updated" string.
 */

const UNITS: Array<{ limit: number; divisor: number; suffix: string }> = [
    { limit: 60_000, divisor: 1000, suffix: 's' },
    { limit: 3_600_000, divisor: 60_000, suffix: 'm' },
    { limit: 86_400_000, divisor: 3_600_000, suffix: 'h' },
];

export function formatStaleTimestamp(epochMs: number, now: number = Date.now()): string {
    const delta = Math.max(0, now - epochMs);
    for (const u of UNITS) {
        if (delta < u.limit) {
            return `${Math.max(1, Math.floor(delta / u.divisor))}${u.suffix} ago`;
        }
    }
    return `${Math.floor(delta / 86_400_000)}d ago`;
}
