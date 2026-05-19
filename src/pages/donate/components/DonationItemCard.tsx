import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DonationItemConfig } from "../types";

interface DonationItemCardProps {
    item: DonationItemConfig;
    quantity: number;
    onUpdateQuantity: (id: string, delta: number) => void;
}

const PRIORITY_BADGE: Record<DonationItemConfig["priority"], string> = {
    critical: "bg-red-900/30 text-red-400 border-red-900/50",
    high: "bg-red-900/30 text-red-400 border-red-900/50",
    medium: "bg-orange-900/30 text-orange-400 border-orange-900/50",
    low: "bg-green-900/30 text-green-400 border-green-900/50"
};

const PRIORITY_LABEL: Record<DonationItemConfig["priority"], string> = {
    critical: "Critical",
    high: "High Demand",
    medium: "Med Priority",
    low: "Low Stock"
};

export function DonationItemCard({ item, quantity, onUpdateQuantity }: DonationItemCardProps) {
    const [bgClass, textColorClass] = item.colorClass.split(" ");
    const inputId = `qty-${item.id}`;

    return (
        <div className="group bg-[#1F2937] rounded-xl border border-gray-700 p-4 shadow-sm hover:shadow-lg hover:border-cyan-500/50 transition-all">
            <div className="flex justify-between items-start mb-3">
                <div className={cn("size-12 rounded-lg flex items-center justify-center", bgClass, textColorClass)}>
                    <item.icon className="size-6" />
                </div>
                <span className={cn("px-2 py-1 rounded-full text-xs font-bold border", PRIORITY_BADGE[item.priority])}>
                    {PRIORITY_LABEL[item.priority]}
                </span>
            </div>
            <h4 className="font-bold text-white">{item.name}</h4>
            <p className="text-xs text-gray-400 mb-4">{item.description}</p>
            <div className="flex items-center justify-between pt-3 border-t border-gray-700">
                <span className="text-sm font-medium text-gray-400">${item.value} est. value</span>
                <div className="flex items-center bg-gray-900 rounded-lg border border-gray-700" role="group" aria-label={`Quantity for ${item.name}`}>
                    <button
                        onClick={() => onUpdateQuantity(item.id, -1)}
                        aria-label={`Decrease ${item.name} quantity`}
                        className="size-8 flex items-center justify-center text-gray-400 hover:text-cyan-400 transition-colors rounded-l-lg hover:bg-gray-800"
                    >
                        <Minus className="size-4" />
                    </button>
                    <label htmlFor={inputId} className="sr-only">
                        {item.name} quantity
                    </label>
                    <input
                        id={inputId}
                        className="w-8 text-center bg-transparent border-none p-0 text-sm font-bold text-white focus:ring-0"
                        readOnly
                        type="text"
                        value={quantity}
                        aria-label={`${item.name} quantity`}
                    />
                    <button
                        onClick={() => onUpdateQuantity(item.id, 1)}
                        aria-label={`Increase ${item.name} quantity`}
                        className="size-8 flex items-center justify-center text-gray-400 hover:text-cyan-400 transition-colors rounded-r-lg hover:bg-gray-800"
                    >
                        <Plus className="size-4" />
                    </button>
                </div>
            </div>
        </div>
    );
}
