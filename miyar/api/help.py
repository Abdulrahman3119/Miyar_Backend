# Copyright (c) 2026, Miyar and contributors
# License: MIT. See LICENSE

import frappe
from frappe.utils import now_datetime

from miyar.api.common import require_login


@frappe.whitelist()
def articles():
	return frappe.get_all("Help Article", fields=["slug", "title", "duration_minutes", "sort_order"], order_by="sort_order")


@frappe.whitelist()
def faqs():
	rows = frappe.get_all("FAQ Entry", fields=["question", "answer", "sort_order"], order_by="sort_order")
	settings = {
		"lab_decision_hours": frappe.db.get_single_value("Miyar Settings", "lab_decision_hours"),
		"consultant_decision_hours": frappe.db.get_single_value("Miyar Settings", "consultant_decision_hours"),
		"min_lead_hours": frappe.db.get_single_value("Miyar Settings", "min_lead_hours"),
	}
	out = []
	for row in rows:
		answer = row.answer or ""
		for key, val in settings.items():
			answer = answer.replace("{{ " + key + " }}", str(val or "")).replace("{{" + key + "}}", str(val or ""))
		row["answer"] = answer
		out.append(row)
	return out


@frappe.whitelist()
def integrations():
	return frappe.get_all("Integration Endpoint", fields=["code", "title", "status", "status_note", "last_checked"])


@frappe.whitelist()
def useful_links():
	return frappe.get_all("Useful Link", fields=["title", "url", "sort_order"], order_by="sort_order")


@frappe.whitelist()
def create_ticket(subject, description, category=None, related_request=None):
	require_login()
	doc = frappe.get_doc(
		{
			"doctype": "Support Ticket",
			"subject": subject,
			"description": description,
			"category": category,
			"related_request": related_request,
			"raised_by": frappe.session.user,
			"status": "مفتوحة",
		}
	)
	doc.insert()
	return {"name": doc.name, "status": doc.status}
