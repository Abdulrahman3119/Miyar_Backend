# Copyright (c) 2026, Miyar and contributors
# License: MIT. See LICENSE

"""Shape Frappe documents into the React store's types."""

from __future__ import annotations

import json

import frappe

from miyar.constants import ADMIN_ROLES, ROLES
from miyar.utils.org import get_org_user, is_principal

ROLE_ORDER = (
	(ROLES["admin"], "admin"),
	(ROLES["support"], "support"),
	(ROLES["supervisor"], "supervisor"),
	(ROLES["lab_principal"], "lab"),
	(ROLES["lab_employee"], "lab"),
	(ROLES["consultant_principal"], "consultant"),
	(ROLES["consultant_employee"], "consultant"),
	(ROLES["contractor_principal"], "contractor"),
	(ROLES["contractor_employee"], "contractor"),
	(ROLES["visitor"], "visitor"),
)

GROUP_TO_CATEGORY = {
	"اختبارات التربة": "soil",
	"اختبارات الإسفلت": "asphalt",
	"اختبارات الخرسانة": "concrete",
	"اختبارات الركام": "aggregate",
}

PRIORITY_AR = {"normal": "عادية", "high": "عالية", "critical": "حرجة"}
METHOD_ORG = {"ASTM": "ASTM", "AASHTO": "AASHTO", "BS": "BS", "SBC": "SBC", "IP": "IP", "ISO": "ISO"}


def frontend_role(roles: list[str] | None = None) -> str:
	roles = roles or frappe.get_roles()
	role_set = set(roles)
	# Desk System Manager / Administrator → portal admin (no Miyar role required)
	if frappe.session.user == "Administrator" or role_set & ADMIN_ROLES:
		return "admin"
	for frappe_role, front in ROLE_ORDER:
		if frappe_role in role_set:
			return front
	return "visitor"


def session_user():
	user = frappe.session.user
	if not user or user == "Guest":
		return None
	ou = get_org_user(user)
	org = None
	if ou:
		org = frappe.db.get_value(
			"Organization",
			ou.organization,
			["name", "organization_name", "organization_type"],
			as_dict=True,
		)
	info = frappe.db.get_value("User", user, ["full_name", "mobile_no", "last_login"], as_dict=True) or {}
	position = "principal" if (ou and ou.position == "Principal") or is_principal(user) else "employee"
	return {
		"id": user,
		"name": info.get("full_name") or user,
		"role": frontend_role(),
		"position": position,
		"orgId": org.name if org else "",
		"orgName": (org.organization_name if org else "") or "",
		"mobile": info.get("mobile_no") or "",
		"canDelegate": bool(ou.can_delegate) if ou else position == "principal",
		"lastLogin": str(info.get("last_login")) if info.get("last_login") else None,
	}


def _specialty_labels(org_name: str) -> list[str]:
	rows = frappe.get_all(
		"Organization Specialty",
		filters={"parent": org_name},
		fields=["specialty"],
	)
	out = []
	for row in rows:
		label = frappe.db.get_value("Organization Specialty Def", row.specialty, "label_ar") or row.specialty
		out.append(label)
	return out


def _saac(org_name: str):
	row = frappe.get_all(
		"SAAC Accreditation",
		filters={"parent": org_name},
		fields=["saac_number", "scope", "expires_on"],
		limit=1,
	)
	if not row:
		return None
	r = row[0]
	return {"number": r.saac_number, "scope": r.scope or "", "expires": str(r.expires_on or "")}


def _org_kpis(row) -> list[dict]:
	get = row.get if hasattr(row, "get") else lambda key: getattr(row, key, None)
	kpis = []
	if get("on_time"):
		kpis.append({"label": "التسليم في الموعد", "value": f"{float(get('on_time') or 0):g}%"})
	if get("auto_approvals"):
		kpis.append({"label": "اعتماد تلقائي", "value": str(int(get("auto_approvals") or 0))})
	if get("employee_count"):
		kpis.append({"label": "عدد العاملين", "value": str(int(get("employee_count") or 0))})
	if get("since_year"):
		kpis.append({"label": "سنة التأسيس", "value": str(int(get("since_year") or 0))})
	return kpis


def organization_payload(row) -> dict:
	name = row.name if hasattr(row, "name") else row.get("name")
	org_type = row.organization_type if hasattr(row, "organization_type") else row.get("organization_type")
	code = frappe.db.get_value("Organization Type", org_type, "code") or org_type
	saac = _saac(name)
	city = row.territory if hasattr(row, "territory") else row.get("territory") or ""
	region = (frappe.db.get_value("Territory", city, "parent_territory") or "") if city else ""
	return {
		"id": name,
		"type": code,
		"name": row.organization_name if hasattr(row, "organization_name") else row.get("organization_name"),
		"cr": row.cr if hasattr(row, "cr") else row.get("cr") or "",
		"city": city,
		"region": region,
		"district": (row.district if hasattr(row, "district") else row.get("district")) or "",
		"about": frappe.utils.strip_html(row.about or "") if hasattr(row, "about") else frappe.utils.strip_html(row.get("about") or ""),
		"specialties": _specialty_labels(name),
		"phone": row.phone if hasattr(row, "phone") else row.get("phone") or "",
		"email": row.email if hasattr(row, "email") else row.get("email") or "",
		"website": (row.website if hasattr(row, "website") else row.get("website")) or "",
		"address": (row.address_html if hasattr(row, "address_html") else row.get("address_html")) or "",
		"rating": float(row.rating or 0) if hasattr(row, "rating") else float(row.get("rating") or 0),
		"reviews": int(row.reviews or 0) if hasattr(row, "reviews") else int(row.get("reviews") or 0),
		"active": bool(row.active if hasattr(row, "active") else row.get("active")),
		"visible": (row.get("directory_status") if hasattr(row, "get") else getattr(row, "directory_status", None))
		== "STS04",
		"featured": bool(row.featured if hasattr(row, "featured") else row.get("featured")),
		"saac": saac,
		"license": row.license if hasattr(row, "license") else row.get("license") or "",
		"since": str(row.since_year or "") if hasattr(row, "since_year") else str(row.get("since_year") or ""),
		"employees": int(row.employee_count or 0) if hasattr(row, "employee_count") else int(row.get("employee_count") or 0),
		"onTime": float(row.on_time or 0) if hasattr(row, "on_time") else float(row.get("on_time") or 0),
		"autoApprovals": int(row.auto_approvals or 0) if hasattr(row, "auto_approvals") else int(row.get("auto_approvals") or 0),
		"kpis": _org_kpis(row),
		"logo": row.logo if hasattr(row, "logo") else row.get("logo"),
	}


def list_organizations(limit=500, include_hidden=False) -> list[dict]:
	filters = {} if include_hidden else {"active": 1, "directory_status": "STS04"}
	rows = frappe.get_all(
		"Organization",
		filters=filters,
		fields=[
			"name",
			"organization_name",
			"organization_type",
			"cr",
			"territory",
			"district",
			"directory_status",
			"about",
			"phone",
			"email",
			"website",
			"address_html",
			"logo",
			"rating",
			"reviews",
			"featured",
			"active",
			"license",
			"since_year",
			"employee_count",
			"on_time",
			"auto_approvals",
		],
		limit_page_length=int(limit),
		order_by="rating desc, organization_name",
		ignore_permissions=True,
	)
	return [organization_payload(r) for r in rows]


def _method_payload(code: str) -> dict:
	row = frappe.db.get_value("Test Method", code, ["code", "method_name", "method_body"], as_dict=True) or {}
	body = row.get("method_body") or ""
	org = METHOD_ORG.get(body, body if body in METHOD_ORG else "ASTM")
	return {"code": row.get("code") or code, "name": row.get("method_name") or code, "org": org}


def list_reference_tests() -> list[dict]:
	rows = frappe.get_all(
		"Reference Test",
		filters={"is_active": 1},
		fields=["name", "code", "test_name_ar", "test_name_en", "item_group", "allow_external_report", "is_active", "is_geotech"],
		order_by="code",
		limit_page_length=200,
	)
	out = []
	for row in rows:
		methods = frappe.get_all("Reference Test Method", filters={"parent": row.name}, pluck="test_method")
		units = frappe.get_all("Reference Test UOM", filters={"parent": row.name}, pluck="uom")
		fields = frappe.get_all(
			"Reference Test Result Field",
			filters={"parent": row.name},
			fields=["field_key", "label_ar", "uom"],
			order_by="sort_order",
		)
		out.append(
			{
				"id": row.code or row.name,
				"nameAr": row.test_name_ar,
				"nameEn": row.test_name_en,
				"category": GROUP_TO_CATEGORY.get(row.item_group, "soil"),
				"allowExternalReport": bool(row.allow_external_report),
				"active": bool(row.is_active),
				"isGeotech": bool(row.is_geotech),
				"methods": [_method_payload(m) for m in methods if m],
				"units": units,
				"resultFields": [{"key": f.field_key, "label": f.label_ar, "unit": f.uom or ""} for f in fields],
			}
		)
	return out


def _ref_code(name: str) -> str:
	return frappe.db.get_value("Reference Test", name, "code") or name


def list_catalog(lab=None, public_only=False) -> list[dict]:
	filters = {}
	if lab:
		filters["lab"] = lab
	if public_only:
		filters["status"] = "STS01"
	rows = frappe.get_all(
		"Lab Catalog Item",
		filters=filters,
		fields=["name", "lab", "reference_test", "uom", "base_price", "sla_days", "status"],
		limit_page_length=500,
	)
	out = []
	for row in rows:
		methods = frappe.get_all("Catalog Method", filters={"parent": row.name}, pluck="test_method")
		out.append(
			{
				"id": row.name,
				"labId": row.lab,
				"refTestId": _ref_code(row.reference_test),
				"unit": row.uom,
				"methods": methods,
				"basePrice": float(row.base_price or 0),
				"sla": int(row.sla_days or 0),
				"status": row.status,
			}
		)
	return out


def _slot(row) -> dict:
	from miyar.utils.timefmt import format_hhmm

	return {
		"date": str(row.slot_date or ""),
		"from": format_hhmm(row.from_time),
		"to": format_hhmm(row.to_time),
	}


def _parse_json(value):
	if not value:
		return None
	if isinstance(value, (dict, list)):
		return value
	try:
		return json.loads(value)
	except Exception:
		return None


def request_payload(name: str) -> dict:
	doc = frappe.get_doc("Test Request", name)
	lines = frappe.get_all(
		"Test Line",
		filters={"test_request": name},
		fields=[
			"name",
			"reference_test",
			"test_method",
			"status",
			"price",
			"sla_days",
			"started_at",
			"submitted_at",
			"decided_at",
			"execution_deadline_at",
			"consultant_deadline_at",
			"auto_approved",
			"delay_hours",
			"notes",
			"reject_reason",
			"sample_id",
			"sample_depth",
			"technician",
			"sample_received_at",
			"geo_verified",
			"geo_distance_m",
			"contractor_confirmed",
			"contractor_confirmed_at",
			"lab_temperature_c",
			"lab_humidity_pct",
			"report_file",
			"delegate",
		],
	)
	tests = []
	for line in lines:
		values = frappe.get_all(
			"Test Result Value",
			filters={"parent": line.name},
			fields=["field_key", "label_ar", "uom", "value", "limit_text", "compliance"],
			order_by="idx",
		)
		specimen = frappe.get_all(
			"Test Specimen Value",
			filters={"parent": line.name},
			fields=["field_key", "label_ar", "uom", "value"],
			order_by="idx",
		)
		equipment = frappe.get_all("Test Equipment Use", filters={"parent": line.name}, pluck="asset")
		photos = frappe.get_all("Test Photo Link", filters={"parent": line.name}, pluck="photo")
		sample = None
		if line.sample_id:
			sample = {
				"id": line.sample_id,
				"depth": float(line.sample_depth or 0),
				"technician": frappe.db.get_value("User", line.technician, "full_name")
				if line.technician
				else "",
				"receivedAt": str(line.sample_received_at) if line.sample_received_at else None,
				"geoVerified": bool(line.geo_verified),
				"geoDistance": float(line.geo_distance_m or 0) or None,
				"confirmedByContractor": bool(line.contractor_confirmed),
				"confirmedAt": str(line.contractor_confirmed_at) if line.contractor_confirmed_at else None,
			}
		tests.append(
			{
				"id": line.name,
				"refTestId": _ref_code(line.reference_test),
				"method": line.test_method or "",
				"price": float(line.price or 0),
				"sla": int(line.sla_days or 0),
				"status": line.status,
				"startedAt": str(line.started_at) if line.started_at else None,
				"submittedAt": str(line.submitted_at) if line.submitted_at else None,
				"decidedAt": str(line.decided_at) if line.decided_at else None,
				"executionDeadlineAt": str(line.execution_deadline_at) if line.execution_deadline_at else None,
				"deadlineAt": str(line.consultant_deadline_at) if line.consultant_deadline_at else None,
				"autoApproved": bool(line.auto_approved),
				"delayHours": float(line.delay_hours or 0) or None,
				"notes": line.notes,
				"rejectReason": line.reject_reason,
				"sample": sample,
				"result": {row.field_key: row.value for row in values if row.value is not None},
				"resultFields": [
					{
						"key": row.field_key,
						"label": row.label_ar or row.field_key,
						"unit": row.uom or "",
						"value": row.value,
						"limit": row.limit_text or "",
						"compliance": row.compliance or None,
					}
					for row in values
				],
				"specimen": {row.field_key: row.value for row in specimen if row.value is not None},
				"equipment": [e for e in equipment if e],
				"photos": [p for p in photos if p],
				"lab": {
					"temperature": float(line.lab_temperature_c or 0) or None,
					"humidity": float(line.lab_humidity_pct or 0) or None,
				},
				"report": (
					{
						"name": line.report_file.split("/")[-1],
						"size": "",
						"file": line.report_file,
					}
					if line.report_file
					else None
				),
				"delegateId": line.delegate or None,
			}
		)
	slots = [_slot(s) for s in (doc.slots or [])]
	chosen = None
	if doc.chosen_slot_date:
		from miyar.utils.timefmt import format_hhmm

		chosen = {
			"date": str(doc.chosen_slot_date),
			"from": format_hhmm(doc.chosen_slot_from),
			"to": format_hhmm(doc.chosen_slot_to),
		}
	snap = (doc.rules_snapshot or [None])[0]
	history = [
		{
			"id": f"{doc.name}-h{row.idx}",
			"at": str(row.at) if row.at else None,
			"actor": row.actor or "",
			"actorRole": row.actor_role or "",
			"action": row.action or "",
			"detail": row.detail or None,
		}
		for row in (doc.history or [])
	]
	attachments = [
		{"name": row.file_name or (row.file or "").split("/")[-1], "size": row.file_size or "", "file": row.file}
		for row in (doc.attachments or [])
	]
	return {
		"id": doc.name,
		"contractId": doc.service_contract or "",
		"contractorId": doc.contractor,
		"labId": doc.lab,
		"consultantId": doc.consultant,
		"project": doc.project_name or doc.name,
		"service": doc.service_type or "standard",
		"category": GROUP_TO_CATEGORY.get(doc.category, None) if doc.category else None,
		"status": doc.status,
		"createdAt": str(doc.creation),
		"submittedAt": str(doc.submitted_at) if doc.submitted_at else None,
		"labDeadlineAt": str(doc.lab_deadline_at) if doc.lab_deadline_at else None,
		"city": doc.city,
		"priority": PRIORITY_AR.get(doc.priority, doc.priority),
		"slots": slots,
		"chosenSlot": chosen,
		"location": doc.location or "",
		"notes": doc.notes,
		"tests": tests,
		"history": history,
		"attachments": attachments,
		"geo": {"lat": float(doc.geo_lat or 0), "lng": float(doc.geo_lng or 0)}
		if doc.geo_lat or doc.geo_lng
		else None,
		"delegateId": doc.delegate or None,
		"parentRequestId": doc.parent_request,
		"retestOf": doc.retest_of,
		"rejectReason": doc.reject_reason,
		"studyId": doc.study,
		"rules": {
			"labDecisionHours": int(snap.lab_decision_hours or 0),
			"consultantDecisionHours": int(snap.consultant_decision_hours or 0),
			"vat": float(snap.vat_rate or 0),
			"minLeadHours": int(snap.min_lead_hours or 0),
			"geofenceMeters": float(snap.geofence_meters or 0),
			"maxTestsPerRequest": int(snap.max_tests_per_request or 0),
			"proposedSlots": int(snap.proposed_slots or 0),
		}
		if snap
		else None,
	}


def list_requests_payload(limit=200) -> list[dict]:
	names = frappe.get_list("Test Request", pluck="name", limit_page_length=int(limit), order_by="creation desc")
	return [request_payload(n) for n in names]


def settings_payload() -> dict:
	s = frappe.get_single("Miyar Settings")
	return {
		"maxTestsPerRequest": int(s.max_tests_per_request or 10),
		"proposedSlots": int(s.proposed_slots or 3),
		"minLeadHours": int(s.min_lead_hours or 48),
		"labDecisionHours": int(s.lab_decision_hours or 12),
		"consultantDecisionHours": int(s.consultant_decision_hours or 48),
		"minBoreholeDepth": int(s.min_borehole_depth or 10),
		"geofenceMeters": int(s.geofence_meters or 3),
		"vat": float(s.vat_rate or 15),
		"labTimeoutAction": "expire" if (s.lab_timeout_action or "Expire") == "Expire" else "none",
		"enginePolicy": s.engine_policy or "screen-then-cloud",
		"autoApproveConsultant": bool(s.auto_approve_consultant),
		"quoteValidityDays": int(s.quote_validity_days or 14),
		"invoiceDueDays": int(s.invoice_due_days or 30),
		"sessionIdleMinutes": int(s.session_idle_minutes or 30),
		"saacExpiryWarnDays": int(s.saac_expiry_warn_days or 60),
		"compliancePenalties": {
			"move": float(s.compliance_move_penalty_pct or 0),
			"addedBorehole": float(s.compliance_added_bh_penalty_pct or 0),
		},
		"sampleRetentionDays": {
			"soil": int(s.sample_retention_soil_days or 0),
			"concrete": int(s.sample_retention_concrete_days or 0),
		},
		"archiveCapacity": int(s.archive_capacity or 0),
		"ratingDimensions": [
			{"key": row.dimension_key, "label": row.label_ar or row.dimension_key, "weight": float(row.weight or 0)}
			for row in (s.rating_dimensions or [])
		],
		"engineCost": _parse_json(s.engine_cloud_cost_ref) or {},
	}


def org_users(organization: str | None) -> list[dict]:
	if not organization:
		return []
	rows = frappe.get_all(
		"Organization User",
		filters={"organization": organization, "is_active": 1},
		fields=["user", "position", "can_delegate"],
	)
	out = []
	org_name = frappe.db.get_value("Organization", organization, "organization_name")
	org_type = frappe.db.get_value("Organization", organization, "organization_type")
	type_code = frappe.db.get_value("Organization Type", org_type, "code") or org_type
	for row in rows:
		info = frappe.db.get_value("User", row.user, ["full_name", "mobile_no", "last_login"], as_dict=True) or {}
		role = type_code if type_code in ("contractor", "lab", "consultant", "supervisor") else "admin"
		if type_code == "ops":
			roles = frappe.get_roles(row.user)
			role = "admin" if ROLES["admin"] in roles else "support"
		out.append(
			{
				"id": row.user,
				"name": info.get("full_name") or row.user,
				"role": role,
				"position": "principal" if row.position == "Principal" else "employee",
				"orgId": organization,
				"orgName": org_name or "",
				"mobile": info.get("mobile_no") or "",
				"canDelegate": bool(row.can_delegate),
				"lastLogin": str(info.get("last_login")) if info.get("last_login") else None,
			}
		)
	return out
