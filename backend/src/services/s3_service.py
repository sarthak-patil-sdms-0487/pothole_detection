import boto3
import json
import logging
from botocore.client import Config
from botocore.exceptions import NoCredentialsError, PartialCredentialsError, ClientError
from io import BytesIO
from ..config.settings import get_settings

# Configure logging
logger = logging.getLogger(__name__)

settings = get_settings()

# Cached client + a flag so the bucket is only ensured once per process
_s3_client = None
_bucket_ready = False


def _is_configured() -> bool:
    return all([
        settings.s3_access_key_id,
        settings.s3_secret_access_key,
        settings.s3_bucket_name,
    ])


def get_s3_client():
    """
    Lazily build the S3 client. Works against MinIO (or any S3-compatible
    store) when S3_ENDPOINT_URL is set, and against real AWS S3 when it is not.
    """
    global _s3_client
    if _s3_client is None:
        _s3_client = boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint_url or None,
            aws_access_key_id=settings.s3_access_key_id,
            aws_secret_access_key=settings.s3_secret_access_key,
            region_name=settings.s3_region,
            # MinIO requires signature v4 and path-style addressing, since
            # bucket.localhost virtual-host style will not resolve locally.
            config=Config(
                signature_version="s3v4",
                s3={"addressing_style": "path" if settings.s3_endpoint_url else "auto"},
            ),
        )
    return _s3_client


def ensure_bucket() -> bool:
    """
    Create the bucket if it does not exist, and make its objects publicly
    readable so the browser can load the returned URLs directly.
    Returns True when the bucket is usable.
    """
    global _bucket_ready
    if _bucket_ready:
        return True
    if not _is_configured():
        return False

    client = get_s3_client()
    bucket = settings.s3_bucket_name
    try:
        client.head_bucket(Bucket=bucket)
    except ClientError:
        try:
            client.create_bucket(Bucket=bucket)
            logger.info(f"Created bucket '{bucket}'.")
        except ClientError as e:
            logger.error(f"Could not create bucket '{bucket}': {e}")
            return False

    # Only force a public-read policy on a self-hosted store. On real AWS this
    # is usually blocked by the account's public-access settings.
    if settings.s3_endpoint_url:
        policy = {
            "Version": "2012-10-17",
            "Statement": [{
                "Effect": "Allow",
                "Principal": {"AWS": ["*"]},
                "Action": ["s3:GetObject"],
                "Resource": [f"arn:aws:s3:::{bucket}/*"],
            }],
        }
        try:
            client.put_bucket_policy(Bucket=bucket, Policy=json.dumps(policy))
        except ClientError as e:
            logger.warning(f"Could not set public-read policy on '{bucket}': {e}")

    _bucket_ready = True
    return True


def upload_file_obj_to_s3(file_obj: BytesIO, object_name: str) -> str:
    """
    Uploads a file-like object (in-memory) to the configured object store and
    returns the public URL.

    :param file_obj: The in-memory file object (BytesIO).
    :param object_name: The name of the object in the bucket.
    :return: The public URL of the uploaded file, or None if the upload fails.
    """
    if not _is_configured():
        logger.error("Object storage credentials or bucket name are not configured.")
        return None

    if not ensure_bucket():
        return None

    try:
        get_s3_client().upload_fileobj(
            file_obj,
            settings.s3_bucket_name,
            object_name,
            ExtraArgs={'ContentType': 'image/jpeg'}
        )

        # Construct the browser-facing URL.
        #  - "relative": emit a same-origin path (/bucket/object). The frontend
        #    proxies this to MinIO, so the image loads from whatever host is
        #    serving the page — laptop on localhost AND phone over ngrok — with
        #    no absolute host baked into the DB. This is the robust default.
        #  - an explicit host (e.g. https://x.ngrok-free.dev): use it verbatim.
        #  - otherwise fall back to the internal endpoint, then real AWS S3.
        public = settings.s3_public_url
        if public == "relative":
            public_url = f"/{settings.s3_bucket_name}/{object_name}"
        else:
            base = public or settings.s3_endpoint_url
            if base:
                public_url = f"{base.rstrip('/')}/{settings.s3_bucket_name}/{object_name}"
            else:
                public_url = f"https://{settings.s3_bucket_name}.s3.amazonaws.com/{object_name}"

        logger.info(f"Successfully uploaded in-memory object to {public_url}")
        return public_url

    except (NoCredentialsError, PartialCredentialsError):
        logger.error("Object storage credentials not found or incomplete.")
        return None
    except Exception as e:
        logger.error(f"An error occurred while uploading to object storage: {e}")
        return None
