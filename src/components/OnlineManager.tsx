/**
 * Bridges the browser online/offline events into TanStack Query's
 * ``onlineManager``. Replaces the old custom ``RetryContext``.
 */
import { useEffect } from 'react';
import { onlineManager } from '@tanstack/react-query';

export function OnlineManager() {
    useEffect(() => {
        const on = () => onlineManager.setOnline(true);
        const off = () => onlineManager.setOnline(false);
        window.addEventListener('online', on);
        window.addEventListener('offline', off);
        return () => {
            window.removeEventListener('online', on);
            window.removeEventListener('offline', off);
        };
    }, []);
    return null;
}

export default OnlineManager;
