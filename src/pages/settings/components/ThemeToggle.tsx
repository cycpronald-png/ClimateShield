// ThemeToggle.tsx — no external icon imports needed here

interface ThemeToggleProps {
    theme: 'light' | 'dark';
    onToggle: () => void;
}

export function ThemeToggle({ theme, onToggle }: ThemeToggleProps) {
    return (
        <div className="flex items-center justify-between py-4 border-b border-zinc-100 dark:border-zinc-800">
            <div>
                <div className="font-medium">Dark Mode</div>
                <div className="text-xs text-zinc-500">Toggle application visual theme</div>
            </div>
            <button
                onClick={onToggle}
                className={`w-12 h-6 rounded-full p-1 transition-colors ${theme === 'dark' ? 'bg-violet-600' : 'bg-zinc-200'}`}
            >
                <div className={`w-4 h-4 rounded-full bg-white transition-transform ${theme === 'dark' ? 'translate-x-6' : 'translate-x-0'}`} />
            </button>
        </div>
    );
}
