import { useState } from 'react';
import type { District } from "@/sections/control-plane/types";
import { RiskCard } from "./RiskCard";
import { Button } from "@/components/ui/button";
import { LayoutGrid, List as ListIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface DashboardProps {
    districts: District[];
    activeWarnings?: Array<{ warning_type: string; signal: string | null }>;
}

export function Dashboard({ districts, activeWarnings = [] }: DashboardProps) {
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

    return (
        <div className="flex h-[calc(100vh-8rem)] gap-6 overflow-hidden">
            {/* Main Panel: District Grid/List */}
            <div className="flex-1 flex flex-col">
                {/* Toolbar */}
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold tracking-tight">District Risk Overview</h2>
                    <div className="flex items-center border rounded-lg p-1 bg-muted/40">
                        <Button
                            variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setViewMode('grid')}
                        >
                            <LayoutGrid className="h-4 w-4" />
                        </Button>
                        <Button
                            variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setViewMode('list')}
                        >
                            <ListIcon className="h-4 w-4" />
                        </Button>
                    </div>
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto pr-2 pb-10">
                    <div className={cn(
                        "grid gap-4",
                        viewMode === 'grid'
                            ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3"
                            : "grid-cols-1"
                    )}>
                        {districts.map(district => (
                            <RiskCard
                                key={district.id}
                                district={district}
                                activeWarnings={activeWarnings}
                                onClick={() => {}}
                            />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}