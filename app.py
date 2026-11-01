"""Conventional root FastAPI entrypoint for Vercel autodetection.

The application implementation remains in backend/app.py. Keeping this tiny
root module makes the repository deploy as one FastAPI app instead of a
frontend-only static project.
"""
from backend.app import app

__all__ = ["app"]
