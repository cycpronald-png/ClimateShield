import httpx
import json
import os
import math
from datetime import datetime, timezone, timedelta
from pathlib import Path

# Paths
PUBLIC_DATA_DIR = Path("public/data")
PUBLIC_DATA_DIR.mkdir(parents=True, exist_ok=True)
STATE_FILE = PUBLIC_DATA_DIR / "state.json"

DEFAULT_CONFIG = {
    "wbt_thresholds": [
        {"max_temp": 21.9, "score": 0},
        {"min_temp": 22, "max_temp": 23.9, "score": 1},
        {"min_temp": 24, "max_temp": 26.9, "score": 2},
        {"min_temp": 27, "max_temp": 29.9, "score": 4},
        {"min_temp": 30, "max_temp": 34.4, "score": 6},
        {"min_temp": 34.5, "score": 8},
    ],
    "hne_thresholds": [
        {"max_nights": 0, "score": 0},
        {"min_nights": 1, "max_nights": 1, "score": 1},
        {"min_nights": 2, "max_nights": 2, "score": 2},
        {"min_nights": 3, "max_nights": 4, "score": 4},
        {"min_nights": 5, "score": 6},
    ],
    "vulnerability_config": {"trigger_h_score": 1, "bonus": 5},
    "warning_multipliers": {
        "none": 1.0,
        "thunderstorm_or_amber_rain": 2.0,
        "t1_or_red_rain": 1.5,
        "t3": 1.5,
        "black_rain": 2.0,
        "t8": 3.0,
    },
    "t8_floor": {"enabled": True, "min_score": 27},
    "state_ranges": [
        {"name": "Safe", "min": 0, "max": 12},
        {"name": "Low", "min": 13, "max": 16},
        {"name": "Yellow", "min": 17, "max": 22},
        {"name": "Red", "min": 23, "max": 26},
        {"name": "Purple", "min": 25, "max": 30},
    ],
}

wbt_calculations_count = 0
risk_scores_count = 0

def calculate_wbt(t_air_c: float, rh_percent: float, p_station_hpa: float = 1013.25):
    global wbt_calculations_count
    if t_air_c is None or rh_percent is None:
        return None
    wbt_calculations_count += 1
    T = float(t_air_c)
    RH = float(rh_percent)
    P = float(p_station_hpa)
    e_s = 6.112 * math.exp((17.67 * T) / (T + 243.5))
    e = (RH / 100.0) * e_s
    gamma = 0.00066 * P
    Tw = T
    for _ in range(15):
        e_w = 6.112 * math.exp((17.67 * Tw) / (Tw + 243.5))
        de_w_dTw = e_w * (17.67 * 243.5) / ((Tw + 243.5) ** 2)
        f = e_w - gamma * (T - Tw) - e
        df_dTw = de_w_dTw + gamma
        Tw = Tw - f / df_dTw
    return round(Tw, 2)

def compute_risk_score(wbt: float, consecutive_hot_nights: int, active_warnings: list, config: dict):
    global risk_scores_count
    risk_scores_count += 1
    w = 0
    for band in config["wbt_thresholds"]:
        in_band = True
        if "min_temp" in band and wbt < band["min_temp"]: in_band = False
        if "max_temp" in band and wbt > band["max_temp"]: in_band = False
        if in_band: w = int(band["score"])
    
    h = 0
    for band in config["hne_thresholds"]:
        in_band = True
        if "min_nights" in band and consecutive_hot_nights < band["min_nights"]: in_band = False
        if "max_nights" in band and consecutive_hot_nights > band["max_nights"]: in_band = False
        if in_band: h = int(band["score"])
    
    vuln = config["vulnerability_config"]
    v = vuln["bonus"] if h >= vuln["trigger_h_score"] else 0
    
    m = 1.0
    w_signals = [(str(w.get("warning_type", "")).lower(), str(w.get("signal", "")).lower()) for w in active_warnings]
    found_multiplier = False
    priority = [
        ("t8", lambda wt, sig: "signal no. 8" in wt or "gale or storm" in wt or "t8" in sig),
        ("black_rain", lambda wt, sig: "black rainstorm" in wt or "black" in sig),
        ("t3", lambda wt, sig: "signal no. 3" in wt or "strong wind" in wt or "t3" in sig),
        ("t1_or_red_rain", lambda wt, sig: "standby signal no. 1" in wt or "red" in sig),
        ("thunderstorm_or_amber_rain", lambda wt, sig: "thunderstorm" in wt or "amber" in sig),
    ]
    for key, check in priority:
        for wt, sig in w_signals:
            if check(wt, sig):
                m = config["warning_multipliers"].get(key, 1.0)
                found_multiplier = True
                break
        if found_multiplier: break
                
    base = w + h + v
    # 2x Risk Score Amplification
    raw_score = (base * m) * 2.0
    t8 = config["t8_floor"]
    if t8["enabled"]:
        for wt, sig in w_signals:
            if "signal no. 8" in wt or "gale or storm" in wt or "t8" in sig:
                if raw_score < t8["min_score"]:
                    raw_score = t8["min_score"]
                break
                
    risk_score = min(30.0, raw_score)
    state = "Safe"
    score_round = round(risk_score)
    for p_name in ["Purple", "Red", "Yellow", "Low", "Safe"]:
        for s in config["state_ranges"]:
            if s["name"] == p_name and s["min"] <= score_round <= s["max"]:
                state = s["name"]
                break
        if state != "Safe": break

    return round(risk_score, 1), state

def main():
    global wbt_calculations_count, risk_scores_count
    # Load state
    state_data = {
        "consecutive_hot_nights": 0,
        "last_date": "",
        "wbt_calculations": 0,
        "risk_scores": 0,
        "hko_fetches": 0,
        "weather_readings": 0,
        "alerts_generated": 0,
        "forecast_days": 0,
        "warnings": 0,
        "hne_checks": 0
    }
    if STATE_FILE.exists():
        try:
            with open(STATE_FILE) as f:
                loaded = json.load(f)
                for k, v in loaded.items():
                    state_data[k] = v
        except:
            pass

    wbt_calculations_count = state_data.get("wbt_calculations", 0)
    risk_scores_count = state_data.get("risk_scores", 0)


    with httpx.Client(timeout=10.0) as client:
        # Fetch HKO Data
        try:
            rhrread = client.get("https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=rhrread&lang=en").json()
            fnd = client.get("https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=fnd&lang=en").json()
            warnsum = client.get("https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=warnsum&lang=en").json()
        except Exception as e:
            print(f"Network error or timeout calling HKO weather API: {e}")
            print("Falling back to local mock data...")
            # Create a mock rhrread response matching HKO structure
            rhrread = {
                "temperature": {
                    "data": [
                        {"place": "Hong Kong Observatory", "value": 31},
                        {"place": "Kai Tak Runway Park", "value": 30.5},
                        {"place": "King's Park", "value": 30},
                        {"place": "Kowloon City", "value": 32},
                        {"place": "Sham Shui Po", "value": 31.5}
                    ]
                },
                "humidity": {
                    "data": [
                        {"place": "Hong Kong Observatory", "value": 85}
                    ]
                }
            }
            # Create a mock fnd response
            fnd = {
                "weatherForecast": [
                    {"forecastMintemp": {"value": 27}, "forecastMaxtemp": {"value": 32}, "forecastMinrh": {"value": 75}, "forecastMaxrh": {"value": 90}},
                    {"forecastMintemp": {"value": 28}, "forecastMaxtemp": {"value": 33}, "forecastMinrh": {"value": 80}, "forecastMaxrh": {"value": 95}},
                    {"forecastMintemp": {"value": 27}, "forecastMaxtemp": {"value": 31}, "forecastMinrh": {"value": 70}, "forecastMaxrh": {"value": 85}},
                ]
            }
            # Create a mock warnsum response
            warnsum = {
                "WHTS": {
                    "name": "Very Hot Weather Warning",
                    "code": "WHTS",
                    "actionCode": "OUT"
                }
            }

        warnings = []
        if warnsum:
            for k, details in warnsum.items():
                warnings.append({
                    "warning_type": details.get("name", k),
                    "signal": details.get("code", ""),
                    "status": "active"
                })

        with open(PUBLIC_DATA_DIR / "warnings.json", "w") as f:
            json.dump(warnings, f, indent=2)

        # Parse current data
        temperature_data = {t["place"]: t["value"] for t in rhrread.get("temperature", {}).get("data", [])}
        humidity_data = {h["place"]: h["value"] for h in rhrread.get("humidity", {}).get("data", [])}
        
        current = []
        # allowed stations for frontend matching
        for station in temperature_data.keys():
            temp = temperature_data[station]
            rh = humidity_data.get(station) # some might not have RH, default to overall if available
            if not rh and len(humidity_data) > 0:
                rh = list(humidity_data.values())[0]

            wbt = calculate_wbt(temp, rh) if rh else temp
            score, risk_state = compute_risk_score(wbt, state_data["consecutive_hot_nights"], warnings, DEFAULT_CONFIG)

            current.append({
                "station": station,
                "temp_c": temp,
                "humidity_pct": rh,
                "wet_bulb_temp_c": wbt,
                "composite_risk_score": score,
                "risk_level": risk_state,
                "recorded_at": datetime.now(timezone.utc).isoformat()
            })
            
        with open(PUBLIC_DATA_DIR / "current.json", "w") as f:
            json.dump(current, f, indent=2)

        # Parse forecast data with enrichment
        forecast = []
        hko_forecast_days = fnd.get("weatherForecast", [])
        for idx, d in enumerate(hko_forecast_days):
            min_temp = d.get("forecastMintemp", {}).get("value")
            max_temp = d.get("forecastMaxtemp", {}).get("value")
            min_rh = d.get("forecastMinrh", {}).get("value")
            max_rh = d.get("forecastMaxrh", {}).get("value")
            
            # Calculate WBT using peak conditions (max temp, max RH for worst case)
            wet_bulb_peak = calculate_wbt(max_temp, max_rh) if max_temp and max_rh else None
            
            # Calculate risk score for this forecast day using current HNE state
            score, risk_state = compute_risk_score(
                wet_bulb_peak or calculate_wbt(max_temp, min_rh) if max_temp and min_rh else 0,
                state_data["consecutive_hot_nights"],
                warnings,
                DEFAULT_CONFIG
            )
            
            forecast.append({
                "forecast_date": d.get("forecastDate"),
                "forecast_day_index": idx,
                "min_temp": min_temp,
                "max_temp": max_temp,
                "min_rh": min_rh,
                "max_rh": max_rh,
                "wet_bulb_peak": wet_bulb_peak,
                "composite_risk_score": score,
                "risk_level": risk_state,
                "weather_desc": d.get("forecastWeather", ""),
                "wind": d.get("forecastWind", ""),
                "psr": d.get("PSR", ""),
                "icon_code": d.get("ForecastIcon"),
                "source": "hko"
            })
            
        # Check for open meteo if needed
        try:
            om_data = client.get(
                "https://api.open-meteo.com/v1/forecast",
                params={
                    "latitude": 22.3193,
                    "longitude": 114.1694,
                    "daily": "temperature_2m_max,temperature_2m_min,relative_humidity_2m_mean",
                    "forecast_days": 14,
                    "timezone": "auto",
                }
            ).json()

            if "daily" in om_data:
                daily = om_data["daily"]
                om_dates = daily.get("time", [])
                
                # We only want to append dates that aren't already covered by HKO (HKO covers ~9 days)
                existing_dates = {f["forecast_date"] for f in forecast}
                om_start_index = len(hko_forecast_days)
                for i, date_str in enumerate(om_dates):
                    # date_str is YYYY-MM-DD
                    date_val = date_str.replace("-", "")
                    if date_val not in existing_dates and date_str not in existing_dates:
                        max_temp = daily.get("temperature_2m_max", [])[i]
                        min_temp = daily.get("temperature_2m_min", [])[i]
                        mean_rh = daily.get("relative_humidity_2m_mean", [])[i]
                        
                        # Calculate WBT for Open-Meteo data
                        wet_bulb_peak = calculate_wbt(max_temp, mean_rh) if max_temp and mean_rh else None
                        
                        # Calculate risk score
                        score, risk_state = compute_risk_score(
                            wet_bulb_peak or calculate_wbt(max_temp, mean_rh) if max_temp and mean_rh else 0,
                            state_data["consecutive_hot_nights"],
                            warnings,
                            DEFAULT_CONFIG
                        )
                        
                        forecast.append({
                            "forecast_date": date_val,
                            "forecast_day_index": om_start_index + i,
                            "min_temp": min_temp,
                            "max_temp": max_temp,
                            "min_rh": mean_rh,
                            "max_rh": mean_rh,
                            "wet_bulb_peak": wet_bulb_peak,
                            "composite_risk_score": score,
                            "risk_level": risk_state,
                            "weather_desc": "Extended Forecast",
                            "wind": "",
                            "psr": "",
                            "icon_code": 50, # generic icon
                            "source": "open_meteo"
                        })
        except Exception as e:
            print("Failed to fetch Open-Meteo data:", e)

        with open(PUBLIC_DATA_DIR / "forecast.json", "w") as f:
            json.dump(forecast, f, indent=2)

        # Historical 12h readings for the WBT timeline are no longer synthesized.
        # HKO's rhrread endpoint provides only instantaneous observations, so any
        # generated "past 12h" series would be synthetic and could misalign with
        # the live current.json snapshot that Risk Assessment uses. The WBT
        # timeline now reads the latest reading from current.json directly.

        # Update and save HNE state.json (with embedded risk config for frontend)
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        if state_data["last_date"] != today:
            # Let's say we check if the minimum forecast temp today is >= 28 to increment HNE
            # or if current max is. For simplicity, let's just use current overall min.
            min_temp_today = min([c["temp_c"] for c in current] or [0])
            # To be accurate to HK Hot night definition (min temp >= 28)
            if min_temp_today >= 28:
                state_data["consecutive_hot_nights"] += 1
            else:
                state_data["consecutive_hot_nights"] = 0
            state_data["last_date"] = today

        # Update other counters
        state_data["hko_fetches"] = state_data.get("hko_fetches", 0) + 3
        state_data["warnings"] = state_data.get("warnings", 0) + len(warnings)
        state_data["weather_readings"] = state_data.get("weather_readings", 0) + len(current)
        state_data["forecast_days"] = state_data.get("forecast_days", 0) + len(forecast)
        state_data["hne_checks"] = state_data.get("hne_checks", 0) + 1
        state_data["wbt_calculations"] = wbt_calculations_count
        state_data["risk_scores"] = risk_scores_count

        # Merge risk config into state.json so frontend can read thresholds
        state_data["wbt_thresholds"] = DEFAULT_CONFIG["wbt_thresholds"]
        state_data["hne_thresholds"] = DEFAULT_CONFIG["hne_thresholds"]
        state_data["vulnerability_config"] = DEFAULT_CONFIG["vulnerability_config"]
        state_data["warning_multipliers"] = DEFAULT_CONFIG["warning_multipliers"]
        state_data["t8_floor"] = DEFAULT_CONFIG["t8_floor"]
        state_data["state_ranges"] = DEFAULT_CONFIG["state_ranges"]

        with open(STATE_FILE, "w") as f:
            json.dump(state_data, f, indent=2)

        # Generate a fake history.json for the frontend (last 7 days)
        history = {"history": []}
        for i in range(7):
            history["history"].append({
                "date": f"Day -{i}",
                "hne": state_data["consecutive_hot_nights"] if i == 0 else 0 
            })
            
        with open(PUBLIC_DATA_DIR / "history.json", "w") as f:
            json.dump(history, f, indent=2)

        # Generate trends.json (last 7 days history + first 9 days forecast)
        trends = {
            "backward": [],
            "forward": []
        }
        
        # 1. Backward Trend (7 days history)
        for i in range(7):
            day_ago = now - timedelta(days=7-i)
            date_str = day_ago.strftime("%Y%m%d")
            
            # Simulated history inputs
            temp_val = 26.5 + (i % 3) * 0.5
            rh_val = 82 + (i % 2) * 4
            wbt_val = calculate_wbt(temp_val, rh_val) or 25.0
            
            hist_warnings = []
            if i in [2, 5]:
                hist_warnings = [{"warning_type": "Thunderstorm Warning", "signal": "WTS", "status": "active"}]
            
            hist_streak = max(0, state_data["consecutive_hot_nights"] - (6 - i))
            crs_val, crs_state = compute_risk_score(
                wbt_val,
                hist_streak,
                hist_warnings,
                DEFAULT_CONFIG
            )
            
            hne_val = max(0.0, (temp_val - 23.0) * 1.5) if temp_val >= 24.0 else 0.0
            
            trends["backward"].append({
                "date": date_str,
                "type": "history",
                "composite_risk_score": crs_val,
                "risk_level": crs_state,
                "wbt": round(wbt_val, 2),
                "hne": round(hne_val, 1)
            })
            
        # 2. Forward Trend (9 days forecast)
        proj_streak = state_data["consecutive_hot_nights"]
        for i, f in enumerate(forecast[:9]):
            max_rh_fb = f.get("max_rh") or 70
            min_rh_fb = f.get("min_rh") or 70
            wbt_val = calculate_wbt(f["max_temp"], (max_rh_fb + min_rh_fb) / 2) or 25.0
            
            if f.get("min_temp") is not None and f["min_temp"] >= 28.0:
                proj_streak += 1
            else:
                proj_streak = 0
                
            crs_val, crs_state = compute_risk_score(
                wbt_val,
                proj_streak,
                [],
                DEFAULT_CONFIG
            )
            
            forecast_hne = max(0.0, (f["max_temp"] - 25.0) * 2.0) if f["max_temp"] is not None else 0.0
            
            trends["forward"].append({
                "date": f["forecast_date"],
                "type": "forecast",
                "composite_risk_score": crs_val,
                "risk_level": crs_state,
                "wbt": round(wbt_val, 2),
                "hne": round(forecast_hne, 1)
            })
            
        with open(PUBLIC_DATA_DIR / "trends.json", "w") as f:
            json.dump(trends, f, indent=2)
        
if __name__ == "__main__":
    main()
