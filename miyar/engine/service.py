# Copyright (c) 2026, Miyar and contributors
# License: MIT. See LICENSE

"""Miyar-facing facade over the embedded dual_core engine."""

from __future__ import annotations

from typing import Any

import frappe

from miyar.engine import dual_core


def load_engine_config() -> dict[str, Any]:
	"""Resolve secrets/settings from Miyar Settings → site_config → env."""
	cfg: dict[str, Any] = {}
	s = None
	try:
		if frappe.db.exists("DocType", "Miyar Settings"):
			s = frappe.get_single("Miyar Settings")
	except Exception:
		s = None

	def _get(field: str, conf_key: str | None = None, env_key: str | None = None, default=None):
		val = None
		if s is not None and getattr(s, "meta", None) and s.meta.has_field(field):
			val = getattr(s, field, None)
		if not val and conf_key:
			val = frappe.conf.get(conf_key)
		if not val and env_key:
			import os

			val = os.environ.get(env_key)
		return val if val not in (None, "") else default

	cfg["openrouter_api_key"] = _get("openrouter_api_key", "miyar_openrouter_api_key", "OPENROUTER_API_KEY", "")
	cfg["openrouter_base_url"] = _get("openrouter_base_url", "miyar_openrouter_base_url", "OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")
	cfg["openrouter_model"] = _get("openrouter_model", "miyar_openrouter_model", "OPENROUTER_MODEL", "openai/gpt-5.6-sol")
	cfg["openrouter_pdf_engine"] = _get("openrouter_pdf_engine", "miyar_openrouter_pdf_engine", "OPENROUTER_PDF_ENGINE", "native")
	cfg["openrouter_timeout_seconds"] = int(_get("openrouter_timeout_seconds", "miyar_openrouter_timeout", "OPENROUTER_TIMEOUT_SECONDS", 180) or 180)
	cfg["cloud_provider"] = _get("cloud_provider", "miyar_cloud_provider", "CLOUD_PROVIDER", "openrouter")
	cfg["cloud_input_mode"] = _get("cloud_input_mode", "miyar_cloud_input_mode", "CLOUD_INPUT_MODE", "auto")
	cfg["cloud_fast"] = cint_bool(_get("cloud_fast", "miyar_cloud_fast", "CLOUD_FAST", 1))
	cfg["cloud_skip_arabic_repair"] = cint_bool(_get("cloud_skip_arabic_repair", "miyar_cloud_skip_arabic_repair", "CLOUD_SKIP_ARABIC_REPAIR", 1))
	cfg["cloud_max_report_chars"] = int(_get("cloud_max_report_chars", None, "CLOUD_MAX_REPORT_CHARS", 35000) or 35000)
	cfg["local_provider"] = _get("local_provider", "miyar_local_provider", "LOCAL_PROVIDER", "lmstudio")
	cfg["local_base_url"] = _get("local_base_url", "miyar_local_base_url", "LOCAL_BASE_URL", "http://127.0.0.1:1234/v1")
	cfg["local_model"] = _get("local_model", "miyar_local_model", "LOCAL_MODEL", "ido-qwen38")
	return cfg


def cint_bool(v) -> bool:
	if isinstance(v, bool):
		return v
	if isinstance(v, (int, float)):
		return bool(v)
	return str(v or "").strip().lower() in {"1", "true", "yes", "on"}


def engine_health() -> dict[str, Any]:
	dual_core.apply_runtime_config(load_engine_config())
	return dual_core.get_health()


def analyze_pdf_bytes(content: bytes, filename: str, profile: str, mode: str = "cloud") -> dict[str, Any]:
	dual_core.apply_runtime_config(load_engine_config())
	return dual_core.analyze_bytes(content, filename, profile, mode)


def list_profiles() -> list[str]:
	return list(dual_core.PROFILE_MAP.keys())
