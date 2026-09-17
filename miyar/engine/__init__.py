# Copyright (c) 2026, Miyar and contributors
# License: MIT. See LICENSE

"""Embedded dual-path engineering engine (formerly ido_dual_ai FastAPI)."""

from miyar.engine.service import analyze_pdf_bytes, engine_health, load_engine_config

__all__ = ["analyze_pdf_bytes", "engine_health", "load_engine_config"]
