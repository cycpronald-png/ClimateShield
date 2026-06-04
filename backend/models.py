import datetime
import enum
from sqlalchemy import (
    Boolean,
    Column,
    ForeignKey,
    Integer,
    String,
    DateTime,
    Enum,
    DECIMAL,
    JSON,
    Float,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from backend.database import Base


class DonationType(str, enum.Enum):
    PHYSICAL = "physical"
    FINANCIAL = "financial"


class DonationStatus(str, enum.Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    FULFILLED = "fulfilled"


class DeliveryMethod(str, enum.Enum):
    DROPOFF = "dropoff"
    PICKUP = "pickup"
    SHIPPED = "shipped"
    NA = "n/a"


class WarningStatus(str, enum.Enum):
    ACTIVE = "active"
    EXPIRED = "expired"


class SystemAlertStatus(str, enum.Enum):
    PENDING = "pending"
    ACKNOWLEDGED = "acknowledged"


class SystemAlertType(str, enum.Enum):
    WEATHER_WARNING = "weather_warning"
    WBT_CRITICAL = "wbt_critical"
    HNE_EXTREME = "hne_extreme"
    HEAT_ADVISORY = "heat_advisory"


# ========== DONATION MODELS ==========

class DonorProfile(Base):
    __tablename__ = "donor_profiles"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    full_name = Column(String, nullable=False)
    phone = Column(String, nullable=True)
    company = Column(String, nullable=True)
    total_contributions_count = Column(Integer, default=0)
    total_financial_value = Column(DECIMAL(10, 2), default=0.0)
    first_donation_at = Column(DateTime(timezone=True), default=datetime.datetime.now)
    last_donation_at = Column(DateTime(timezone=True), onupdate=datetime.datetime.now)
    communication_opt_in = Column(Boolean, default=False)

    pledges = relationship("DonationPledge", back_populates="donor")


class DonationPledge(Base):
    __tablename__ = "donation_pledges"

    id = Column(Integer, primary_key=True, index=True)
    donor_id = Column(
        Integer, ForeignKey("donor_profiles.id"), nullable=True
    )  # Link to profile if exists

    # Snapshot of donor info at time of pledge
    donor_name = Column(String, nullable=False)
    donor_email = Column(String, nullable=False)
    donor_phone = Column(String, nullable=True)
    company = Column(String, nullable=True)

    donation_type = Column(
        String, nullable=False
    )  # Store enum as string for simplicity in minimal setup
    status = Column(String, default=DonationStatus.PENDING)
    total_estimated_value = Column(DECIMAL(10, 2), default=0.0)
    message = Column(String, nullable=True)

    created_at = Column(DateTime(timezone=True), default=datetime.datetime.now)
    updated_at = Column(DateTime(timezone=True), onupdate=datetime.datetime.now)

    approved_by_user_id = Column(String, nullable=True)  # Placeholder for Auth user ID
    approved_at = Column(DateTime(timezone=True), nullable=True)
    rejection_reason = Column(String, nullable=True)

    donor = relationship("DonorProfile", back_populates="pledges")
    items = relationship("DonationItem", back_populates="pledge")


class DonationItem(Base):
    __tablename__ = "donation_items"

    id = Column(Integer, primary_key=True, index=True)
    pledge_id = Column(Integer, ForeignKey("donation_pledges.id"))

    item_type = Column(String, nullable=False)  # e.g., "blankets", "masks"
    quantity = Column(Integer, nullable=False)
    delivery_method = Column(String, default=DeliveryMethod.DROPOFF)
    is_received = Column(Boolean, default=False)
    notes = Column(String, nullable=True)

    pledge = relationship("DonationPledge", back_populates="items")


# ========== WEATHER MODELS ==========

class WeatherReading(Base):
    __tablename__ = "weather_readings"

    id = Column(Integer, primary_key=True, index=True)
    station = Column(String, nullable=False, index=True)
    district = Column(String, nullable=True)
    temp_c = Column(Float, nullable=True)
    humidity_pct = Column(Float, nullable=True)
    rainfall_mm = Column(Float, nullable=True)
    wind_kmh = Column(Float, nullable=True)
    wind_direction = Column(String, nullable=True)
    uv_index = Column(Float, nullable=True)
    wet_bulb_temp_c = Column(Float, nullable=True)
    hne = Column(Float, nullable=True)
    nightly_hne = Column(Float, nullable=True)
    risk_level = Column(String, nullable=True)
    composite_risk_score = Column(Float, nullable=True)
    wet_bulb_peak = Column(Float, nullable=True)
    recorded_at = Column(DateTime(timezone=True), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), default=datetime.datetime.now)


class WeatherForecastDay(Base):
    __tablename__ = "weather_forecast_days"

    id = Column(Integer, primary_key=True, index=True)
    forecast_date = Column(String, nullable=False, index=True)
    forecast_day_index = Column(Integer, nullable=False)  # 0 = today, 1 = tomorrow...
    min_temp = Column(Float, nullable=True)
    max_temp = Column(Float, nullable=True)
    min_rh = Column(Float, nullable=True)
    max_rh = Column(Float, nullable=True)
    weather_desc = Column(Text, nullable=True)
    risk_level = Column(String, nullable=True)
    wind = Column(String, nullable=True)
    psr = Column(String, nullable=True)  # Probability of Significant Rainfall
    icon_code = Column(Integer, nullable=True)
    composite_risk_score = Column(Float, nullable=True)
    wet_bulb_peak = Column(Float, nullable=True)
    fetched_at = Column(DateTime(timezone=True), default=datetime.datetime.now)


class WeatherWarning(Base):
    __tablename__ = "weather_warnings"

    id = Column(Integer, primary_key=True, index=True)
    warning_type = Column(String, nullable=False, index=True)
    signal = Column(String, nullable=True)
    description = Column(Text, nullable=True)
    issue_time = Column(DateTime(timezone=True), nullable=True)
    update_time = Column(DateTime(timezone=True), nullable=True)
    status = Column(String, default=WarningStatus.ACTIVE)
    fetched_at = Column(DateTime(timezone=True), default=datetime.datetime.now)


class SystemAlert(Base):
    __tablename__ = "system_alerts"

    id = Column(Integer, primary_key=True, index=True)
    alert_type = Column(String, nullable=False, index=True)
    title = Column(String, nullable=False)
    message = Column(Text, nullable=False)
    district = Column(String, nullable=True, index=True)
    risk_level = Column(String, nullable=True)
    status = Column(String, default=SystemAlertStatus.PENDING)
    target_group = Column(String, nullable=True)
    source_data = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.datetime.now)
    acknowledged_at = Column(DateTime(timezone=True), nullable=True)


class GenerationCounter(Base):
    __tablename__ = "generation_counters"

    name = Column(String, primary_key=True)
    total = Column(Integer, default=0, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=datetime.datetime.now, onupdate=datetime.datetime.now)


class CounterResetLog(Base):
    __tablename__ = "counter_reset_log"

    id = Column(Integer, primary_key=True)
    reset_at = Column(DateTime(timezone=True), default=datetime.datetime.now)


# ========== RISK FORMULA CONFIG MODELS ==========

class RiskFormulaConfig(Base):
    __tablename__ = "risk_formula_configs"

    id = Column(Integer, primary_key=True)
    name = Column(String, default="default")
    is_active = Column(Boolean, default=True)

    # W — Wet-bulb thresholds: list of dicts {"min_temp": float|None, "max_temp": float|None, "score": int}
    wbt_thresholds = Column(JSON, nullable=False)

    # H — Hot Night Excess thresholds: list of dicts {"min_nights": int|None, "max_nights": int|None, "score": int}
    hne_thresholds = Column(JSON, nullable=False)

    # V — Vulnerability config: {"trigger_h_score": int, "bonus": int}
    vulnerability_config = Column(JSON, nullable=False)

    # M — Warning multipliers: dict {"warning_key": float}
    warning_multipliers = Column(JSON, nullable=False)

    # T8 Floor: {"enabled": bool, "min_score": int}
    t8_floor = Column(JSON, nullable=False)

    # State ranges: list of dicts {"name": str, "min": int, "max": int}
    state_ranges = Column(JSON, nullable=False)

    created_at = Column(DateTime(timezone=True), default=datetime.datetime.now)
    updated_at = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())


class ConsecutiveHotNights(Base):
    __tablename__ = "consecutive_hot_nights"

    id = Column(Integer, primary_key=True)
    station = Column(String, nullable=False, index=True)
    date = Column(String, nullable=False, index=True)  # YYYY-MM-DD
    consecutive_count = Column(Integer, nullable=False, default=0)
    # Did this night (20:00-07:59) have min_temp > 28°C? (the condition that extends the streak)
    is_hot_night = Column(Boolean, default=False)
    min_temp = Column(Float, nullable=True)

    created_at = Column(DateTime(timezone=True), default=datetime.datetime.now)

    __table_args__ = (
        # Only one record per station per date
        UniqueConstraint("station", "date", name="uq_station_date_hot_nights"),
    )

