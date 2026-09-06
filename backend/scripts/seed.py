import asyncio
import uuid
from datetime import datetime, date
from backend.app.db.session import sync_engine, SyncSessionLocal
from backend.app.models import (
    Base, User, UserRole, Building, Floor, Location, Machine, MachineModel,
    MachineStatus, DataQualityStatus, MachineLocation, Technician, TechnicianStatus,
    SparePartCategory, SparePart, Ticket, TicketStatus, TicketPriority, TicketSource,
    FaultCategory, TicketStatusHistory, SparePartRequest, PartRequestStatus
)

def run_seed():
    """Seeds default demo data directly using SQLAlchemy ORM."""
    print("Starting database seeding...")
    db = SyncSessionLocal()
    try:
        # 1. Admin & Users
        admin = db.query(User).filter(User.email == "admin@vendingfleet.com").first()
        if not admin:
            admin = User(
                id=uuid.UUID("a0000000-0000-0000-0000-000000000001"),
                email="admin@vendingfleet.com",
                password_hash="$2b$12$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW",
                full_name="System Administrator",
                phone="+966501234567",
                role=UserRole.SUPER_ADMIN,
                is_active=True
            )
            db.add(admin)

        tech_user = db.query(User).filter(User.email == "tech.khalid@vendingfleet.com").first()
        if not tech_user:
            tech_user = User(
                id=uuid.UUID("a0000000-0000-0000-0000-000000000003"),
                email="tech.khalid@vendingfleet.com",
                password_hash="$2b$12$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW",
                full_name="Khalid Al-Ghamdi (Senior Tech)",
                phone="+966551122334",
                role=UserRole.TECHNICIAN,
                is_active=True
            )
            db.add(tech_user)
        db.commit()

        # 2. Technician Profile
        tech = db.query(Technician).filter(Technician.employee_code == "TECH-001").first()
        if not tech:
            tech = Technician(
                id=uuid.UUID("b0000000-0000-0000-0000-000000000001"),
                user_id=tech_user.id,
                employee_code="TECH-001",
                specialization="POS & Electronics",
                status=TechnicianStatus.AVAILABLE,
                skills=["POS Diagnostics", "Card Readers", "Coin Mechanisms"],
                assigned_region="Central Campus",
                max_active_tickets=6
            )
            db.add(tech)
        db.commit()

        # 3. Buildings & Locations
        building = db.query(Building).filter(Building.code == "HQ-ADM").first()
        if not building:
            building = Building(
                id=uuid.UUID("c0000000-0000-0000-0000-000000000001"),
                name="Administrative Headquarters",
                name_ar="مبنى الإدارة الرئيسي",
                code="HQ-ADM",
                address="Main Campus Gate 1, Administrative Ave"
            )
            db.add(building)
            db.flush()

            floor = Floor(
                id=uuid.UUID("d0000000-0000-0000-0000-000000000001"),
                building_id=building.id,
                floor_number=0,
                floor_name="Ground Floor",
                floor_name_ar="الدور الأرضي",
                level_order=0
            )
            db.add(floor)
            db.flush()

            loc = Location(
                id=uuid.UUID("e0000000-0000-0000-0000-000000000001"),
                building_id=building.id,
                floor_id=floor.id,
                area_zone="Main Reception Lobby",
                area_zone_ar="بهو الاستقبال الرئيسي",
                full_description="Administrative Headquarters - Ground Floor - Main Reception Lobby",
                original_raw_text="مبنى الإدارة الرئيسي - الدور الأرضي - بهو الاستقبال",
                is_active=True
            )
            db.add(loc)
            db.commit()

        # 4. Machine
        machine = db.query(Machine).filter(Machine.machine_number == "VM-001").first()
        if not machine:
            machine = Machine(
                id=uuid.UUID("10000000-0000-0000-0000-000000000001"),
                public_id=uuid.UUID("90000000-0000-0000-0000-000000000001"),
                machine_number="VM-001",
                serial_number="SN-FAS-9988201",
                machine_type="SNACK_AND_BEVERAGE",
                status=MachineStatus.OPERATIONAL,
                data_quality_status=DataQualityStatus.VALID,
                health_score=98,
                qr_code_url="/report/90000000-0000-0000-0000-000000000001",
                notes="Fully operational, high traffic lobby unit."
            )
            db.add(machine)
            db.flush()

            mach_loc = MachineLocation(
                machine_id=machine.id,
                location_id=uuid.UUID("e0000000-0000-0000-0000-000000000001"),
                is_current=True
            )
            db.add(mach_loc)
            db.commit()

        print("Database seeding completed successfully!")
    except Exception as e:
        db.rollback()
        print(f"Error during seeding: {e}")
        raise
    finally:
        db.close()

if __name__ == "__main__":
    run_seed()
