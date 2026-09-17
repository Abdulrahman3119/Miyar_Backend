# Copyright (c) 2026, Miyar and contributors
# License: MIT. See LICENSE

import json

import frappe

from miyar.api.common import require_login


def _parse(value):
	if isinstance(value, str):
		try:
			return json.loads(value)
		except Exception:
			return value
	return value


@frappe.whitelist()
def get_test(name):
	require_login()
	return frappe.get_doc("Test Line", name).as_dict()


@frappe.whitelist()
def start(name, sample=None):
	require_login()
	doc = frappe.get_doc("Test Line", name)
	doc.start_execution(sample=_parse(sample))
	return doc.as_dict()


@frappe.whitelist()
def confirm_sample(name, confirmed=1):
	require_login()
	doc = frappe.get_doc("Test Line", name)
	doc.confirm_sample(confirmed=int(confirmed))
	return doc.as_dict()


@frappe.whitelist()
def submit_output(name, result_values=None, report_file=None, notes=None):
	require_login()
	doc = frappe.get_doc("Test Line", name)
	vals = _parse(result_values)
	if vals:
		by_key = {r.get("field_key"): r for r in vals}
		for row in doc.result_values:
			incoming = by_key.get(row.field_key)
			if incoming:
				row.value = incoming.get("value")
	if report_file:
		doc.report_file = report_file
	if notes is not None:
		doc.notes = notes
	doc.submit_output()
	return doc.as_dict()


@frappe.whitelist()
def review(name, approve, reason=None):
	require_login()
	doc = frappe.get_doc("Test Line", name)
	doc.review(approve=bool(int(approve) if str(approve).isdigit() else approve), reason=reason)
	return doc.as_dict()


@frappe.whitelist()
def retest(test_line):
	"""B.R.153 — new request linked to the rejected line, once."""
	require_login()
	line = frappe.get_doc("Test Line", test_line)
	if line.status != "STS21":
		frappe.throw("إعادة الاختبار لبند مرفوض فقط.")
	existing = frappe.db.exists("Test Request", {"retest_of": test_line, "status": ["not in", ["STS16", "STS13"]]})
	if existing:
		frappe.throw("أُنشئت إعادة اختبار لهذا البند مسبقاً.")
	src = frappe.get_doc("Test Request", line.test_request)
	doc = frappe.copy_doc(src)
	doc.status = "STS09"
	doc.naming_series = "TST-DRAFT-."
	doc.parent_request = src.name
	doc.retest_of = line.name
	doc.submitted_at = None
	doc.lab_deadline_at = None
	doc.history = []
	doc.insert()
	new_line = frappe.get_doc(
		{
			"doctype": "Test Line",
			"test_request": doc.name,
			"reference_test": line.reference_test,
			"test_method": line.test_method,
			"uom": line.uom,
			"price": line.price,
			"sla_days": line.sla_days,
			"status": "STS17",
		}
	)
	new_line.insert()
	return {"request": doc.name, "test_line": new_line.name}
