# Copyright (c) 2026, Miyar and contributors
# License: MIT. See LICENSE

"""Shared API helpers for the Miyar frontend."""

from __future__ import annotations

import frappe

from miyar.constants import ADMIN_ROLES, ROLES
from miyar.ui import permissions_for
from miyar.utils.org import get_org_user, is_principal


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


def front_identity() -> dict:
	"""Portal role/position used by appendix-7.1 capability checks."""
	from miyar.api.payload import session_user

	require_login()
	front = session_user()
	if not front:
		frappe.throw("يلزم تسجيل الدخول.", frappe.AuthenticationError)
	return front


def user_capabilities(user: str | None = None) -> list[str]:
	"""Capability keys for the current (or given) user from PERMISSION_MATRIX."""
	from miyar.api.payload import frontend_role

	user = user or frappe.session.user
	if not user or user == "Guest":
		return list(permissions_for("visitor", "employee"))
	ou = get_org_user(user)
	position = "principal" if (ou and ou.position == "Principal") or is_principal(user) else "employee"
	role = frontend_role(frappe.get_roles(user))
	return permissions_for(role, position)


def has_capability(capability: str, user: str | None = None) -> bool:
	return capability in user_capabilities(user)


def require_capability(*capabilities: str, allow_admin: bool = True):
	"""Enforce appendix-7.1 capabilities on mutating APIs.

	- Guest → AuthenticationError
	- Supervisor → always denied for writes (BRD 3.2.1 read-only)
	- Otherwise user must hold at least one of the given capability keys
	"""
	require_login()
	roles = set(frappe.get_roles())
	if allow_admin and (frappe.session.user == "Administrator" or roles & ADMIN_ROLES):
		# System Manager / Miyar Admin still constrained by capability list below
		# unless they hold admin portal role — frontend_role maps them to admin.
		pass

	front = front_identity()
	if front.get("role") == "supervisor":
		frappe.throw(
			"الجهة الإشرافية تملك صلاحية الاطلاع فقط وليس تنفيذ إجراءات تشغيلية.",
			frappe.PermissionError,
		)

	caps = set(user_capabilities())
	needed = set(capabilities)
	if not needed.intersection(caps):
		frappe.throw(
			f"لا تملك الصلاحية المطلوبة لهذا الإجراء ({', '.join(capabilities)}).",
			frappe.PermissionError,
		)
	return front


def as_dict(doc, fields=None):
	if isinstance(doc, str):
		return frappe.get_doc(doc).as_dict()
	data = doc.as_dict() if hasattr(doc, "as_dict") else dict(doc)
	if fields:
		return {k: data.get(k) for k in fields}
	return data
