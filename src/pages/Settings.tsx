import { useState, useEffect, useRef } from 'react';
import { Settings as SettingsIcon, Monitor, Key, Download, Upload, Activity, Wifi, AlertTriangle } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { api } from '@/services/api';
import { ThemeToggle } from './settings/components/ThemeToggle';
import { MetricsPanel } from './settings/components/MetricsPanel';
import { RiskFormulaPanel } from './settings/components/RiskFormulaPanel';
import { cn } from '@/lib/utils';

export default function Settings() {
    const [theme, setTheme] = useState<'light' | 'dark'>('dark');
    const [metrics, setMetrics] = useState<Record<string, number> | null>(null);
    const [metricsLoading, setMetricsLoading] = useState(false);
    const [lastResetAt, setLastResetAt] = useState<string | null>(null);
    const [importing, setImporting] = useState(false);
    const [openMeteoBeta, setOpenMeteoBeta] = useState(() => localStorage.getItem("climateshield_openmeteo_beta") === "true");
    const [lanAccessEnabled, setLanAccessEnabled] = useState(() => localStorage.getItem("climateshield_lan_access") === "true");
    const [activeTab, setActiveTab] = useState<'general' | 'risk'>('general');
    const fileInputRef = useRef<HTMLInputElement>(null);

    async function handleExport() {
        try {
            const response = await fetch("/api/admin/export");
            if (!response.ok) {
                throw new Error(`Export failed: ${response.status}`);
            }
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            const contentDisposition = response.headers.get("content-disposition");
            const filename = contentDisposition?.match(/filename="?([^";]+)"?/)?.[1] || "climateshield_backup.json";
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
        } catch (err) {
            console.error("Export failed:", err);
            alert("Export failed. See console for details.");
        }
    }

    async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        setImporting(true);
        try {
            const formData = new FormData();
            formData.append("file", file);
            const response = await fetch("/api/admin/import", {
                method: "POST",
                body: formData,
            });
            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.detail || `Import failed: ${response.status}`);
            }
            alert(`Import successful! Readings: ${result.imported.weather_readings}, Forecasts: ${result.imported.weather_forecasts}, Warnings: ${result.imported.weather_warnings}, Alerts: ${result.imported.system_alerts}, Counters: ${result.imported.generation_counters}`);
        } catch (err: any) {
            console.error("Import failed:", err);
            alert(`Import failed: ${err.message}`);
        } finally {
            setImporting(false);
            if (fileInputRef.current) {
                fileInputRef.current.value = "";
            }
        }
    }

    useEffect(() => {
        const isDark = document.documentElement.classList.contains('dark');
        setTheme(isDark ? 'dark' : 'light');

        setOpenMeteoBeta(localStorage.getItem("climateshield_openmeteo_beta") === "true");

        loadMetrics();
    }, []);

    const toggleTheme = () => {
        const newTheme = theme === 'dark' ? 'light' : 'dark';
        setTheme(newTheme);
        document.documentElement.classList.toggle('dark');
        localStorage.setItem("vite-ui-theme", newTheme);
    };

    const loadMetrics = async () => {
        setMetricsLoading(true);
        try {
            const [data, resetData] = await Promise.all([
                api.weather.getMetrics(),
                api.weather.getLastReset().catch(() => ({ last_reset_at: null })),
            ]);
            setMetrics(data);
            setLastResetAt(resetData.last_reset_at);
        } catch (e) {
            console.warn("Metrics load failed:", e instanceof Error ? e.message : e);
        } finally {
            setMetricsLoading(false);
        }
    };

    return (
        <div className="container max-w-4xl mx-auto py-8 space-y-8 animate-in fade-in-50">
            <div className="flex items-center gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-6">
                <div className="p-3 bg-violet-100 dark:bg-violet-900/30 rounded-xl text-violet-600 dark:text-violet-400">
                    <SettingsIcon className="w-8 h-8" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Settings & Configuration</h1>
                    <p className="text-zinc-500 dark:text-zinc-400">Manage application preferences, backups, and metrics.</p>
                </div>
            </div>

            <div className="grid gap-8 md:grid-cols-[250px_1fr]">
                <nav className="flex flex-col gap-2">
                    <button 
                        onClick={() => setActiveTab('general')}
                        className={cn(
                            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                            activeTab === 'general' 
                                ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100" 
                                : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                        )}
                    >
                        <Monitor className="w-4 h-4" />
                        Appearance
                    </button>
                    <button 
                        onClick={() => setActiveTab('risk')}
                        className={cn(
                            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                            activeTab === 'risk' 
                                ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100" 
                                : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                        )}
                    >
                        <Activity className="w-4 h-4" />
                        Risk Formula
                    </button>
                    <button className="flex items-center gap-2 px-4 py-2 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-sm font-medium transition-colors">
                        <Key className="w-4 h-4" />
                        Security
                    </button>
                </nav>

                <div className="space-y-6">
                    {activeTab === 'risk' && <RiskFormulaPanel />}
                    {activeTab === 'general' && (
                        <>
                        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 shadow-sm">
                            <h2 className="text-lg font-semibold mb-4">System Preferences</h2>
                        <ThemeToggle theme={theme} onToggle={toggleTheme} />

                        <div className="flex items-center justify-between py-4 border-b border-zinc-100 dark:border-zinc-800">
                            <div>
                                <div className="font-medium">Extended 14-day forecast</div>
                                <div className="text-xs text-zinc-500">Show days 10-14 from Open-Meteo in Forecast Discrepancy</div>
                            </div>
                            <button
                                role="switch"
                                aria-checked={openMeteoBeta}
                                onClick={() => {
                                    const next = !openMeteoBeta;
                                    setOpenMeteoBeta(next);
                                    localStorage.setItem("climateshield_openmeteo_beta", String(next));
                                }}
                                className={cn(
                                    "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
                                    openMeteoBeta ? "bg-primary" : "bg-muted"
                                )}
                            >
                                <span className={cn(
                                    "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform",
                                    openMeteoBeta ? "translate-x-5" : "translate-x-0.5"
                                )} />
                            </button>
                        </div>

                        <div className="flex items-center justify-between py-4 border-b border-zinc-100 dark:border-zinc-800">
                            <div>
                                <div className="font-medium">Data Backup</div>
                                <div className="text-xs text-zinc-500">Export or import your weather data and alerts.</div>
                            </div>
                            <div className="flex items-center gap-2">
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".json"
                                    onChange={handleFileChange}
                                    className="hidden"
                                />
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={importing}
                                    className="flex items-center gap-2 px-3 py-1.5 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 text-xs font-medium transition-colors disabled:opacity-50"
                                >
                                    <Upload className="w-3 h-3" />
                                    {importing ? "Importing..." : "Import Backup"}
                                </button>
                                <button
                                    onClick={handleExport}
                                    className="flex items-center gap-2 px-3 py-1.5 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 text-xs font-medium transition-colors"
                                >
                                    <Download className="w-3 h-3" />
                                    Export Backup
                                </button>
                            </div>
                        </div>

                        <div className="flex items-center justify-between py-4 border-b border-zinc-100 dark:border-zinc-800">
                            <div className="flex items-start gap-3">
                                <Wifi className="w-4 h-4 mt-0.5 text-zinc-400 shrink-0" />
                                <div>
                                    <div className="font-medium">LAN Access</div>
                                    <div className="text-xs text-zinc-500">Generate a QR code to open ClimateShield from another device on your Wi-Fi network.</div>
                                </div>
                            </div>
                            <button
                                role="switch"
                                aria-checked={lanAccessEnabled}
                                onClick={() => {
                                    const next = !lanAccessEnabled;
                                    setLanAccessEnabled(next);
                                    localStorage.setItem("climateshield_lan_access", String(next));
                                }}
                                className={cn(
                                    "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
                                    lanAccessEnabled ? "bg-primary" : "bg-muted"
                                )}
                            >
                                <span className={cn(
                                    "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform",
                                    lanAccessEnabled ? "translate-x-5" : "translate-x-0.5"
                                )} />
                            </button>
                        </div>

                        {/* QR Code Panel */}
                        {lanAccessEnabled && (
                            <div className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 space-y-4">
                                <div className="flex items-start gap-2 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg p-3 text-xs">
                                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                                    <span>
                                        Only enable on trusted networks. This exposes your ClimateShield dashboard to anyone on the same Wi-Fi.
                                    </span>
                                </div>

                                <div className="flex flex-col sm:flex-row items-center gap-6">
                                    <div className="p-3 bg-white rounded-xl shadow-sm border border-zinc-200 shrink-0">
                                        <QRCodeSVG
                                            value={typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.host}` : ''}
                                            size={160}
                                            level="M"
                                            bgColor="#ffffff"
                                            fgColor="#18181b"
                                            marginSize={2}
                                            title="ClimateShield LAN Access"
                                        />
                                    </div>
                                    <div className="space-y-3 flex-1 text-sm">
                                        <div>
                                            <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">URL</div>
                                            <div className="font-mono text-xs bg-zinc-100 dark:bg-zinc-800 px-2 py-1.5 rounded break-all">
                                                {typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.host}` : '—'}
                                            </div>
                                        </div>
                                        <div className="text-xs text-zinc-500">
                                            Scan with your phone camera or QR reader to open the dashboard instantly.
                                        </div>
                                        <div className="text-[10px] text-zinc-400">
                                            Server must be reachable on your local network (firewall / Docker port may need configuration).
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                    </div>

                    <MetricsPanel
                        metrics={metrics}
                        loading={metricsLoading}
                        lastResetAt={lastResetAt}
                    />
                    </>
                )}
                </div>
            </div>
        </div>
    );
}
