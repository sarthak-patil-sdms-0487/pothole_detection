import os
from dotenv import load_dotenv
from functools import lru_cache

@lru_cache()
def get_settings():
    # This will load the .env file from the `backend/` directory
    # when the uvicorn command is run from there.
    load_dotenv()
    return Settings()

class Settings:
    def __init__(self):
        self.database_url: str = os.getenv("DATABASE_URL")
        self.aws_access_key_id: str = os.getenv("AWS_ACCESS_KEY_ID")
        self.aws_secret_access_key: str = os.getenv("AWS_SECRET_ACCESS_KEY")
        self.aws_s3_bucket_name: str = os.getenv("AWS_S3_BUCKET_NAME")
        self.gemini_api_key: str = os.getenv("GEMINI_API_KEY")
        self.notify_contractors_live: bool = os.getenv("NOTIFY_CONTRACTORS_LIVE", "false").lower() in ("true", "1", "yes")
