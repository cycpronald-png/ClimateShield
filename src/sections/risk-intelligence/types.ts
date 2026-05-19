export type RiskLevel = 'Safe' | 'Low' | 'Yellow' | 'Red' | 'Purple';

export interface WeatherReading {
    id: number;
    station: string;
    district?: string;
    temp_c?: number;
    humidity_pct?: number;
    rainfall_mm?: number;
    wind_kmh?: number;
    wind_direction?: string;
    uv_index?: number;
    wet_bulb_temp_c?: number;
    composite_risk_score?: number;
    wet_bulb_peak?: number;
    risk_level: string;
    recorded_at: string; // ISO
}

export interface WeatherForecastDay {
    id?: number;
    forecast_date: string;
    forecast_day_index: number;
    min_temp?: number;
    max_temp?: number;
    min_rh?: number;
    max_rh?: number;
    weather_desc?: string;
    risk_level: string;
    wind?: string;
    psr?: string;
    icon_code?: number;
    composite_risk_score?: number;
    wet_bulb_peak?: number;
    source?: 'hko' | 'open_meteo';
}

export interface HotNightEntry {
    date: string;
    hne_value: number;
    is_extreme: boolean;
    threshold: number; // 17.7
}

export interface CompositeRiskScore {
    value: number;        // 0-100
    risk_level: string;
    factors: {
        wbt: number;
        rh: number;
        warning_multiplier: number;
        hne_add: number;
        base_score: number;
    };
}

export interface ClimateShieldForecast {
    date: string;
    hko_temp_min: number;
    hko_temp_max: number;
    hko_icon: string;
    hko_description: string;
    risk_score: CompositeRiskScore;
    wet_bulb_peak: number;
    hne?: number;
    advisory?: string;
}

export interface ExtendedRisk {
    raw_score: number;
    normalized_score: number;  // 0-30 scale (capped)
    risk_level: 'Low' | 'Medium' | 'High' | 'Extreme';
    pct_of_max: number;
    factors: {
        wbt_contribution: number;
        rainfall_contribution: number;
        typhoon_contribution: number;
        thunderstorm_contribution: number;
        flooding_contribution: number;
    };
}

export interface TrendPoint {
    date: string;
    type: 'history' | 'forecast';
    composite_risk_score: number;
    risk_level: string;
    extended_risk?: ExtendedRisk;
    wbt?: number;
    hne?: number;
}

export interface WeatherHistoryItem {
    date: string;
    station: string;
    peak_temp?: number;
    peak_wbt?: number;
    peak_rh?: number;
    avg_rh?: number;
    hne: number;
    nightly_hne?: number;
    composite_risk_score?: CompositeRiskScore;
    risk_level: string;
}
