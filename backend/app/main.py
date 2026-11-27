from __future__ import annotations

import threading
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import mysql.connector
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse

from .config import settings
from .database import create_connection
from .ml.detector import detector as pothole_detector
from .potholes import router as pothole_router
from .registration_emails import start_registration_email_worker
from .routers import (
    activity_logs,
    admin_reports,
    admin_requests,
    auth,
    notifications,
    registrations,
    resident_requests,
    residents,
    staff,
)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    stop_registration_email_worker = start_registration_email_worker()
    # Load the model in the background so the API starts immediately and the
    # first resident's upload does not wait for it.
    threading.Thread(
        target=pothole_detector.warm_up, name="pothole-model-load", daemon=True
    ).start()
    try:
        yield
    finally:
        stop_registration_email_worker()


app = FastAPI(title="Barangay Portal API", version="1.0.0", lifespan=lifespan)


app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_origin_regex=settings.cors_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Resident pothole reports and their administration (see app/potholes.py).
app.include_router(pothole_router)


@app.get("/", include_in_schema=False)
def root() -> RedirectResponse:
    return RedirectResponse(url="/docs")


@app.get("/api/health")
def health_check() -> dict[str, str]:
    try:
        connection = create_connection()
        connection.close()
    except mysql.connector.Error as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="MySQL is unavailable.",
        ) from error
    return {"status": "ok"}


# Registration order is the route matching order.
app.include_router(auth.router)
app.include_router(resident_requests.router)
app.include_router(admin_reports.router)
app.include_router(residents.router)
app.include_router(registrations.router)
app.include_router(admin_requests.router)
app.include_router(staff.router)
app.include_router(activity_logs.router)
app.include_router(notifications.router)
