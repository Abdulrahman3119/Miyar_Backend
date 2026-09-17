# Copyright (c) 2026, Miyar and contributors
# License: MIT. See LICENSE

"""Idempotent master data from ERPNext-DocTypes.md sections 3 and 18."""

from __future__ import annotations

import json

import frappe
from frappe.utils import cint

from miyar.constants import MODULE


def _upsert(doctype: str, name: str | None, values: dict, autoname_field: str | None = None):
	if name and frappe.db.exists(doctype, name):
		doc = frappe.get_doc(doctype, name)
		doc.update(values)
		doc.save(ignore_permissions=True)
		return doc
	if autoname_field and values.get(autoname_field) and frappe.db.exists(doctype, {autoname_field: values[autoname_field]}):
		existing = frappe.db.get_value(doctype, {autoname_field: values[autoname_field]}, "name")
		doc = frappe.get_doc(doctype, existing)
		doc.update(values)
		doc.save(ignore_permissions=True)
		return doc
	doc = frappe.new_doc(doctype)
	doc.update(values)
	if name:
		doc.name = name
	doc.insert(ignore_permissions=True)
	if name and doc.name != name:
		from frappe.model.rename_doc import rename_doc

		rename_doc(doctype, doc.name, name, force=True, ignore_permissions=True)
		doc = frappe.get_doc(doctype, name)
	return doc


def _simple(doctype, code, label_ar, **extra):
	name = code or label_ar
	values = {"code": code, "label_ar": label_ar, "is_active": 1, **extra}
	# DocTypes autonamed by label_ar use the Arabic text as name
	meta = frappe.get_meta(doctype)
	autoname = meta.autoname or ""
	if autoname == "field:label_ar":
		return _upsert(doctype, label_ar, values)
	if autoname == "field:code":
		return _upsert(doctype, code, values)
	return _upsert(doctype, name, values)


def seed_organization_types():
	rows = [
		("contractor", "مقاول", 1, 0, 1),
		("lab", "مختبر", 1, 1, 1),
		("consultant", "مكتب استشاري", 1, 0, 1),
		("supervisor", "جهة إشرافية", 0, 0, 0),
		("ops", "تشغيل المنصة", 0, 0, 0),
	]
	for i, (code, label, self_reg, directory, party) in enumerate(rows, 1):
		_simple(
			"Organization Type",
			code,
			label,
			can_self_register=self_reg,
			appears_in_directory=directory,
			is_operational_party=party,
			sort_order=i,
		)


def seed_coded_lists():
	lists = {
		"Priority": [("normal", "عادية"), ("high", "عالية"), ("critical", "حرجة")],
		"Payment Term Code": [("advance", "مقدم"), ("on-completion", "عند الاكتمال")],
		"Service Type": [("standard", "قياسي"), ("geotech", "دراسة جيوتقنية")],
		"Building Type": [("residential", "سكني"), ("commercial", "تجاري"), ("industrial", "صناعي")],
		"Structure Type": [("rc", "خرساني مسلح"), ("steel", "معدني")],
		"Foundation Type": [("unknown", "غير محدد"), ("isolated", "قواعد منفصلة"), ("raft", "لبشة")],
		"Sample Type": [("SPT", "SPT"), ("UD", "UD"), ("D", "D"), ("CS", "CS")],
		"Sample Kind": [("soil", "تربة"), ("rock", "صخر")],
		"Photo Kind": [
			("sample", "عينة"),
			("specimen", "نموذج"),
			("measurement", "قياس"),
			("equipment", "معدة"),
			("site", "موقع"),
			("instrument", "جهاز"),
		],
		"Document Type": [
			("report", "تقرير"),
			("borehole-log", "سجل جسة"),
			("test-result", "نتيجة اختبار"),
			("certificate", "شهادة"),
			("contract", "عقد"),
			("deed", "صك"),
			("invoice", "فاتورة"),
			("photo", "صورة"),
		],
		"Payment Channel": [("sadad", "سداد"), ("mada", "مدى"), ("bank", "تحويل بنكي")],
		"Engine Policy": [
			("screen-then-cloud", "فحص ثم سحابة"),
			("cloud-first", "سحابة أولاً"),
			("local-first", "محلي أولاً"),
			("compare", "مقارنة"),
		],
	}
	for doctype, rows in lists.items():
		for i, (code, label) in enumerate(rows, 1):
			_simple(doctype, code, label, sort_order=i)

	label_named = {
		"Site Condition": [
			"قرب طريق رئيسي",
			"أرض مستوية",
			"أرض منحدرة",
			"مياه سطحية",
			"ردم سابق",
			"مبانٍ ملاصقة",
			"شبكة مرافق قائمة",
		],
		"Borehole Method": [
			"حفر دوراني رطب (Rotary Wash)",
			"حفر دوراني جاف (Dry Rotary)",
			"حفر لولبي (Auger)",
		],
		"Weather Condition": ["صافٍ", "غائم", "ممطر", "عاصف"],
		"Soil Color": ["بني فاتح", "بني", "بني داكن", "رمادي فاتح", "رمادي"],
		"Gradation": ["ناعم", "ناعم إلى متوسط", "متوسط", "متوسط إلى خشن", "خشن"],
		"Moisture Description": ["جافة", "رطبة قليلاً", "رطبة", "مبللة", "مشبعة"],
		"Document Classification": ["عام", "داخلي", "سري"],
		"Sample Archive Kind": [
			"كور خرساني",
			"مكعب خرساني",
			"تربة مضطربة",
			"تربة غير مضطربة (UD)",
			"عينة SPT",
			"كور صخري",
			"إسفلت",
			"ركام",
			"حديد تسليح",
		],
		"Sample Condition": ["سليمة", "متشققة", "مكسورة جزئياً"],
		"Equipment Type": [
			"ضغط/شد",
			"أبعاد",
			"كتلة",
			"حرارة",
			"اختراق",
			"كثافة",
			"حفر",
			"اختراق قياسي",
			"منسوب",
			"موقع",
			"تدرج",
			"جهد صدأ",
			"بيئة",
		],
		"Ticket Category": ["فني", "حساب وصلاحيات", "اعتماد منشأة", "مالي", "اقتراح"],
		"Ticket Status": ["قيد المعالجة", "بانتظار مدير النظام", "مغلقة"],
	}
	for doctype, labels in label_named.items():
		for i, label in enumerate(labels, 1):
			_simple(doctype, f"{i:02d}", label, sort_order=i)
	# Soil color allow_other on last? spec says allow_other for free description — enable on the master generally via a dedicated row not needed.

	uscs = [
		("SM", "رمل طمي", "#E8DFA8", 0),
		("SC", "رمل طيني", "#D9C27A", 0),
		("SW", "رمل جيد التدرج", "#EFE6B5", 0),
		("SP", "رمل ضعيف التدرج", "#F2EBC4", 0),
		("ML", "طمي منخفض اللدونة", "#CFCBB8", 0),
		("CL", "طين منخفض اللدونة", "#B9B39A", 0),
		("CH", "طين عالي اللدونة", "#9E987F", 0),
		("GW", "حصى جيد التدرج", "#C9C2A0", 0),
		("GP", "حصى ضعيف التدرج", "#D5CFAF", 0),
		("ROCK", "صخر", "#A89F8C", 1),
	]
	for i, (code, label, color, rock) in enumerate(uscs, 1):
		_simple("USCS Classification", code, label, color_hex=color, is_rock=rock, sort_order=i)

	spt = [
		("very-loose", "مفككة جداً", 0, 3),
		("loose", "مفككة", 4, 9),
		("medium", "متوسطة الكثافة", 10, 29),
		("dense", "كثيفة", 30, 49),
		("very-dense", "كثيفة جداً", 50, 999),
	]
	for i, (code, label, nmin, nmax) in enumerate(spt, 1):
		_simple("Spt Density Class", code, label, n_min=nmin, n_max=nmax, sort_order=i)

	steps = [
		("collect", "جمع", "في الموقع", 1),
		("transport", "نقل", "قيد النقل", 2),
		("receive", "استلام", "مستلمة", 3),
		("prepare", "تجهيز", "قيد التجهيز", 4),
		("test", "اختبار", "قيد الاختبار", 5),
		("tested", "مختبرة", "مختبرة", 6),
		("store", "تخزين", "مؤرشفة", 7),
		("dispose", "إتلاف", "متلفة", 8),
	]
	for code, label, status, sort in steps:
		_simple("Custody Step", code, label, maps_to_sample_status=status, sort_order=sort)

	seismic = [
		("B", "B", "760–1500 m/s", "—", "—"),
		("C", "C", "360–760", "> 50", "> 100 kPa"),
		("D", "D", "180–360", "15–50", "50–100"),
		("E", "E", "< 180", "< 15", "< 50"),
	]
	for i, (code, label, vs, nbar, su) in enumerate(seismic, 1):
		_simple("Seismic Site Class", code, label, vs30=vs, n_bar=nbar, su=su, sort_order=i)

	ecc = [
		("1", "حوكمة", 22),
		("2", "تعزيز", 46),
		("3", "صمود", 12),
		("4", "أطراف ثالثة وسحابة", 28),
	]
	for code, title, total in ecc:
		_upsert(
			"ECC Control Domain",
			code,
			{"code": code, "title_ar": title, "total_controls": total, "implemented": 0},
		)

	bodies = [("ASTM", "ASTM"), ("AASHTO", "AASHTO"), ("BS", "BS"), ("SBC", "SBC"), ("IP", "IP"), ("ISO", "ISO")]
	for i, (code, label) in enumerate(bodies, 1):
		_simple("Method Body", code, label, sort_order=i)

	profiles = [
		"الدراسة الجيوتقنية — منصة معيار",
		"الفحص والتقييم الإنشائي",
		"تقرير هندسي عام — نسخة العرض",
	]
	for i, code in enumerate(profiles, 1):
		_upsert("Engine Profile", code, {"code": code, "label_ar": code, "is_active": 1, "sort_order": i})


def seed_uom_and_item_groups():
	for uom, desc in (("Ea", "عدد لكل عينة"), ("Set", "طقم"), ("per Test", "خدمة متكاملة")):
		if not frappe.db.exists("UOM", uom):
			doc = frappe.new_doc("UOM")
			doc.uom_name = uom
			if doc.meta.has_field("must_be_whole_number"):
				doc.must_be_whole_number = 1 if uom != "per Test" else 0
			doc.insert(ignore_permissions=True)
		if frappe.db.has_column("UOM", "description"):
			try:
				frappe.db.set_value("UOM", uom, "description", desc)
			except Exception:
				pass
	groups = ["اختبارات التربة", "اختبارات الإسفلت", "اختبارات الخرسانة", "اختبارات الركام"]
	root = None
	if frappe.db.exists("Item Group", "All Item Groups"):
		root = "All Item Groups"
	for name in groups:
		if frappe.db.exists("Item Group", name):
			continue
		doc = frappe.new_doc("Item Group")
		doc.item_group_name = name
		if root:
			doc.parent_item_group = root
		doc.is_group = 0
		doc.insert(ignore_permissions=True)


def seed_test_methods():
	methods = [
		("ASTM D698", "Standard Proctor", "ASTM"),
		("ASTM D1557", "Modified Proctor", "ASTM"),
		("BS 1377-4", "BS Compaction / CBR", "BS"),
		("AASHTO T-99", "AASHTO Proctor", "AASHTO"),
		("ASTM D1883", "CBR", "ASTM"),
		("ASTM D422", "Sieve Analysis", "ASTM"),
		("ASTM D6913", "Particle Size", "ASTM"),
		("ASTM D4318", "Atterberg Limits", "ASTM"),
		("ASTM D2216", "Moisture Content", "ASTM"),
		("ASTM D1556", "Sand Cone", "ASTM"),
		("ASTM D2435", "Consolidation", "ASTM"),
		("ASTM D3080", "Direct Shear", "ASTM"),
		("ASTM D4546", "Swell", "ASTM"),
		("ASTM D4829", "Free Swell", "ASTM"),
		("ASTM D5333", "Collapse", "ASTM"),
		("ASTM D2166", "UCS Soil", "ASTM"),
		("ASTM D7012", "UCS Rock", "ASTM"),
		("ASTM D6927", "Marshall", "ASTM"),
		("BS EN 12697", "Bituminous mixtures", "BS"),
		("ASTM D5", "Penetration", "ASTM"),
		("IP 49", "Penetration IP", "IP"),
		("ASTM D2726", "Asphalt Core Density", "ASTM"),
		("BS EN 12390-3", "Cube Strength", "BS"),
		("ASTM C42", "Concrete Core", "ASTM"),
		("ASTM C143", "Slump", "ASTM"),
		("ASTM C876", "Half-Cell", "ASTM"),
		("ASTM A370", "Rebar Tensile", "ASTM"),
		("ISO 6892-1", "Metallic tensile", "ISO"),
		("ASTM C131", "LA Abrasion", "ASTM"),
		("ASTM C127", "Aggregate SG", "ASTM"),
		("SBC 303", "Geotechnical Investigation", "SBC"),
		("ASTM D4972", "pH", "ASTM"),
		("BS 1377-3", "Chemical soils", "BS"),
		("ASTM D4373", "Carbonate", "ASTM"),
		("ASTM D2974", "Organic", "ASTM"),
		("ASTM D1586", "SPT", "ASTM"),
		("ASTM D2487", "USCS Classification", "ASTM"),
	]
	for code, name, body in methods:
		_upsert(
			"Test Method",
			code,
			{"code": code, "method_name": name, "method_body": body, "is_active": 1},
		)


def seed_reference_tests():
	defs = [
		{
			"code": "RT-PROCTOR",
			"ar": "اختبار الدمك القياسي",
			"en": "Standard Proctor Test",
			"group": "اختبارات التربة",
			"uoms": ["Ea"],
			"methods": ["ASTM D698", "ASTM D1557", "BS 1377-4", "AASHTO T-99"],
			"fields": [
				("mdd", "الكثافة الجافة القصوى MDD", "Mg/m³"),
				("omc", "نسبة الرطوبة المثلى OMC", "%"),
				("fc", "درجة الدمك الحقلية", "%"),
			],
		},
		{
			"code": "RT-CBR",
			"ar": "اختبار CBR",
			"en": "California Bearing Ratio",
			"group": "اختبارات التربة",
			"uoms": ["Ea"],
			"methods": ["ASTM D1883", "BS 1377-4"],
			"fields": [("cbr", "قيمة CBR", "%"), ("swell", "الانتفاخ", "%")],
		},
		{
			"code": "RT-SIEVE",
			"ar": "التحليل الحبيبي",
			"en": "Sieve Analysis",
			"group": "اختبارات التربة",
			"uoms": ["Ea"],
			"methods": ["ASTM D422", "ASTM D6913"],
			"fields": [("p200", "المار من منخل 200", "%")],
		},
		{
			"code": "RT-ATTERBERG",
			"ar": "حدود أتربرج",
			"en": "Atterberg Limits",
			"group": "اختبارات التربة",
			"uoms": ["Ea"],
			"methods": ["ASTM D4318"],
			"fields": [
				("ll", "حد السيولة", "%"),
				("pl", "حد اللدونة", "%"),
				("pi", "مؤشر اللدونة", "%"),
			],
		},
		{
			"code": "RT-MC",
			"ar": "معامل الرطوبة",
			"en": "Moisture Content",
			"group": "اختبارات التربة",
			"uoms": ["Ea"],
			"methods": ["ASTM D2216"],
			"fields": [("mc", "المحتوى الرطوبي", "%")],
		},
		{
			"code": "RT-FDT",
			"ar": "الكثافة الحقلية (المخروط الرملي)",
			"en": "Field Density – Sand Cone",
			"group": "اختبارات التربة",
			"uoms": ["Ea"],
			"methods": ["ASTM D1556"],
			"fields": [
				("dd", "الكثافة الجافة الحقلية", "Mg/m³"),
				("rc", "نسبة الدمك النسبي", "%"),
			],
		},
		{
			"code": "RT-CONSOL",
			"ar": "اختبار الانضغاطية",
			"en": "Consolidation Test",
			"group": "اختبارات التربة",
			"uoms": ["Ea"],
			"methods": ["ASTM D2435"],
			"fields": [],
		},
		{
			"code": "RT-SHEAR",
			"ar": "اختبار القص المباشر",
			"en": "Direct Shear Test",
			"group": "اختبارات التربة",
			"uoms": ["Ea"],
			"methods": ["ASTM D3080"],
			"fields": [("c", "التماسك", "kPa"), ("phi", "زاوية الاحتكاك", "°")],
		},
		{
			"code": "RT-SWELL",
			"ar": "اختبار الانتفاخ",
			"en": "Swell Test",
			"group": "اختبارات التربة",
			"uoms": ["Ea"],
			"methods": ["ASTM D4546", "ASTM D4829"],
			"fields": [],
		},
		{
			"code": "RT-COLLAPSE",
			"ar": "اختبار الانهيارية",
			"en": "Collapse Potential",
			"group": "اختبارات التربة",
			"uoms": ["Ea"],
			"methods": ["ASTM D5333"],
			"fields": [],
		},
		{
			"code": "RT-UCS",
			"ar": "مقاومة الضغط غير المحصور",
			"en": "Unconfined Compressive Strength",
			"group": "اختبارات التربة",
			"uoms": ["Ea"],
			"methods": ["ASTM D2166", "ASTM D7012"],
			"fields": [("ucs", "UCS", "MPa")],
		},
		{
			"code": "RT-MARSHALL",
			"ar": "اختبار المارشال",
			"en": "Marshall Test",
			"group": "اختبارات الإسفلت",
			"uoms": ["Set"],
			"methods": ["ASTM D6927", "BS EN 12697"],
			"fields": [("stab", "الثبات", "kN"), ("flow", "الانسياب", "mm")],
		},
		{
			"code": "RT-PEN",
			"ar": "اختبار الاختراق",
			"en": "Penetration Test",
			"group": "اختبارات الإسفلت",
			"uoms": ["Ea"],
			"methods": ["ASTM D5", "IP 49"],
			"fields": [("pen", "الاختراق", "0.1mm")],
		},
		{
			"code": "RT-CORE-ASPH",
			"ar": "كور إسفلتي",
			"en": "Asphalt Core",
			"group": "اختبارات الإسفلت",
			"uoms": ["Ea"],
			"methods": ["ASTM D2726"],
			"fields": [("thk", "السمك", "mm"), ("den", "الكثافة", "%")],
		},
		{
			"code": "RT-CUBE",
			"ar": "مقاومة ضغط المكعبات",
			"en": "Concrete Cube Strength",
			"group": "اختبارات الخرسانة",
			"uoms": ["Set"],
			"methods": ["BS EN 12390-3"],
			"fields": [
				("f7", "مقاومة 7 أيام", "MPa"),
				("f28", "مقاومة 28 يوماً", "MPa"),
			],
		},
		{
			"code": "RT-CORE",
			"ar": "كور خرساني",
			"en": "Concrete Core",
			"group": "اختبارات الخرسانة",
			"uoms": ["Ea"],
			"methods": ["ASTM C42"],
			"fields": [("fc", "مقاومة الضغط المصححة", "MPa")],
		},
		{
			"code": "RT-SLUMP",
			"ar": "اختبار الهبوط",
			"en": "Slump Test",
			"group": "اختبارات الخرسانة",
			"uoms": ["Ea"],
			"methods": ["ASTM C143"],
			"fields": [("slump", "الهبوط", "mm")],
		},
		{
			"code": "RT-HALFCELL",
			"ar": "كشف صدأ الحديد",
			"en": "Half-Cell Potential",
			"group": "اختبارات الخرسانة",
			"uoms": ["Ea"],
			"methods": ["ASTM C876"],
			"fields": [("pot", "أدنى جهد", "mV"), ("prob", "احتمالية الصدأ", "%")],
		},
		{
			"code": "RT-REBAR",
			"ar": "شد حديد التسليح",
			"en": "Rebar Tensile Test",
			"group": "اختبارات الخرسانة",
			"uoms": ["Ea"],
			"methods": ["ASTM A370", "ISO 6892-1"],
			"fields": [
				("fy", "إجهاد الخضوع", "MPa"),
				("fu", "إجهاد الشد الأقصى", "MPa"),
				("el", "الاستطالة", "%"),
			],
		},
		{
			"code": "RT-LA",
			"ar": "تآكل لوس أنجلوس",
			"en": "LA Abrasion",
			"group": "اختبارات الركام",
			"uoms": ["Ea"],
			"methods": ["ASTM C131"],
			"fields": [("la", "نسبة التآكل", "%")],
		},
		{
			"code": "RT-SG",
			"ar": "الوزن النوعي للركام",
			"en": "Specific Gravity",
			"group": "اختبارات الركام",
			"uoms": ["Ea"],
			"methods": ["ASTM C127"],
			"fields": [],
		},
		{
			"code": "RT-GEOTECH",
			"ar": "دراسة جيوتقنية شاملة",
			"en": "Geotechnical Investigation",
			"group": "اختبارات التربة",
			"uoms": ["per Test"],
			"methods": ["SBC 303"],
			"fields": [],
			"is_geotech": 1,
		},
	]
	for spec in defs:
		if frappe.db.exists("Reference Test", spec["code"]):
			doc = frappe.get_doc("Reference Test", spec["code"])
		else:
			doc = frappe.new_doc("Reference Test")
			doc.name = spec["code"]
		doc.code = spec["code"]
		doc.test_name_ar = spec["ar"]
		doc.test_name_en = spec["en"]
		doc.item_group = spec["group"]
		doc.is_geotech = spec.get("is_geotech", 0)
		doc.is_active = 1
		doc.units = []
		for uom in spec["uoms"]:
			doc.append("units", {"uom": uom})
		doc.methods = []
		for m in spec["methods"]:
			if frappe.db.exists("Test Method", m):
				doc.append("methods", {"test_method": m})
		doc.result_fields = []
		for i, (key, label, uom) in enumerate(spec["fields"], 1):
			doc.append("result_fields", {"field_key": key, "label_ar": label, "uom": uom, "sort_order": i})
		if doc.is_new():
			doc.flags.name_set = True
			doc.insert(ignore_permissions=True)
			if doc.name != spec["code"]:
				from frappe.model.rename_doc import rename_doc

				rename_doc("Reference Test", doc.name, spec["code"], force=True, ignore_permissions=True)
		else:
			doc.save(ignore_permissions=True)


def seed_acceptance_limits():
	rows = [
		("RT-PROCTOR", "fc", "≥ 95% للطبقات الحاملة · ≥ 90% للردم العام", "SBC 303 / MOMRAH specs"),
		("RT-PROCTOR", "omc", "±2% من OMC المعملية", "ASTM D1557"),
		("RT-CBR", "cbr", "≥ 8% طبقة التأسيس · ≥ 30% الأساس السفلي · ≥ 80% الأساس", "MOMRAH Roads §3"),
		("RT-CBR", "swell", "≤ 1% (تربة غير انتفاخية)", "ASTM D1883"),
		("RT-FDT", "rc", "≥ 95% من MDD المعدّل", "ASTM D1556"),
		("RT-ATTERBERG", "pi", "PI ≤ 6 لمواد الأساس · PI ≤ 12 للردم", "ASTM D4318"),
		("RT-ATTERBERG", "ll", "LL ≤ 25 لمواد الأساس", "MOMRAH Roads"),
		("RT-SIEVE", "p200", "≤ 12% لمواد الأساس", "ASTM D422"),
		("RT-MC", "mc", "ضمن OMC ±2%", "ASTM D2216"),
		("RT-SHEAR", "phi", "يُستخدم لحساب قدرة التحمل (Terzaghi)", "SBC 303 §2.6"),
		("RT-UCS", "ucs", "يُصنّف الصخر: ضعيف < 25 · متوسط 25–50 · قوي > 50 MPa", "ISRM"),
		("RT-MARSHALL", "stab", "≥ 8 kN للطبقة السطحية", "MOMRAH Roads §5"),
		("RT-MARSHALL", "flow", "2–4 mm", "ASTM D6927"),
		("RT-PEN", "pen", "60–70 (درجة البيتومين 60/70)", "ASTM D5"),
		("RT-CORE-ASPH", "den", "≥ 97% من كثافة مارشال", "ASTM D2726"),
		("RT-CUBE", "f28", "≥ المقاومة المميزة fcu المحددة بالتصميم", "SBC 304"),
		("RT-CUBE", "f7", "≈ 65–70% من مقاومة 28 يوماً", "BS EN 12390-3"),
		("RT-CORE", "fc", "≥ 85% من fc المحددة (متوسط 3 كور)", "ACI 318 / SBC 304"),
		("RT-SLUMP", "slump", "حسب التصميم ±25 mm", "ASTM C143"),
		("RT-LA", "la", "≤ 40% للأساس · ≤ 30% للإسفلت", "ASTM C131"),
	]
	for rt, key, rule, ref in rows:
		if not frappe.db.exists("Reference Test", rt):
			continue
		if frappe.db.exists("Acceptance Limit", {"reference_test": rt, "field_key": key}):
			continue
		frappe.get_doc(
			{
				"doctype": "Acceptance Limit",
				"reference_test": rt,
				"field_key": key,
				"rule_text": rule,
				"reference_text": ref,
			}
		).insert(ignore_permissions=True)


def seed_table_21():
	rows = [
		{
			"code": "T21-2F-LT600",
			"label_ar": "1–2 أدوار، مساحة أقل من 600 م²",
			"floors_min": 1,
			"floors_max": 2,
			"built_area_min_m2": 0,
			"built_area_max_m2": 599,
			"base_count": 3,
			"count_cap": 3,
			"depth_two_thirds_m": 4,
			"depth_one_third_m": 6,
			"is_special": 0,
			"borehole_count_rule": "ثابت 3",
		},
		{
			"code": "T21-2F-600-5000",
			"label_ar": "1–2 أدوار، 600–5000 م²",
			"floors_min": 1,
			"floors_max": 2,
			"built_area_min_m2": 600,
			"built_area_max_m2": 5000,
			"base_count": 3,
			"extra_per_m2": 700,
			"count_cap": 10,
			"depth_two_thirds_m": 5,
			"depth_one_third_m": 8,
			"is_special": 0,
			"borehole_count_rule": "3 + 1 لكل 700 م² (سقف 10)",
		},
		{
			"code": "T21-34F-LT600",
			"label_ar": "3–4 أدوار، مساحة أقل من 600 م²",
			"floors_min": 3,
			"floors_max": 4,
			"built_area_min_m2": 0,
			"built_area_max_m2": 599,
			"base_count": 3,
			"count_cap": 3,
			"depth_two_thirds_m": 6,
			"depth_one_third_m": 9,
			"is_special": 0,
			"borehole_count_rule": "ثابت 3",
		},
		{
			"code": "T21-34F-600-5000",
			"label_ar": "3–4 أدوار، 600–5000 م²",
			"floors_min": 3,
			"floors_max": 4,
			"built_area_min_m2": 600,
			"built_area_max_m2": 5000,
			"base_count": 3,
			"extra_per_m2": 700,
			"count_cap": 10,
			"depth_two_thirds_m": 8,
			"depth_one_third_m": 12,
			"is_special": 0,
			"borehole_count_rule": "3 + 1 لكل 700 م² (سقف 10)",
		},
		{
			"code": "T21-GT5000",
			"label_ar": "مساحة أكبر من 5000 م² — دراسة خاصة",
			"floors_min": 1,
			"floors_max": 4,
			"built_area_min_m2": 5001,
			"base_count": 0,
			"is_special": 1,
			"borehole_count_rule": "دراسة خاصة",
		},
		{
			"code": "T21-GE5F",
			"label_ar": "5 أدوار فأكثر — دراسة خاصة",
			"floors_min": 5,
			"built_area_min_m2": 0,
			"base_count": 0,
			"is_special": 1,
			"borehole_count_rule": "دراسة خاصة",
		},
	]
	for row in rows:
		_upsert("SBC Table 21 Row", row["code"], row)


def seed_chemical_optional_triggers():
	chem = [
		("ch-ph", "درجة الحموضة pH", "ASTM D4972", "6 – 9", "", 1, "سياسة منصة / SBC 304", "تنبيه"),
		("ch-so4", "كبريتات SO₄", "BS 1377-3", "< 0.2%", "%", 2, "سياسة منصة / SBC 304", "أسمنت Type V"),
		("ch-cl", "كلوريد Cl⁻", "BS 1377-3", "< 0.05%", "%", 3, "سياسة منصة / SBC 304", "غطاء أكبر"),
		("ch-carb", "كربونات", "ASTM D4373", "< 5%", "%", 4, "سياسة منصة / SBC 304", "تنبيه"),
		("ch-org", "مواد عضوية", "ASTM D2974", "< 3%", "%", 5, "سياسة منصة / SBC 304", "عدم صلاحية للردم"),
	]
	for code, label, method, limit, uom, sort, source, effect in chem:
		_upsert(
			"Chemical Test Def",
			code,
			{
				"code": code,
				"label_ar": label,
				"test_method": method if frappe.db.exists("Test Method", method) else None,
				"limit_text": limit,
				"uom": uom,
				"sort_order": sort,
				"is_mandatory": 1,
				"sabkha_requires_groundwater": 1,
				"matrix": "soil",
				"source_text": source,
				"exceedance_effect": effect,
			},
		)
	optional = [
		("opt-ucs", "اختبار الضغط غير المحصور (UCS)", "ASTM D2166"),
		("opt-shear", "القص المباشر (Direct Shear)", "ASTM D3080"),
		("opt-so4-total", "الكبريتات الكلية", "BS 1377-3"),
		("opt-swell", "الانتفاخ الحر (Free Swell)", "ASTM D4829"),
		("opt-consol", "الانضغاطية (Consolidation)", "ASTM D2435"),
		("opt-collapse", "الانهيارية (Collapse Index)", "ASTM D5333"),
	]
	for code, label, method in optional:
		_upsert(
			"Optional Lab Test Def",
			code,
			{
				"code": code,
				"label_ar": label,
				"test_method": method if frappe.db.exists("Test Method", method) else None,
				"is_active": 1,
			},
		)
	triggers = [
		("sabkha_n", "سبخة من SPT", "أي طبقة n_value ≤ 8", "Require Chemical GW", None),
		("swell_pi", "انتفاخ من PI / مار 200", "PI ≥ 15 أو مار #200 > 10%", "Suggest Optional Test", "opt-swell"),
		("special_floors", "دراسة خاصة", "floors ≥ 5 أو built_area > 5000", "Mark Special", None),
		("collapse_index", "انهيارية", "Collapse Index > 1%", "Suggest Optional Test", "opt-collapse"),
		("chemical_sample_pick", "اقتراح عينة كيميائية", "طبقة عمق التأسيس متجانسة", "Suggest Chemical Sample", None),
	]
	for code, label, cond, action, opt in triggers:
		if frappe.db.exists("Engine Trigger Rule", {"code": code}):
			continue
		frappe.get_doc(
			{
				"doctype": "Engine Trigger Rule",
				"code": code,
				"label_ar": label,
				"condition_expr": cond,
				"message_ar": label,
				"action": action,
				"optional_test": opt,
				"is_active": 1,
			}
		).insert(ignore_permissions=True)


def seed_mandatory_sample_rules():
	soil = frappe.db.get_value("Sample Kind", {"code": "soil"}, "name") or "soil"
	rock = frappe.db.get_value("Sample Kind", {"code": "rock"}, "name") or "rock"
	rules = [
		(soil, "RT-SIEVE", "ASTM D422", "التحليل الحبيبي", 1, 0, 1),
		(soil, "RT-ATTERBERG", "ASTM D4318", "أتربرج", 1, 0, 2),
		(soil, "RT-MC", "ASTM D2216", "رطوبة", 0, 1, 3),
		(soil, None, "ASTM D2487", "USCS", 0, 1, 4),
		(rock, "RT-UCS", "ASTM D7012", "UCS صخر", 1, 1, 1),
	]
	for kind, rt, method, label, att, val, sort in rules:
		filters = {"sample_kind": kind, "test_method": method}
		if frappe.db.exists("Mandatory Sample Test Rule", filters):
			continue
		frappe.get_doc(
			{
				"doctype": "Mandatory Sample Test Rule",
				"sample_kind": kind,
				"reference_test": rt if rt and frappe.db.exists("Reference Test", rt) else None,
				"test_method": method if frappe.db.exists("Test Method", method) else None,
				"label_ar": label,
				"requires_attachment": att,
				"requires_value": val,
				"sort_order": sort,
			}
		).insert(ignore_permissions=True)


def seed_settings():
	doc = frappe.get_single("Miyar Settings")
	defaults = {
		"max_tests_per_request": 10,
		"proposed_slots": 3,
		"min_lead_hours": 48,
		"lab_decision_hours": 12,
		"consultant_decision_hours": 48,
		"min_borehole_depth": 10,
		"geofence_meters": 3,
		"vat_rate": 15,
		"lab_timeout_action": "Expire",
		"quote_validity_days": 14,
		"compliance_move_penalty_pct": 2,
		"compliance_added_bh_penalty_pct": 4,
		"auto_approve_consultant": 1,
		"invoice_due_days": 30,
		"support_phone": "920000000",
		"support_field_emergency": "0550001112",
		"support_email": "support@miyar.gov.sa",
		"support_hours_text": "الأحد–الخميس 8–16",
		"saac_expiry_warn_days": 120,
		"sample_retention_soil_days": 90,
		"sample_retention_concrete_days": 180,
		"session_idle_minutes": 30,
	}
	if frappe.db.exists("Engine Policy", "screen-then-cloud"):
		defaults["engine_policy"] = "screen-then-cloud"
	doc.update(defaults)
	if not doc.rating_dimensions:
		for key, label, w in (("quality", "الجودة", 0.4), ("punctuality", "الالتزام بالموعد", 0.4), ("communication", "التواصل", 0.2)):
			doc.append("rating_dimensions", {"dimension_key": key, "label_ar": label, "weight": w})
	doc.save(ignore_permissions=True)


def seed_knowledge_v12():
	if frappe.db.exists("Knowledge Version", "v1.2"):
		return
	doc = frappe.new_doc("Knowledge Version")
	doc.version_code = "v1.2"
	doc.status = "ساري"
	doc.changes = "الإصدار التشغيلي الأول — Table 2.1 والمعادلات الأربع."
	for row in frappe.get_all("SBC Table 21 Row", pluck="name"):
		doc.append("table_21", {"sbc_row": row})
	formulas = [
		(
			"bearing",
			"قدرة تحمل التربة الصافية",
			"kN/m²",
			"q_net = c·Nc·sc + q·(Nq−1) + 0.5·γ·B·Nγ·sγ ÷ FS",
			[{"input_key": "phi", "label": "زاوية الاحتكاك φ"}, {"input_key": "fs", "label": "عامل الأمان FS"}, {"input_key": "b", "label": "عرض القاعدة B"}],
		),
		(
			"settlement",
			"الهبوط المتوقع",
			"mm",
			"S = Σ (Δσ · H) / Es",
			[{"input_key": "es", "label": "معامل الانضغاط"}, {"input_key": "load", "label": "الحمل الإنشائي"}],
		),
		(
			"ks",
			"معامل رد فعل التربة",
			"kN/m³",
			"ks = q_all / δ_all",
			[{"input_key": "b", "label": "عرض القاعدة الافتراضي"}],
		),
		(
			"lateral",
			"Ka / Kp / K0",
			"—",
			"Ka = tan²(45−φ/2), Kp = tan²(45+φ/2), K0 = 1−sinφ",
			[{"input_key": "phi", "label": "زاوية الاحتكاك φ"}],
		),
	]
	for key, label, unit, formula, schema in formulas:
		doc.append(
			"formulas",
			{
				"field_key": key,
				"label_ar": label,
				"unit": unit,
				"formula": formula,
				"input_schema": json.dumps(schema, ensure_ascii=False),
			},
		)
	for key, label, source in (
		("site_class", "التصنيف الزلزالي للتربة (Site Class)", "sbc_301"),
		("n_bar", "N̄", "computed"),
		("ss", "Ss", "sbc_301"),
		("s1", "S1", "sbc_301"),
		("fa", "Fa", "sbc_301"),
		("fv", "Fv", "sbc_301"),
		("vs30", "Vs30", "sbc_301"),
		("pga", "PGA", "sbc_301"),
		("geology", "التكوين الجيولوجي", "knowledge"),
		("ref", "المرجع", "knowledge"),
	):
		doc.append("analytical_fields", {"field_key": key, "label_ar": label, "source": source})
	for key, label in (
		("foundation_type", "نوع الأساس"),
		("foundation_depth", "عمق التأسيس"),
		("bearing_allowable", "قدرة التحمل المسموح بها"),
		("settlement_allowable", "الهبوط المسموح به"),
		("cement_type", "نوع الأسمنت"),
		("rebar_type", "نوع حديد التسليح"),
		("groundwater", "توصيات المياه الجوفية"),
		("drainage", "الصرف السطحي"),
		("min_cement_content", "الحد الأدنى للمحتوى الأسمنتي"),
		("min_cover", "الحد الأدنى للغطاء الخرساني"),
		("ref", "المرجع"),
	):
		doc.append("recommendation_fields", {"field_key": key, "label_ar": label})
	for key, label, options in (
		("cavities", "وجود تكهفات", "غير موجودة\nموجودة"),
		("slope", "الميل الرأسي للحفر", "نص حر (مثال 1:1)"),
		("fill", "صلاحية مواد الحفر للردم", "صالحة\nصالحة جزئياً\nغير صالحة"),
	):
		doc.append("manual_fields", {"field_key": key, "label_ar": label, "options": options})
	for trig in frappe.get_all("Engine Trigger Rule", pluck="name"):
		doc.append("engine_triggers", {"trigger": trig})
	doc.insert(ignore_permissions=True)


def seed_help_and_integrations():
	# Note: ERPNext also ships a DocType named "Help Article" — set both schemas' fields.
	articles = [
		("new-request", "إنشاء طلب اختبار", 8),
		("accept-sample", "تأكيد العينة", 5),
		("execute-borehole", "تنفيذ جسة", 12),
		("auto-approve", "الاعتماد التلقائي", 4),
		("delegation", "التفويض", 6),
		("read-log", "قراءة سجل الجسة", 5),
		("export-reports", "تصدير التقارير", 4),
	]
	for i, (slug, title, mins) in enumerate(articles, 1):
		if frappe.db.exists("Help Article", {"slug": slug}) or frappe.db.exists("Help Article", slug):
			continue
		html = f"<p>{title}</p>"
		values = {
			"slug": slug,
			"title": title,
			"duration_minutes": mins,
			"sort_order": i,
			"body": html,
			"content": html,
			"published": 1,
			"route": f"/miyar-help/{slug}",
		}
		# ERPNext Help Article requires category — create/use a generic one when present
		if frappe.db.exists("DocType", "Help Category"):
			cat = frappe.db.get_value("Help Category", {}, "name")
			if not cat:
				try:
					cat_doc = frappe.get_doc({"doctype": "Help Category", "category_name": "معيار", "published": 1})
					cat_doc.insert(ignore_permissions=True)
					cat = cat_doc.name
				except Exception:
					cat = None
			if cat:
				values["category"] = cat
		doc = frappe.get_doc({"doctype": "Help Article", **values})
		doc.flags.ignore_mandatory = True
		doc.insert(ignore_permissions=True)
	faqs = [
		(
			"كم مهلة رد المختبر على الطلب؟",
			"مهلة قرار المختبر {{ lab_decision_hours }} ساعة من إرسال الطلب القياسي أو اعتماد خطة الدراسة.",
		),
		(
			"متى يبدأ احتساب SLA التنفيذ؟",
			"بعد تأكيد المقاول للعينة، وليس عند قبول الطلب.",
		),
	]
	for i, (q, a) in enumerate(faqs, 1):
		if frappe.db.exists("FAQ Entry", {"question": q}):
			continue
		frappe.get_doc({"doctype": "FAQ Entry", "question": q, "answer": a, "sort_order": i}).insert(ignore_permissions=True)
	links = [
		("كود البناء SBC 303", "https://sbc.gov.sa"),
		("SAAC", "https://saac.gov.sa"),
		("كود المنصات", "https://dga.gov.sa"),
		("NCA ECC", "https://nca.gov.sa"),
	]
	for i, (title, url) in enumerate(links, 1):
		if frappe.db.exists("Useful Link", {"url": url}):
			continue
		frappe.get_doc({"doctype": "Useful Link", "title": title, "url": url, "sort_order": i}).insert(ignore_permissions=True)
	for code, title in (
		("wathq", "واثق"),
		("nafath", "نفاذ"),
		("zatca", "ZATCA"),
		("sms", "SMS"),
		("geo-maps", "خرائط المساحة"),
	):
		_upsert("Integration Endpoint", code, {"code": code, "title": title, "status": "يعمل"})


def seed_report_template_and_retention():
	if not frappe.db.exists("Report Template", "geo"):
		doc = frappe.new_doc("Report Template")
		doc.template_key = "geo"
		doc.template_name = "تقرير الدراسة الجيوتقنية"
		doc.version_code = "1"
		doc.standard_ref = "SBC 303 §2.6"
		doc.status = "ساري"
		sections = [
			("القرار المساحي", "§2.6 (1)"),
			("بيانات المالك", ""),
			("بيانات المختبر والاعتماد", "§2.6 (9)"),
			("بيانات الموقع", "§2.6 (1)"),
			("وصف المشروع", "§2.6 (2)"),
			("المعلومات الجيولوجية والزلزالية", "SBC 301"),
			("الاستكشاف الحقلي", "§2.6 (4)(5)"),
			("اختبارات التربة الخاصة", "§2.5"),
			("طبيعة الطبقات والنتائج المعملية", "§2.6 (9)"),
			("الاستنتاجات والتوصيات", "§2.6 (10)(11)(12)(17)"),
			("التكهفات ورد الفعل الجانبي", ""),
			("الرسومات والصور", ""),
			("بيانات الحفر وسجل كل جسة", "§2.6 (6)(8)"),
		]
		for i, (title, clause) in enumerate(sections, 1):
			doc.append("sections", {"title": title, "standard_clause": clause, "sort_order": i})
		doc.insert(ignore_permissions=True)
	if not frappe.db.exists("Retention Rule", {"applies_to": "Platform Document", "years": 10}):
		for applies, years, days, dtype in (
			("Platform Document", 10, None, "test-result"),
			("Platform Document", 20, None, "contract"),
			("Platform Document", 10, None, "deed"),
			("Archived Sample", None, 90, None),
			("Archived Sample", None, 180, None),
		):
			frappe.get_doc(
				{
					"doctype": "Retention Rule",
					"applies_to": applies,
					"years": years,
					"days": days,
					"document_type": dtype if dtype and frappe.db.exists("Document Type", dtype) else None,
				}
			).insert(ignore_permissions=True)


def seed_territories():
	cities = ["الرياض", "جدة", "الدمام", "مكة", "المدينة", "القصيم", "تبوك"]
	parent = "All Territories" if frappe.db.exists("Territory", "All Territories") else None
	if not parent:
		# create a root if missing
		if not frappe.db.exists("Territory", "المملكة العربية السعودية"):
			root = frappe.new_doc("Territory")
			root.territory_name = "المملكة العربية السعودية"
			root.is_group = 1
			root.insert(ignore_permissions=True)
			parent = root.name
		else:
			parent = "المملكة العربية السعودية"
	for city in cities:
		if frappe.db.exists("Territory", city):
			continue
		doc = frappe.new_doc("Territory")
		doc.territory_name = city
		doc.parent_territory = parent
		doc.is_group = 0
		doc.insert(ignore_permissions=True)


def seed_all():
	seed_organization_types()
	seed_coded_lists()
	seed_uom_and_item_groups()
	seed_test_methods()
	seed_reference_tests()
	seed_acceptance_limits()
	seed_table_21()
	seed_chemical_optional_triggers()
	seed_mandatory_sample_rules()
	seed_settings()
	seed_knowledge_v12()
	seed_help_and_integrations()
	seed_report_template_and_retention()
	seed_territories()
	from miyar.setup.demo import seed_demo
	from miyar.setup.seed_ops import seed_ops

	seed_demo()
	seed_ops()
	frappe.db.commit()


@frappe.whitelist()
def run_seed():
	"""Manual re-run from Desk console / bench execute."""
	seed_all()
	return {"ok": True}
