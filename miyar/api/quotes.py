# Copyright (c) 2026, Miyar and contributors
# License: MIT. See LICENSE

import json

import frappe

from miyar.api.common import require_login
from miyar.utils.org import get_user_org


def _parse(value):
	if isinstance(value, str):
		try:
			return json.loads(value)
		except Exception:
			return value
	return value


@frappe.whitelist()
def create_quote(lab, consultant, project_name, payment_term, city=None, items=None, services=None, notes=None):
	require_login()
	contractor = get_user_org()
	items = _parse(items) or []
	services = _parse(services) or []
	doc = frappe.get_doc(
		{
			"doctype": "Miyar Quote",
			"contractor": contractor,
			"lab": lab,
			"consultant": consultant,
			"project_name": project_name,
			"city": city,
			"payment_term": payment_term,
			"notes": notes,
			"status": "Pending",
		}
	)
	for s in services:
		doc.append("services", {"service_type": s if isinstance(s, str) else s.get("service_type")})
	for row in items:
		cat = frappe.db.get_value(
			"Lab Catalog Item",
			{"lab": lab, "reference_test": row.get("reference_test"), "status": "STS01"},
			["base_price", "sla_days", "uom"],
			as_dict=True,
		)
		if not cat:
			frappe.throw(f"البند {row.get('reference_test')} غير فعّال في كتالوج المختبر.")
		doc.append(
			"items",
			{
				"reference_test": row.get("reference_test"),
				"test_method": row.get("test_method"),
				"uom": row.get("uom") or cat.uom,
				"base_price": cat.base_price,
				"price": row.get("price") or cat.base_price,
				"sla_days": row.get("sla_days") or cat.sla_days,
			},
		)
	doc.insert()
	return doc.as_dict()


@frappe.whitelist()
def respond(name, items=None, lab_notes=None):
	require_login()
	doc = frappe.get_doc("Miyar Quote", name)
	doc.respond(items=_parse(items), lab_notes=lab_notes)
	return doc.as_dict()


@frappe.whitelist()
def accept(name, otp_verified=0):
	require_login()
	doc = frappe.get_doc("Miyar Quote", name)
	contract = doc.accept(otp_verified=int(otp_verified or 0))
	return {"quote": doc.name, "service_contract": contract}


@frappe.whitelist()
def reject(name, reason):
	require_login()
	doc = frappe.get_doc("Miyar Quote", name)
	doc.reject(reason)
	return {"ok": True}
