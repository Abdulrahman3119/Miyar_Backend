# Copyright (c) 2026, Miyar and contributors
# License: MIT. See LICENSE

"""Miyar-facing facade over the embedded dual_core engine."""

from __future__ import annotations

from typing import Any

import frappe


def load_engine_config() -> dict[str, Any]:
	"""Resolve secrets/settings from Miyar Settings → site_config → env."""
	cfg: dict[str, Any] = {}
	s = None
	try:
		if frappe.db.exists("DocType", "Miyar Settings"):
			s = frappe.get_single("Miyar Settings")
	except Exception:
		s = None

	def _field_val(field: str):
		if s is None or not getattr(s, "meta", None) or not s.meta.has_field(field):
			return None
		df = s.meta.get_field(field)
		if df and df.fieldtype == "Password":
			try:
				return s.get_password(field) or None
			except Exception:
				return None
		return getattr(s, field, None)

	def _get(field: str, conf_key: str | None = None, env_key: str | None = None, default=None):
		val = _field_val(field)
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


def _import_dual_core():
	try:
		from miyar.engine import dual_core

		return dual_core, None
	except Exception as e:
		return None, str(e)


def _degraded_health(error: str, cfg: dict[str, Any] | None = None) -> dict[str, Any]:
	cfg = cfg or {}
	key = (cfg.get("openrouter_api_key") or "").strip()
	return {
		"status": "degraded",
		"embedded": True,
		"error": error,
		"cloud": {
			"provider": cfg.get("cloud_provider") or "openrouter",
			"configured": bool(key),
			"model": cfg.get("openrouter_model") or "openai/gpt-5.6-sol",
			"base_url": cfg.get("openrouter_base_url") or "https://openrouter.ai/api/v1",
			"pdf_engine": cfg.get("openrouter_pdf_engine") or "native",
			"input_mode": cfg.get("cloud_input_mode") or "auto",
			"fast": cint_bool(cfg.get("cloud_fast", True)),
			"skip_arabic_repair": cint_bool(cfg.get("cloud_skip_arabic_repair", True)),
			"max_report_chars": int(cfg.get("cloud_max_report_chars") or 35000),
		},
		"local": {
			"provider": cfg.get("local_provider") or "lmstudio",
			"reachable": False,
			"model": cfg.get("local_model") or "",
			"base_url": cfg.get("local_base_url") or "",
			"thinking_enabled": False,
			"structured_mode": "prompt",
			"num_ctx": 0,
			"num_predict": 0,
			"evidence_chars": 0,
			"timeout_seconds": 0,
			"error": error,
			"pipeline": "v2",
			"v2_evidence_chars": 0,
			"v2_max_snippets": 0,
			"v2_force_json": True,
		},
		"policy_version": "embedded-unavailable",
		"meyar_engineering_controls": {
			"guardrails_loaded": False,
			"control_pack_loaded": False,
			"clause_registry_loaded": False,
			"control_pack_version": None,
			"clause_registry_version": None,
			"effective_for_production": False,
			"edition_gate": {"required": True, "reason": error, "on_unconfirmed": "NOT_EVALUABLE"},
		},
	}


def engine_health() -> dict[str, Any]:
	cfg = load_engine_config()
	dual_core, err = _import_dual_core()
	if err or dual_core is None:
		return _degraded_health(
			err or "تعذّر تحميل المحرك المدمج — ثبّت الاعتماديات: pip install httpx jsonschema pymupdf",
			cfg,
		)
	try:
		dual_core.apply_runtime_config(cfg)
		return dual_core.get_health()
	except Exception as e:
		return _degraded_health(str(e), cfg)


def analyze_pdf_bytes(content: bytes, filename: str, profile: str, mode: str = "cloud") -> dict[str, Any]:
	cfg = load_engine_config()
	dual_core, err = _import_dual_core()
	if err or dual_core is None:
		raise RuntimeError(
			err or "المحرك المدمج غير متاح. نفّذ: bench setup requirements && ./env/bin/pip install httpx jsonschema pymupdf"
		)
	if mode in {"cloud", "compare"} and not (cfg.get("openrouter_api_key") or "").strip():
		raise RuntimeError(
			"مفتاح OpenRouter غير مضبوط. أضِفه في Miyar Settings أو: bench --site <site> set-config miyar_openrouter_api_key \"<key>\""
		)
	dual_core.apply_runtime_config(cfg)
	return dual_core.analyze_bytes(content, filename, profile, mode)


def list_profiles() -> list[str]:
	dual_core, err = _import_dual_core()
	if err or dual_core is None:
		return [
			"الدراسة الجيوتقنية — منصة معيار",
			"الفحص والتقييم الإنشائي",
			"تقرير هندسي عام — نسخة العرض",
		]
	return list(dual_core.PROFILE_MAP.keys())
