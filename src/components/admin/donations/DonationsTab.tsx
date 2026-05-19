import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Check, X, Package, Clock } from "lucide-react";
import { toast } from "sonner";

type Donation = {
    id: number;
    donor_name: string;
    donation_type: "financial" | "physical";
    status: "pending" | "approved" | "rejected";
    items: { name: string; quantity: number }[];
    amount?: number;
    created_at: string;
};

export function DonationsTab() {
    const [donations, setDonations] = useState<Donation[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const [authRequired, setAuthRequired] = useState(false);

    useEffect(() => {
        const fetchDonations = async () => {
            try {
                const res = await fetch("/api/admin/donations");
                if (res.status === 401 || res.status === 403) {
                    setAuthRequired(true);
                    return;
                }
                if (!res.ok) throw new Error("Failed to fetch donations");
                const data = await res.json();
                setDonations(data);
            } catch (error) {
                toast.error("Failed to load donations");
                console.error(error);
            } finally {
                setIsLoading(false);
            }
        };
        fetchDonations();
    }, []);

    const handleApprove = (id: number) => {
        setDonations(prev => prev.map(d => d.id === id ? { ...d, status: "approved" as const } : d));
        toast.success(`Donation #${id} approved`);
    };

    const handleReject = (id: number) => {
        setDonations(prev => prev.map(d => d.id === id ? { ...d, status: "rejected" as const } : d));
        toast.info(`Donation #${id} rejected`);
    };

    if (authRequired) {
        return (
            <div className="p-8 text-center text-muted-foreground">
                <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>Sign in as admin to manage donations.</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Pledges</CardTitle>
                        <Package className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{donations.length}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Pending Approval</CardTitle>
                        <Clock className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {donations.filter(d => d.status === "pending").length}
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card className="col-span-4">
                <CardHeader>
                    <CardTitle>Recent Donations</CardTitle>
                    <CardDescription>
                        Review and approve incoming donation pledges.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <ScrollArea className="h-[400px]">
                        <div className="space-y-4">
                            {isLoading ? (
                                <div className="text-center py-4 text-muted-foreground">Loading...</div>
                            ) : donations.length === 0 ? (
                                <div className="text-center py-4 text-muted-foreground">No donations found.</div>
                            ) : (
                                donations.map((donation) => (
                                    <div key={donation.id} className="flex items-center justify-between p-4 border rounded-lg bg-card">
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2">
                                                <span className="font-semibold">{donation.donor_name}</span>
                                                <Badge variant={donation.donation_type === "financial" ? "default" : "secondary"}>
                                                    {donation.donation_type}
                                                </Badge>
                                                <Badge variant={donation.status === "approved" ? "default" : donation.status === "rejected" ? "destructive" : "outline"}>
                                                    {donation.status}
                                                </Badge>
                                            </div>
                                            <div className="text-sm text-muted-foreground">
                                                {donation.donation_type === "physical" ? (
                                                    <span>
                                                        {donation.items?.map((i: any) => `${i.quantity}x ${i.item_name || i.name}`).join(", ")}
                                                    </span>
                                                ) : (
                                                    <span>${donation.amount?.toFixed(2)}</span>
                                                )}
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                                {new Date(donation.created_at).toLocaleString()}
                                            </div>
                                        </div>

                                        {donation.status === "pending" && (
                                            <div className="flex gap-2">
                                                <Button size="sm" variant="outline" onClick={() => handleReject(donation.id)}>
                                                    <X className="h-4 w-4 mr-1" /> Reject
                                                </Button>
                                                <Button size="sm" onClick={() => handleApprove(donation.id)}>
                                                    <Check className="h-4 w-4 mr-1" /> Approve
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    </ScrollArea>
                </CardContent>
            </Card>
        </div>
    );
}
