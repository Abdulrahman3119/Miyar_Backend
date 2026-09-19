# Copyright (c) 2026, Miyar and contributors
# License: MIT. See LICENSE

"""Idempotent demo orgs/users so the SPA can log in with the mock mobile numbers."""

from __future__ import annotations

import frappe

from miyar.utils.org import sync_user_role

SPECIALTIES = ["تربة", "إسفلت", "خرسانة", "جيوتقنية", "ركام", "طرق", "إنشاءات"]

ORGS = [
	{
		"cr": "4030123456",
		"organization_name": "مختبر التربة والمواد",
		"organization_type": "lab",
		"territory": "جدة",
		"phone": "+966 12 673 0123",
		"email": "info@soilmat-lab.sa",
		"about": "مختبر متخصص في اختبارات التربة والطرق والمواد الإنشائية.",
		"specialties": ["تربة", "إسفلت", "خرسانة"],
		"rating": 4.2,
		"reviews": 38,
		"featured": 1,
		"on_time": 91,
		"directory_status": "STS04",
		"saac": {"saac_number": "SAC-L-2021-004", "scope": "اختبارات التربة", "expires_on": "2027-03-01"},
	},
	{
		"cr": "1010987654",
		"organization_name": "مختبر الجودة الشاملة",
		"organization_type": "lab",
		"territory": "الرياض",
		"phone": "+966 11 456 7890",
		"email": "lab@tqlab.sa",
		"about": "مختبر رائد في الفحوصات الجيوتقنية.",
		"specialties": ["تربة", "جيوتقنية", "ركام"],
		"rating": 4.8,
		"reviews": 62,
		"on_time": 97,
		"directory_status": "STS04",
		"saac": {"saac_number": "SAC-L-2019-011", "scope": "الجيوتقنية", "expires_on": "2026-12-31"},
	},
	{
		"cr": "1010111222",
		"organization_name": "شركة الإنشاءات المتكاملة",
		"organization_type": "contractor",
		"territory": "الرياض",
		"phone": "+966 11 222 3344",
		"email": "info@integrated-const.sa",
		"about": "شركة متخصصة في أعمال الإنشاء والبنية التحتية.",
		"specialties": ["طرق", "إنشاءات"],
		"directory_status": "STS04",
	},
	{
		"cr": "4030777888",
		"organization_name": "مكتب الاستشارات الهندسية المتكاملة",
		"organization_type": "consultant",
		"territory": "جدة",
		"phone": "+966 12 667 7889",
		"email": "info@iec.sa",
		"about": "استشارات جيوتقنية وهندسية.",
		"specialties": ["جيوتقنية", "طرق"],
		"directory_status": "STS04",
	},
	{
		"cr": "0000000001",
		"organization_name": "الإدارة العامة لكود البناء السعودي",
		"organization_type": "supervisor",
		"territory": "الرياض",
		"directory_status": "STS05",
		"active": 1,
	},
	{
		"cr": "0000000002",
		"organization_name": "فريق تشغيل معيار",
		"organization_type": "ops",
		"territory": "الرياض",
		"directory_status": "STS05",
		"active": 1,
	},
]

USERS = [
	# مقاول — شركة الإنشاءات المتكاملة
	("ahmad.otaibi@miyar.demo", "أحمد العتيبي", "0551234567", "1010111222", "Principal"),
	("sara.dossary@miyar.demo", "سارة الدوسري", "0551234568", "1010111222", "Employee"),
	# مختبر 1 — مختبر التربة والمواد (جدة)
	("mohammed.subaie@miyar.demo", "محمد السبيعي", "0559876543", "4030123456", "Principal"),
	("faisal.qahtani@miyar.demo", "فيصل القحطاني", "0559876544", "4030123456", "Employee"),
	# مختبر 2 — مختبر الجودة الشاملة (الرياض)
	("noura.rashid@miyar.demo", "نورة الراشد", "0559876550", "1010987654", "Principal"),
	("omar.shahrani@miyar.demo", "عمر الشهراني", "0559876551", "1010987654", "Employee"),
	# استشاري — مكتب الاستشارات الهندسية المتكاملة
	("khaled.asiri@miyar.demo", "خالد العسيري", "0553334444", "4030777888", "Principal"),
	("reem.harbi@miyar.demo", "ريم الحربي", "0553334445", "4030777888", "Employee"),
	# إشراف — الإدارة العامة لكود البناء السعودي
	("abdullah.ghamdi@miyar.demo", "عبدالله الغامدي", "0551112222", "0000000001", "Principal"),
	("layan.qahtani@miyar.demo", "ليان القحطاني", "0551112223", "0000000001", "Employee"),
	# تشغيل معيار — أدمن + دعم
	("yasser.ali@miyar.demo", "ياسر العلي", "0550001111", "0000000002", "Principal"),
	("rehab.madkhali@miyar.demo", "رحاب مدخلي", "0550001112", "0000000002", "Employee"),
]


def _ensure_specialties():
	for i, label in enumerate(SPECIALTIES, 1):
		if frappe.db.exists("Organization Specialty Def", label):
			continue
		doc = frappe.get_doc(
			{"doctype": "Organization Specialty Def", "label_ar": label, "code": f"sp-{i:02d}", "is_active": 1, "sort_order": i}
		)
		doc.insert(ignore_permissions=True)


def _territory(city: str) -> str:
	if frappe.db.exists("Territory", city):
		return city
	return frappe.db.get_value("Territory", {}, "name") or city


def _upsert_org(spec: dict) -> str:
	existing = frappe.db.get_value("Organization", {"cr": spec["cr"]}, "name")
	values = {
		"organization_name": spec["organization_name"],
		"organization_type": spec["organization_type"],
		"cr": spec["cr"],
		"territory": _territory(spec.get("territory") or "الرياض"),
		"phone": spec.get("phone"),
		"email": spec.get("email"),
		"about": spec.get("about"),
		"directory_status": spec.get("directory_status", "STS04"),
		"active": spec.get("active", 1),
		"featured": spec.get("featured", 0),
		"rating": spec.get("rating", 0),
		"reviews": spec.get("reviews", 0),
		"on_time": spec.get("on_time", 0),
	}
	if existing:
		doc = frappe.get_doc("Organization", existing)
		doc.update({k: v for k, v in values.items() if v is not None})
	else:
		doc = frappe.get_doc({"doctype": "Organization", **values})
	doc.specialties = []
	for label in spec.get("specialties") or []:
		if frappe.db.exists("Organization Specialty Def", label):
			doc.append("specialties", {"specialty": label})
	if spec.get("saac") and not doc.saac:
		doc.append("saac", spec["saac"])
	doc.flags.ignore_permissions = True
	if doc.is_new():
		doc.insert()
	else:
		doc.save()
	return doc.name


def _ensure_user(email: str, full_name: str, mobile: str) -> str:
	if frappe.db.exists("User", email):
		frappe.db.set_value("User", email, {"mobile_no": mobile, "full_name": full_name, "enabled": 1, "first_name": full_name.split()[0]})
		return email
	doc = frappe.get_doc(
		{
			"doctype": "User",
			"email": email,
			"first_name": full_name.split()[0],
			"last_name": " ".join(full_name.split()[1:]) or full_name,
			"full_name": full_name,
			"mobile_no": mobile,
			"send_welcome_email": 0,
			"enabled": 1,
			"user_type": "System User",
			"language": "ar",
		}
	)
	doc.flags.no_welcome_mail = True
	doc.flags.ignore_permissions = True
	doc.insert()
	return doc.name


def _link_org_user(user: str, organization: str, position: str):
	if frappe.db.exists("Organization User", {"user": user}):
		name = frappe.db.get_value("Organization User", {"user": user}, "name")
		frappe.db.set_value("Organization User", name, {"organization": organization, "position": position, "is_active": 1, "can_delegate": 1 if position == "Principal" else 0})
		sync_user_role(frappe.get_doc("Organization User", name))
		return
	doc = frappe.get_doc(
		{
			"doctype": "Organization User",
			"organization": organization,
			"user": user,
			"position": position,
			"is_active": 1,
			"can_delegate": 1 if position == "Principal" else 0,
		}
	)
	doc.flags.ignore_permissions = True
	doc.insert()


def _seed_catalog(lab: str):
	if frappe.db.exists("Lab Catalog Item", {"lab": lab}):
		# still ensure geotech if missing
		_ensure_geotech_catalog(lab)
		return
	codes = ["RT-PROCTOR", "RT-CBR", "RT-SIEVE", "RT-ATTERBERG", "RT-MC", "RT-FDT"]
	for code in codes:
		rt = frappe.db.get_value("Reference Test", {"code": code}, "name")
		if not rt:
			continue
		uom = frappe.db.get_value("Reference Test UOM", {"parent": rt}, "uom") or "Ea"
		methods = frappe.get_all("Reference Test Method", filters={"parent": rt}, pluck="test_method")
		doc = frappe.get_doc(
			{
				"doctype": "Lab Catalog Item",
				"lab": lab,
				"reference_test": rt,
				"uom": uom,
				"base_price": 450,
				"sla_days": 3,
			}
		)
		for m in methods[:2]:
			doc.append("methods", {"test_method": m})
		doc.flags.ignore_permissions = True
		doc.insert()
	_ensure_geotech_catalog(lab)


def _ensure_geotech_catalog(lab: str):
	rt = frappe.db.get_value("Reference Test", {"code": "RT-GEOTECH"}, "name") or frappe.db.get_value(
		"Reference Test", {"is_geotech": 1}, "name"
	)
	if not rt or frappe.db.exists("Lab Catalog Item", {"lab": lab, "reference_test": rt}):
		return
	uom = frappe.db.get_value("Reference Test UOM", {"parent": rt}, "uom") or "Ea"
	methods = frappe.get_all("Reference Test Method", filters={"parent": rt}, pluck="test_method")
	doc = frappe.get_doc(
		{
			"doctype": "Lab Catalog Item",
			"lab": lab,
			"reference_test": rt,
			"uom": uom,
			"base_price": 18500,
			"sla_days": 21,
			"status": "STS01",
		}
	)
	for m in methods[:1]:
		doc.append("methods", {"test_method": m})
	doc.flags.ignore_permissions = True
	doc.insert()


def _seed_contracts(by_cr: dict):
	"""Active demo contracts so طلبات الاختبار can be created without quoting first."""
	if frappe.db.count("Service Contract"):
		return
	contractor = by_cr.get("1010111222")
	consultant = by_cr.get("4030777888")
	labs = [
		(by_cr.get("4030123456"), "مشروع طريق الملك عبدالله — الرياض", "الرياض", ["standard"]),
		(by_cr.get("1010987654"), "مجمّع سكني النرجس — الرياض", "الرياض", ["standard", "geotech"]),
	]
	payment = frappe.db.get_value("Payment Term Code", {"code": "on-completion"}, "name") or "on-completion"
	for lab, project, city, services in labs:
		if not (contractor and lab and consultant):
			continue
		doc = frappe.get_doc(
			{
				"doctype": "Service Contract",
				"contractor": contractor,
				"lab": lab,
				"consultant": consultant,
				"project_name": project,
				"city": city if frappe.db.exists("Territory", city) else None,
				"payment_term": payment,
				"started_on": frappe.utils.nowdate(),
				"is_active": 1,
			}
		)
		for svc in services:
			st = frappe.db.get_value("Service Type", {"code": svc}, "name") or svc
			doc.append("services", {"service_type": st})
		# freeze a few catalog prices as contract items
		for item in frappe.get_all(
			"Lab Catalog Item",
			filters={"lab": lab},
			fields=["name", "reference_test", "base_price", "sla_days"],
			limit=6,
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
		doc.flags.ignore_permissions = True
		doc.insert()
		doc.submit()


def seed_demo():
	_ensure_specialties()
	by_cr = {}
	for spec in ORGS:
		by_cr[spec["cr"]] = _upsert_org(spec)
	for email, name, mobile, cr, position in USERS:
		org = by_cr.get(cr)
		if not org:
			continue
		user = _ensure_user(email, name, mobile)
		_link_org_user(user, org, position)
	for cr, org in by_cr.items():
		if next(s for s in ORGS if s["cr"] == cr)["organization_type"] == "lab":
			_seed_catalog(org)
	_seed_contracts(by_cr)
	frappe.db.commit()
