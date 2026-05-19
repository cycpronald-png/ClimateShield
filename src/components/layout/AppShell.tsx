import { useState } from "react";
import { Outlet } from "react-router-dom";
import { Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { MainNav } from "./MainNav";
import { UserMenu } from "./UserMenu";
import { ModeToggle } from "@/components/mode-toggle";

export function AppShell() {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-zinc-950 lg:flex-row">
            {/* Mobile Header */}
            <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b bg-white dark:bg-zinc-950 px-6 lg:hidden">
                <div className="flex items-center gap-2 font-bold text-violet-700 dark:text-violet-500">
                    <img src="/logo.png" alt="ClimateShield" className="h-12 w-12 object-contain mix-blend-multiply dark:mix-blend-screen" />
                    <span>ClimateShield</span>
                </div>
                <div className="flex items-center gap-4">
                    <ModeToggle />
                    <UserMenu />
                    <Sheet open={isOpen} onOpenChange={setIsOpen}>
                        <SheetTrigger asChild>
                            <Button variant="ghost" size="icon">
                                <Menu className="h-6 w-6 text-zinc-600 dark:text-zinc-400" />
                                <span className="sr-only">Toggle menu</span>
                            </Button>
                        </SheetTrigger>
                        <SheetContent side="left" className="w-[240px] p-0">
                            <div className="flex h-16 items-center border-b px-6 font-bold text-violet-700 dark:text-violet-500">
                                <img src="/logo.png" alt="ClimateShield" className="mr-2 h-12 w-12 object-contain mix-blend-multiply dark:mix-blend-screen" />
                                <span>ClimateShield</span>
                            </div>
                            <MainNav isMobile onLinkClick={() => setIsOpen(false)} />
                        </SheetContent>
                    </Sheet>
                </div>
            </header>

            {/* Desktop Sidebar */}
            <aside className="hidden w-64 flex-col border-r bg-white dark:bg-zinc-950 lg:flex">
                <div className="flex h-16 items-center border-b px-6 font-bold text-violet-700 dark:text-violet-500">
                    <img src="/logo.png" alt="ClimateShield" className="mr-2 h-12 w-12 object-contain mix-blend-multiply dark:mix-blend-screen" />
                    <span>ClimateShield</span>
                </div>
                <MainNav className="flex-1" />
            </aside>

            {/* Main Content */}
            <main className="flex-1 min-w-0 overflow-hidden flex flex-col">
                <div className="flex h-16 items-center justify-end gap-4 border-b bg-white dark:bg-zinc-950 px-8 lg:flex hidden flex-shrink-0">
                    <ModeToggle />
                    <UserMenu />
                </div>
                <div className="flex-1 overflow-auto p-6 lg:p-10">
                    <Outlet />
                </div>
            </main>
        </div>
    );
}
