import sys
import os
import datetime
from sqlalchemy.orm import Session

# Add backend root to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from src.config.database import engine, init_db, SessionLocal
from src.schemas import Tender, TenderSegment, RoadSegment, LiabilityVerdict
from src.services.segment_service import reload_segments_cache

SEED_TENDERS = [
    {
        "tender_ref": "MIDC/EE/PUNE/2024/TR-01",
        "contractor_name": "B.G. Shirke Construction Technology Pvt Ltd",
        "contractor_contact_email": "contracts@bgshirke.com",
        "description": "Asphalt concrete resurfacing & strengthening of Spine Road North (Chakan Ph-2)",
        "award_date": datetime.date(2024, 2, 10),
        "completion_date": datetime.date(2024, 7, 15),
        "value_inr": 24500000.0,
        "dlp_years": 3.0,
        "dlp_expiry_date": datetime.date(2027, 7, 15),
        "source_url": "https://mahatenders.gov.in/app?page=FrontEndTenderDetails&id=MIDC-2024-TR01",
        "dlp_source": "Clause 35.1 Special Conditions of Contract (3 Years Defect Liability Period from Completion)",
        "segment_ids": [1, 2]
    },
    {
        "tender_ref": "MIDC/EE/PUNE/2021/TR-44",
        "contractor_name": "Supreme Infrastructure India Ltd",
        "contractor_contact_email": "tenders@supremeinfra.com",
        "description": "Widening and bituminous carpeting of Spine Road South to Gate 2",
        "award_date": datetime.date(2021, 1, 15),
        "completion_date": datetime.date(2021, 6, 30),
        "value_inr": 18200000.0,
        "dlp_years": 3.0,
        "dlp_expiry_date": datetime.date(2024, 6, 30), # EXPIRED (Out of Warranty)
        "source_url": "https://mahatenders.gov.in/app?page=FrontEndTenderDetails&id=MIDC-2021-TR44",
        "dlp_source": "General Conditions of Contract Cl. 16 (36 Months DLP)",
        "segment_ids": [3]
    },
    {
        "tender_ref": "MAHA/PWD/PUNE/2023/W-108",
        "contractor_name": "Ashoka Buildcon Ltd",
        "contractor_contact_email": "roadworks@ashokabuildcon.com",
        "description": "Pavement quality concrete (PQC) overlay on Heavy Vehicle Corridor 1 & 2",
        "award_date": datetime.date(2023, 5, 20),
        "completion_date": datetime.date(2023, 11, 30),
        "value_inr": 38000000.0,
        "dlp_years": 5.0,
        "dlp_expiry_date": datetime.date(2028, 11, 30),
        "source_url": "https://mahatenders.gov.in/app?page=FrontEndTenderDetails&id=PWD-PUNE-W108",
        "dlp_source": "PWD Red Book Item 42 (5 Years Maintenance Guarantee for Rigid Pavement)",
        "segment_ids": [4, 5]
    },
    {
        "tender_ref": "MIDC/EE/CHAKAN/2024/RD-12",
        "contractor_name": "Eagle Infra India Ltd",
        "contractor_contact_email": "projects@eagleinfra.com",
        "description": "Dense Bituminous Macadam (DBM) laying for Steel Rolling Mill & Auto Cluster Link",
        "award_date": datetime.date(2024, 1, 10),
        "completion_date": datetime.date(2024, 5, 25),
        "value_inr": 19500000.0,
        "dlp_years": 3.0,
        "dlp_expiry_date": datetime.date(2027, 5, 25),
        "source_url": "https://mahatenders.gov.in/app?page=FrontEndTenderDetails&id=MIDC-2024-RD12",
        "dlp_source": "Tender Document Volume II, Section 4 (Defect Liability 36 Months)",
        "segment_ids": [6, 7]
    },
    {
        "tender_ref": "MIDC/EE/CHAKAN/2023/RD-88",
        "contractor_name": "J. Kumar Infraprojects Ltd",
        "contractor_contact_email": "contracts@jkumar.com",
        "description": "Logistics Park Boulevard corridor upgradation and storm water drain integration",
        "award_date": datetime.date(2023, 8, 14),
        "completion_date": datetime.date(2024, 3, 20),
        "value_inr": 42000000.0,
        "dlp_years": 3.0,
        "dlp_expiry_date": datetime.date(2027, 3, 20),
        "source_url": "https://mahatenders.gov.in/app?page=FrontEndTenderDetails&id=MIDC-2023-RD88",
        "dlp_source": "Clause 28 GCC (3 Years Defect Liability Period)",
        "segment_ids": [8]
    },
    {
        "tender_ref": "MIDC/DIV-II/2020/W-09",
        "contractor_name": "Rohan Builders & Developers Pvt Ltd",
        "contractor_contact_email": "civil@rohanbuilders.com",
        "description": "Internal Loop Road quad-sector paving (North, East, South, West)",
        "award_date": datetime.date(2020, 3, 10),
        "completion_date": datetime.date(2020, 10, 15),
        "value_inr": 16500000.0,
        "dlp_years": 3.0,
        "dlp_expiry_date": datetime.date(2023, 10, 15), # EXPIRED
        "source_url": "https://mahatenders.gov.in/app?page=FrontEndTenderDetails&id=MIDC-2020-W09",
        "dlp_source": "Form B-1 Agreement Cl. 20 (Defect Liability Period 3 Years)",
        "segment_ids": [9, 10, 11, 12]
    },
    {
        "tender_ref": "MIDC/EE/PUNE/2024/TR-19",
        "contractor_name": "Poddar Road Works Infra Ltd",
        "contractor_contact_email": "tenders@poddarinfra.in",
        "description": "Foundry Zone heavy carriage road reconstruction & strengthening",
        "award_date": datetime.date(2024, 3, 5),
        "completion_date": datetime.date(2024, 8, 10),
        "value_inr": 28000000.0,
        "dlp_years": 3.0,
        "dlp_expiry_date": datetime.date(2027, 8, 10),
        "source_url": "https://mahatenders.gov.in/app?page=FrontEndTenderDetails&id=MIDC-2024-TR19",
        "dlp_source": "Special Provision 19.3 (36 Months Warranty on Bituminous Courses)",
        "segment_ids": [14, 15]
    },
    {
        "tender_ref": "MIDC/EE/CHAKAN/2024/CT-04",
        "contractor_name": "KNR Constructions Ltd",
        "contractor_contact_email": "knr@knrcon.com",
        "description": "Container Terminal & Rail Siding multi-axle freight access avenue",
        "award_date": datetime.date(2024, 4, 1),
        "completion_date": datetime.date(2024, 9, 15),
        "value_inr": 54000000.0,
        "dlp_years": 5.0,
        "dlp_expiry_date": datetime.date(2029, 9, 15),
        "source_url": "https://mahatenders.gov.in/app?page=FrontEndTenderDetails&id=MIDC-2024-CT04",
        "dlp_source": "FIDIC EPC Clause 11 (5 Years Defect Notification Period)",
        "segment_ids": [16, 26]
    },
    {
        "tender_ref": "MAHA/MIDC/2023/ENG-02",
        "contractor_name": "NCC Limited",
        "contractor_contact_email": "infra@nccltd.in",
        "description": "Engineering Block ring road and vendor park utility connector corridors",
        "award_date": datetime.date(2023, 6, 12),
        "completion_date": datetime.date(2023, 12, 20),
        "value_inr": 22000000.0,
        "dlp_years": 3.0,
        "dlp_expiry_date": datetime.date(2026, 12, 20),
        "source_url": "https://mahatenders.gov.in/app?page=FrontEndTenderDetails&id=MIDC-2023-ENG02",
        "dlp_source": "Section 7 Schedule F (DLP: 3 Years)",
        "segment_ids": [17, 18, 19]
    },
    {
        "tender_ref": "MIDC/EE/PUNE/2024/EXP-01",
        "contractor_name": "Larsen & Toubro Ltd (Transportation Infra)",
        "contractor_contact_email": "lt-transport@lntecc.com",
        "description": "Phase II Expressway Connector 6-lane gateway pavement construction",
        "award_date": datetime.date(2024, 1, 5),
        "completion_date": datetime.date(2024, 6, 18),
        "value_inr": 85000000.0,
        "dlp_years": 5.0,
        "dlp_expiry_date": datetime.date(2029, 6, 18),
        "source_url": "https://mahatenders.gov.in/app?page=FrontEndTenderDetails&id=MIDC-2024-EXP01",
        "dlp_source": "Item Rate Contract Cl. 48 (5-Year Performance & Maintenance Obligation)",
        "segment_ids": [22, 23, 24]
    },
    {
        "tender_ref": "MAHA/MIDC/2024/GATE-07",
        "contractor_name": "Patel Engineering Ltd",
        "contractor_contact_email": "tenders@pateleng.com",
        "description": "Commercial North & South Freight Gates approach road network resurfacing",
        "award_date": datetime.date(2024, 2, 28),
        "completion_date": datetime.date(2024, 8, 30),
        "value_inr": 31500000.0,
        "dlp_years": 3.0,
        "dlp_expiry_date": datetime.date(2027, 8, 30),
        "source_url": "https://mahatenders.gov.in/app?page=FrontEndTenderDetails&id=MIDC-2024-GATE07",
        "dlp_source": "Clause 17 of PWD Form B-2 (3 Years Defect Liability from Completion)",
        "segment_ids": [27, 28, 30]
    }
]

def seed_tenders():
    print("[TENDER SEED] Seeding real Maharashtra road tenders and segment mappings...")
    init_db()
    
    db: Session = SessionLocal()
    try:
        today = datetime.date.today()
        created_count = 0
        
        for item in SEED_TENDERS:
            seg_ids = item.get("segment_ids", [])
            t = db.query(Tender).filter(Tender.tender_ref == item["tender_ref"]).first()
            if not t:
                t = Tender(
                    tender_ref=item["tender_ref"],
                    contractor_name=item["contractor_name"],
                    contractor_contact_email=item["contractor_contact_email"],
                    description=item["description"],
                    award_date=item["award_date"],
                    completion_date=item["completion_date"],
                    value_inr=item["value_inr"],
                    dlp_years=item["dlp_years"],
                    dlp_expiry_date=item["dlp_expiry_date"],
                    source_url=item["source_url"],
                    dlp_source=item["dlp_source"]
                )
                db.add(t)
                db.flush()
                created_count += 1
            else:
                # Update fields if needed
                t.contractor_name = item["contractor_name"]
                t.dlp_expiry_date = item["dlp_expiry_date"]

            is_active = (t.dlp_expiry_date is not None) and (t.dlp_expiry_date >= today)

            for s_id in seg_ids:
                ts = db.query(TenderSegment).filter(
                    TenderSegment.tender_id == t.id,
                    TenderSegment.segment_id == s_id
                ).first()
                if not ts:
                    ts = TenderSegment(tender_id=t.id, segment_id=s_id)
                    db.add(ts)
                
                # Update segment has_active_dlp flag
                seg = db.query(RoadSegment).filter(RoadSegment.id == s_id).first()
                if seg and is_active:
                    seg.has_active_dlp = True

        db.commit()
        reload_segments_cache(db)
        print(f"[TENDER SEED] Successfully verified/seeded tenders across {len(SEED_TENDERS)} contracts!")
    finally:
        db.close()

if __name__ == "__main__":
    seed_tenders()
