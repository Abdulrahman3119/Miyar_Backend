# Copyright (c) 2026, Miyar and contributors
# License: MIT. See LICENSE

import frappe

from miyar.api.common import require_login
from miyar.utils.org import get_user_org


@frappe.whitelist()
def list_invoices(status=None):
	require_login()
	filters = {}
	if status:
		filters["status"] = status
	return frappe.get_list(
		"Laboratory Invoice",
		filters=filters,
		fields=["name", "test_request", "seller_lab", "buyer_contractor", "grand_total", "status", "due_at"],
		order_by="modified desc",
	)


@frappe.whitelist()
def pay(name, channel=None):
	require_login()
	doc = frappe.get_doc("Laboratory Invoice", name)
	if get_user_org() != doc.buyer_contractor:
		frappe.throw("سداد الفاتورة للمقاول المشتري.")
	doc.mark_paid(channel=channel)
	return doc.as_dict()
