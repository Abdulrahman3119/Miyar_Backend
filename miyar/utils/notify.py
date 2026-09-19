# Copyright (c) 2026, Miyar and contributors
# License: MIT. See LICENSE

"""In-app notifications via Frappe Notification Log (B.R.157). SMS/email are later."""

from __future__ import annotations

import frappe
from frappe.utils import now_datetime


def notify_user(
	user: str | None,
	*,
	subject: str,
	body: str = "",
	document_type: str | None = None,
	document_name: str | None = None,
	notification_type: str = "Alert",
):
	"""Create a Notification Log row for `user`. Never raises to caller."""
	if not user or user in ("Guest", "Administrator"):
		return
	try:
		doc = frappe.get_doc(
			{
				"doctype": "Notification Log",
				"subject": subject[:140],
				"email_content": body or subject,
				"for_user": user,
				"type": notification_type if notification_type in ("Alert", "Mention", "Assignment", "Share", "Energy Point") else "Alert",
				"document_type": document_type,
				"document_name": document_name,
				"from_user": frappe.session.user if frappe.session.user not in (None, "Guest") else "Administrator",
			}
		)
		doc.flags.ignore_permissions = True
		doc.insert(ignore_permissions=True)
	except Exception:
		frappe.log_error(title="Miyar notify_user failed")


def notify_org_principals(
	organization: str | None,
	*,
	subject: str,
	body: str = "",
	document_type: str | None = None,
	document_name: str | None = None,
	exclude_user: str | None = None,
):
	if not organization:
		return
	users = frappe.get_all(
		"Organization User",
		filters={"organization": organization, "is_active": 1, "position": "Principal"},
		pluck="user",
	)
	for user in users:
		if exclude_user and user == exclude_user:
			continue
		notify_user(
			user,
			subject=subject,
			body=body,
			document_type=document_type,
			document_name=document_name,
		)


def field_work_started(test_request: str) -> bool:
	"""True once the request / any line has entered field execution (B.R.235)."""
	from miyar.constants import STS14, STS15, STS18, STS19, STS20, STS21

	status = frappe.db.get_value("Test Request", test_request, "status")
	if status in (STS14, STS15):
		return True
	return bool(
		frappe.db.exists(
			"Test Line",
			{"test_request": test_request, "status": ["in", [STS18, STS19, STS20, STS21]]},
		)
	)
