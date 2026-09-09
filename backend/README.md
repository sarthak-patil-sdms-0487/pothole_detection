# Backend

This is the backend for the MIDC Pothole project.

## Folder Structure

The backend follows a modular, Express-style MVC structure:

- `src/`: Contains the core application logic.
  - `api/`: Aggregates all the API routers.
  - `config/`: Handles application configuration, including database connections and environment variables.
  - `controllers/`: Contains the business logic for each route.
  - `middlewares/`: Custom middleware for the FastAPI application.
  - `routes/`: Defines the API routes and their corresponding controller functions.
  - `schemas/`: Pydantic and SQLAlchemy schemas for data validation and ORM.
  - `services/`: Houses external services, such as S3, YOLO, and Gemini.
- `main.py`: The main entry point for the FastAPI application.
- `src/scripts/`: Standalone scripts — schema migration, gazetteer loading, and seed data.
- `src/models/`: Machine learning model weights.
- `data/`: The segment gazetteer GeoJSON and the sample DLP extraction output.
- `tests/`: Pytest suite. Runs against a disposable database, never your dev Postgres —
  see `tests/conftest.py`.
