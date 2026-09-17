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
def get_study(test_request=None, name=None):
	require_login()
	if not name:
		name = frappe.db.get_value("Geotechnical Study", {"test_request": test_request}, "name")
	if not name:
		frappe.throw("لا توجد دراسة على هذا الطلب.")
	doc = frappe.get_doc("Geotechnical Study", name)
	data = doc.as_dict()
	data["boreholes"] = frappe.get_all(
		"Borehole",
		filters={"study": name},
		fields=["name", "code", "status", "approved_depth", "executed_depth", "moved_m"],
	)
	return data


@frappe.whitelist()
def save_prelim(name, values=None):
	require_login()
	doc = frappe.get_doc("Geotechnical Study", name)
	for key, val in (_parse(values) or {}).items():
		if doc.meta.has_field(key) and key not in ("phase", "name"):
			doc.set(key, val)
	doc.save()
	return doc.as_dict()


@frappe.whitelist()
def approve_prelim(name):
	require_login()
	doc = frappe.get_doc("Geotechnical Study", name)
	doc.approve_prelim()
	return doc.as_dict()


@frappe.whitelist()
def client_study(name):
	"""The study exactly as the web client's store keeps it."""
	require_login()
	from miyar.api.collections import study_payload

	return study_payload(name)


@frappe.whitelist()
def run_plan_engine(name):
	require_login()
	doc = frappe.get_doc("Geotechnical Study", name)
	return doc.run_plan_engine()


@frappe.whitelist()
def approve_plan(name, justification=None):
	require_login()
	doc = frappe.get_doc("Geotechnical Study", name)
	doc.approve_plan(justification=justification)
	return doc.as_dict()


@frappe.whitelist()
def approve_report(name, approve=1, reason=None):
	require_login()
	doc = frappe.get_doc("Geotechnical Study", name)
	doc.approve_report(approve=bool(int(approve)), reason=reason)
	return doc.as_dict()
