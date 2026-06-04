/**
 * Section-local aliases. The "real" contracts live in ``@/types/api``.
 *
 * These are kept here so existing components can import the names they
 * are used to. New code should prefer importing from ``@/types/api``
 * directly so a single source of truth is maintained.
 */
import type {
    StateName,
    WeatherForecastDay as ApiWeatherForecastDay,
    WeatherReading as ApiWeatherReading,
} from '@/types/api';

export type RiskLevel = StateName;

export type WeatherReading = ApiWeatherReading;
export type WeatherForecastDay = ApiWeatherForecastDay;

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
    hne?: number;
    nightly_hne?: number;
    composite_risk_score?: CompositeRiskScore | { value: number; state: string } | null;
    risk_level?: string;
}
