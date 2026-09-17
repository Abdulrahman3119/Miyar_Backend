# Copyright (c) 2026, Miyar and contributors
# License: MIT. See LICENSE

from __future__ import annotations

import frappe
from frappe.utils import now_datetime

from miyar.constants import ADMIN_ROLES


def log_event(
	action: str,
	*,
	entity=None,
	organization: str | None = None,
	severity: str = "info",
	detail: str | None = None,
	actor_user: str | None = None,
):
	"""Append an Audit Event. Never raises to the caller."""
	try:
		user = actor_user or frappe.session.user
		actor_name = "المنصة" if user in (None, "Guest") else (frappe.db.get_value("User", user, "full_name") or user)
		roles = frappe.get_roles(user) if user and user != "Guest" else []
		actor_role = next((r for r in roles if r.startswith("Miyar ")), roles[0] if roles else "")
		doc = frappe.get_doc(
			{
				"doctype": "Audit Event",
				"event_time": now_datetime(),
				"actor_user": user if user not in (None, "Guest") else None,
				"actor_name": actor_name,
				"actor_role": actor_role,
				"organization": organization,
				"action": action,
				"entity_doctype": entity.doctype if entity else None,
				"entity_name": entity.name if entity else None,
				"ip": getattr(frappe.local, "request_ip", None) or frappe.get_request_header("X-Forwarded-For"),
				"severity": severity,
				"detail": detail,
			}
		)
		doc.flags.ignore_permissions = True
		doc.insert()
	except Exception:
		frappe.log_error(title="Miyar audit event failed")


def log_denied(action: str, entity=None, organization: str | None = None, detail: str | None = None):
	"""B.R.158 — rejected access is a critical audit row, never silent."""
	log_event(
		action or "محاولة وصول مرفوضة",
		entity=entity,
		organization=organization,
		severity="critical",
		detail=detail,
	)


def is_admin(user: str | None = None) -> bool:
	user = user or frappe.session.user
	return bool(set(frappe.get_roles(user)) & ADMIN_ROLES)
