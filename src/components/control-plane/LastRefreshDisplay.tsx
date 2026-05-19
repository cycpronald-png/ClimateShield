import React from 'react';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from '@/components/ui/tooltip';

export interface LastRefreshDisplayProps {
  lastRefresh: Date | null;
  isStale: boolean;
  loading: boolean;
  error: string | null;
}

function formatRelativeTime(date: Date): string {
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

  if (diffMinutes < 1) return 'just now';
  if (diffHours < 1) return rtf.format(-diffMinutes, 'minute');
  if (diffDays < 1) return rtf.format(-diffHours, 'hour');
  return rtf.format(-diffDays, 'day');
}

function formatAbsoluteTime(date: Date): string {
  const dateStr = date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  const timeStr = date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return `Last refreshed: ${dateStr} at ${timeStr}`;
}

export const LastRefreshDisplay: React.FC<LastRefreshDisplayProps> = ({
  lastRefresh,
  isStale,
  loading,
  error,
}) => {
  if (error) {
    return (
      <div className="flex items-center gap-2 mt-2 justify-end">
        <span className="text-sm text-muted-foreground">
          Unable to check last refresh
        </span>
      </div>
    );
  }

  if (loading || lastRefresh === null) {
    return (
      <div className="flex items-center gap-2 mt-2 justify-end">
        <span className="text-sm text-muted-foreground">
          Waiting for first refresh...
        </span>
      </div>
    );
  }

  const relativeText = formatRelativeTime(lastRefresh);
  const absoluteText = formatAbsoluteTime(lastRefresh);
  const dotColor = isStale ? 'bg-amber-500' : 'bg-emerald-500';

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-2 mt-2 justify-end cursor-default">
            <span className={`w-2 h-2 rounded-full ${dotColor}`} aria-hidden="true" />
            <span className="text-sm text-muted-foreground">
              {relativeText}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="end">
          <p className="text-sm">{absoluteText}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
