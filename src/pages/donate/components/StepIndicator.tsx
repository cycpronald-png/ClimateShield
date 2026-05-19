import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface StepIndicatorProps {
    currentStep: number;
}

const STEPS = [
    { num: 1, label: "Categories" },
    { num: 2, label: "Selection" },
    { num: 3, label: "Confirm" }
];

export function StepIndicator({ currentStep }: StepIndicatorProps) {
    return (
        <div className="mb-10 max-w-3xl mx-auto">
            <div className="flex items-center justify-between relative">
                {/* Background Line */}
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-gray-800 -z-10 rounded-full" />

                {/* Active Line */}
                <div
                    className={cn(
                        "absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-cyan-500 -z-10 rounded-full transition-all duration-500 shadow-[0_0_10px_rgba(13,242,223,0.3)]",
                        currentStep === 1 ? "w-0" : currentStep === 2 ? "w-1/2" : "w-full"
                    )}
                />

                {STEPS.map((step) => (
                    <div key={step.num} className="flex flex-col items-center gap-2 bg-[#111827] px-2">
                        <div
                            className={cn(
                                "size-8 rounded-full flex items-center justify-center font-bold text-sm shadow-lg transition-all border-2",
                                step.num < currentStep
                                    ? "bg-cyan-500 border-cyan-500 text-white"
                                    : step.num === currentStep
                                        ? "bg-cyan-500 border-cyan-500 text-white ring-4 ring-cyan-500/20 shadow-cyan-500/20"
                                        : "bg-gray-800 border-gray-700 text-gray-400"
                            )}
                        >
                            {step.num < currentStep ? <Check className="size-4" /> : step.num}
                        </div>
                        <span
                            className={cn(
                                "text-xs font-bold",
                                step.num <= currentStep ? "text-cyan-400" : "text-gray-500"
                            )}
                        >
                            {step.label}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}
