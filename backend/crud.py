from sqlalchemy.orm import Session
from backend import models, schemas
from backend.models import DonationStatus


def create_donor_profile(db: Session, donor: schemas.DonationPledgeCreate):
    # Check if donor exists by email
    db_donor = (
        db.query(models.DonorProfile)
        .filter(models.DonorProfile.email == donor.donor_email)
        .first()
    )
    if not db_donor:
        db_donor = models.DonorProfile(
            full_name=donor.donor_name,
            email=donor.donor_email,
            phone=donor.donor_phone,
            company=donor.company,
        )
        db.add(db_donor)
        db.commit()
        db.refresh(db_donor)
    return db_donor


def create_donation_pledge(db: Session, pledge_data: schemas.DonationPledgeCreate):
    # 1. Get or Create Donor
    donor = create_donor_profile(db, pledge_data)

    # 2. Create Pledge
    db_pledge = models.DonationPledge(
        donor_id=donor.id,
        donor_name=pledge_data.donor_name,
        donor_email=pledge_data.donor_email,
        donation_type=pledge_data.donation_type,
        message=pledge_data.message,
        status=DonationStatus.PENDING,
    )
    db.add(db_pledge)
    db.commit()
    db.refresh(db_pledge)

    # 3. Create Items
    for item in pledge_data.items:
        db_item = models.DonationItem(
            pledge_id=db_pledge.id,
            item_type=item.item_type,
            quantity=item.quantity,
            delivery_method=item.delivery_method,
            notes=item.notes,
        )
        db.add(db_item)

    db.commit()
    db.refresh(db_pledge)
    return db_pledge


def get_pledges(db: Session, skip: int = 0, limit: int = 100):
    return db.query(models.DonationPledge).offset(skip).limit(limit).all()


def get_pledge(db: Session, pledge_id: int):
    return (
        db.query(models.DonationPledge)
        .filter(models.DonationPledge.id == pledge_id)
        .first()
    )
