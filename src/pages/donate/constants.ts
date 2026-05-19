import { Fan, Droplets, Bed, Soup } from "lucide-react";
import type { DonationItemConfig } from "./types";

export const DONATION_ITEMS: DonationItemConfig[] = [
    {
        id: "portable_fan",
        name: "Portable Fans",
        description: "Battery operated, incl. batteries",
        value: 85,
        icon: Fan,
        category: "cooling",
        priority: "high",
        colorClass: "text-blue-400 bg-blue-900/30 border-blue-900/50"
    },
    {
        id: "cooling_towel",
        name: "Cooling Towels",
        description: "Microfiber, quick-dry packs",
        value: 25,
        icon: Droplets,
        category: "cooling",
        priority: "medium",
        colorClass: "text-cyan-400 bg-cyan-900/30 border-cyan-900/50"
    },
    {
        id: "thermal_blanket",
        name: "Thermal Blankets",
        description: "Heavy duty, foil insulated",
        value: 45,
        icon: Bed,
        category: "warming",
        priority: "critical",
        colorClass: "text-orange-400 bg-orange-900/30 border-orange-900/50"
    },
    {
        id: "heat_pack",
        name: "Heat Packs",
        description: "Pack of 10, disposable",
        value: 30,
        icon: Soup,
        category: "warming",
        priority: "low",
        colorClass: "text-amber-500 bg-amber-900/30 border-amber-900/50"
    }
];

export const LOCATIONS = [
    "Sham Shui Po Store (Family Hub) - 2.1km",
    "Kwun Tong Hub (Industrial Ctr) - 5.4km",
    "Central District Shelter - 8.2km",
    "Yuen Long Community Center - 12km"
];
