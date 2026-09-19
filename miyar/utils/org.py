# Copyright (c) 2026, Miyar and contributors
# License: MIT. See LICENSE

from __future__ import annotations

import frappe

from miyar.constants import ORG_TYPE_TO_ROLES, PRINCIPAL_ROLES, ROLES


def get_org_user(user: str | None = None) -> dict | None:
	user = user or frappe.session.user
	if not user or user in ("Guest", "Administrator"):
		if user == "Administrator":
			return None
		return None
	row = frappe.db.get_value(
		"Organization User",
		{"user": user, "is_active": 1},
		["name", "organization", "position", "can_delegate"],
		as_dict=True,
	)
	return row


def get_user_org(user: str | None = None) -> str | None:
	row = get_org_user(user)
	return row.organization if row else None


def get_org_type(organization: str | None) -> str | None:
	if not organization:
		return None
	return frappe.db.get_value("Organization", organization, "organization_type")


def is_principal(user: str | None = None) -> bool:
	row = get_org_user(user)
	if row and row.position == "Principal":
		return True
	return bool(set(frappe.get_roles(user or frappe.session.user)) & PRINCIPAL_ROLES)


def can_delegate(user: str | None = None) -> bool:
	row = get_org_user(user)
	if not row:
		return is_principal(user)
	return bool(row.can_delegate) or row.position == "Principal"


def sync_user_role(org_user) -> None:
	"""Map Organization User.position × Organization.organization_type → Role Profile."""
	org_type = frappe.db.get_value("Organization", org_user.organization, "organization_type")
	mapping = ORG_TYPE_TO_ROLES.get(org_type) or {}
	role = mapping.get(org_user.position)
	if not role:
		return
	user = org_user.user
	if not user or not frappe.db.exists("User", user):
		return
	profile_name = role
	if frappe.db.exists("Role Profile", profile_name):
		frappe.db.set_value("User", user, "role_profile_name", profile_name)
	# Ensure the role itself is present
	roles = frappe.get_roles(user)
	if role not in roles:
		user_doc = frappe.get_doc("User", user)
		user_doc.append("roles", {"role": role})
		user_doc.flags.ignore_permissions = True
		user_doc.save()
	frappe.permissions.add_user_permission("Organization", org_user.organization, user, ignore_permissions=True)


def party_on_request(doc, organization: str | None) -> bool:
	if not organization or not doc:
		return False
	return organization in {
		doc.get("contractor"),
		doc.get("lab"),
		doc.get("consultant"),
	}


def has_active_delegation(user: str, test_request: str, test_line: str | None = None) -> bool:
	"""B.R.238 — only STS23 grants access; pending/rejected/cancelled do not."""
	# Request-scope covers every test on the request
	if frappe.db.exists(
		"Delegation",
		{"to_user": user, "test_request": test_request, "status": "STS23", "scope": "Request"},
	):
		return True
	if test_line:
		return bool(
			frappe.db.exists(
				"Delegation",
				{
					"to_user": user,
					"test_request": test_request,
					"status": "STS23",
					"scope": "Test",
					"test_line": test_line,
				},
			)
		)
	# Any active test-scope on the request still grants request visibility
	return bool(
		frappe.db.exists(
			"Delegation",
			{"to_user": user, "test_request": test_request, "status": "STS23"},
		)
	)


def require_principal(msg: str | None = None):
	from miyar.utils.audit import is_admin

	if is_admin() or is_principal():
		return
	from miyar.utils.audit import log_denied

	log_denied(msg or "محاولة وصول مرفوضة — قرار المفوّض الرئيسي فقط")
	frappe.throw(msg or "هذا الإجراء للمفوّض الرئيسي فقط.")


def is_party_or_admin(organization: str | None) -> bool:
	"""True if the current user belongs to `organization`, or is a platform admin."""
	from miyar.utils.audit import is_admin

	if is_admin():
		return True
	return bool(organization) and get_user_org() == organization
