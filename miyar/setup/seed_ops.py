# Copyright (c) 2026, Miyar and contributors
# License: MIT. See LICENSE

"""Operational / transactional seed for every standalone Miyar DocType.

Masters live in ``seed.py``. Demo orgs/users/catalog/contracts live in ``demo.py``.
This module fills the remaining DocTypes so Desk + /miyar have real rows after migrate.

Idempotent: skips each block when representative rows already exist.
"""

from __future__ import annotations

import hashlib
from datetime import timedelta

import frappe
from frappe.utils import add_days, add_to_date, now_datetime, nowdate


def _org(cr: str) -> str | None:
	return frappe.db.get_value("Organization", {"cr": cr}, "name")


def _first(doctype: str, filters: dict | None = None, field: str = "name") -> str | None:
	rows = frappe.get_all(doctype, filters=filters or {}, pluck=field, limit=1)
	return rows[0] if rows else None


def _ensure(doctype: str, filters: dict, values: dict):
	existing = frappe.db.exists(doctype, filters)
	if existing:
		return existing
	doc = frappe.get_doc({"doctype": doctype, **values})
	doc.flags.ignore_permissions = True
	doc.insert(ignore_permissions=True)
	return doc.name


def seed_policies():
	if frappe.db.count("Policy"):
		return
	rows = [
		("سياسة حماية البيانات الشخصية", "v1.2", "ساري", "NDMO · PDPL", "المنصة"),
		("سياسة الاحتفاظ بالمستندات", "v1.0", "ساري", "NDMO", "الأرشيف"),
		("سياسة استخدام المحرك الذكي", "v0.9", "مسودة", "SBC · I-DO", "المحرك"),
	]
	for title, ver, status, refs, scope in rows:
		frappe.get_doc(
			{
				"doctype": "Policy",
				"title": title,
				"version_code": ver,
				"effective_on": nowdate(),
				"policy_owner": "الإدارة العامة لكود البناء",
				"status": status,
				"scope": scope,
				"reference_codes": refs,
				"body": f"<p>نص سياسة {title} — بيانات أولية للعرض.</p>",
			}
		).insert(ignore_permissions=True)


def seed_audit_events():
	if frappe.db.count("Audit Event") >= 5:
		return
	org = _org("1010111222") or _first("Organization")
	user = frappe.db.get_value("User", {"mobile_no": "0551234567"}, "name") or "Administrator"
	actions = [
		("info", "تسجيل دخول", "جلسة مستخدم"),
		("notice", "حفظ مسودة طلب", "Test Request"),
		("warning", "اقتراب مهلة قرار المختبر", "Test Request"),
		("critical", "تعديل قواعد الأعمال", "Miyar Settings"),
		("info", "رفع تقرير نتيجة", "Test Line"),
	]
	base = now_datetime()
	for i, (sev, action, entity) in enumerate(actions):
		frappe.get_doc(
			{
				"doctype": "Audit Event",
				"event_time": base - timedelta(hours=i * 6),
				"actor_user": user,
				"actor_name": frappe.db.get_value("User", user, "full_name") or user,
				"actor_role": "contractor",
				"organization": org,
				"action": action,
				"severity": sev,
				"ip": "127.0.0.1",
				"entity_doctype": entity if entity in ("Test Request", "Test Line", "Miyar Settings") else None,
				"detail": f"سجل تجريبي — {action}",
			}
		).insert(ignore_permissions=True)


def seed_quotes():
	if frappe.db.count("Miyar Quote"):
		return
	contractor, lab, consultant = _org("1010111222"), _org("4030123456"), _org("4030777888")
	if not (contractor and lab and consultant):
		return
	payment = _first("Payment Term Code") or "on-completion"
	city = "الرياض" if frappe.db.exists("Territory", "الرياض") else None
	doc = frappe.get_doc(
		{
			"doctype": "Miyar Quote",
			"contractor": contractor,
			"lab": lab,
			"consultant": consultant,
			"status": "Quoted",
			"project_name": "مشروع عرض سعر تجريبي — الرياض",
			"city": city,
			"payment_term": payment,
			"valid_until": add_days(nowdate(), 30),
			"quoted_at": now_datetime(),
			"notes": "عرض سعر تجريبي بعد migrate",
		}
	)
	st = _first("Service Type", {"code": "standard"}) or _first("Service Type")
	if st:
		doc.append("services", {"service_type": st})
	for item in frappe.get_all(
		"Lab Catalog Item",
		filters={"lab": lab},
		fields=["reference_test", "base_price", "sla_days", "name"],
		limit=3,
	):
		methods = frappe.get_all("Catalog Method", filters={"parent": item.name}, pluck="test_method")
		uom = frappe.db.get_value("Reference Test UOM", {"parent": item.reference_test}, "uom") or "Ea"
		doc.append(
			"items",
			{
				"reference_test": item.reference_test,
				"test_method": methods[0] if methods else None,
				"uom": uom,
				"price": item.base_price,
				"sla_days": item.sla_days,
			},
		)
	doc.insert(ignore_permissions=True)


def seed_test_requests_and_lines():
	"""Create a standard request (STS11) + geotech draft/study scaffolding."""
	if frappe.db.count("Test Request"):
		return
	contract = _first("Service Contract", {"is_active": 1})
	if not contract:
		return
	priority = _first("Priority", {"code": "normal"}) or _first("Priority")
	standard = _first("Service Type", {"code": "standard"}) or _first("Service Type")
	geotech = _first("Service Type", {"code": "geotech"})

	# ── standard request awaiting lab decision ──
	req = frappe.get_doc(
		{
			"doctype": "Test Request",
			"naming_series": "TST-DRAFT-.",
			"status": "STS09",
			"service_contract": contract,
			"service_type": standard,
			"priority": priority,
			"location": "حي النرجس — الرياض",
			"notes": "طلب تجريبي من seed بعد migrate",
			"geo_lat": 24.839,
			"geo_lng": 46.654,
		}
	)
	for i in range(3):
		d = add_days(nowdate(), 2 + i)
		req.append("slots", {"slot_date": d, "from_time": "09:00:00", "to_time": "12:00:00"})
	req.insert(ignore_permissions=True)

	# attach catalog lines
	lab = frappe.db.get_value("Service Contract", contract, "lab")
	items = frappe.get_all(
		"Lab Catalog Item",
		filters={"lab": lab},
		fields=["name", "reference_test", "base_price", "sla_days"],
		limit=2,
	)
	for item in items:
		methods = frappe.get_all("Catalog Method", filters={"parent": item.name}, pluck="test_method")
		if not methods:
			continue
		uom = frappe.db.get_value("Reference Test UOM", {"parent": item.reference_test}, "uom") or "Ea"
		frappe.get_doc(
			{
				"doctype": "Test Line",
				"test_request": req.name,
				"reference_test": item.reference_test,
				"test_method": methods[0],
				"uom": uom,
				"price": item.base_price,
				"sla_days": item.sla_days,
				"status": "STS17",
			}
		).insert(ignore_permissions=True)

	# submit → STS11
	req.reload()
	req.submit_request()

	# ── second request in execution (STS14) with sample confirmed ──
	req2 = frappe.get_doc(
		{
			"doctype": "Test Request",
			"naming_series": "TST-DRAFT-.",
			"status": "STS09",
			"service_contract": contract,
			"service_type": standard,
			"priority": priority,
			"location": "طريق الملك عبدالله — الرياض",
			"notes": "طلب تنفيذ تجريبي",
		}
	)
	req2.append("slots", {"slot_date": add_days(nowdate(), 1), "from_time": "09:00:00", "to_time": "12:00:00"})
	req2.insert(ignore_permissions=True)
	if items:
		item = items[0]
		methods = frappe.get_all("Catalog Method", filters={"parent": item.name}, pluck="test_method")
		if methods:
			uom = frappe.db.get_value("Reference Test UOM", {"parent": item.reference_test}, "uom") or "Ea"
			line = frappe.get_doc(
				{
					"doctype": "Test Line",
					"test_request": req2.name,
					"reference_test": item.reference_test,
					"test_method": methods[0],
					"uom": uom,
					"price": item.base_price,
					"sla_days": item.sla_days,
					"status": "STS18",
					"sample_id": "SMP-SEED-001",
					"sample_depth": 1.5,
					"technician": "فني تجريبي",
					"sample_received_at": now_datetime(),
					"geo_verified": 1,
					"contractor_confirmed": 1,
					"contractor_confirmed_at": now_datetime(),
					"started_at": now_datetime(),
				}
			)
			line.insert(ignore_permissions=True)
	req2.reload()
	req2.submit_request()
	# force accepted + in progress for demo richness
	req2 = frappe.get_doc("Test Request", req2.name)
	req2.status = "STS14"
	req2.chosen_slot_date = add_days(nowdate(), 1)
	req2.chosen_slot_from = "09:00:00"
	req2.chosen_slot_to = "12:00:00"
	req2.save(ignore_permissions=True)

	# ── geotech request (draft → study) if contract supports it ──
	geo_contract = None
	for c in frappe.get_all("Service Contract", filters={"is_active": 1}, pluck="name"):
		svcs = frappe.get_all("Contract Service", filters={"parent": c}, fields=["service_type"])
		codes = []
		for s in svcs:
			codes.append(frappe.db.get_value("Service Type", s.service_type, "code") or s.service_type)
		if "geotech" in codes:
			geo_contract = c
			break
	if geo_contract and geotech:
		g = frappe.get_doc(
			{
				"doctype": "Test Request",
				"naming_series": "TST-DRAFT-.",
				"status": "STS09",
				"service_contract": geo_contract,
				"service_type": geotech,
				"priority": priority,
				"location": "مجمّع النرجس — الرياض",
			}
		)
		g.append("slots", {"slot_date": add_days(nowdate(), 5), "from_time": "08:00:00", "to_time": "14:00:00"})
		g.insert(ignore_permissions=True)
		# ensure study exists
		if not frappe.db.exists("Geotechnical Study", {"test_request": g.name}):
			study = frappe.get_doc(
				{
					"doctype": "Geotechnical Study",
					"test_request": g.name,
					"phase": 1,
					"parcel": "1234",
					"owner_name": "مالك تجريبي",
					"owner_id": "1000000001",
					"floors": 3,
					"built_area": 850,
					"foundation_depth": 2.0,
				}
			)
			# optional links
			bt = _first("Building Type")
			stt = _first("Structure Type")
			ft = _first("Foundation Type")
			if bt:
				study.building_type = bt
			if stt:
				study.structure_type = stt
			if ft:
				study.foundation_type = ft
			study.insert(ignore_permissions=True)
			frappe.db.set_value("Test Request", g.name, "study", study.name)


def seed_invoices():
	if frappe.db.count("Laboratory Invoice"):
		return
	req = _first("Test Request", {"status": ["in", ["STS11", "STS12", "STS14", "STS15"]]})
	if not req:
		req = _first("Test Request")
	if not req:
		return
	row = frappe.db.get_value(
		"Test Request", req, ["service_contract", "lab", "contractor"], as_dict=True
	)
	channel = _first("Payment Channel")
	amount = sum(frappe.get_all("Test Line", filters={"test_request": req}, pluck="price") or [0]) or 3500
	vat_rate = frappe.db.get_single_value("Miyar Settings", "vat_rate") or 15
	vat = round(amount * float(vat_rate) / 100, 2)
	for status, days_ago, paid in (("Paid", 40, True), ("Due", 5, False), ("Overdue", 45, False)):
		doc = frappe.get_doc(
			{
				"doctype": "Laboratory Invoice",
				"service_contract": row.service_contract,
				"test_request": req,
				"seller_lab": row.lab,
				"buyer_contractor": row.contractor,
				"status": status,
				"payment_channel": channel,
				"amount": amount,
				"vat_rate": vat_rate,
				"vat_amount": vat,
				"grand_total": amount + vat,
				"issued_at": add_to_date(now_datetime(), days=-days_ago),
				"due_at": add_to_date(now_datetime(), days=-days_ago + 30),
				"paid_at": add_to_date(now_datetime(), days=-days_ago + 10) if paid else None,
			}
		)
		doc.append(
			"items",
			{
				"description": f"خدمات اختبارات — {req}",
				"qty": 1,
				"rate": amount,
				"amount": amount,
			},
		)
		doc.insert(ignore_permissions=True)


def seed_platform_documents():
	if frappe.db.count("Platform Document"):
		return
	req = _first("Test Request")
	contract = _first("Service Contract")
	org = _org("4030123456") or _first("Organization")
	dtype = _first("Document Type", {"code": "report"}) or _first("Document Type")
	cls = _first("Document Classification")
	for title, code in (("تقرير نتيجة تجريبي", "test-result"), ("عقد خدمة تجريبي", "contract"), ("شهادة إتمام", "certificate")):
		dt = _first("Document Type", {"code": code}) or dtype
		frappe.get_doc(
			{
				"doctype": "Platform Document",
				"title": title,
				"document_type": dt,
				"classification": cls,
				"test_request": req,
				"service_contract": contract,
				"organization": org,
				"file_size": "1.2 MB",
				"version": 1,
				"content_hash": hashlib.sha256(title.encode()).hexdigest()[:16],
				"issued_at": now_datetime(),
				"retention_until": add_days(nowdate(), 3650),
			}
		).insert(ignore_permissions=True)


def seed_archived_samples():
	if frappe.db.count("Archived Sample"):
		return
	lab = _org("4030123456") or _first("Organization", {"organization_type": "lab"})
	kind = _first("Sample Archive Kind")
	cond = _first("Sample Condition")
	req = _first("Test Request")
	line = _first("Test Line")
	step = _first("Custody Step", {"code": "collect"}) or _first("Custody Step")
	doc = frappe.get_doc(
		{
			"doctype": "Archived Sample",
			"lab": lab,
			"archive_kind": kind,
			"designation": "D-1 · طبقة الأساس — محطة تجريبية",
			"test_request": req,
			"test_line": line,
			"collected_at": now_datetime(),
			"collected_by": "فني تجريبي",
			"lat": 24.839,
			"lng": 46.654,
			"mass_g": 1250,
			"condition": cond,
			"storage": "غرفة الأرشيف B-1",
			"retention_until": add_days(nowdate(), 90),
			"seal_no": "SEAL-SEED-01",
			"status": "مؤرشفة",
		}
	)
	doc.append("dimensions", {"dim_key": "الكتلة", "dim_value": "1250 g"})
	if step:
		doc.append(
			"custody",
			{
				"at": now_datetime(),
				"step": step,
				"by": "فني تجريبي",
				"location": "الموقع",
				"note": "جمع أولي",
			},
		)
	doc.insert(ignore_permissions=True)


def seed_photo_evidence():
	if frappe.db.count("Photo Evidence"):
		return
	kind = _first("Photo Kind", {"code": "site"}) or _first("Photo Kind")
	req = _first("Test Request")
	sample = _first("Archived Sample")
	frappe.get_doc(
		{
			"doctype": "Photo Evidence",
			"photo_kind": kind,
			"caption": "صورة موقع تجريبية",
			"taken_at": now_datetime(),
			"lat": 24.839,
			"lng": 46.654,
			"accuracy_m": 2.4,
			"device": "seed-device",
			"content_hash": hashlib.sha256(b"seed-photo").hexdigest()[:16],
			"test_request": req,
			"archived_sample": sample,
		}
	).insert(ignore_permissions=True)


def seed_ratings():
	if frappe.db.count("Lab Rating"):
		return
	# Rating is allowed only on ended contracts — clone an active one as ended for demo.
	active = _first("Service Contract", {"is_active": 1})
	if not active:
		return
	src = frappe.get_doc("Service Contract", active)
	ended = frappe.get_doc(
		{
			"doctype": "Service Contract",
			"contractor": src.contractor,
			"lab": src.lab,
			"consultant": src.consultant,
			"project_name": f"{src.project_name} — منتهٍ (seed)",
			"city": src.city,
			"payment_term": src.payment_term,
			"started_on": add_days(nowdate(), -400),
			"ended_on": add_days(nowdate(), -30) if src.meta.has_field("ended_on") else None,
			"is_active": 0,
		}
	)
	for row in src.services or []:
		ended.append("services", {"service_type": row.service_type})
	for row in (src.items or [])[:3]:
		ended.append(
			"items",
			{
				"reference_test": row.reference_test,
				"test_method": row.test_method,
				"uom": row.uom,
				"price": row.price,
				"sla_days": row.sla_days,
			},
		)
	ended.flags.ignore_permissions = True
	ended.insert(ignore_permissions=True)
	try:
		ended.submit()
	except Exception:
		pass
	frappe.db.set_value("Service Contract", ended.name, "is_active", 0)
	doc = frappe.get_doc(
		{
			"doctype": "Lab Rating",
			"service_contract": ended.name,
			"status": "STS06",
			"comment": "تقييم تجريبي بعد migrate — جودة والتزام جيدة.",
		}
	)
	for key, score in (("quality", 5), ("punctuality", 4), ("communication", 5)):
		doc.append("scores", {"dimension_key": key, "score": score})
	doc.insert(ignore_permissions=True)


def seed_support_tickets():
	if frappe.db.count("Support Ticket"):
		return
	cat = _first("Ticket Category")
	st = _first("Ticket Status")
	user = frappe.db.get_value("User", {"mobile_no": "0551234567"}, "name") or "Administrator"
	req = _first("Test Request")
	frappe.get_doc(
		{
			"doctype": "Support Ticket",
			"subject": "استفسار تجريبي عن مهلة القرار",
			"category": cat,
			"ticket_status": st,
			"status": "قيد المعالجة",
			"raised_by": user,
			"related_request": req,
			"description": "تذكرة أولية من seed بعد migrate.",
		}
	).insert(ignore_permissions=True)


def seed_delegations():
	if frappe.db.count("Delegation"):
		return
	# Pick a request whose lab matches lab users 0559876543 / 0559876544
	lab = _org("4030123456")
	req = _first("Test Request", {"lab": lab}) if lab else _first("Test Request")
	from_user = frappe.db.get_value("User", {"mobile_no": "0559876543"}, "name")
	to_user = frappe.db.get_value("User", {"mobile_no": "0559876544"}, "name")
	if not (req and from_user and to_user):
		return
	# Ensure users are linked to the request lab
	lab_of_req = frappe.db.get_value("Test Request", req, "lab")
	for user in (from_user, to_user):
		if not frappe.db.exists("Organization User", {"user": user, "organization": lab_of_req}):
			try:
				frappe.get_doc(
					{
						"doctype": "Organization User",
						"user": user,
						"organization": lab_of_req,
						"position": "Employee",
						"can_delegate": 1,
						"is_active": 1,
					}
				).insert(ignore_permissions=True)
			except Exception:
				pass
	doc = frappe.get_doc(
		{
			"doctype": "Delegation",
			"delegation_type": "Direct",
			"scope": "Request",
			"status": "STS23",
			"test_request": req,
			"from_user": from_user,
			"to_user": to_user,
			"decided_at": now_datetime(),
		}
	)
	doc.flags.ignore_permissions = True
	try:
		doc.insert(ignore_permissions=True)
	except Exception:
		# Soft-fail — validation rules vary by request party
		frappe.log_error(title="Miyar seed_ops failed: seed_delegations")


def seed_method_sheets():
	if frappe.db.count("Method Sheet"):
		return
	rt = _first("Reference Test")
	if not rt:
		return
	method = frappe.db.get_value("Reference Test Method", {"parent": rt}, "test_method") or _first("Test Method")
	if not method:
		return
	doc = frappe.get_doc(
		{
			"doctype": "Method Sheet",
			"reference_test": rt,
			"test_method": method,
			"title": "ورقة طريقة تجريبية",
			"form_code": "MS-SEED-01",
			"specimen_desc": "عينة قياسية وفق الطريقة المعتمدة",
			"environment": "درجة حرارة 23±2 °C",
			"uncertainty": "حسب شهادة المعايرة",
			"reporting": "حقول مهيكلة + PDF",
			"acceptance": "وفق مواصفات المشروع",
		}
	)
	doc.append("procedure", {"step": 1, "instruction": "تجهيز العينة"})
	doc.append("procedure", {"step": 2, "instruction": "تنفيذ القياس وتسجيل النتيجة"})
	eq = _first("Equipment Type")
	if eq:
		doc.append("equipment_types", {"equipment_type": eq})
	doc.insert(ignore_permissions=True)


def seed_scheduled_reports():
	if frappe.db.count("Scheduled Report"):
		return
	frappe.get_doc(
		{
			"doctype": "Scheduled Report",
			"title": "تقرير التشغيل الأسبوعي",
			"report_name": "miyar-ops-weekly",
			"frequency": "weekly",
			"recipient_role": "System Manager",
			"output_format": "PDF",
			"is_active": 1,
		}
	).insert(ignore_permissions=True)


def seed_engine_runs():
	if frappe.db.count("Engine Run"):
		return
	profile = _first("Engine Profile")
	req = _first("Test Request")
	study = _first("Geotechnical Study")
	frappe.get_doc(
		{
			"doctype": "Engine Run",
			"profile": profile,
			"mode": "cloud",
			"overall_status": "PARTIALLY_COMPLIANT",
			"ran_at": now_datetime(),
			"actor": "Administrator",
			"test_request": req,
			"study": study,
			"effective_for_production": 0,
			"result": '{"summary":"seed run"}',
			"route_used": "cloud",
			"tokens": 1200,
			"cost": 0,
		}
	).insert(ignore_permissions=True)


def seed_ops():
	"""Seed every transactional DocType that masters/demo do not cover."""
	steps = [
		seed_policies,
		seed_audit_events,
		seed_quotes,
		seed_test_requests_and_lines,
		seed_invoices,
		seed_platform_documents,
		seed_archived_samples,
		seed_photo_evidence,
		seed_ratings,
		seed_support_tickets,
		seed_delegations,
		seed_method_sheets,
		seed_scheduled_reports,
		seed_engine_runs,
	]
	for fn in steps:
		try:
			fn()
			frappe.db.commit()
		except Exception:
			frappe.db.rollback()
			frappe.log_error(title=f"Miyar seed_ops failed: {fn.__name__}")
			# continue other DocTypes — one failure must not block migrate
			continue
