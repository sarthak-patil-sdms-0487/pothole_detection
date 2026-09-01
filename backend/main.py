from fastapi import FastAPI
import logging
from src.api.router import router
from src.config.database import init_db
from src.middlewares.cors import add_cors_middleware

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize database
init_db()

app = FastAPI()

# Add CORS middleware
add_cors_middleware(app)

import os
from fastapi.staticfiles import StaticFiles

# Ensure uploads directory exists and mount static files
os.makedirs("uploads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# Include the API router
app.include_router(router)

@app.get("/")
def read_root():
    return {"message": "Welcome to the Pothole Detection API"}
