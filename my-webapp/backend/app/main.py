from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes.deterministic import router as deterministic_router
from app.routes.fabric import router as fabric_router


app = FastAPI(
    title="Label Inspection API",
    description="Deterministic and non-deterministic label inspection",
    version="1.0.0",
)


# --------------------------------------------------
# CORS
# --------------------------------------------------

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --------------------------------------------------
# Routes
# --------------------------------------------------

app.include_router(
    deterministic_router
)

app.include_router(
    fabric_router
)


# --------------------------------------------------
# Root
# --------------------------------------------------

@app.get("/")
def root():

    return {
        "message": "Label Inspection API is running"
    }