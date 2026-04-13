"""OptiBuilding API — FastAPI application entry point."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routers import analysis, renovation, materials, calibration, weather
from api.routers import auth as auth_router
from api.routers import projects as projects_router
from api.database import init_db

app = FastAPI(
    title="OptiBuilding API",
    description=(
        "Physics-based building energy analysis API. "
        "Compute DPE class, heating needs, and renovation scenarios "
        "from GeoJSON building geometry."
    ),
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS — open for local frontend development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router.router)
app.include_router(projects_router.router)
app.include_router(analysis.router)
app.include_router(renovation.router)
app.include_router(materials.router)
app.include_router(calibration.router)
app.include_router(weather.router)


@app.on_event("startup")
def on_startup():
    init_db()


@app.get("/health", tags=["system"])
def health() -> dict:
    return {"status": "ok", "version": "1.0.0"}
