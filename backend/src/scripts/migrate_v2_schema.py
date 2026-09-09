import sys
import os
from sqlalchemy import inspect, text

# Add backend root to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from src.config.database import engine, init_db
from src.schemas import Base

def migrate():
    print("[MIGRATION] Starting Schema v2 Migration...")
    
    # 1. Initialize all newly defined tables
    print("[MIGRATION] Creating any missing tables from metadata...")
    init_db()
    
    # 2. Inspect existing 'reports' table for missing columns
    inspector = inspect(engine)
    if "reports" in inspector.get_table_names():
        existing_cols = {col["name"] for col in inspector.get_columns("reports")}
        print(f"[MIGRATION] Existing columns in 'reports': {existing_cols}")
        
        cols_to_add = [
            ("defect_id", "INTEGER REFERENCES defect(id)"),
            ("segment_id", "INTEGER REFERENCES road_segment(id)"),
            ("capture_source", "VARCHAR"),
            ("survey_run_id", "INTEGER REFERENCES survey_run(id)"),
        ]
        
        with engine.begin() as conn:
            for col_name, col_def in cols_to_add:
                if col_name not in existing_cols:
                    print(f"[MIGRATION] Adding column '{col_name}' to 'reports' table...")
                    try:
                        conn.execute(text(f"ALTER TABLE reports ADD COLUMN {col_name} {col_def}"))
                        print(f"[MIGRATION] Added column '{col_name}'.")
                    except Exception as e:
                        print(f"[MIGRATION] Note on adding '{col_name}': {e}")
                else:
                    print(f"[MIGRATION] Column '{col_name}' already exists in 'reports'.")

    # 3. Verify all tables exist
    refreshed_tables = inspect(engine).get_table_names()
    print(f"[MIGRATION] Current database tables ({len(refreshed_tables)} total): {refreshed_tables}")
    print("[MIGRATION] Migration completed successfully!")

if __name__ == "__main__":
    migrate()
