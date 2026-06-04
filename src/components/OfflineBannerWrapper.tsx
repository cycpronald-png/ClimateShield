/**
 * Online/offline detection banner trigger.
 *
 * This is a thin wrapper that re-uses TanStack Query's built-in
 * ``onlineManager`` instead of the old custom ``RetryContext``. Query
 * auto-pauses and resumes queries based on browser online status.
 */
import { useEffect, useState } from 'react';
import { onlineManager } from '@tanstack/react-query';
import { OfflineBanner } from '@/components/OfflineBanner';

interface OfflineBannerWrapperProps {
    onRetry?: () => void;
}

export function OfflineBannerWrapper({ onRetry }: OfflineBannerWrapperProps) {
    const [offline, setOffline] = useState(!onlineManager.isOnline());

    useEffect(() => {
        const unsubscribe = onlineManager.subscribe((isOnline) => setOffline(!isOnline));
        return () => {
            unsubscribe();
        };
    }, []);

    if (!offline) return null;
    return <OfflineBanner lastSuccessfulFetch={null} onRetry={onRetry ?? (() => undefined)} />;
}

export default OfflineBannerWrapper;
