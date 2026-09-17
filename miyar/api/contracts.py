# Copyright (c) 2026, Miyar and contributors
# License: MIT. See LICENSE

import frappe

from miyar.api.common import require_login
from miyar.utils.org import get_user_org


@frappe.whitelist()
def list_contracts(is_active=None):
	require_login()
	filters = {}
	if is_active is not None:
		filters["is_active"] = int(is_active)
	return frappe.get_list(
		"Service Contract",
		filters=filters,
		fields=["name", "project_name", "contractor", "lab", "consultant", "is_active", "started_on", "ended_on"],
		order_by="modified desc",
	)
