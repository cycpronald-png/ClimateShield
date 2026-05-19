import { ArrowRight, HeartHandshake, Loader2, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { DONATION_ITEMS } from "../constants";
import type { CartItem } from "../types";

interface ImpactSidebarProps {
    cart: CartItem[];
    selectedLocation: string;
    estimatedValue: number;
    estimatedLivesImpacting: number;
    isSubmitting: boolean;
    totalItems: number;
    onDonate: () => void;
}

export function ImpactSidebar({
    cart,
    selectedLocation,
    estimatedValue,
    estimatedLivesImpacting,
    isSubmitting,
    totalItems,
    onDonate
}: ImpactSidebarProps) {
    const canSubmit = !isSubmitting && totalItems > 0 && !!selectedLocation;

    return (
        <div className="sticky top-24 bg-[#1F2937] rounded-2xl shadow-xl border border-gray-700 overflow-hidden">
            <div className="bg-cyan-500/10 p-4 border-b border-gray-700 flex items-center gap-2">
                <HeartHandshake className="text-cyan-400 size-5" />
                <h2 className="font-bold text-white">Your Impact</h2>
            </div>

            <div className="p-6 space-y-6">
                {/* Cart Items */}
                <div className="space-y-3">
                    {cart.length === 0 ? (
                        <div className="text-center py-4 text-gray-500 text-sm italic">
                            Select items to see impact
                        </div>
                    ) : (
                        cart.map(cartItem => {
                            const item = DONATION_ITEMS.find(i => i.id === cartItem.id);
                            if (!item) return null;
                            return (
                                <div key={cartItem.id} className="flex justify-between text-sm">
                                    <span className="text-gray-400">{item.name} (x{cartItem.quantity})</span>
                                    <span className="font-medium text-white">~ ${cartItem.quantity * item.value}</span>
                                </div>
                            );
                        })
                    )}

                    {cart.length > 0 && (
                        <>
                            <div className="border-t border-dashed border-gray-700 my-2" />
                            <div className="flex justify-between items-center">
                                <span className="font-bold text-white">Total Value</span>
                                <span className="font-extrabold text-xl text-cyan-400">${estimatedValue}</span>
                            </div>
                        </>
                    )}
                </div>

                {/* Collection Point */}
                <div className="bg-blue-900/20 rounded-lg p-3 border border-blue-900/50">
                    <h4 className="text-xs font-bold text-blue-400 uppercase tracking-wide mb-1">Collection Point</h4>
                    <div className="flex items-start gap-2">
                        <MapPin className="text-blue-400 size-5 mt-0.5" />
                        <div>
                            <p className="text-sm font-bold text-blue-300">
                                {selectedLocation ? selectedLocation.split(" -")[0] : "Select a location..."}
                            </p>
                            <p className="text-xs text-blue-400/80">Open 10:00 - 20:00 Daily</p>
                        </div>
                    </div>
                </div>

                {/* Impact Meter */}
                <div className="bg-gradient-to-br from-gray-900 to-black rounded-xl p-4 text-white border border-gray-800">
                    <p className="text-xs text-gray-400 mb-1">Estimated Impact</p>
                    <p className="text-sm font-medium leading-relaxed">
                        Your donation will help approximately{" "}
                        <span className="text-cyan-400 font-bold">{estimatedLivesImpacting} people</span>{" "}
                        survive extreme weather conditions.
                    </p>
                    <div className="mt-3 h-1.5 w-full bg-gray-800 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-cyan-400 rounded-full shadow-[0_0_8px_rgba(13,242,223,0.5)] transition-all duration-500"
                            style={{ width: `${Math.min(100, (estimatedLivesImpacting / 20) * 100)}%` }}
                        />
                    </div>
                </div>

                {/* Submit Button */}
                <button
                    onClick={onDonate}
                    disabled={!canSubmit}
                    className={cn(
                        "w-full py-3 px-4 font-bold rounded-lg shadow-lg transition-all transform flex items-center justify-center gap-2",
                        canSubmit
                            ? "bg-cyan-500 hover:bg-cyan-400 text-black shadow-cyan-500/20 active:scale-[0.98]"
                            : "bg-gray-700 text-gray-400 cursor-not-allowed"
                    )}
                >
                    {isSubmitting ? (
                        <>
                            <Loader2 className="animate-spin size-4" />
                            <span>Processing...</span>
                        </>
                    ) : (
                        <>
                            <span>Proceed to Confirmation</span>
                            <ArrowRight className="size-4" />
                        </>
                    )}
                </button>

                <p className="text-center text-xs text-gray-500">
                    Step 2 of 3 • Next: Review &amp; Contact Info
                </p>
            </div>
        </div>
    );
}
