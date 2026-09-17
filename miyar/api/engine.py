# Copyright (c) 2026, Miyar and contributors
# License: MIT. See LICENSE

"""Miyar SPA ↔ embedded dual AI engine (in-process, no external FastAPI)."""

from __future__ import annotations

import json
import time
from typing import Any

import frappe
from frappe.utils import now_datetime
from frappe.utils.file_manager import get_file_path

from miyar.api.common import require_login
from miyar.engine.service import analyze_pdf_bytes, engine_health, list_profiles, load_engine_config
from miyar.utils.audit import log_event

_HEALTH_CACHE: dict[str, Any] = {"at": 0.0, "payload": None}
_HEALTH_TTL = 45.0


def _read_frappe_file(file_url: str, fallback_name: str = "report.pdf") -> tuple[bytes, str]:
	"""Load bytes from a Frappe File URL — works for local and S3-backed files."""
	name = frappe.db.get_value("File", {"file_url": file_url}, "name")
	if name:
		doc = frappe.get_doc("File", name)
		raw = doc.get_content()
		content = raw.encode("utf-8") if isinstance(raw, str) else raw
		return content, doc.file_name or fallback_name
	path = get_file_path(file_url)
	with open(path, "rb") as f:
		return f.read(), file_url.rsplit("/", 1)[-1] or fallback_name


def _profile_link(profile: str) -> str | None:
	if not profile:
		return None
	if frappe.db.exists("Engine Profile", profile):
		return profile
	name = frappe.db.get_value("Engine Profile", {"code": profile}, "name")
	return name


def _extract_overall(payload: dict) -> str | None:
	for key in ("cloud", "local"):
		run = payload.get(key) or {}
		result = run.get("result") if isinstance(run, dict) else None
		if isinstance(result, dict) and result.get("overall_status"):
			return result["overall_status"]
	return None


def _usage_totals(payload: dict) -> tuple[float, int]:
	cost = 0.0
	tokens = 0
	for key in ("cloud", "local"):
		run = payload.get(key) or {}
		usage = run.get("usage") if isinstance(run, dict) else None
		if isinstance(usage, dict):
			cost += float(usage.get("cost") or 0)
			tokens += int(usage.get("total_tokens") or 0)
	return cost, tokens


def _persist_run(
	*,
	profile: str,
	mode: str,
	payload: dict,
	source_file: str | None = None,
	test_request: str | None = None,
	study: str | None = None,
) -> str | None:
	try:
		run0 = payload.get("cloud") or payload.get("local") or {}
		safety = ((run0.get("result") or {}) if isinstance(run0, dict) else {}).get("_engineering_safety") or {}
		cost, tokens = _usage_totals(payload)
		doc = frappe.get_doc(
			{
				"doctype": "Engine Run",
				"profile": _profile_link(profile),
				"mode": mode,
				"overall_status": _extract_overall(payload),
				"ran_at": now_datetime(),
				"actor": frappe.session.user,
				"test_request": test_request if test_request and frappe.db.exists("Test Request", test_request) else None,
				"study": study if study and frappe.db.exists("Geotechnical Study", study) else None,
				"scope_gate_stopped": 1 if payload.get("scope_gate_stopped") else 0,
				"effective_for_production": 1 if safety.get("effective_for_production") else 0,
				"cloud_path": json.dumps(payload.get("cloud"), ensure_ascii=False) if payload.get("cloud") else None,
				"local_path": json.dumps(payload.get("local"), ensure_ascii=False) if payload.get("local") else None,
				"comparison": json.dumps(payload.get("comparison"), ensure_ascii=False) if payload.get("comparison") else None,
				"result": json.dumps(payload, ensure_ascii=False),
				"cost": cost,
				"tokens": tokens,
				"policy_version": safety.get("guardrails_version") or payload.get("policy_version"),
				"control_pack_version": safety.get("control_pack_version") or None,
				"route_used": mode,
				"source_file": source_file,
			}
		)
		doc.flags.ignore_permissions = True
		doc.insert(ignore_permissions=True)
		try:
			log_event(
				"تشغيل المحرك الذكي",
				entity=doc,
				organization=frappe.db.get_value("Test Request", test_request, "lab") if test_request else None,
				detail=f"{profile} · {mode} · {_extract_overall(payload) or '—'}",
			)
		except Exception:
			pass
		return doc.name
	except Exception:
		frappe.log_error(title="Miyar engine persist failed")
		return None


@frappe.whitelist()
def config():
	"""Frontend bootstrap — engine is embedded in Miyar (no external base URL required)."""
	require_login()
	cfg = load_engine_config()
	return {
		"embedded": True,
		"proxy": True,
		"profiles": list_profiles(),
		"model": cfg.get("openrouter_model"),
		"healthMethod": "miyar.api.engine.health",
		"analyzeMethod": "miyar.api.engine.analyze",
	}


@frappe.whitelist()
def health():
	"""In-process engine health (cached briefly). Never hard-fails the SPA."""
	require_login()
	now = time.monotonic()
	cached = _HEALTH_CACHE.get("payload")
	if cached is not None and (now - float(_HEALTH_CACHE.get("at") or 0)) < _HEALTH_TTL:
		return cached
	try:
		payload = engine_health()
	except Exception as e:
		frappe.log_error(title="Miyar engine health failed")
		from miyar.engine.service import _degraded_health, load_engine_config

		payload = _degraded_health(str(e), load_engine_config())
	_HEALTH_CACHE["at"] = now
	_HEALTH_CACHE["payload"] = payload
	return payload


@frappe.whitelist()
def diagnose():
	"""Operator checklist for production — why the engine badge is red."""
	require_login()
	if "System Manager" not in frappe.get_roles():
		frappe.throw("التشخيص متاح لمدير النظام فقط.")
	cfg = load_engine_config()
	key = (cfg.get("openrouter_api_key") or "").strip()
	checks = []
	try:
		import httpx  # noqa: F401

		checks.append({"id": "httpx", "ok": True, "detail": "مثبّت"})
	except Exception as e:
		checks.append({"id": "httpx", "ok": False, "detail": str(e)})
	try:
		import jsonschema  # noqa: F401

		checks.append({"id": "jsonschema", "ok": True, "detail": "مثبّت"})
	except Exception as e:
		checks.append({"id": "jsonschema", "ok": False, "detail": str(e)})
	try:
		import fitz  # noqa: F401

		checks.append({"id": "pymupdf", "ok": True, "detail": "مثبّت"})
	except Exception as e:
		checks.append({"id": "pymupdf", "ok": False, "detail": str(e)})
	try:
		from miyar.engine import dual_core  # noqa: F401

		checks.append({"id": "dual_core", "ok": True, "detail": "يُحمَّل"})
	except Exception as e:
		checks.append({"id": "dual_core", "ok": False, "detail": str(e)})
	checks.append(
		{
			"id": "openrouter_key",
			"ok": bool(key),
			"detail": "موجود" if key else "ناقص — أضِف miyar_openrouter_api_key في site_config أو Miyar Settings",
		}
	)
	checks.append({"id": "openrouter_model", "ok": True, "detail": cfg.get("openrouter_model") or "—"})
	h = engine_health()
	return {
		"ok": all(c["ok"] for c in checks if c["id"] != "local"),
		"checks": checks,
		"health": h,
		"hint": "bench setup requirements && ./env/bin/pip install httpx jsonschema pymupdf && bench --site <site> set-config miyar_openrouter_api_key \"<KEY>\" && bench --site <site> clear-cache",
	}


@frappe.whitelist()
def analyze(profile=None, mode="cloud", file_url=None, test_request=None, study=None):
	"""Run the embedded dual AI engine on an uploaded PDF or existing file_url."""
	require_login()
	profile = profile or frappe.form_dict.get("profile")
	mode = mode or frappe.form_dict.get("mode") or "cloud"
	file_url = file_url or frappe.form_dict.get("file_url")
	test_request = test_request or frappe.form_dict.get("test_request")
	study = study or frappe.form_dict.get("study")

	if not profile:
		frappe.throw("ملف التقييم مطلوب.")
	if mode not in {"cloud", "local", "compare"}:
		frappe.throw("نمط التحليل غير معروف.")

	filename = "report.pdf"
	content: bytes | None = None

	uploaded = None
	if getattr(frappe.request, "files", None):
		uploaded = frappe.request.files.get("file")
	if uploaded and getattr(uploaded, "filename", None):
		filename = uploaded.filename
		content = uploaded.stream.read() if hasattr(uploaded, "stream") else uploaded.read()

	if content is None and file_url:
		try:
			content, filename = _read_frappe_file(file_url, fallback_name=filename)
		except Exception as e:
			frappe.throw(f"تعذّر قراءة الملف المرفق: {e}")

	if not content:
		frappe.throw("ارفع ملف PDF للتحليل.")

	try:
		payload = analyze_pdf_bytes(content, filename, profile, mode)
	except ValueError as e:
		frappe.throw(str(e))
	except Exception as e:
		frappe.throw(f"تعذّر إجراء التحليل: {e}")

	if not isinstance(payload, dict):
		frappe.throw("رد المحرك غير صالح.")

	run_name = _persist_run(
		profile=profile,
		mode=mode,
		payload=payload,
		source_file=file_url,
		test_request=test_request,
		study=study,
	)
	payload = {**payload, "engine_run": run_name, "embedded": True}
	return payload


def _parse_json_field(val):
	if val is None or val == "":
		return None
	if isinstance(val, (dict, list)):
		return val
	try:
		return json.loads(val)
	except Exception:
		return None


@frappe.whitelist(methods=["GET", "POST"])
def list_runs(limit=50, profile=None, mode=None):
	"""Previous Engine Run rows for the SPA history panel."""
	require_login()
	limit = min(cint_limit(limit), 100)
	filters = {}
	if profile:
		filters["profile"] = profile
	if mode in {"cloud", "local", "compare"}:
		filters["mode"] = mode
	rows = frappe.get_list(
		"Engine Run",
		filters=filters or None,
		fields=[
			"name",
			"profile",
			"mode",
			"overall_status",
			"ran_at",
			"actor",
			"test_request",
			"study",
			"scope_gate_stopped",
			"cost",
			"tokens",
			"route_used",
			"source_file",
			"creation",
		],
		order_by="ran_at desc, creation desc",
		limit_page_length=limit,
	)
	return {"runs": rows, "count": len(rows)}


def cint_limit(v) -> int:
	try:
		return max(1, int(v or 50))
	except Exception:
		return 50


@frappe.whitelist(methods=["GET", "POST"])
def get_run(name=None):
	"""Full stored analysis payload for one Engine Run."""
	require_login()
	name = name or frappe.form_dict.get("name")
	if not name:
		frappe.throw("معرّف التشغيل مطلوب.")
	if not frappe.db.exists("Engine Run", name):
		frappe.throw("تشغيل المحرك غير موجود.")
	doc = frappe.get_doc("Engine Run", name)
	payload = _parse_json_field(doc.result) or {}
	if not isinstance(payload, dict):
		payload = {"raw": payload}
	# Prefer structured path fields when result blob is incomplete
	if not payload.get("cloud") and doc.cloud_path:
		payload["cloud"] = _parse_json_field(doc.cloud_path)
	if not payload.get("local") and doc.local_path:
		payload["local"] = _parse_json_field(doc.local_path)
	if not payload.get("comparison") and doc.comparison:
		payload["comparison"] = _parse_json_field(doc.comparison)
	payload.setdefault("mode", doc.mode)
	payload.setdefault("profile", doc.profile)
	payload["engine_run"] = doc.name
	payload["meta"] = {
		"name": doc.name,
		"ran_at": str(doc.ran_at) if doc.ran_at else None,
		"actor": doc.actor,
		"overall_status": doc.overall_status,
		"cost": doc.cost,
		"tokens": doc.tokens,
		"source_file": doc.source_file,
		"test_request": doc.test_request,
		"study": doc.study,
		"scope_gate_stopped": bool(doc.scope_gate_stopped),
	}
	return payload


@frappe.whitelist()
def run(profile, mode="cloud", source_file=None, test_request=None, study=None, result=None):
	"""Store an advisory Engine Run without calling the model (manual/legacy)."""
	require_login()
	parsed = result
	if isinstance(result, str):
		try:
			parsed = json.loads(result)
		except Exception:
			parsed = {"raw": result}
	doc = frappe.get_doc(
		{
			"doctype": "Engine Run",
			"profile": _profile_link(profile),
			"mode": mode,
			"source_file": source_file,
			"test_request": test_request,
			"study": study,
			"actor": frappe.session.user,
			"ran_at": now_datetime(),
			"result": json.dumps(parsed, ensure_ascii=False) if not isinstance(parsed, str) else parsed,
			"overall_status": _extract_overall(parsed) if isinstance(parsed, dict) else None,
			"scope_gate_stopped": 1 if isinstance(parsed, dict) and parsed.get("scope_gate_stopped") else 0,
		}
	)
	doc.insert(ignore_permissions=True)
	return doc.as_dict()
