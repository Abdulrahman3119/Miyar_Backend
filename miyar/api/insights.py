# Copyright (c) 2026, Miyar and contributors
# License: MIT. See LICENSE

"""Aggregates and reference content: the analytics the dashboards plot, the knowledge
base the study screens read, and the help centre.

The figures are counted from the operational documents on every boot — the client
plots what the database holds, never a series we typed in.
"""

from __future__ import annotations

from collections import defaultdict

import frappe
from frappe.utils import add_months, getdate, get_datetime, nowdate

from miyar.api.payload import GROUP_TO_CATEGORY, _ref_code

AR_MONTHS = (
	"يناير",
	"فبراير",
	"مارس",
	"أبريل",
	"مايو",
	"يونيو",
	"يوليو",
	"أغسطس",
	"سبتمبر",
	"أكتوبر",
	"نوفمبر",
	"ديسمبر",
)

GEOTECH_LABEL = "جيوتقنية"
OTHER_LABEL = "أخرى"


def _month_key(value) -> str:
	date = getdate(value)
	return f"{date.year}-{date.month:02d}"


def _month_label(key: str) -> str:
	year, month = key.split("-")
	return AR_MONTHS[int(month) - 1]


def _last_months(count=12) -> list[str]:
	today = getdate(nowdate())
	keys = []
	for back in range(count - 1, -1, -1):
		date = getdate(add_months(today, -back))
		keys.append(f"{date.year}-{date.month:02d}")
	return keys


def _group_label(reference_test: str | None) -> str | None:
	if not reference_test:
		return None
	group = frappe.db.get_value("Reference Test", reference_test, "item_group")
	return group if group in GROUP_TO_CATEGORY else None


def analytics() -> dict:
	requests = frappe.get_all(
		"Test Request",
		fields=["name", "creation", "status", "service_type", "city", "category", "lab", "contractor"],
		limit_page_length=0,
	)
	lines = frappe.get_all(
		"Test Line",
		fields=[
			"name",
			"test_request",
			"reference_test",
			"price",
			"auto_approved",
			"status",
			"submitted_at",
			"execution_deadline_at",
			"creation",
		],
		limit_page_length=0,
	)
	lines_by_request = defaultdict(list)
	for line in lines:
		lines_by_request[line.test_request].append(line)

	keys = _last_months()
	blank = {"requests": 0, "completed": 0, "geotech": 0, "rejected": 0, "auto": 0, "revenue": 0.0, "onTime": 0, "rated": 0}
	buckets = {key: dict(blank) for key in keys}

	category_mix: dict[str, int] = defaultdict(int)
	city_mix: dict[str, int] = defaultdict(int)
	city_category: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))

	geotech_service = frappe.db.get_value("Service Type", {"code": "geotech"}, "name") or "geotech"

	for request in requests:
		key = _month_key(request.creation)
		bucket = buckets.get(key)
		is_geotech = request.service_type == geotech_service
		if bucket:
			bucket["requests"] += 1
			if request.status == "STS15":
				bucket["completed"] += 1
			if request.status == "STS13":
				bucket["rejected"] += 1
			if is_geotech:
				bucket["geotech"] += 1
		city = request.city or OTHER_LABEL
		city_mix[city] += 1
		if is_geotech:
			category_mix[GEOTECH_LABEL] += 1
			city_category[city][GEOTECH_LABEL] += 1
		for line in lines_by_request.get(request.name, []):
			label = _group_label(line.reference_test)
			if label:
				category_mix[label] += 1
				city_category[city][label] += 1
			if bucket:
				if line.auto_approved:
					bucket["auto"] += 1
				if request.status in ("STS12", "STS14", "STS15"):
					bucket["revenue"] += float(line.price or 0)
				if line.submitted_at and line.execution_deadline_at:
					bucket["rated"] += 1
					if get_datetime(line.submitted_at) <= get_datetime(line.execution_deadline_at):
						bucket["onTime"] += 1

	monthly = []
	for key in keys:
		bucket = buckets[key]
		rated = bucket.pop("rated")
		on_time = bucket.pop("onTime")
		monthly.append(
			{
				"m": _month_label(key),
				"key": key,
				"requests": bucket["requests"],
				"completed": bucket["completed"],
				"geotech": bucket["geotech"],
				"rejected": bucket["rejected"],
				"auto": bucket["auto"],
				"revenue": round(bucket["revenue"], 2),
				"sla": round(on_time * 100 / rated) if rated else 100,
			}
		)

	orgs = frappe.get_all(
		"Organization", fields=["name", "creation", "organization_type"], limit_page_length=0
	)
	type_codes = {
		row.name: row.code
		for row in frappe.get_all("Organization Type", fields=["name", "code"], limit_page_length=0)
	}
	registrations = {key: {"labs": 0, "contractors": 0, "consultants": 0} for key in keys}
	for org in orgs:
		key = _month_key(org.creation)
		if key not in registrations:
			continue
		code = type_codes.get(org.organization_type)
		if code == "lab":
			registrations[key]["labs"] += 1
		elif code == "contractor":
			registrations[key]["contractors"] += 1
		elif code == "consultant":
			registrations[key]["consultants"] += 1

	city_ranked = sorted(city_mix.items(), key=lambda item: item[1], reverse=True)
	top_cities = city_ranked[:5]
	rest = sum(value for _, value in city_ranked[5:])
	city_series = [{"name": name, "value": value} for name, value in top_cities]
	if rest:
		city_series.append({"name": OTHER_LABEL, "value": rest})

	return {
		"monthly": monthly,
		"registrations": [
			{"m": _month_label(key), "key": key, **registrations[key]} for key in keys
		],
		"categoryMix": [
			{"name": name, "value": value}
			for name, value in sorted(category_mix.items(), key=lambda item: item[1], reverse=True)
		],
		"cityMix": city_series,
		"cityCategory": {city: dict(values) for city, values in city_category.items()},
		"totals": {
			"requests": len(requests),
			"tests": len(lines),
			"orgs": len(orgs),
			"studies": frappe.db.count("Geotechnical Study"),
		},
	}


def ref_limits() -> dict:
	rows = frappe.get_all(
		"Acceptance Limit",
		fields=["reference_test", "field_key", "rule_text", "reference_text"],
		limit_page_length=0,
	)
	out: dict[str, list[dict]] = defaultdict(list)
	for row in rows:
		out[_ref_code(row.reference_test)].append(
			{"key": row.field_key, "rule": row.rule_text or "", "ref": row.reference_text or ""}
		)
	return dict(out)


def knowledge() -> dict:
	active = frappe.db.get_value("Knowledge Version", {"status": "ساري"}, "name")
	table_21 = frappe.get_all(
		"SBC Table 21 Row",
		fields=[
			"name",
			"code",
			"label_ar",
			"floors_min",
			"floors_max",
			"built_area_min_m2",
			"built_area_max_m2",
			"base_count",
			"extra_per_m2",
			"count_cap",
			"depth_two_thirds_m",
			"depth_one_third_m",
			"is_special",
			"borehole_count_rule",
		],
		order_by="floors_min asc, built_area_min_m2 asc",
		limit_page_length=0,
	)
	formulas = []
	analytical = []
	recommendations = []
	manual = []
	triggers = []
	if active:
		formulas = frappe.get_all(
			"Formula Definition",
			filters={"parent": active},
			fields=["field_key", "label_ar", "formula", "unit", "input_schema"],
			order_by="idx",
		)
		analytical = frappe.get_all(
			"Analytical Field Def",
			filters={"parent": active},
			fields=["field_key", "label_ar", "source"],
			order_by="idx",
		)
		recommendations = frappe.get_all(
			"Recommendation Field Def",
			filters={"parent": active},
			fields=["field_key", "label_ar", "logic_notes"],
			order_by="idx",
		)
		manual = frappe.get_all(
			"Manual Analysis Field Def",
			filters={"parent": active},
			fields=["field_key", "label_ar", "options"],
			order_by="idx",
		)
		trigger_names = frappe.get_all("Knowledge Trigger", filters={"parent": active}, pluck="trigger")
		if trigger_names:
			triggers = frappe.get_all(
				"Engine Trigger Rule",
				filters={"name": ["in", trigger_names]},
				fields=["code", "label_ar", "condition_expr", "message_ar", "action", "optional_test"],
			)
	chemical = frappe.get_all(
		"Chemical Test Def",
		fields=[
			"code",
			"label_ar",
			"test_method",
			"limit_text",
			"uom",
			"is_mandatory",
			"matrix",
			"sabkha_requires_groundwater",
			"source_text",
			"exceedance_effect",
		],
		order_by="sort_order asc",
		limit_page_length=0,
	)
	mandatory = frappe.get_all(
		"Mandatory Sample Test Rule",
		fields=[
			"sample_kind",
			"reference_test",
			"test_method",
			"label_ar",
			"requires_attachment",
			"requires_value",
			"uom",
		],
		order_by="sort_order asc",
		limit_page_length=0,
	)
	return {
		"activeVersion": frappe.db.get_value("Knowledge Version", active, "version_code") if active else "",
		"table21": [
			{
				"code": row.code or row.name,
				"label": row.label_ar or "",
				"floorsMin": int(row.floors_min or 0),
				"floorsMax": int(row.floors_max or 0),
				"areaMin": float(row.built_area_min_m2 or 0),
				"areaMax": float(row.built_area_max_m2 or 0),
				"baseCount": int(row.base_count or 0),
				"extraPerM2": float(row.extra_per_m2 or 0),
				"countCap": int(row.count_cap or 0),
				"depthTwoThirds": float(row.depth_two_thirds_m or 0),
				"depthOneThird": float(row.depth_one_third_m or 0),
				"special": bool(row.is_special),
				"rule": row.borehole_count_rule or "",
			}
			for row in table_21
		],
		"formulas": [
			{
				"key": row.field_key,
				"label": row.label_ar or row.field_key,
				"formula": row.formula or "",
				"unit": row.unit or "",
				"inputs": frappe.parse_json(row.input_schema) if row.input_schema else [],
			}
			for row in formulas
		],
		"analyticalFields": [
			{"key": row.field_key, "label": row.label_ar or row.field_key, "source": row.source or ""}
			for row in analytical
		],
		"recommendationFields": [
			{"key": row.field_key, "label": row.label_ar or row.field_key, "notes": row.logic_notes or ""}
			for row in recommendations
		],
		"manualFields": [
			{
				"key": row.field_key,
				"label": row.label_ar or row.field_key,
				"options": [o.strip() for o in (row.options or "").split("\n") if o.strip()],
			}
			for row in manual
		],
		"triggers": [
			{
				"code": row.code,
				"label": row.label_ar or row.code,
				"condition": row.condition_expr or "",
				"message": row.message_ar or "",
				"action": row.action or "",
				"optionalTest": row.optional_test or "",
			}
			for row in triggers
		],
		"chemicalTests": [
			{
				"code": row.code,
				"label": row.label_ar or row.code,
				"method": row.test_method or "",
				"limit": row.limit_text or "",
				"unit": row.uom or "",
				"mandatory": bool(row.is_mandatory),
				"matrix": row.matrix or "soil",
				"needsGroundwater": bool(row.sabkha_requires_groundwater),
				"source": row.source_text or "",
				"effect": row.exceedance_effect or "",
			}
			for row in chemical
		],
		"mandatorySampleTests": [
			{
				"sampleKind": frappe.db.get_value("Sample Kind", row.sample_kind, "code") or row.sample_kind,
				"refTestId": _ref_code(row.reference_test) if row.reference_test else "",
				"method": row.test_method or "",
				"label": row.label_ar or "",
				"requiresAttachment": bool(row.requires_attachment),
				"requiresValue": bool(row.requires_value),
				"unit": row.uom or "",
			}
			for row in mandatory
		],
	}


def help_center() -> dict:
	guides = frappe.get_all(
		"Help Article",
		fields=["name", "slug", "title", "audience", "duration_minutes", "body"],
		order_by="sort_order asc, name asc",
		limit_page_length=0,
	)
	audience_code = {
		row.name: row.code
		for row in frappe.get_all("Organization Type", fields=["name", "code"], limit_page_length=0)
	}
	faqs = frappe.get_all(
		"FAQ Entry",
		fields=["name", "question", "answer", "roles"],
		order_by="sort_order asc",
		limit_page_length=0,
	)
	integrations = frappe.get_all(
		"Integration Endpoint",
		fields=["name", "code", "title", "status", "status_note", "last_checked"],
		order_by="name",
		limit_page_length=0,
	)
	links = frappe.get_all(
		"Useful Link", fields=["name", "title", "url"], order_by="sort_order asc", limit_page_length=0
	)
	ecc = frappe.get_all(
		"ECC Control Domain",
		fields=["name", "code", "title_ar", "total_controls", "implemented"],
		order_by="code",
		limit_page_length=0,
	)
	settings = frappe.get_single("Miyar Settings")
	replacements = {
		"lab_decision_hours": settings.lab_decision_hours,
		"consultant_decision_hours": settings.consultant_decision_hours,
		"min_borehole_depth": settings.min_borehole_depth,
		"min_lead_hours": settings.min_lead_hours,
	}

	def _fill(text: str) -> str:
		out = frappe.utils.strip_html(text or "")
		for key, val in replacements.items():
			out = out.replace("{{ " + key + " }}", str(val or "")).replace("{{" + key + "}}", str(val or ""))
		return out

	return {
		"guides": [
			{
				"id": row.slug or row.name,
				"title": row.title or "",
				"audience": audience_code.get(row.audience, "") if row.audience else "",
				"minutes": int(row.duration_minutes or 0),
				"body": frappe.utils.strip_html(row.body or ""),
			}
			for row in guides
		],
		"faqs": [
			{
				"id": row.name,
				"q": _fill(row.question or ""),
				"a": _fill(row.answer or ""),
				"roles": [r.strip() for r in (row.roles or "").split(",") if r.strip()],
			}
			for row in faqs
		],
		"integrations": [
			{
				"code": row.code or row.name,
				"title": row.title or "",
				"status": row.status or "",
				"note": row.status_note or "",
				"lastChecked": str(row.last_checked) if row.last_checked else None,
			}
			for row in integrations
		],
		"links": [{"title": row.title or "", "url": row.url or ""} for row in links],
		"ecc": [
			{
				"code": row.code or row.name,
				"title": row.title_ar or "",
				"total": int(row.total_controls or 0),
				"implemented": int(row.implemented or 0),
			}
			for row in ecc
		],
		"support": {
			"phone": settings.support_phone or "",
			"emergency": settings.support_field_emergency or "",
			"email": settings.support_email or "",
			"hours": settings.support_hours_text or "",
		},
	}
