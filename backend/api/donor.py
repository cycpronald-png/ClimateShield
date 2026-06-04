from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from typing import List
from backend import crud, schemas, database
from backend.limiter import limiter

router = APIRouter(prefix="/api/donor", tags=["donor"])


@router.post("/pledge", response_model=schemas.DonationPledgeResponse)
@limiter.limit("10/minute")
def create_pledge(
    request: Request,
    pledge: schemas.DonationPledgeCreate,
    db: Session = Depends(database.get_db),
):
    """
    Submit a new donation pledge.
    Creates a donor profile if one doesn't exist.
    """
    return crud.create_donation_pledge(db=db, pledge_data=pledge)
