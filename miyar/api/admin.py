# Copyright (c) 2026, Miyar and contributors
# License: MIT. See LICENSE

import frappe

from miyar.api.common import require_login
from miyar.constants import ROLES
from miyar.miyar.doctype.organization_registration.organization_registration import activate_registration


def _require_admin_or_support():
	require_login()
	roles = set(frappe.get_roles())
	if not roles.intersection({ROLES["admin"], ROLES["support"], "System Manager", "Administrator"}):
		frappe.throw("صلاحية إدارة غير متوفرة.")


@frappe.whitelist()
def pending_registrations():
	_require_admin_or_support()
	return frappe.get_all(
		"Organization Registration",
		filters={"status": ["in", ["Submitted", "Under Review"]]},
		fields=["name", "organization_name", "cr", "organization_type", "status", "principal_name", "principal_email"],
	)


@frappe.whitelist()
def activate(name):
	_require_admin_or_support()
	return {"organization": activate_registration(name)}


@frappe.whitelist()
def reject_registration(name, reason):
	_require_admin_or_support()
	doc = frappe.get_doc("Organization Registration", name)
	doc.status = "Rejected"
	doc.reject_reason = reason
	doc.save(ignore_permissions=True)
	return {"ok": True}


@frappe.whitelist()
def masters(doctype, fields=None):
	"""Read-only master lists for the frontend selects."""
	meta = frappe.get_meta(doctype)
	if meta.module != "Miyar":
		frappe.throw("غير مسموح.")
	fieldnames = ["name"]
	for fname in ("code", "label_ar", "is_active", "sort_order"):
		if meta.has_field(fname):
			fieldnames.append(fname)
	if fields:
		fieldnames = ["name"] + list(fields)
	return frappe.get_all(doctype, fields=fieldnames, order_by="sort_order, name")
