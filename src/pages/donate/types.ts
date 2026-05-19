import type { LucideProps } from "lucide-react";
import type { ForwardRefExoticComponent, RefAttributes } from "react";

export interface DonationItemConfig {
    id: string;
    name: string;
    description: string;
    value: number;
    icon: ForwardRefExoticComponent<Omit<LucideProps, "ref"> & RefAttributes<SVGSVGElement>>;
    category: "cooling" | "warming";
    priority: "low" | "medium" | "high" | "critical";
    colorClass: string;
}

export interface CartItem {
    id: string;
    quantity: number;
}
