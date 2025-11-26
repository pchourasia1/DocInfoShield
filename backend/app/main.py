"""
DocInfoShield detection API.

The Word task pane sends the document's paragraphs here and gets back, for each
paragraph, the sensitive spans to redact. Run over HTTPS (see scripts/api.js),
because the task pane itself is served over HTTPS and browsers block mixed content.
"""

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .detector import SPACY_MODEL, detect_as_dicts, get_analyzer

ADDIN_ORIGIN = os.getenv("ADDIN_ORIGIN", "https://localhost:3100")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Load the spaCy model at startup so the first redaction isn't slow
    get_analyzer()
    yield


app = FastAPI(title="DocInfoShield API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[ADDIN_ORIGIN],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


class DetectRequest(BaseModel):
    paragraphs: list[str] = Field(max_length=10_000)


class Entity(BaseModel):
    text: str
    start: int
    end: int
    entity: str
    type: str
    marker: str
    score: float


class DetectResponse(BaseModel):
    paragraphs: list[list[Entity]]


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "model": SPACY_MODEL}


@app.post("/api/detect", response_model=DetectResponse)
def detect_endpoint(request: DetectRequest) -> DetectResponse:
    # Sync endpoint: FastAPI runs it in a worker thread, so spaCy doesn't block the event loop
    return DetectResponse(paragraphs=detect_as_dicts(request.paragraphs))
