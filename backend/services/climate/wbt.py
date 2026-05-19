"""
Wet-Bulb Temperature (WBT) and Wet-Bulb Globe Temperature (WBGT) calculations.

Implements:
- Tetens Iterative WBT using Newton-Raphson iteration
- WBGT simplified approximation for outdoor shaded conditions
"""
import math
from typing import Optional


def calculate_wbt(t_air_c: float, rh_percent: float, p_station_hpa: float = 1013.25) -> Optional[float]:
    """
    Calculate wet-bulb temperature using Tetens saturation vapor pressure
    and Newton-Raphson iteration, accounting for station barometric pressure.

    Args:
        t_air_c: Dry-bulb temperature in °C.
        rh_percent: Relative humidity in percent (0-100).
        p_station_hpa: Atmospheric station pressure in hPa (default sea-level 1013.25).

    Returns:
        Wet-bulb temperature in °C, or None if inputs are invalid.
    """
    if t_air_c is None or rh_percent is None:
        return None
    if rh_percent < 0 or rh_percent > 100:
        return None

    T = float(t_air_c)
    RH = float(rh_percent)
    P = float(p_station_hpa)

    # Saturation vapor pressure (Tetens, 1930) in hPa
    e_s = 6.112 * math.exp((17.67 * T) / (T + 243.5))

    # Actual vapor pressure
    e = (RH / 100.0) * e_s

    # Psychrometric constant (hPa / °C)
    gamma = 0.00066 * P

    # Newton-Raphson to find Tw where e_w - gamma * (T - Tw) = e
    Tw = T
    for _ in range(15):
        e_w = 6.112 * math.exp((17.67 * Tw) / (Tw + 243.5))
        # Derivative de_w / dTw
        de_w_dTw = e_w * (17.67 * 243.5) / ((Tw + 243.5) ** 2)
        f = e_w - gamma * (T - Tw) - e
        df_dTw = de_w_dTw + gamma
        Tw = Tw - f / df_dTw

    return round(Tw, 2)


def calculate_wbgt(t_air_c: float, rh_percent: float, p_station_hpa: float = 1013.25) -> Optional[float]:
    """
    Approximate WBGT (shaded, no solar) from Tetens WBT and dry-bulb temp.
    """
    wbt = calculate_wbt(t_air_c, rh_percent, p_station_hpa)
    if wbt is None:
        return None
    return round(0.7 * wbt + 0.3 * t_air_c, 2)
