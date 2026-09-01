from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from .settings import get_settings
from ..schemas import Base

settings = get_settings()
DATABASE_URL = settings.database_url or "sqlite:///./potholes.db"

# SQLite requires check_same_thread=False for multi-threaded FastAPI execution
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def init_db():
    Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
