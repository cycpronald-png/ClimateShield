import type { ComponentProps } from "react";
import { Link, useLocation } from "react-router-dom";
import {
    Activity,
    BrainCircuit,
    Settings,
    Heart
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
    {
        title: "Risk Intelligence",
        href: "/",
        icon: BrainCircuit,
        variant: "default",
    },
    {
        title: "Control Plane",
        href: "/control-plane",
        icon: Activity,
        variant: "default",
    },
    {
        title: "Donate",
        href: "/donate",
        icon: Heart,
        variant: "default",
    },
    {
        title: "Settings",
        href: "/settings",
        icon: Settings,
        variant: "default",
    },
];

export function MainNav({ className, isMobile, onLinkClick, ...props }: ComponentProps<"nav"> & { isMobile?: boolean; onLinkClick?: () => void }) {
    const location = useLocation();

    return (
        <nav
            className={cn("flex flex-col gap-2 px-2", className)}
            {...props}
        >
            {navItems.map((item) => {
                const isActive =
                    location.pathname === item.href ||
                    (item.href !== "/" &&
                        location.pathname.startsWith(item.href));
                const Icon = item.icon;
                return (
                    <Link
                        key={item.href}
                        to={item.href}
                        className={cn(
                            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                            isActive
                                ? "bg-primary text-primary-foreground"
                                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                        )}
                    >
                        <Icon className="h-4 w-4" />
                        {item.title}
                    </Link>
                );
            })}
        </nav>
    );
}