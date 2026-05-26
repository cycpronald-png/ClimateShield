import { useCallback } from 'react';
import { getLocalDateKey } from '@/lib/localDates';

const CACHE_KEY_PREFIX = "climateshield_cache_";
const CACHE_VERSION = 3; // Increment when schema changes to invalidate stale cached data

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  version: number;
  dayKey: string;
}

export interface CacheResult<T> {
  data: T;
  timestamp: number;
}

export function useOfflineCache() {
  const read = useCallback(<T>(key: string): CacheResult<T> | null => {
    try {
      const raw = sessionStorage.getItem(CACHE_KEY_PREFIX + key);
      if (!raw) return null;
      const entry = JSON.parse(raw) as CacheEntry<T>;
      // Auto-invalidate stale cache entries from older schema versions
      if (entry.version !== CACHE_VERSION || entry.dayKey !== getLocalDateKey()) {
        sessionStorage.removeItem(CACHE_KEY_PREFIX + key);
        return null;
      }
      return { data: entry.data, timestamp: entry.timestamp };
    } catch {
      return null;
    }
  }, []);

  const write = useCallback(<T>(key: string, data: T): void => {
    try {
      const entry: CacheEntry<T> = {
        data,
        timestamp: Date.now(),
        version: CACHE_VERSION,
        dayKey: getLocalDateKey(),
      };
      sessionStorage.setItem(CACHE_KEY_PREFIX + key, JSON.stringify(entry));
    } catch {
      // sessionStorage may be full — silently fail
    }
  }, []);

  const clear = useCallback((): void => {
    try {
      Object.keys(sessionStorage)
        .filter((k) => k.startsWith(CACHE_KEY_PREFIX))
        .forEach((k) => sessionStorage.removeItem(k));
    } catch {
      // ignore
    }
  }, []);

  return { read, write, clear };
}

export function formatStaleTimestamp(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString();
}
