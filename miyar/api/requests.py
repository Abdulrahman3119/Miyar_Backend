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
def list_requests(status=None, service_type=None, limit_start=0, limit_page_length=20):
	require_login()
	filters = {}
	if status:
		filters["status"] = status
	if service_type:
		filters["service_type"] = service_type
	return frappe.get_list(
		"Test Request",
		filters=filters,
		fields=[
			"name",
			"project_name",
			"service_contract",
			"service_type",
			"contractor",
			"lab",
			"consultant",
			"status",
			"priority",
			"city",
			"chosen_slot_date",
		],
		limit_start=int(limit_start or 0),
		limit_page_length=int(limit_page_length or 20),
		order_by="modified desc",
	)


@frappe.whitelist()
def get_request(name):
	require_login()
	doc = frappe.get_doc("Test Request", name)
	lines = frappe.get_all(
		"Test Line",
		filters={"test_request": name},
		fields=["name", "reference_test", "test_method", "status", "price", "sla_days"],
	)
	data = doc.as_dict()
	data["tests"] = lines
	return data


@frappe.whitelist()
def create_draft(service_contract, service_type, location, category=None, priority=None, slots=None, notes=None, tests=None, geo_lat=None, geo_lng=None):
	require_login()
	slots = _parse(slots) or []
	tests = _parse(tests) or []
	doc = frappe.get_doc(
		{
			"doctype": "Test Request",
			"service_contract": service_contract,
			"service_type": service_type,
			"location": location,
			"category": category,
			"priority": priority,
			"notes": notes,
			"geo_lat": geo_lat,
			"geo_lng": geo_lng,
			"status": "STS09",
		}
	)
	for slot in slots:
		doc.append("slots", slot)
	doc.insert()
	for t in tests:
		line = frappe.get_doc(
			{
				"doctype": "Test Line",
				"test_request": doc.name,
				"reference_test": t.get("reference_test"),
				"test_method": t.get("test_method"),
				"uom": t.get("uom"),
				"price": t.get("price"),
				"sla_days": t.get("sla_days"),
				"status": "STS17",
			}
		)
		line.insert()
	return get_request(doc.name)


@frappe.whitelist()
def submit_request(name):
	require_login()
	doc = frappe.get_doc("Test Request", name)
	new_name = doc.submit_request()
	return get_request(new_name)


@frappe.whitelist()
def cancel_request(name, reason=None):
	require_login()
	doc = frappe.get_doc("Test Request", name)
	doc.cancel_request(reason)
	return {"ok": True}


@frappe.whitelist()
def lab_decide(name, accept, slot=None, reason=None):
	require_login()
	doc = frappe.get_doc("Test Request", name)
	doc.lab_decide(accept=frappe.parse_json(accept) if isinstance(accept, str) and accept in ("true", "false") else bool(int(accept) if str(accept).isdigit() else accept), slot=_parse(slot), reason=reason)
	return get_request(doc.name)
