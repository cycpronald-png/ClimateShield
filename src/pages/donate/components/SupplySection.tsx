import type { ReactNode } from "react";
import type { DonationItemConfig, CartItem } from "../types";
import { DonationItemCard } from "./DonationItemCard";

interface SupplySectionProps {
    title: string;
    icon: ReactNode;
    items: DonationItemConfig[];
    cart: CartItem[];
    onUpdateQuantity: (id: string, delta: number) => void;
}

export function SupplySection({ title, icon, items, cart, onUpdateQuantity }: SupplySectionProps) {
    const getQty = (id: string) => cart.find(i => i.id === id)?.quantity ?? 0;

    return (
        <div>
            <div className="flex items-center gap-3 mb-4">
                {icon}
                <h3 className="text-lg font-bold text-white">{title}</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {items.map(item => (
                    <DonationItemCard
                        key={item.id}
                        item={item}
                        quantity={getQty(item.id)}
                        onUpdateQuantity={onUpdateQuantity}
                    />
                ))}
            </div>
        </div>
    );
}
