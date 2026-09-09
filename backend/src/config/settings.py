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
        # Object storage. Points at MinIO when S3_ENDPOINT_URL is set, and at
        # real AWS S3 when it is left blank. The AWS_* names are still read as
        # a fallback so existing .env files keep working.
        self.s3_endpoint_url: str = os.getenv("S3_ENDPOINT_URL", "")
        self.s3_public_url: str = os.getenv("S3_PUBLIC_URL", "")
        self.s3_region: str = os.getenv("S3_REGION", "us-east-1")
        self.s3_access_key_id: str = os.getenv("S3_ACCESS_KEY_ID") or os.getenv("AWS_ACCESS_KEY_ID")
        self.s3_secret_access_key: str = os.getenv("S3_SECRET_ACCESS_KEY") or os.getenv("AWS_SECRET_ACCESS_KEY")
        self.s3_bucket_name: str = os.getenv("S3_BUCKET_NAME") or os.getenv("AWS_S3_BUCKET_NAME")
        self.gemini_api_key: str = os.getenv("GEMINI_API_KEY")
        self.notify_contractors_live: bool = os.getenv("NOTIFY_CONTRACTORS_LIVE", "false").lower() in ("true", "1", "yes")

        # Outbound mail for contractor complaint notices. Without SMTP_HOST the
        # notice is generated and audit-logged but never delivered, and reports
        # itself as SIMULATED rather than claiming to have been sent.
        self.smtp_host: str = os.getenv("SMTP_HOST", "")
        self.smtp_port: int = int(os.getenv("SMTP_PORT", "587"))
        self.smtp_user: str = os.getenv("SMTP_USER", "")
        self.smtp_password: str = os.getenv("SMTP_PASSWORD", "")
        self.smtp_use_tls: bool = os.getenv("SMTP_USE_TLS", "true").lower() in ("true", "1", "yes")
        self.smtp_from: str = os.getenv("SMTP_FROM", "") or self.smtp_user
        # While testing, send every notice here instead of the real contractor.
        # Clear it to address notices to the contractor on the governing tender.
        self.notice_recipient_override: str = os.getenv("NOTICE_RECIPIENT_OVERRIDE", "")
