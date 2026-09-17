# Copyright (c) 2026, Miyar and contributors
# License: MIT. See LICENSE

"""Shared API helpers for the Miyar frontend."""

from __future__ import annotations

import frappe

from miyar.constants import ROLES
from miyar.utils.org import get_org_user, get_org_type, is_principal


def me():
	user = frappe.session.user
	if not user or user == "Guest":
		return {"user": None, "guest": True}
	ou = get_org_user(user)
	org = None
	if ou:
		org = frappe.db.get_value(
			"Organization",
			ou.organization,
			["name", "organization_name", "organization_type", "logo", "directory_status", "active"],
			as_dict=True,
		)
	return {
		"user": user,
		"full_name": frappe.db.get_value("User", user, "full_name"),
		"roles": [r for r in frappe.get_roles(user) if r.startswith("Miyar ")],
		"organization": org,
		"position": ou.position if ou else None,
		"can_delegate": bool(ou.can_delegate) if ou else False,
		"is_principal": is_principal(user),
		"guest": False,
	}


def require_login():
	if frappe.session.user == "Guest":
		frappe.throw("يلزم تسجيل الدخول.", frappe.AuthenticationError)


def as_dict(doc, fields=None):
	if isinstance(doc, str):
		return frappe.get_doc(doc).as_dict()
	data = doc.as_dict() if hasattr(doc, "as_dict") else dict(doc)
	if fields:
		return {k: data.get(k) for k in fields}
	return data
