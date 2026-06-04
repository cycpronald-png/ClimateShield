import { useState } from "react";
import { toast } from "sonner";
import { Snowflake, Thermometer } from "lucide-react";
import { api } from "@/services/api";
import { DONATION_ITEMS } from "./constants";
import type { CartItem } from "./types";
import { DonationHeader } from "./components/DonationHeader";
import { StepIndicator } from "./components/StepIndicator";
import { LocationSelector } from "./components/LocationSelector";
import { SupplySection } from "./components/SupplySection";
import { ImpactSidebar } from "./components/ImpactSidebar";

export default function Donate() {
    const [selectedLocation, setSelectedLocation] = useState<string>("");
    const [cart, setCart] = useState<CartItem[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [currentStep, setCurrentStep] = useState(2);

    const updateQuantity = (itemId: string, delta: number) => {
        setCart(prev => {
            const existing = prev.find(i => i.id === itemId);
            const currentQty = existing?.quantity ?? 0;
            const newQty = Math.max(0, currentQty + delta);
            if (newQty === 0) return prev.filter(i => i.id !== itemId);
            if (existing) return prev.map(i => i.id === itemId ? { ...i, quantity: newQty } : i);
            return [...prev, { id: itemId, quantity: newQty }];
        });
    };

    const totalItems = cart.reduce((acc, item) => acc + item.quantity, 0);
    const estimatedValue = cart.reduce((acc, item) => {
        const config = DONATION_ITEMS.find(c => c.id === item.id);
        return acc + (item.quantity * (config?.value ?? 0));
    }, 0);
    const estimatedLivesImpacting = Math.floor(estimatedValue / 15);

    const handleDonate = async () => {
        if (!selectedLocation) { toast.error("Please select a drop-off location"); return; }
        if (totalItems === 0) { toast.error("Please select at least one item to donate"); return; }
        setIsSubmitting(true);
        setCurrentStep(3);
        try {
            await api.donate.createPledge({
                donor_name: "Anonymous User",
                donor_email: "anonymous@example.com",
                donor_phone: "N/A",
                company: "N/A",
                donation_type: "physical",
                message: `Drop-off at: ${selectedLocation}`,
                items: cart.map(item => {
                    const meta = DONATION_ITEMS.find(d => d.id === item.id);
                    return {
                        item_type: meta?.id ?? item.id,
                        quantity: item.quantity,
                        delivery_method: 'dropoff',
                        notes: `${meta?.name ?? item.id} (${meta?.category ?? 'other'})`,
                    };
                })
            });
            toast.success("Pledge submitted successfully!");
            setTimeout(() => { setCart([]); setSelectedLocation(""); setCurrentStep(2); setIsSubmitting(false); }, 2000);
        } catch (error) {
            console.error("Donation failed", error);
            toast.error("Failed to submit pledge. Please try again.");
            setIsSubmitting(false);
            setCurrentStep(2);
        }
    };

    const coolingItems = DONATION_ITEMS.filter(i => i.category === "cooling");
    const warmingItems = DONATION_ITEMS.filter(i => i.category === "warming");

    return (
        <div className="min-h-screen bg-[#111827] text-gray-100 font-sans selection:bg-cyan-500/30">
            <DonationHeader />
            <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-8 py-8 md:py-12">
                <StepIndicator currentStep={currentStep} />
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
                    <div className="lg:col-span-8 space-y-8">
                        <div className="flex flex-col gap-2">
                            <h1 className="text-3xl font-extrabold text-white tracking-tight">Select Supply Items</h1>
                            <p className="text-gray-400">Choose the items you wish to donate. Quantities are based on current shelter requests.</p>
                        </div>
                        <LocationSelector selectedLocation={selectedLocation} onLocationChange={setSelectedLocation} />
                        <SupplySection
                            title="Cooling Supplies"
                            icon={<div className="p-2 rounded-lg bg-blue-500/10 text-blue-400"><Snowflake className="size-6" aria-hidden="true" /></div>}
                            items={coolingItems}
                            cart={cart}
                            onUpdateQuantity={updateQuantity}
                        />
                        <SupplySection
                            title="Warming Supplies"
                            icon={<div className="p-2 rounded-lg bg-orange-500/10 text-orange-400"><Thermometer className="size-6" aria-hidden="true" /></div>}
                            items={warmingItems}
                            cart={cart}
                            onUpdateQuantity={updateQuantity}
                        />
                    </div>
                    <div className="lg:col-span-4 relative">
                        <ImpactSidebar
                            cart={cart}
                            selectedLocation={selectedLocation}
                            estimatedValue={estimatedValue}
                            estimatedLivesImpacting={estimatedLivesImpacting}
                            isSubmitting={isSubmitting}
                            totalItems={totalItems}
                            onDonate={handleDonate}
                        />
                    </div>
                </div>
            </main>
        </div>
    );
}