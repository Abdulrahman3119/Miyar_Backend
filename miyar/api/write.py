# Copyright (c) 2026, Miyar and contributors
# License: MIT. See LICENSE

"""Client-shaped write API. The React store posts the same objects it hydrates."""

from __future__ import annotations

import json
import frappe
from frappe.utils import add_days, getdate, nowdate, now_datetime

from miyar.api.common import require_login
from miyar.api.payload import request_payload
from miyar.constants import ADMIN_ROLES, ORG_TYPE_TO_ROLES, ROLES, STS01, STS02, STS06
from miyar.utils.org import get_user_org, is_principal


def _parse(value):
	if isinstance(value, str):
		try:
			return json.loads(value)
		except Exception:
			return value
	return value


def _as_int(value, default=0):
	try:
		return int(value)
	except (TypeError, ValueError):
		return default


def _as_bool(value):
	if isinstance(value, bool):
		return value
	if isinstance(value, (int, float)):
		return bool(value)
	return str(value).strip().lower() in ("1", "true", "yes")


def _link(doctype: str, value, extra: dict | None = None):
	"""Resolve a Link value by name/code/label. Returns None when unresolved (never echo raw text)."""
	if not value:
		return None
	if not frappe.db.exists("DocType", doctype):
		return None
	if frappe.db.exists(doctype, value):
		return value
	meta = frappe.get_meta(doctype)
	if meta.has_field("code"):
		name = frappe.db.get_value(doctype, {"code": value}, "name")
		if name:
			return name
	if meta.has_field("label_ar"):
		name = frappe.db.get_value(doctype, {"label_ar": value}, "name")
		if name:
			return name
	if extra:
		name = frappe.db.get_value(doctype, extra, "name")
		if name:
			return name
	return None


def _ref_test(code_or_name):
	if not code_or_name:
		return None
	if frappe.db.exists("Reference Test", code_or_name):
		return code_or_name
	return frappe.db.get_value("Reference Test", {"code": code_or_name}, "name") or code_or_name


def _priority(label):
	if not label:
		return None
	return _link("Priority", label) or frappe.db.get_value("Priority", {"label_ar": label}, "name")


def _service_type(code):
	return _link("Service Type", code) or code


def _category(code):
	"""Map SPA category codes (soil/…) to Item Group names used on Test Request."""
	if not code:
		return None
	from miyar.api.payload import GROUP_TO_CATEGORY

	category_to_group = {v: k for k, v in GROUP_TO_CATEGORY.items()}
	group = category_to_group.get(code, code)
	if frappe.db.exists("Item Group", group):
		return group
	return _link("Item Group", group) or _link("Item Group", code)


def _city(value, fallback=None):
	"""Accept only real Territory names; otherwise use contract city / None."""
	if value and frappe.db.exists("Territory", value):
		return value
	# common spelling variants
	aliases = {"جده": "جدة", "الرياض ": "الرياض"}
	alt = aliases.get((value or "").strip())
	if alt and frappe.db.exists("Territory", alt):
		return alt
	if fallback and frappe.db.exists("Territory", fallback):
		return fallback
	return None


def _payment_term(code):
	mapping = {"advance": "advance", "on-completion": "on-completion", "on_completion": "on-completion"}
	raw = mapping.get(code, code)
	return _link("Payment Term Code", raw) or _link("Payment Term", raw)


def _slot_row(slot: dict) -> dict:
	from miyar.utils.timefmt import to_frappe_time

	return {
		"slot_date": slot.get("date") or slot.get("slot_date"),
		"from_time": to_frappe_time(slot.get("from") or slot.get("from_time")),
		"to_time": to_frappe_time(slot.get("to") or slot.get("to_time")),
	}


def _user_email(user_id: str | None) -> str | None:
	if not user_id:
		return None
	if frappe.db.exists("User", user_id):
		return user_id
	return frappe.db.get_value("User", {"mobile_no": user_id}, "name") or user_id


def _require_admin():
	require_login()
	if not set(frappe.get_roles()).intersection(ADMIN_ROLES | {ROLES["support"]}):
		frappe.throw("صلاحية إدارة غير متوفرة.")


def _sync_test_lines(request_name: str, tests: list):
	existing = {row.name: row for row in frappe.get_all("Test Line", filters={"test_request": request_name}, fields=["name", "reference_test"])}
	keep = set()
	for t in tests or []:
		ref = _ref_test(t.get("refTestId") or t.get("reference_test"))
		method = t.get("method") or t.get("test_method")
		name = t.get("id") if t.get("id") and frappe.db.exists("Test Line", t.get("id")) else None
		if not name:
			name = frappe.db.get_value("Test Line", {"test_request": request_name, "reference_test": ref}, "name")
		if name:
			doc = frappe.get_doc("Test Line", name)
		else:
			doc = frappe.get_doc({"doctype": "Test Line", "test_request": request_name, "status": "STS17"})
		doc.reference_test = ref
		if method:
			doc.test_method = method if frappe.db.exists("Test Method", method) else _link("Test Method", method) or method
		if t.get("price") is not None:
			doc.price = t.get("price")
		if t.get("sla") is not None:
			doc.sla_days = t.get("sla")
		if t.get("unit") or t.get("uom"):
			doc.uom = t.get("unit") or t.get("uom")
		if doc.is_new():
			doc.insert(ignore_permissions=True)
		else:
			doc.save(ignore_permissions=True)
		keep.add(doc.name)
	for name in existing:
		if name not in keep:
			frappe.delete_doc("Test Line", name, ignore_permissions=True, force=True)


def _apply_slots(doc, slots):
	doc.slots = []
	for slot in slots or []:
		row = _slot_row(slot)
		if row.get("slot_date"):
			doc.append("slots", row)


def _ensure_study(request_name: str):
	name = frappe.db.get_value("Geotechnical Study", {"test_request": request_name}, "name")
	if name:
		return name
	study = frappe.get_doc({"doctype": "Geotechnical Study", "test_request": request_name, "phase": 1})
	study.insert(ignore_permissions=True)
	frappe.db.set_value("Test Request", request_name, "study", study.name)
	return study.name


@frappe.whitelist()
def save_draft(payload=None):
	require_login()
	data = _parse(payload) or {}
	name = data.get("id") or data.get("name")
	contract = data.get("contractId") or data.get("service_contract")
	if not contract:
		frappe.throw("اختر العقد.")
	service = _service_type(data.get("service") or data.get("service_type") or "standard")
	if name and frappe.db.exists("Test Request", name):
		doc = frappe.get_doc("Test Request", name)
		if doc.status != "STS09":
			frappe.throw("يُحفظ المسودة فقط وهي في STS09.")
	else:
		doc = frappe.get_doc(
			{
				"doctype": "Test Request",
				"service_contract": contract,
				"service_type": service,
				"status": "STS09",
			}
		)
	doc.service_contract = contract
	doc.service_type = service
	if data.get("project"):
		doc.project_name = data.get("project")
	if data.get("location"):
		doc.location = data.get("location")
	contract_city = frappe.db.get_value("Service Contract", contract, "city")
	city = _city(data.get("city"), fallback=contract_city)
	if city:
		doc.city = city
	elif data.get("city"):
		# free-text location city — keep location, leave Link blank rather than 417
		doc.city = contract_city if contract_city and frappe.db.exists("Territory", contract_city) else None
	if data.get("notes") is not None:
		doc.notes = data.get("notes")
	if data.get("geo_lat") is not None:
		doc.geo_lat = data.get("geo_lat")
	if data.get("geo_lng") is not None:
		doc.geo_lng = data.get("geo_lng")
	pri = _priority(data.get("priority"))
	if pri:
		doc.priority = pri
	cat = _category(data.get("category"))
	if cat:
		doc.category = cat
	_apply_slots(doc, data.get("slots"))
	if doc.is_new():
		doc.insert(ignore_permissions=True)
	else:
		doc.save(ignore_permissions=True)
	_sync_test_lines(doc.name, data.get("tests") or [])
	if "attachments" in data:
		doc.set("attachments", [])
		for item in data.get("attachments") or []:
			if not isinstance(item, dict):
				continue
			file_url = item.get("file") or item.get("url") or ""
			if not file_url and not item.get("name"):
				continue
			doc.append(
				"attachments",
				{
					"file": file_url,
					"file_name": item.get("name") or (str(file_url).rsplit("/", 1)[-1] if file_url else ""),
					"file_size": item.get("size") or "",
				},
			)
		doc.save(ignore_permissions=True)
	if str(data.get("service") or "") == "geotech" or _service_type("geotech") == service:
		_ensure_study(doc.name)
	return {"name": doc.name, "request": request_payload(doc.name)}


@frappe.whitelist()
def submit_request(name):
	from miyar.api.requests import submit_request as _submit

	res = _submit(name)
	new_name = res["name"] if isinstance(res, dict) else res
	return {"name": new_name, "request": request_payload(new_name)}


@frappe.whitelist()
def cancel_request(name, reason=None):
	from miyar.api.requests import cancel_request as _cancel

	return _cancel(name, reason)


@frappe.whitelist()
def lab_decide(name, accept, slot=None, reason=None):
	from miyar.api.requests import lab_decide as _decide

	parsed = _parse(slot)
	slot_row = _slot_row(parsed) if parsed else None
	return _decide(name, accept, slot=slot_row, reason=reason)


@frappe.whitelist()
def start_test(name, sample=None):
	from miyar.api.tests import start

	return start(name, sample=sample)


@frappe.whitelist()
def confirm_sample(name, confirmed=1, reason=None):
	from miyar.api.tests import confirm_sample as _confirm

	ok = _as_int(confirmed, 1)
	if not ok and reason:
		line = frappe.get_doc("Test Line", name)
		line.notes = reason
		line.save(ignore_permissions=True)
	return _confirm(name, confirmed=ok)


@frappe.whitelist()
def save_result(name, result=None, report=None, notes=None, specimen=None, equipment=None):
	require_login()
	doc = frappe.get_doc("Test Line", name)
	vals = _parse(result) or {}
	if isinstance(vals, dict):
		by_key = {row.field_key: row for row in (doc.result_values or [])}
		for key, value in vals.items():
			if key in by_key:
				by_key[key].value = value
			else:
				doc.append("result_values", {"field_key": key, "value": value})
	if report:
		parsed = _parse(report) if not isinstance(report, str) else report
		if isinstance(parsed, dict):
			# Prefer Frappe file_url so download/print open the real attachment.
			doc.report_file = (
				parsed.get("file")
				or parsed.get("url")
				or parsed.get("file_url")
				or parsed.get("name")
				or doc.report_file
			)
		else:
			doc.report_file = parsed
	if notes is not None:
		doc.notes = notes
	if specimen:
		doc.specimen_json = json.dumps(_parse(specimen), ensure_ascii=False)
	if equipment is not None:
		doc.equipment_used = []
		for item in _parse(equipment) or []:
			asset = item if isinstance(item, str) else item.get("id")
			if asset:
				doc.append("equipment_used", {"asset": asset})
	doc.save(ignore_permissions=True)
	return doc.as_dict()


@frappe.whitelist()
def submit_output(name, result_values=None, report_file=None, notes=None):
	from miyar.api.tests import submit_output as _submit

	return _submit(name, result_values=result_values, report_file=report_file, notes=notes)


@frappe.whitelist()
def review_test(name, approve, reason=None):
	from miyar.api.tests import review

	return review(name, approve, reason=reason)


@frappe.whitelist()
def create_retest(test_line, slots=None, notes=None):
	from miyar.api.tests import retest
	from miyar.api.requests import submit_request as _submit

	created = retest(test_line)
	req = frappe.get_doc("Test Request", created["request"])
	if notes:
		req.notes = notes
	_apply_slots(req, _parse(slots) or [])
	req.save(ignore_permissions=True)
	new_name = req.submit_request()
	return {"name": new_name, "request": request_payload(new_name)}


@frappe.whitelist()
def create_quote(payload=None):
	from miyar.api.quotes import create_quote as _create

	data = _parse(payload) or {}
	items = []
	for row in data.get("items") or []:
		items.append(
			{
				"reference_test": _ref_test(row.get("refTestId") or row.get("reference_test")),
				"test_method": row.get("method") or row.get("test_method"),
				"uom": row.get("unit") or row.get("uom"),
				"price": row.get("price"),
				"sla_days": row.get("sla") or row.get("sla_days"),
			}
		)
	return _create(
		lab=data.get("labId") or data.get("lab"),
		consultant=data.get("consultantId") or data.get("consultant"),
		project_name=data.get("project") or data.get("project_name"),
		payment_term=_payment_term(data.get("payment") or data.get("payment_term")),
		city=data.get("city"),
		items=items,
		services=data.get("services"),
		notes=data.get("notes"),
	)


@frappe.whitelist()
def respond_quote(name, items=None, lab_notes=None):
	from miyar.api.quotes import respond

	parsed = []
	for row in _parse(items) or []:
		parsed.append(
			{
				"reference_test": _ref_test(row.get("refTestId") or row.get("reference_test")),
				"test_method": row.get("method") or row.get("test_method"),
				"price": row.get("price"),
				"sla_days": row.get("sla") or row.get("sla_days"),
			}
		)
	return respond(name, items=parsed, lab_notes=lab_notes)


@frappe.whitelist()
def decide_quote(name, accept, reason=None):
	from miyar.api.quotes import accept as _accept, reject as _reject

	if _as_bool(accept):
		return _accept(name, otp_verified=1)
	return _reject(name, reason or "رُفض العرض")


@frappe.whitelist()
def upsert_catalog(payload=None):
	from miyar.api.catalog import upsert_item

	data = _parse(payload) or {}
	ref = _ref_test(data.get("refTestId") or data.get("reference_test"))
	status = data.get("status")
	doc = upsert_item(
		reference_test=ref,
		uom=data.get("unit") or data.get("uom"),
		base_price=data.get("basePrice") if data.get("basePrice") is not None else data.get("base_price"),
		sla_days=data.get("sla") if data.get("sla") is not None else data.get("sla_days"),
		methods=data.get("methods"),
		status=status,
	)
	if status in (STS01, STS02) and doc.get("name"):
		frappe.db.set_value("Lab Catalog Item", doc["name"], "status", status)
		doc["status"] = status
	return doc


@frappe.whitelist()
def toggle_catalog(name):
	require_login()
	doc = frappe.get_doc("Lab Catalog Item", name)
	doc.status = STS01 if doc.status == STS02 else STS02
	doc.save()
	return doc.as_dict()


@frappe.whitelist()
def update_ref_test(payload=None):
	_require_admin()
	data = _parse(payload) or {}
	code = data.get("id") or data.get("code")
	if code and frappe.db.exists("Reference Test", code):
		doc = frappe.get_doc("Reference Test", code)
	elif code:
		name = frappe.db.get_value("Reference Test", {"code": code}, "name")
		doc = frappe.get_doc("Reference Test", name) if name else frappe.get_doc({"doctype": "Reference Test", "code": code})
	else:
		frappe.throw("رمز الاختبار المرجعي مطلوب.")
	if data.get("nameAr"):
		doc.test_name_ar = data["nameAr"]
	if data.get("nameEn"):
		doc.test_name_en = data["nameEn"]
	if data.get("category"):
		group = {
			"soil": "اختبارات التربة",
			"asphalt": "اختبارات الإسفلت",
			"concrete": "اختبارات الخرسانة",
			"aggregate": "اختبارات الركام",
		}.get(data["category"], data["category"])
		doc.item_group = group
	if "allowExternalReport" in data:
		doc.allow_external_report = _as_int(data.get("allowExternalReport"))
	if "active" in data:
		doc.is_active = _as_int(data.get("active"), 1)
	if data.get("methods") is not None:
		doc.methods = []
		for m in data["methods"]:
			code_m = m if isinstance(m, str) else m.get("code")
			if code_m:
				doc.append("methods", {"test_method": code_m})
	if data.get("units") is not None:
		doc.units = []
		for u in data["units"]:
			doc.append("units", {"uom": u})
	if data.get("resultFields") is not None:
		doc.result_fields = []
		for i, f in enumerate(data["resultFields"]):
			doc.append("result_fields", {"field_key": f.get("key"), "label_ar": f.get("label"), "uom": f.get("unit"), "sort_order": i})
	if doc.is_new():
		doc.insert()
	else:
		doc.save()
	return doc.as_dict()


@frappe.whitelist()
def update_org(name, patch=None):
	require_login()
	data = _parse(patch) or {}
	doc = frappe.get_doc("Organization", name)
	org = get_user_org()
	roles = set(frappe.get_roles())
	if org != name and not roles.intersection(ADMIN_ROLES | {ROLES["support"]}):
		frappe.throw("لا يمكن تعديل منشأة أخرى.")
	mapping = {
		"name": "organization_name",
		"about": "about",
		"phone": "phone",
		"email": "email",
		"website": "website",
		"address": "address_html",
		"license": "license",
		"district": "district",
		"city": "territory",
		"employees": "employee_count",
		"since": "since_year",
		"featured": "featured",
		"visible": "directory_status",
		"logo": "logo",
	}
	for key, field in mapping.items():
		if key not in data:
			continue
		val = data[key]
		if key == "visible":
			doc.directory_status = "STS04" if _as_bool(val) else "STS05"
		else:
			doc.set(field, val)
	if "active" in data:
		doc.active = _as_int(data["active"])
	if data.get("specialties") is not None:
		doc.specialties = []
		for spec in data["specialties"]:
			doc.append("specialties", {"specialty": spec})
	doc.save(ignore_permissions=True)
	return doc.as_dict()


@frappe.whitelist()
def set_org_active(name, active):
	_require_admin()
	frappe.db.set_value("Organization", name, "active", _as_int(active))
	return {"ok": True}


@frappe.whitelist()
def add_rating(payload=None):
	require_login()
	data = _parse(payload) or {}
	doc = frappe.get_doc(
		{
			"doctype": "Lab Rating",
			"service_contract": data.get("contractId"),
			"lab": data.get("labId"),
			"contractor": data.get("contractorId") or get_user_org(),
			"comment": data.get("comment"),
			"status": STS06,
		}
	)
	for key, score in (("quality", data.get("quality")), ("punctuality", data.get("punctuality")), ("communication", data.get("communication"))):
		if score is not None:
			doc.append("scores", {"dimension_key": key, "score": score})
	doc.insert()
	return doc.as_dict()


@frappe.whitelist()
def moderate_rating(name, status):
	require_login()
	doc = frappe.get_doc("Lab Rating", name)
	doc.status = status
	doc.save()
	return doc.as_dict()


@frappe.whitelist()
def create_delegation(payload=None):
	from miyar.api.delegations import create as _create

	data = _parse(payload) or {}
	dtype = "Direct" if (data.get("type") or "direct") == "direct" else "Indirect"
	scope = "Request" if (data.get("scope") or "request") == "request" else "Test"
	return _create(
		test_request=data.get("requestId") or data.get("test_request"),
		to_user=_user_email(data.get("toUserId") or data.get("to_user")),
		delegation_type=dtype,
		scope=scope,
		test_line=data.get("testId") or data.get("test_line"),
	)


@frappe.whitelist()
def decide_delegation(name, accept):
	from miyar.api.delegations import decide

	return decide(name, accept)


@frappe.whitelist()
def revoke_delegation(name, to_user=None):
	from miyar.api.delegations import revoke, create as _create

	old = frappe.get_doc("Delegation", name)
	revoke(name)
	if to_user:
		return _create(
			test_request=old.test_request,
			to_user=_user_email(to_user),
			delegation_type=old.delegation_type,
			scope=old.scope,
			test_line=old.test_line,
		)
	return {"ok": True}


@frappe.whitelist()
def set_rules(payload=None):
	_require_admin()
	data = _parse(payload) or {}
	doc = frappe.get_single("Miyar Settings")
	mapping = {
		"maxTestsPerRequest": "max_tests_per_request",
		"proposedSlots": "proposed_slots",
		"minLeadHours": "min_lead_hours",
		"labDecisionHours": "lab_decision_hours",
		"consultantDecisionHours": "consultant_decision_hours",
		"minBoreholeDepth": "min_borehole_depth",
		"geofenceMeters": "geofence_meters",
		"vat": "vat_rate",
		"enginePolicy": "engine_policy",
		"quoteValidityDays": "quote_validity_days",
		"invoiceDueDays": "invoice_due_days",
		"sessionIdleMinutes": "session_idle_minutes",
		"saacExpiryWarnDays": "saac_expiry_warn_days",
	}
	for key, field in mapping.items():
		if key in data and data[key] is not None:
			doc.set(field, data[key])
	if "labTimeoutAction" in data:
		doc.lab_timeout_action = "Expire" if data["labTimeoutAction"] == "expire" else "None"
	doc.save()
	return {"ok": True}


@frappe.whitelist()
def add_employee(name, mobile, can_delegate=0):
	require_login()
	if not is_principal():
		frappe.throw("إضافة موظف للمفوّض الرئيسي.")
	org = get_user_org()
	org_type = frappe.db.get_value("Organization", org, "organization_type")
	email = f"{mobile}@miyar.local"
	if frappe.db.exists("User", email):
		user = frappe.get_doc("User", email)
	else:
		user = frappe.get_doc(
			{
				"doctype": "User",
				"email": email,
				"first_name": name,
				"mobile_no": mobile,
				"send_welcome_email": 0,
				"enabled": 1,
			}
		)
		user.insert(ignore_permissions=True)
	role = (ORG_TYPE_TO_ROLES.get(org_type) or {}).get("Employee")
	if role:
		user.add_roles(role)
	if not frappe.db.exists("Organization User", {"organization": org, "user": user.name}):
		frappe.get_doc(
			{
				"doctype": "Organization User",
				"organization": org,
				"user": user.name,
				"position": "Employee",
				"can_delegate": _as_int(can_delegate),
				"is_active": 1,
			}
		).insert(ignore_permissions=True)
	return {"name": user.name}


@frappe.whitelist()
def set_employee_delegate(user, can_delegate=0):
	require_login()
	org = get_user_org()
	name = frappe.db.get_value("Organization User", {"organization": org, "user": _user_email(user)}, "name")
	if not name:
		frappe.throw("الموظف غير موجود في المنشأة.")
	frappe.db.set_value("Organization User", name, "can_delegate", _as_int(can_delegate))
	return {"ok": True}


@frappe.whitelist()
def add_organization(payload=None):
	_require_admin()
	data = _parse(payload) or {}
	org_type = _link("Organization Type", data.get("type")) or data.get("type")
	org = frappe.get_doc(
		{
			"doctype": "Organization",
			"organization_name": data.get("name"),
			"organization_type": org_type,
			"cr": data.get("cr"),
			"territory": _city(data.get("city")) or data.get("city"),
			"phone": data.get("phone"),
			"email": data.get("email"),
			"active": 1,
			"directory_status": "STS04",
		}
	)
	org.insert(ignore_permissions=True)
	mobile = data.get("mobile")
	principal = data.get("principal") or data.get("name")
	if mobile:
		email = data.get("email") or f"{mobile}@miyar.local"
		if not frappe.db.exists("User", email):
			user = frappe.get_doc(
				{
					"doctype": "User",
					"email": email,
					"first_name": principal,
					"mobile_no": mobile,
					"send_welcome_email": 0,
					"enabled": 1,
				}
			)
			user.insert(ignore_permissions=True)
		else:
			user = frappe.get_doc("User", email)
		role = (ORG_TYPE_TO_ROLES.get(data.get("type")) or {}).get("Principal")
		if role:
			user.add_roles(role)
		if not frappe.db.exists("Organization User", {"organization": org.name, "user": user.name}):
			frappe.get_doc(
				{
					"doctype": "Organization User",
					"organization": org.name,
					"user": user.name,
					"position": "Principal",
					"can_delegate": 1,
					"is_active": 1,
				}
			).insert(ignore_permissions=True)
	from miyar.api.payload import organization_payload

	frappe.db.commit()
	return {"name": org.name, "organization": organization_payload(frappe.get_doc("Organization", org.name))}


@frappe.whitelist()
def upsert_equipment(payload=None):
	require_login()
	data = _parse(payload) or {}
	lab = data.get("labId") or get_user_org()
	name = data.get("id")
	if name and frappe.db.exists("Asset", name):
		doc = frappe.get_doc("Asset", name)
	else:
		doc = frappe.get_doc({"doctype": "Asset", "asset_name": data.get("name") or "معدة", "miyar_lab": lab})
	if data.get("name"):
		doc.asset_name = data["name"]
	doc.miyar_lab = lab
	if data.get("type"):
		doc.miyar_equipment_type = _link("Equipment Type", data["type"]) or data["type"]
	if data.get("serial") and doc.meta.has_field("serial_no"):
		doc.serial_no = data["serial"]
	if data.get("range") is not None:
		doc.measuring_range = data["range"]
	if data.get("resolution") is not None:
		doc.resolution = data["resolution"]
	if data.get("calibrationDue"):
		doc.calibration_due = data["calibrationDue"][:10]
	if data.get("certificate"):
		doc.calibration_certificate = data["certificate"]
	if data.get("provider"):
		doc.calibration_provider = data["provider"]
	if data.get("status"):
		doc.miyar_status = data["status"]
	if data.get("location"):
		doc.lab_location = data["location"]
	if doc.is_new():
		doc.flags.ignore_mandatory = True
		doc.insert(ignore_permissions=True)
	else:
		doc.save(ignore_permissions=True)
	return {"name": doc.name}


@frappe.whitelist()
def record_calibration(name, certificate, calibrated_at, provider=None):
	require_login()
	due = add_days(getdate(calibrated_at), 365)
	if frappe.db.exists("DocType", "Calibration Record"):
		frappe.get_doc(
			{
				"doctype": "Calibration Record",
				"asset": name,
				"calibrated_on": calibrated_at[:10],
				"due_on": due,
				"certificate_no": certificate,
				"provider": provider,
			}
		).insert(ignore_permissions=True)
	frappe.db.set_value(
		"Asset",
		name,
		{
			"calibration_certificate": certificate,
			"calibration_provider": provider,
			"calibration_due": due,
			"miyar_status": "صالح",
		},
	)
	return {"ok": True, "due": str(due)}


@frappe.whitelist()
def retire_equipment(name):
	require_login()
	frappe.db.set_value("Asset", name, "miyar_status", "خارج الخدمة")
	return {"ok": True}


@frappe.whitelist()
def register_sample(payload=None):
	require_login()
	data = _parse(payload) or {}
	first = frappe.get_all("Custody Step", fields=["name", "label_ar", "sample_status"], order_by="sort_order asc", limit=1)
	step = first[0] if first else {}
	doc = frappe.get_doc(
		{
			"doctype": "Archived Sample",
			"lab": data.get("labId") or get_user_org(),
			"archive_kind": data.get("kind"),
			"designation": data.get("designation"),
			"test_request": data.get("requestId"),
			"test_line": data.get("testId"),
			"borehole": data.get("boreholeCode"),
			"collected_at": data.get("collectedAt"),
			"collected_by": data.get("collectedBy"),
			"lat": data.get("lat"),
			"lng": data.get("lng"),
			"mass_g": data.get("massG"),
			"condition": data.get("condition"),
			"storage": data.get("storage"),
			"retention_until": data.get("retentionUntil"),
			"seal_no": data.get("sealNo"),
			"status": data.get("status") or step.get("sample_status") or step.get("label_ar"),
			"dimensions": json.dumps(data.get("dims") or {}, ensure_ascii=False),
		}
	)
	doc.append(
		"custody",
		{
			"event_at": now_datetime(),
			"step": step.get("name"),
			"actor": frappe.session.user,
			"location": data.get("designation"),
			"note": f"ختم {data.get('sealNo') or ''}".strip(),
		},
	)
	doc.insert(ignore_permissions=True)
	return {"name": doc.name}


@frappe.whitelist()
def add_custody_event(name, step=None, by=None, where=None, note=None, temp_c=None):
	require_login()
	doc = frappe.get_doc("Archived Sample", name)
	step_name = _link("Custody Step", step) or step
	status = frappe.db.get_value("Custody Step", step_name, "sample_status") if step_name else None
	doc.append(
		"custody",
		{
			"event_at": now_datetime(),
			"step": step_name,
			"actor": _user_email(by) or frappe.session.user,
			"location": where,
			"note": note,
			"temp_c": temp_c,
		},
	)
	if status:
		doc.status = status
	doc.save(ignore_permissions=True)
	return doc.as_dict()


@frappe.whitelist()
def dispose_sample(name, reason=None):
	require_login()
	steps = frappe.get_all("Custody Step", fields=["name", "label_ar"], order_by="sort_order desc", limit=1)
	last = steps[0]["label_ar"] if steps else "إتلاف"
	return add_custody_event(name, step=last, by=frappe.session.user, where="محضر إتلاف موقّع", note=reason)


@frappe.whitelist()
def upsert_template(payload=None):
	_require_admin()
	data = _parse(payload) or {}
	key = data.get("id")
	name = frappe.db.get_value("Report Template", {"template_key": key}, "name") if key else None
	if name:
		doc = frappe.get_doc("Report Template", name)
	elif key and frappe.db.exists("Report Template", key):
		doc = frappe.get_doc("Report Template", key)
	else:
		doc = frappe.get_doc({"doctype": "Report Template", "template_key": key, "template_name": data.get("name")})
	if data.get("name"):
		doc.template_name = data["name"]
	if data.get("ver"):
		doc.version_code = data["ver"]
	if data.get("ref"):
		doc.standard_ref = data["ref"]
	if data.get("status"):
		doc.status = data["status"]
	if data.get("sections") is not None:
		doc.sections = []
		for i, title in enumerate(data["sections"]):
			doc.append("sections", {"title": title, "sort_order": i})
	if doc.is_new():
		doc.insert()
	else:
		doc.save()
	return doc.as_dict()


@frappe.whitelist()
def add_template_version(name, ver, note=None, publish=0):
	_require_admin()
	key = name
	doc_name = frappe.db.get_value("Report Template", {"template_key": key}, "name") or name
	doc = frappe.get_doc("Report Template", doc_name)
	doc.append(
		"history",
		{
			"version_code": ver,
			"published_on": nowdate() if _as_int(publish) else None,
			"note": note,
			"status": "ساري" if _as_int(publish) else "مسودة",
		},
	)
	if _as_int(publish):
		doc.version_code = ver
		doc.status = "ساري"
	doc.save()
	return doc.as_dict()


@frappe.whitelist()
def add_knowledge_version(ver, changes):
	_require_admin()
	doc = frappe.get_doc({"doctype": "Knowledge Version", "version_code": ver, "changes": changes, "status": "مسودة"})
	doc.insert()
	return doc.as_dict()


@frappe.whitelist()
def publish_knowledge_version(ver):
	_require_admin()
	name = frappe.db.get_value("Knowledge Version", {"version_code": ver}, "name") or ver
	for row in frappe.get_all("Knowledge Version", filters={"status": "ساري"}, pluck="name"):
		frappe.db.set_value("Knowledge Version", row, "status", "مؤرشف")
	frappe.db.set_value("Knowledge Version", name, {"status": "ساري", "published_on": nowdate()})
	return {"ok": True}


@frappe.whitelist()
def upsert_policy(payload=None):
	_require_admin()
	data = _parse(payload) or {}
	name = data.get("id")
	if name and frappe.db.exists("Platform Policy", name):
		doc = frappe.get_doc("Platform Policy", name)
	else:
		doc = frappe.get_doc({"doctype": "Platform Policy", "title": data.get("title")})
	for src, dest in (("title", "title"), ("version", "version_code"), ("effective", "effective_on"), ("owner", "owner"), ("scope", "scope"), ("status", "status"), ("ref", "standard_ref")):
		if data.get(src) is not None and doc.meta.has_field(dest):
			doc.set(dest, data[src])
	if doc.is_new():
		doc.insert()
	else:
		doc.save()
	return doc.as_dict()


@frappe.whitelist()
def pay_invoice(name, channel=None):
	from miyar.api.invoices import pay

	return pay(name, channel=channel)


@frappe.whitelist()
def create_ticket(subject, description, category=None, related_request=None):
	from miyar.api.help import create_ticket as _create

	return _create(subject, description, category=category, related_request=related_request)


@frappe.whitelist()
def mark_notification_read(name):
	require_login()
	if frappe.db.exists("Platform Notification", name):
		frappe.db.set_value("Platform Notification", name, "is_read", 1)
	return {"ok": True}


@frappe.whitelist()
def mark_all_notifications_read():
	require_login()
	frappe.db.sql(
		"update `tabPlatform Notification` set is_read = 1 where for_user = %s or for_org = %s",
		(frappe.session.user, get_user_org()),
	)
	return {"ok": True}


def _coded(doctype, value):
	if not value:
		return None
	return _link(doctype, value)


def _apply_prelim(doc, prelim: dict):
	mapping = {
		"deedFile": "deed_file",
		"parcel": "parcel",
		"plan": "plan_no",
		"district": "district",
		"city": "city",
		"region": "region",
		"deedNo": "deed_no",
		"deedDate": "deed_date",
		"area": "plot_area",
		"computedArea": "computed_area",
		"boundaryOk": "boundary_ok",
		"owner": "owner_name",
		"ownerId": "owner_id",
		"floors": "floors",
		"builtArea": "built_area",
		"foundationDepth": "foundation_depth",
		"priorInfo": "prior_info",
		"neighbors": "neighbors",
		"permitNo": "permit_no",
		"reviewNotes": "review_notes",
	}
	for src, dest in mapping.items():
		if src in prelim and prelim[src] is not None and doc.meta.has_field(dest):
			val = prelim[src]
			if dest in ("boundary_ok", "prior_info", "neighbors"):
				val = _as_int(val)
			doc.set(dest, val)
	if prelim.get("buildingType"):
		doc.building_type = _coded("Building Type", prelim["buildingType"])
	if prelim.get("structure"):
		doc.structure_type = _coded("Structure Type", prelim["structure"])
	if prelim.get("foundationType"):
		doc.foundation_type = _coded("Foundation Type", prelim["foundationType"])
	if prelim.get("siteConditions") is not None:
		doc.site_conditions = []
		for c in prelim["siteConditions"]:
			link = _coded("Site Condition", c)
			if link:
				doc.append("site_conditions", {"site_condition": link})
	if prelim.get("approvedByConsultant"):
		doc.prelim_approved = 1


def _apply_polygon(doc, polygon):
	doc.polygon = []
	for i, pt in enumerate(polygon or []):
		doc.append("polygon", {"seq": i + 1, "northing": pt.get("n"), "easting": pt.get("e")})


BH_STATUS = {"ready": "Ready", "in-progress": "In Progress", "done": "Done"}


def _apply_boreholes(study_name: str, boreholes: list):
	keep = set()
	for b in boreholes or []:
		name = b.get("id") if b.get("id") and frappe.db.exists("Borehole", b.get("id")) else None
		if not name:
			name = frappe.db.get_value("Borehole", {"study": study_name, "code": b.get("code")}, "name")
		if name:
			doc = frappe.get_doc("Borehole", name)
		else:
			doc = frappe.get_doc({"doctype": "Borehole", "study": study_name, "code": b.get("code")})
		doc.code = b.get("code") or doc.code
		doc.status = BH_STATUS.get(b.get("status"), b.get("status") or "Ready")
		approved = b.get("approved") or {}
		doc.approved_n = approved.get("n")
		doc.approved_e = approved.get("e")
		op = b.get("operational")
		if op:
			doc.operational_n = op.get("n")
			doc.operational_e = op.get("e")
		actual = b.get("actual")
		if actual:
			doc.actual_n = actual.get("n")
			doc.actual_e = actual.get("e")
		if b.get("approvedDepth") is not None:
			doc.approved_depth = b["approvedDepth"]
		if b.get("executedDepth") is not None:
			doc.executed_depth = b["executedDepth"]
		if b.get("moved") is not None:
			doc.moved_m = b["moved"]
		if b.get("notReachedReason"):
			doc.not_reached_reason = b["notReachedReason"]
		added = b.get("addedByLab")
		if added:
			doc.added_by_lab = 1
			doc.added_reason = added.get("reason") if isinstance(added, dict) else added
		geo = b.get("geoVerified")
		if geo:
			doc.geo_distance_m = geo.get("distance") if isinstance(geo, dict) else geo
		head = b.get("head") or {}
		if head.get("method"):
			doc.borehole_method = _coded("Borehole Method", head["method"])
		if head.get("rig"):
			doc.rig = head["rig"]
		if head.get("diameter") is not None:
			doc.diameter_mm = head["diameter"]
		if head.get("casing") is not None:
			doc.casing_m = head["casing"]
		if head.get("groundLevel") is not None:
			doc.ground_level = head["groundLevel"]
		if head.get("waterInstant") is not None:
			doc.water_instant = head["waterInstant"]
		if head.get("water24h") is not None:
			doc.water_24h = head["water24h"]
		if head.get("date"):
			doc.work_date = str(head["date"])[:10]
		if head.get("weather"):
			doc.weather = _coded("Weather Condition", head["weather"])
		if doc.is_new():
			doc.insert(ignore_permissions=True)
		else:
			doc.save(ignore_permissions=True)
		keep.add(doc.name)
	for name in frappe.get_all("Borehole", filters={"study": study_name}, pluck="name"):
		if name not in keep:
			frappe.delete_doc("Borehole", name, ignore_permissions=True, force=True)


@frappe.whitelist()
def save_study(name=None, test_request=None, payload=None):
	require_login()
	data = _parse(payload) or {}
	if not name:
		name = data.get("id") or frappe.db.get_value("Geotechnical Study", {"test_request": test_request or data.get("requestId")}, "name")
	if not name:
		req = test_request or data.get("requestId")
		if not req:
			frappe.throw("لا توجد دراسة.")
		name = _ensure_study(req)
	doc = frappe.get_doc("Geotechnical Study", name)
	if data.get("phase") is not None:
		doc.phase = data["phase"]
	if data.get("prelim"):
		_apply_prelim(doc, data["prelim"])
	if data.get("polygon") is not None:
		_apply_polygon(doc, data["polygon"])
	plan = data.get("plan") or {}
	if plan.get("justification") is not None:
		doc.plan_justification = plan["justification"]
	if plan.get("approved"):
		doc.plan_approved = 1
		doc.plan_approved_at = plan.get("approvedAt") or now_datetime()
	if "fieldPlanReviewed" in data:
		doc.field_plan_reviewed = _as_int(data.get("fieldPlanReviewed"))
	if data.get("fieldPlanReason") is not None:
		doc.field_plan_reason = data.get("fieldPlanReason")
	if "fieldPlanAck" in data:
		doc.field_plan_ack = _as_int(data.get("fieldPlanAck"))
	if data.get("compliance") is not None:
		doc.compliance_pct = data["compliance"]
	if "fieldApproved" in data:
		doc.field_approved = _as_int(data.get("fieldApproved"))
	chem = data.get("chemical") or {}
	if chem:
		if chem.get("sampleId"):
			doc.chemical_sample = chem["sampleId"]
		if chem.get("reasonOverride"):
			doc.chemical_override_reason = chem["reasonOverride"]
		if "done" in chem:
			doc.chemical_done = _as_int(chem.get("done"))
		if chem.get("partialReason") is not None:
			doc.chemical_partial_reason = chem["partialReason"]
	report = data.get("report") or {}
	if report.get("previewed"):
		doc.report_previewed = 1
	if report.get("approved"):
		doc.report_approved = 1
		doc.report_approved_at = report.get("approvedAt") or now_datetime()
	if report.get("rejectReason"):
		doc.report_reject_reason = report["rejectReason"]
		doc.report_approved = 0
	if report.get("generatedFile"):
		doc.report_file = report["generatedFile"]
	doc.save(ignore_permissions=True)
	if data.get("boreholes") is not None:
		_apply_boreholes(doc.name, data["boreholes"])
	from miyar.api.collections import study_payload

	return study_payload(doc.name)


@frappe.whitelist()
def save_preferences(calendar=None, density=None, home=None, sms=None, email=None, push=None, digest=None):
	from miyar.api.session import save_preferences as _save

	return _save(calendar=calendar, density=density, home=home, sms=sms, email=email, push=push, digest=digest)


@frappe.whitelist()
def activate_registration(name):
	from miyar.api.admin import activate

	return activate(name)


@frappe.whitelist()
def reject_registration(name, reason=None):
	from miyar.api.admin import reject_registration as _reject

	return _reject(name, reason or "مرفوض")


@frappe.whitelist(allow_guest=True)
def submit_registration(payload=None, **kwargs):
	from miyar.api.register import submit_registration as _submit

	data = _parse(payload) if payload else kwargs
	return _submit(**{k: v for k, v in data.items() if k in (
		"cr", "organization_type", "organization_name", "principal_name",
		"principal_national_id", "principal_mobile", "principal_email",
		"saac_number", "agreed_terms", "wathq_payload",
	)})
