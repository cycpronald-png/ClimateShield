import { useState, useEffect, useCallback } from 'react';
import { api } from '@/services/api';
import { useRetry } from '@/context/RetryContext';

const STALE_THRESHOLD_MS = 7 * 60 * 60 * 1000; // 7 hours
const POLL_INTERVAL_MS = 30000; // 30 seconds

export interface UseLastRefreshResult {
  lastRefresh: Date | null;
  isStale: boolean;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useLastRefresh(): UseLastRefreshResult {
  const { retryKey } = useRetry();
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [isStale, setIsStale] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { timestamp } = await api.weather.getLastRefresh();
      if (timestamp) {
        const date = new Date(timestamp);
        setLastRefresh(date);
        setIsStale(Date.now() - date.getTime() > STALE_THRESHOLD_MS);
      } else {
        setLastRefresh(null);
        setIsStale(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to check last refresh time');
      setLastRefresh(null);
      setIsStale(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const iv = setInterval(() => {
      fetchData();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(iv);
  }, [fetchData, retryKey]);

  return { lastRefresh, isStale, loading, error, refetch: fetchData };
}
