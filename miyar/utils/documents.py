# Copyright (c) 2026, Miyar and contributors
# License: MIT. See LICENSE

"""Geotech final report + completion certificate (B.R.220–223, B.R.127)."""

from __future__ import annotations

import hashlib

import frappe
from frappe import _
from frappe.utils import cint, now_datetime
from frappe.utils.file_manager import save_file


def _active_template(key: str = "geo"):
	name = frappe.db.get_value("Report Template", {"template_key": key, "status": "ساري"}, "name")
	if not name:
		name = frappe.db.get_value("Report Template", {"template_key": key}, "name")
	return frappe.get_doc("Report Template", name) if name else None


def generate_study_report(study_name: str) -> str:
	"""Build PDF (or HTML fallback) for an approved geotech study; return file_url."""
	study = frappe.get_doc("Geotechnical Study", study_name)
	req = frappe.get_doc("Test Request", study.test_request) if study.test_request else None
	tpl = _active_template("geo")
	version = (tpl.version_code if tpl else None) or "v1"
	sections = []
	if tpl and tpl.sections:
		sections = [row.title for row in tpl.sections if row.title]
	if not sections:
		sections = [
			"البيانات الأولية",
			"خطة الاستكشاف",
			"الأعمال الميدانية",
			"البيانات المعملية",
			"التحليل الهندسي",
			"التوصيات",
		]
	project = (req.project_name if req else None) or study.test_request or study.name
	html = f"""<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"/>
<title>تقرير دراسة جيوتقنية — {frappe.utils.escape_html(project)}</title>
<style>
body{{font-family:Tahoma,Arial,sans-serif;padding:28px;color:#111}}
h1{{font-size:20px;margin:0 0 8px}} h2{{font-size:14px;margin:18px 0 6px;border-bottom:1px solid #ddd;padding-bottom:4px}}
.meta{{color:#555;font-size:12px}} .box{{border:1px solid #ddd;padding:10px;margin:8px 0;border-radius:4px}}
</style></head><body>
<h1>تقرير الدراسة الجيوتقنية</h1>
<p class="meta">المرجع: {frappe.utils.escape_html(study.name)} · الطلب: {frappe.utils.escape_html(study.test_request or '—')}
· القالب: {frappe.utils.escape_html(version)} · تاريخ التوليد: {now_datetime()}</p>
<div class="box"><b>المشروع:</b> {frappe.utils.escape_html(project)}</div>
"""
	for title in sections:
		html += f"<h2>{frappe.utils.escape_html(title)}</h2><p class='meta'>مخرجات معتمدة من مراحل الدراسة (B.R.221).</p>"
	html += f"""
<div class="box"><b>المرحلة:</b> {cint(study.phase)} · <b>اعتماد التقرير:</b> {'نعم' if study.report_approved else 'قيد الاعتماد'}</div>
<p class="meta">وُلِّد تلقائياً بعد اعتماد الاستشاري وفق القالب الساري (B.R.222 / B.R.223).</p>
</body></html>"""

	fname = f"geo-report-{study.name}-{version}.pdf"
	content = None
	try:
		from frappe.utils.pdf import get_pdf

		content = get_pdf(html)
	except Exception:
		fname = f"geo-report-{study.name}-{version}.html"
		content = html.encode("utf-8")

	f = save_file(fname, content, "Geotechnical Study", study.name, is_private=1)
	file_url = f.file_url
	digest = hashlib.sha256(content if isinstance(content, (bytes, bytearray)) else str(content).encode()).hexdigest()
	frappe.db.set_value(
		"Geotechnical Study",
		study.name,
		{"report_file": file_url, "report_hash": digest[:64]},
	)
	if tpl:
		frappe.db.set_value("Report Template", tpl.name, "usage_count", cint(tpl.usage_count) + 1)

	# Archive as Platform Document
	dtype = frappe.db.get_value("Document Type", {"code": "report"}, "name") or frappe.db.get_value(
		"Document Type", {"label_ar": ["like", "%تقرير%"]}, "name"
	)
	existing_pd = frappe.db.exists(
		"Platform Document",
		{"test_request": study.test_request, "file": file_url},
	)
	if not existing_pd:
		payload = {
			"doctype": "Platform Document",
			"title": f"تقرير دراسة جيوتقنية — {study.name}",
			"file": file_url,
			"test_request": study.test_request,
			"organization": req.lab if req else None,
			"version": cint(str(version).lstrip("vV").split(".")[0] or 1),
			"content_hash": digest[:64],
			"issued_at": now_datetime(),
		}
		if dtype:
			payload["document_type"] = dtype
		doc = frappe.get_doc(payload)
		doc.flags.ignore_permissions = True
		doc.insert(ignore_permissions=True)
	return file_url


def issue_completion_certificate(contract: str) -> dict:
	"""B.R.127 — certificate only after lab rating for the ended contract; blocked by overdue invoices."""
	sc = frappe.get_doc("Service Contract", contract)
	if sc.is_active:
		frappe.throw(_("شهادة الإتمام بعد انتهاء العقد فقط."))
	from miyar.utils.org import get_user_org
	from miyar.utils.audit import is_admin

	org = get_user_org()
	if not is_admin() and org and org != sc.contractor:
		frappe.throw(_("شهادة الإتمام للمقاول صاحب العقد فقط."), frappe.PermissionError)

	rated = frappe.db.exists(
		"Lab Rating",
		{"service_contract": contract, "status": "STS06"},
	)
	if not rated:
		frappe.throw(_("قيّم المختبر أولاً لتحميل شهادة الإتمام (B.R.127)."))

	blocked = frappe.db.exists(
		"Laboratory Invoice",
		{"service_contract": contract, "blocks_certificate": 1},
	)
	if blocked:
		frappe.throw(_("فاتورة متأخرة تمنع إصدار شهادة الإتمام."))

	existing = frappe.db.get_value(
		"Platform Document",
		{"service_contract": contract, "title": ["like", "%شهادة إتمام%"]},
		["name", "file"],
		as_dict=True,
	)
	if existing and existing.file:
		return {"ok": True, "file": existing.file, "document": existing.name}

	html = f"""<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"/>
<title>شهادة إتمام اختبارات</title>
<style>body{{font-family:Tahoma,Arial,sans-serif;padding:36px}} h1{{font-size:22px}} .meta{{color:#444}}</style>
</head><body>
<h1>شهادة إتمام الاختبارات</h1>
<p class="meta">العقد: {frappe.utils.escape_html(sc.name)} · المشروع: {frappe.utils.escape_html(sc.project_name or '')}</p>
<p>تشهد منصة معيار باكتمال مخرجات الاختبارات المعتمدة بموجب العقد أعلاه بعد تقييم المختبر.</p>
<p class="meta">تاريخ الإصدار: {now_datetime()}</p>
</body></html>"""
	fname = f"completion-cert-{sc.name}.pdf"
	try:
		from frappe.utils.pdf import get_pdf

		content = get_pdf(html)
	except Exception:
		fname = f"completion-cert-{sc.name}.html"
		content = html.encode("utf-8")

	f = save_file(fname, content, "Service Contract", sc.name, is_private=1)
	dtype = frappe.db.get_value("Document Type", {"code": "certificate"}, "name") or frappe.db.get_value(
		"Document Type", {"label_ar": ["like", "%شهادة%"]}, "name"
	)
	payload = {
		"doctype": "Platform Document",
		"title": f"شهادة إتمام — {sc.name}",
		"file": f.file_url,
		"service_contract": sc.name,
		"organization": sc.contractor,
		"version": 1,
		"issued_at": now_datetime(),
	}
	if dtype:
		payload["document_type"] = dtype
	doc = frappe.get_doc(payload)
	doc.flags.ignore_permissions = True
	doc.insert(ignore_permissions=True)
	return {"ok": True, "file": f.file_url, "document": doc.name}
