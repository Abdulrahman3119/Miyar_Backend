# Copyright (c) 2026, Miyar and contributors
# License: MIT. See LICENSE

import frappe

from miyar.api.common import require_capability, require_login


@frappe.whitelist()
def create(test_request, to_user, delegation_type="Direct", scope="Request", test_line=None):
	require_capability("delegation.create")
	doc = frappe.get_doc(
		{
			"doctype": "Delegation",
			"test_request": test_request,
			"to_user": to_user,
			"from_user": frappe.session.user,
			"delegation_type": delegation_type,
			"scope": scope,
			"test_line": test_line,
		}
	)
	doc.insert()
	return doc.as_dict()


@frappe.whitelist()
def decide(name, accept):
	require_capability("delegation.decide")
	doc = frappe.get_doc("Delegation", name)
	doc.decide(accept=bool(int(accept)))
	return doc.as_dict()


@frappe.whitelist()
def revoke(name):
	require_capability("delegation.edit", "delegation.create")
	doc = frappe.get_doc("Delegation", name)
	doc.revoke()
	return {"ok": True, "name": name, "status": "STS25"}


@frappe.whitelist()
def modify(name, to_user):
	"""B.R.235 — replace assignee: cancel old (STS25) + insert new."""
	require_capability("delegation.edit", "delegation.create")
	doc = frappe.get_doc("Delegation", name)
	new_doc = doc.modify_assignee(to_user)
	return new_doc.as_dict()
