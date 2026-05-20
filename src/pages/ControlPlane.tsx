import { useControlPlaneData } from "@/hooks/useControlPlaneData";
import { Dashboard } from '@/sections/control-plane/components/Dashboard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DonationsTab } from '@/components/admin/donations/DonationsTab';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { WarningsCard } from '@/sections/risk-intelligence/components/WarningsCard';
import { OfflineBanner } from '@/components/OfflineBanner';
import { useRetry } from '@/context/RetryContext';

export default function ControlPlane() {
    const { districts, activeWarnings, loading, error, isOffline, lastSuccessfulFetch, refetch } = useControlPlaneData();
    const { triggerRetry } = useRetry();

    const handleRefresh = async () => {
        try {
            refetch();
            toast.success("Refreshed");
        } catch (e) {
            toast.error("Refresh failed");
        }
    };

    return (
        <div className="h-full flex flex-col">
            {isOffline && (
                <OfflineBanner lastSuccessfulFetch={lastSuccessfulFetch} onRetry={triggerRetry} />
            )}
            <div className="mb-8 flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-heading font-bold tracking-tight">Control Plane</h1>
                    <p className="text-muted-foreground mt-2">
                        Real-time monitoring of district heat stress levels and multi-agent risk assessment.
                    </p>
                </div>
                <div className="flex flex-col items-end">
                    <Button onClick={handleRefresh} variant="outline" className="flex items-center gap-2">
                        <RefreshCw className="w-4 h-4" />
                        Refresh
                    </Button>
                </div>
            </div>

            <div className="flex-1">
                {loading && districts.length === 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {Array.from({ length: 5 }).map((_, i) => (
                            <Skeleton key={i} className="h-40 w-full rounded-lg" />
                        ))}
                    </div>
                ) : error && districts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 gap-4">
                        <p className="text-destructive font-medium">{error}</p>
                        <Button onClick={handleRefresh} variant="outline">
                            Retry
                        </Button>
                    </div>
                ) : districts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 gap-4">
                        <p className="text-muted-foreground font-medium">No weather data available</p>
                        <p className="text-sm text-muted-foreground">Try refreshing to fetch the latest readings from HKO.</p>
                        <Button onClick={handleRefresh} variant="outline" className="flex items-center gap-2">
                            <RefreshCw className="w-4 h-4" />
                            Retry
                        </Button>
                    </div>
                ) : (
                    <Tabs defaultValue="dashboard" className="space-y-4">
                        <TabsList>
                            <TabsTrigger value="dashboard">Risk Overview</TabsTrigger>
                            <TabsTrigger value="donations">Donations</TabsTrigger>
                        </TabsList>
                        <TabsContent value="dashboard" className="space-y-4">
                            <Dashboard districts={districts} activeWarnings={activeWarnings} />
                            <WarningsCard />
                        </TabsContent>
                        <TabsContent value="donations" className="space-y-4">
                            <DonationsTab />
                        </TabsContent>
                    </Tabs>
                )}
            </div>
        </div>
    )
}
