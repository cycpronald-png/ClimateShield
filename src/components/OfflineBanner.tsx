import { WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatStaleTimestamp } from "@/hooks/useOfflineCache";

interface OfflineBannerProps {
  lastSuccessfulFetch: number | null;
  onRetry: () => void;
}

export function OfflineBanner({ lastSuccessfulFetch, onRetry }: OfflineBannerProps) {
  return (
    <div className="w-full bg-destructive/90 text-destructive-foreground px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <WifiOff className="h-5 w-5" />
        <div className="text-sm">
          <span className="font-semibold">Offline — data may be stale</span>
          {lastSuccessfulFetch && (
            <span className="ml-2 opacity-90">
              Last updated: {formatStaleTimestamp(lastSuccessfulFetch)}
            </span>
          )}
        </div>
      </div>
      <Button variant="secondary" size="sm" onClick={onRetry}>
        Retry Now
      </Button>
    </div>
  );
}
