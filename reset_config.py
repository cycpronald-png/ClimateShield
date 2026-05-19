from backend.database import SessionLocal
from backend.services.risk_config_service import reset_risk_config
db = SessionLocal()
reset_risk_config(db)
db.close()
