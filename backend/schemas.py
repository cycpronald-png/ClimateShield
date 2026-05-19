from pydantic import BaseModel, ConfigDict, EmailStr, Field
from typing import List, Optional, Dict, Any
from datetime import datetime
from decimal import Decimal

# Shared Enums (mirroring models for API validation)
from backend.models import DonationType, DonationStatus, DeliveryMethod


# ========== DONATION SCHEMAS ==========

class DonationItemBase(BaseModel):
    item_type: str
    quantity: int = Field(gt=0)
    delivery_method: str = DeliveryMethod.DROPOFF
    notes: Optional[str] = None


class DonationItemCreate(DonationItemBase):
    pass


class DonationItemResponse(DonationItemBase):
    id: int
    is_received: bool

    model_config = ConfigDict(from_attributes=True)


class DonationPledgeCreate(BaseModel):
    donor_name: str
    donor_email: EmailStr
    donor_phone: Optional[str] = None
    company: Optional[str] = None
    donation_type: str  # "physical" or "financial"
    message: Optional[str] = None
    items: List[DonationItemCreate]


class DonationPledgeResponse(BaseModel):
    id: int
    status: str
    created_at: datetime
    donor_name: str
    total_estimated_value: Optional[Decimal]
    items: List[DonationItemResponse]
    next_steps: Optional[str] = None  # Instructions for the donor

    model_config = ConfigDict(from_attributes=True)


class DonationPledgeAdminView(DonationPledgeResponse):
    donor_email: str
    donor_phone: Optional[str]
    company: Optional[str]
    message: Optional[str]
    rejection_reason: Optional[str]
    approved_at: Optional[datetime]


# ========== WEATHER SCHEMAS ==========

class WeatherReadingBase(BaseModel):
    station: str
    district: Optional[str] = None
    temp_c: Optional[float] = None
    humidity_pct: Optional[float] = None
    rainfall_mm: Optional[float] = None
    wind_kmh: Optional[float] = None
    wind_direction: Optional[str] = None
    uv_index: Optional[float] = None
    wet_bulb_temp_c: Optional[float] = None
    recorded_at: datetime


class WeatherReadingCreate(WeatherReadingBase):
    pass


class WeatherReadingResponse(WeatherReadingBase):
    id: int
    created_at: datetime
    hne: Optional[float] = None
    nightly_hne: Optional[float] = None
    risk_level: Optional[str] = None
    composite_risk_score: Optional[float] = None
    wet_bulb_peak: Optional[float] = None

    model_config = ConfigDict(from_attributes=True)


class WeatherForecastDayBase(BaseModel):
    forecast_date: str
    forecast_day_index: int
    min_temp: Optional[float] = None
    max_temp: Optional[float] = None
    min_rh: Optional[float] = None
    max_rh: Optional[float] = None
    weather_desc: Optional[str] = None
    risk_level: Optional[str] = None
    wind: Optional[str] = None
    psr: Optional[str] = None
    icon_code: Optional[int] = None
    composite_risk_score: Optional[float] = None
    wet_bulb_peak: Optional[float] = None
    source: Optional[str] = None  # "hko" | "open_meteo"


class WeatherForecastDayResponse(WeatherForecastDayBase):
    id: int
    fetched_at: datetime

    model_config = ConfigDict(from_attributes=True)


class WeatherWarningBase(BaseModel):
    warning_type: str
    signal: Optional[str] = None
    description: Optional[str] = None
    issue_time: Optional[datetime] = None
    update_time: Optional[datetime] = None
    status: str = "active"


class WeatherWarningResponse(WeatherWarningBase):
    id: int
    fetched_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SystemAlertBase(BaseModel):
    alert_type: str
    title: str
    message: str
    district: Optional[str] = None
    risk_level: Optional[str] = None
    status: str = "pending"
    target_group: Optional[str] = None
    source_data: Optional[Dict[str, Any]] = None


class SystemAlertCreate(SystemAlertBase):
    pass


class SystemAlertResponse(SystemAlertBase):
    id: int
    created_at: datetime
    acknowledged_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class RiskOutlook(BaseModel):
    outlook_days: int
    risk_level: str
    avg_max_temp: Optional[float] = None
    avg_wet_bulb_temp: Optional[float] = None
    highest_wet_bulb_temp: Optional[float] = None
    advisory: Optional[str] = None


class WeatherSummary(BaseModel):
    current: List[WeatherReadingResponse]
    forecast: List[WeatherForecastDayResponse]
    warnings: List[WeatherWarningResponse]
    risk_7_day: Optional[RiskOutlook] = None
    risk_9_day: Optional[RiskOutlook] = None
    last_updated: datetime


# ========== AGENT SCHEMAS ==========

class AgentStatus(BaseModel):
    id: str
    name: str
    role: str
    status: str  # "healthy" | "idle" | "error"
    last_activity: Optional[str] = None  # ISO datetime string
    capabilities: list[str]

    model_config = ConfigDict(from_attributes=True)


class AgentLog(BaseModel):
    id: str
    timestamp: str
    agentId: str
    type: str
    content: str
    metadata: Optional[Dict[str, Any]] = None

    model_config = ConfigDict(from_attributes=True)
