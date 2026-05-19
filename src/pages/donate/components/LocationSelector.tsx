import { Info, MapPin } from "lucide-react";
import { LOCATIONS } from "../constants";

interface LocationSelectorProps {
    selectedLocation: string;
    onLocationChange: (location: string) => void;
}

export function LocationSelector({ selectedLocation, onLocationChange }: LocationSelectorProps) {
    return (
        <div className="bg-[#1F2937] rounded-xl p-5 border border-gray-700 shadow-lg">
            <label
                htmlFor="location-select"
                className="block text-sm font-bold text-white mb-2 flex items-center gap-2"
            >
                <MapPin className="text-cyan-400 size-5" />
                Drop-off Location
            </label>
            <div className="relative">
                <select
                    id="location-select"
                    value={selectedLocation}
                    onChange={(e) => onLocationChange(e.target.value)}
                    className="block w-full rounded-lg bg-[#111827] border-gray-700 py-3 pl-4 pr-10 text-white focus:border-cyan-500 focus:ring-cyan-500 sm:text-sm shadow-sm appearance-none"
                >
                    <option value="" disabled>Select a nearby collection point...</option>
                    {LOCATIONS.map(loc => (
                        <option key={loc} value={loc}>{loc}</option>
                    ))}
                </select>
            </div>
            <p className="mt-2 text-xs text-gray-400 flex items-center gap-1">
                <Info className="size-4" />
                Items must be dropped off within 48 hours of pledge.
            </p>
        </div>
    );
}
