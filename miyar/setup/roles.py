# Copyright (c) 2026, Miyar and contributors
# License: MIT. See LICENSE

from __future__ import annotations

import frappe

from miyar.constants import ALL_ROLES, ROLE_PROFILES


def ensure_roles():
	desk_roles = {
		"Miyar Visitor": 0,
		"Miyar Contractor Principal": 1,
		"Miyar Contractor Employee": 1,
		"Miyar Lab Principal": 1,
		"Miyar Lab Employee": 1,
		"Miyar Consultant Principal": 1,
		"Miyar Consultant Employee": 1,
		"Miyar Supervisor": 1,
		"Miyar Admin": 1,
		"Miyar Support": 1,
	}
	for role in ALL_ROLES:
		if not frappe.db.exists("Role", role):
			doc = frappe.get_doc(
				{
					"doctype": "Role",
					"role_name": role,
					"desk_access": desk_roles.get(role, 1),
				}
			)
			doc.insert(ignore_permissions=True)
	for profile, roles in ROLE_PROFILES.items():
		if frappe.db.exists("Role Profile", profile):
			continue
		doc = frappe.get_doc({"doctype": "Role Profile", "role_profile": profile})
		for role in roles:
			doc.append("roles", {"role": role})
		doc.insert(ignore_permissions=True)
