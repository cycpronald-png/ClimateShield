/**
 * API contract types — single source of truth for backend response shapes.
 *
 * Mirror of `backend/services/risk_config_service.py` (Pydantic v2 model)
 * and `backend/schemas.py`. Keep these in sync if the backend changes.
 */

// --------------------------------------------------------------------------- //
// Risk configuration                                                          //
// --------------------------------------------------------------------------- //

export type WarningKey =
  | "none"
  | "t8"
  | "t3"
  | "t1_or_red_rain"
  | "thunderstorm_or_amber_rain"
  | "black_rain";

export interface WBTBand {
  min_temp?: number;
  max_temp?: number;
  score: number;
}

export interface HNEBand {
  min_nights?: number;
  max_nights?: number;
  score: number;
}

export interface VulnerabilityConfig {
  trigger_h_score: number;
  bonus: number;
}

export interface T8Floor {
  enabled: boolean;
  min_score: number;
}

export type StateName = "Safe" | "Low" | "Yellow" | "Red" | "Purple";

export interface StateRange {
  name: StateName;
  min: number;
  max: number;
}

export interface RiskConfig {
  wbt_thresholds: WBTBand[];
  hne_thresholds: HNEBand[];
  vulnerability_config: VulnerabilityConfig;
  warning_multipliers: Record<WarningKey, number>;
  t8_floor: T8Floor;
  state_ranges: StateRange[];
}

// --------------------------------------------------------------------------- //
// Weather domain                                                              //
// --------------------------------------------------------------------------- //

export interface WeatherReading {
  id: number;
  station: string;
  district: string | null;
  temp_c: number | null;
  humidity_pct: number | null;
  rainfall_mm: number | null;
  wind_kmh: number | null;
  wind_direction: string | null;
  uv_index: number | null;
  wet_bulb_temp_c: number | null;
  hne: number | null;
  nightly_hne: number | null;
  risk_level: StateName | null;
  composite_risk_score: number | null;
  wet_bulb_peak: number | null;
  recorded_at: string;
  created_at: string;
}

export interface WeatherForecastDay {
  forecast_date: string;
  forecast_day_index: number;
  min_temp: number | null;
  max_temp: number | null;
  min_rh: number | null;
  max_rh: number | null;
  weather_desc: string | null;
  risk_level: StateName | null;
  wind: string | null;
  psr: string | null;
  icon_code: number | null;
  composite_risk_score: number | null;
  wet_bulb_peak: number | null;
  source?: "hko" | "open_meteo";
}

export interface WeatherWarning {
  id: number;
  warning_type: string;
  signal: string | null;
  description: string | null;
  issue_time: string | null;
  update_time: string | null;
  status: "active" | "expired";
  fetched_at: string;
}

export interface SystemAlert {
  id: number;
  alert_type: string;
  title: string;
  message: string;
  district: string | null;
  risk_level: StateName | null;
  status: "pending" | "acknowledged";
  target_group: string | null;
  source_data: Record<string, unknown> | null;
  created_at: string;
  acknowledged_at: string | null;
}

export interface LiveRiskScore {
  station: string;
  value: number;
  state: StateName;
  w: number;
  h: number;
  v: number;
  m: number;
  t8_applied: boolean;
  breakdown: string;
  theoretical_max: number;
  warnings_active: string[];
  hot_nights_consecutive: number;
  wet_bulb_temp_c: number;
  recorded_at: string;
}

// --------------------------------------------------------------------------- //
// Donations                                                                   //
// --------------------------------------------------------------------------- //

export interface DonationItem {
  item_type: string;
  quantity: number;
  delivery_method: string;
  notes?: string | null;
}

export interface DonationPledge {
  donor_name: string;
  donor_email: string;
  donor_phone?: string | null;
  company?: string | null;
  donation_type: "physical" | "financial";
  message?: string | null;
  items: DonationItem[];
}

export interface DonationPledgeResponse {
  id: number;
  status: string;
  created_at: string;
  donor_name: string;
  total_estimated_value: number | null;
  items: (DonationItem & { id: number; is_received: boolean })[];
  next_steps?: string | null;
}
