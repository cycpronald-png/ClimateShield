import { useState, useEffect, useCallback } from 'react';
import { Activity, RotateCcw, Save, Shield, TestTube, AlertTriangle, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/services/api';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from './ConfirmDialog';

interface WbtBand { min_temp?: number; max_temp?: number; score: number; }
interface HneBand { min_nights?: number; max_nights?: number; score: number; }
interface StateBand { name: string; min: number; max: number; }

interface RiskConfig {
  wbt_thresholds: WbtBand[];
  hne_thresholds: HneBand[];
  vulnerability_config: { trigger_h_score: number; bonus: number };
  warning_multipliers: Record<string, number>;
  t8_floor: { enabled: boolean; min_score: number };
  state_ranges: StateBand[];
}

const DEFAULT_CONFIG: RiskConfig = {
  wbt_thresholds: [
    { max_temp: 21.9, score: 0 },
    { min_temp: 22, max_temp: 23.9, score: 1 },
    { min_temp: 24, max_temp: 26.9, score: 2 },
    { min_temp: 27, max_temp: 29.9, score: 4 },
    { min_temp: 30, score: 6 },
  ],
  hne_thresholds: [
    { max_nights: 0, score: 0 },
    { min_nights: 1, max_nights: 1, score: 1 },
    { min_nights: 2, max_nights: 2, score: 2 },
    { min_nights: 3, max_nights: 4, score: 4 },
    { min_nights: 5, score: 6 },
  ],
  vulnerability_config: { trigger_h_score: 1, bonus: 5 },
  warning_multipliers: {
    none: 1.0,
    thunderstorm_or_amber_rain: 2.0,
    t1_or_red_rain: 1.5,
    t3: 1.5,
    black_rain: 2.0,
    t8: 3.0,
  },
  t8_floor: { enabled: true, min_score: 27 },
  state_ranges: [
    { name: 'Safe', min: 0, max: 12 },
    { name: 'Low', min: 13, max: 16 },
    { name: 'Yellow', min: 17, max: 22 },
    { name: 'Red', min: 23, max: 26 },
    { name: 'Purple', min: 25, max: 30 },
  ],
};

const STATE_COLORS: Record<string, string> = {
  Safe: 'bg-emerald-300 text-emerald-900 border-emerald-400',
  Low: 'bg-blue-300 text-blue-900 border-blue-400',
  Yellow: 'bg-yellow-300 text-yellow-900 border-yellow-400',
  Red: 'bg-red-300 text-red-900 border-red-400',
  Purple: 'bg-purple-300 text-purple-900 border-purple-400',
};

const WBT_STATE_REFS = ['Safe', 'Low', 'Yellow', 'Red', 'Purple'];

function wbtStateRef(index: number): string {
  return WBT_STATE_REFS[index] ?? 'Unknown';
}

export function RiskFormulaPanel() {
  const [password, setPassword] = useState('');
  const [authenticated, setAuthenticated] = useState(false);
  const [config, setConfig] = useState<RiskConfig>(DEFAULT_CONFIG);
  const [originalConfig, setOriginalConfig] = useState<RiskConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [expandedSection, setExpandedSection] = useState<string | null>('wbt');
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [testResults, setTestResults] = useState<any[] | null>(null);

  const loadConfig = useCallback(async () => {
    if (!authenticated) return;
    setLoading(true);
    try {
      const data = await api.admin.getRiskConfig("Climate012220ShielD");
      setConfig(data);
      setOriginalConfig(data);
      setHasChanges(false);
    } catch (e) {
      toast.error('Failed to load risk config');
    } finally {
      setLoading(false);
    }
  }, [authenticated]);

  useEffect(() => {
    if (authenticated) {
      loadConfig();
    }
  }, [authenticated, loadConfig]);

  const handleAuthenticate = async () => {
    if (password !== "Climate012220ShielD") {
      toast.error('Invalid password');
      return;
    }
    setLoading(true);
    try {
      const data = await api.admin.getRiskConfig(password);
      setConfig(data);
      setOriginalConfig(data);
      setHasChanges(false);
      setAuthenticated(true);
      toast.success('Authenticated');
    } catch (e: any) {
      if (e.message?.includes('403') || e.message?.includes('Forbidden')) {
        toast.error('Invalid password');
      } else {
        toast.error(e.message || 'Authentication failed');
      }
    } finally {
      setLoading(false);
    }
  };

  if (!authenticated) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="w-5 h-5" />
            Risk Formula Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Admin access is required to modify the risk scoring formula used by ClimateShield.
          </p>
          <Input
            type="password"
            placeholder="Enter admin password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAuthenticate()}
          />
          <Button onClick={handleAuthenticate} className="w-full">
            <Shield className="w-4 h-4 mr-2" />
            Authenticate
          </Button>
        </CardContent>
      </Card>
    );
  }

  const updateConfig = (partial: Partial<RiskConfig>) => {
    setConfig((prev) => {
      const next = { ...prev, ...partial };
      setHasChanges(JSON.stringify(next) !== JSON.stringify(originalConfig));
      return next;
    });
  };

  const handleSave = async () => {
    if (!password) return;
    setSaving(true);
    try {
      await api.admin.updateRiskConfig(password, config);
      setOriginalConfig(config);
      setHasChanges(false);
      toast.success('Risk configuration saved');
    } catch (e: any) {
      toast.error(e.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!password) return;
    try {
      await api.admin.resetRiskConfig(password);
      await loadConfig();
      setResetDialogOpen(false);
      toast.success('Reset to default');
    } catch (e) {
      toast.error('Reset failed');
    }
  };

  const handleTest = async () => {
    if (!password) return;
    try {
      const result = await api.admin.testRiskConfig(password, config);
      setTestResults(result.scenarios);
      setTestModalOpen(true);
    } catch (e: any) {
      toast.error(e.message || 'Test failed');
    }
  };

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  const SectionHeader = ({ title, icon, section, isValid }: { title: string; icon: React.ReactNode; section: string; isValid?: boolean }) => (
    <button
      onClick={() => toggleSection(section)}
      className="flex items-center justify-between w-full py-3 text-sm font-medium text-left hover:bg-accent/50 rounded-lg px-2 transition-colors"
    >
      <span className="flex items-center gap-2">
        {icon}
        {title}
        {isValid !== undefined && (
          isValid ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <AlertTriangle className="w-4 h-4 text-red-500" />
        )}
      </span>
      {expandedSection === section ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
    </button>
  );

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="w-5 h-5" />
            Risk Formula Configuration
          </CardTitle>
          <div className="flex items-center gap-2">
            {hasChanges && (
              <Badge variant="secondary" className="text-xs">
                Unsaved Changes
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="h-32 flex items-center justify-center text-muted-foreground text-sm">Loading configuration...</div>
          ) : (
            <>
              {/* State Ranges Visual Strip — proportional widths */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">Score States (0–30)</label>
                <div className="flex rounded-lg overflow-hidden border">
                  {config.state_ranges.sort((a, b) => a.min - b.min).map((s) => {
                    const widthPct = Math.max(8, ((s.max - s.min + 1) / 31) * 100);
                    return (
                      <div
                        key={s.name}
                        className={cn(
                          'py-2 px-1 text-center text-[11px] font-bold leading-tight',
                          STATE_COLORS[s.name]?.split(' ')[0],
                          STATE_COLORS[s.name]?.split(' ')[1]
                        )}
                        style={{ width: `${widthPct}%`, minWidth: '44px' }}
                      >
                        <div>{s.name}</div>
                        <div className="opacity-80 text-[10px] mt-0.5">{s.min}–{s.max}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* WBT Thresholds */}
              <div className="border rounded-lg">
                <SectionHeader
                  title="Wet-Bulb Temperature (W)"
                  icon={<span className="text-xs bg-sky-100 text-sky-700 px-1.5 py-0.5 rounded">W</span>}
                  section="wbt"
                />
                {expandedSection === 'wbt' && (
                  <div className="p-3 space-y-2 border-t">
                    {config.wbt_thresholds.map((band, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <Badge
                          className={cn(
                            'min-w-[56px] justify-center text-[10px] px-1 py-0.5',
                            STATE_COLORS[wbtStateRef(i)]?.split(' ')[0],
                            STATE_COLORS[wbtStateRef(i)]?.split(' ')[1]
                          )}
                          title={`Reference state: ${wbtStateRef(i)}`}
                        >
                          {wbtStateRef(i)}
                        </Badge>
                        <Input
                          type="number"
                          placeholder="Min °C"
                          className="w-20 h-8 text-xs"
                          value={band.min_temp ?? ''}
                          onChange={(e) => {
                            const val = e.target.value ? parseFloat(e.target.value) : undefined;
                            const next = [...config.wbt_thresholds];
                            next[i] = { ...next[i], min_temp: val };
                            updateConfig({ wbt_thresholds: next });
                          }}
                        />
                        <span className="text-muted-foreground text-xs">to</span>
                        <Input
                          type="number"
                          placeholder="Max °C"
                          className="w-20 h-8 text-xs"
                          value={band.max_temp ?? ''}
                          onChange={(e) => {
                            const val = e.target.value ? parseFloat(e.target.value) : undefined;
                            const next = [...config.wbt_thresholds];
                            next[i] = { ...next[i], max_temp: val };
                            updateConfig({ wbt_thresholds: next });
                          }}
                        />
                        <span className="text-muted-foreground text-xs">=</span>
                        <Input
                          type="number"
                          placeholder="Score"
                          className="w-16 h-8 text-xs"
                          value={band.score}
                          onChange={(e) => {
                            const next = [...config.wbt_thresholds];
                            next[i] = { ...next[i], score: parseInt(e.target.value) || 0 };
                            updateConfig({ wbt_thresholds: next });
                          }}
                        />
                        <span className="text-xs text-muted-foreground">pts</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* HNE Thresholds */}
              <div className="border rounded-lg">
                <SectionHeader
                  title="Hot Night Excess (H)"
                  icon={<span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded">H</span>}
                  section="hne"
                />
                {expandedSection === 'hne' && (
                  <div className="p-3 space-y-2 border-t">
                    {config.hne_thresholds.map((band, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <Input
                          type="number"
                          placeholder="Min nights"
                          className="w-20 h-8 text-xs"
                          value={band.min_nights ?? ''}
                          onChange={(e) => {
                            const val = e.target.value ? parseInt(e.target.value) : undefined;
                            const next = [...config.hne_thresholds];
                            next[i] = { ...next[i], min_nights: val };
                            updateConfig({ hne_thresholds: next });
                          }}
                        />
                        <span className="text-muted-foreground text-xs">to</span>
                        <Input
                          type="number"
                          placeholder="Max nights"
                          className="w-20 h-8 text-xs"
                          value={band.max_nights ?? ''}
                          onChange={(e) => {
                            const val = e.target.value ? parseInt(e.target.value) : undefined;
                            const next = [...config.hne_thresholds];
                            next[i] = { ...next[i], max_nights: val };
                            updateConfig({ hne_thresholds: next });
                          }}
                        />
                        <span className="text-muted-foreground text-xs">nights =</span>
                        <Input
                          type="number"
                          placeholder="Score"
                          className="w-16 h-8 text-xs"
                          value={band.score}
                          onChange={(e) => {
                            const next = [...config.hne_thresholds];
                            next[i] = { ...next[i], score: parseInt(e.target.value) || 0 };
                            updateConfig({ hne_thresholds: next });
                          }}
                        />
                        <span className="text-xs text-muted-foreground">pts</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Vulnerability Constant */}
              <div className="border rounded-lg">
                <SectionHeader
                  title="Vulnerability Constant (V)"
                  icon={<span className="text-xs bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded">V</span>}
                  section="vuln"
                />
                {expandedSection === 'vuln' && (
                  <div className="p-3 space-y-3 border-t">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="w-32 text-muted-foreground">Trigger when H ≥</span>
                      <Input
                        type="number"
                        className="w-20 h-8 text-xs"
                        value={config.vulnerability_config.trigger_h_score}
                        onChange={(e) =>
                          updateConfig({
                            vulnerability_config: {
                              ...config.vulnerability_config,
                              trigger_h_score: parseInt(e.target.value) || 0,
                            },
                          })
                        }
                      />
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="w-32 text-muted-foreground">Bonus value</span>
                      <Input
                        type="number"
                        className="w-20 h-8 text-xs"
                        value={config.vulnerability_config.bonus}
                        onChange={(e) =>
                          updateConfig({
                            vulnerability_config: {
                              ...config.vulnerability_config,
                              bonus: parseInt(e.target.value) || 0,
                            },
                          })
                        }
                      />
                      <span className="text-xs text-muted-foreground">pts added</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Warning Multipliers */}
              <div className="border rounded-lg">
                <SectionHeader
                  title="Warning Multipliers (M)"
                  icon={<span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">M</span>}
                  section="multipliers"
                />
                {expandedSection === 'multipliers' && (
                  <div className="p-3 space-y-2 border-t">
                    {Object.entries(config.warning_multipliers).map(([key, val]) => (
                      <div key={key} className="flex items-center gap-2 text-sm">
                        <span className="w-40 truncate text-xs text-muted-foreground capitalize">
                          {key.replace(/_/g, ' ')}
                        </span>
                        <Input
                          type="number"
                          step="0.1"
                          className="w-20 h-8 text-xs"
                          value={val}
                          onChange={(e) => {
                            const next = { ...config.warning_multipliers };
                            next[key] = parseFloat(e.target.value) || 1.0;
                            updateConfig({ warning_multipliers: next });
                          }}
                        />
                        <span className="text-xs text-muted-foreground">x</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* T8 Floor */}
              <div className="border rounded-lg">
                <SectionHeader
                  title="T8 Floor Rule"
                  icon={<span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded">T8</span>}
                  section="t8"
                />
                {expandedSection === 't8' && (
                  <div className="p-3 space-y-3 border-t">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.t8_floor.enabled}
                        onChange={(e) =>
                          updateConfig({
                            t8_floor: { ...config.t8_floor, enabled: e.target.checked },
                          })
                        }
                        className="rounded border-gray-300"
                      />
                      <span>Enable T8 minimum floor</span>
                    </label>
                    {config.t8_floor.enabled && (
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground">Minimum score when T8 is active:</span>
                        <Input
                          type="number"
                          className="w-20 h-8 text-xs"
                          value={config.t8_floor.min_score}
                          onChange={(e) =>
                            updateConfig({
                              t8_floor: {
                                ...config.t8_floor,
                                min_score: parseInt(e.target.value) || 27,
                              },
                            })
                          }
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* State Ranges Editor */}
              <div className="border rounded-lg">
                <SectionHeader
                  title="State Score Ranges"
                  icon={<span className="text-xs bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded">0-30</span>}
                  section="states"
                />
                {expandedSection === 'states' && (
                  <div className="p-3 space-y-2 border-t">
                    {config.state_ranges.map((s, i) => (
                      <div key={s.name} className="flex items-center gap-2 text-sm">
                        <Badge className={cn('min-w-[60px] justify-center', STATE_COLORS[s.name])}>
                          {s.name}
                        </Badge>
                        <Input
                          type="number"
                          className="w-20 h-8 text-xs"
                          value={s.min}
                          onChange={(e) => {
                            const next = [...config.state_ranges];
                            next[i] = { ...next[i], min: parseInt(e.target.value) || 0 };
                            updateConfig({ state_ranges: next });
                          }}
                        />
                        <span className="text-muted-foreground text-xs">to</span>
                        <Input
                          type="number"
                          className="w-20 h-8 text-xs"
                          value={s.max}
                          onChange={(e) => {
                            const next = [...config.state_ranges];
                            next[i] = { ...next[i], max: parseInt(e.target.value) || 0 };
                            updateConfig({ state_ranges: next });
                          }}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-4 border-t">
                <Button onClick={handleSave} disabled={saving || !hasChanges} className="flex-1">
                  <Save className="w-4 h-4 mr-2" />
                  {saving ? 'Saving...' : 'Save Changes'}
                </Button>
                <Button variant="outline" onClick={handleTest} disabled={saving}>
                  <TestTube className="w-4 h-4 mr-2" />
                  Test
                </Button>
                <Button variant="outline" onClick={() => setResetDialogOpen(true)} disabled={saving}>
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Default
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Reset Dialog */}
      <ConfirmDialog
        open={resetDialogOpen}
        title="Reset to Default?"
        description="This will discard your custom configuration and restore the built-in Update_For.md formula."
        confirmLabel="Reset"
        confirmLoadingLabel="Resetting..."
        onConfirm={handleReset}
        onCancel={() => setResetDialogOpen(false)}
        loading={false}
      />

      {/* Test Results Modal */}
      {testModalOpen && testResults && (
        <ConfirmDialog
          open={testModalOpen}
          title="Test Results"
          description="Computed scores using current configuration:"
          confirmLabel="Close"
          onConfirm={() => setTestModalOpen(false)}
          onCancel={() => setTestModalOpen(false)}
          loading={false}
        >
          <div className="space-y-3 mt-4">
            {testResults.map((r: any, i: number) => (
              <div key={i} className="border rounded-lg p-3 text-sm">
                <div className="font-medium">{r.label}</div>
                <div className="text-muted-foreground text-xs mt-1">{r.breakdown}</div>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-lg font-bold">{r.score}</span>
                  <Badge className={STATE_COLORS[r.state]}>{r.state}</Badge>
                </div>
              </div>
            ))}
          </div>
        </ConfirmDialog>
      )}
    </>
  );
}
