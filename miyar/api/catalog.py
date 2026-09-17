# Copyright (c) 2026, Miyar and contributors
# License: MIT. See LICENSE

import frappe

from miyar.api.common import require_login
from miyar.utils.org import get_user_org, is_principal


@frappe.whitelist()
def list_items(lab=None):
	require_login()
	lab = lab or get_user_org()
	return frappe.get_all(
		"Lab Catalog Item",
		filters={"lab": lab},
		fields=["name", "reference_test", "uom", "base_price", "sla_days", "status"],
	)


@frappe.whitelist()
def upsert_item(reference_test, uom=None, base_price=None, sla_days=None, methods=None, status=None):
	require_login()
	if not is_principal():
		frappe.throw("إدارة الكتالوج للمفوّض الرئيسي.")
	lab = get_user_org()
	name = frappe.db.get_value("Lab Catalog Item", {"lab": lab, "reference_test": reference_test}, "name")
	if name:
		doc = frappe.get_doc("Lab Catalog Item", name)
	else:
		doc = frappe.get_doc({"doctype": "Lab Catalog Item", "lab": lab, "reference_test": reference_test})
	if uom is not None:
		doc.uom = uom
	if base_price is not None:
		doc.base_price = base_price
	if sla_days is not None:
		doc.sla_days = sla_days
	if status in ("STS01", "STS02"):
		doc.status = status
	if methods is not None:
		doc.methods = []
		for m in methods or []:
			doc.append("methods", {"test_method": m})
	if doc.is_new():
		doc.insert()
	else:
		doc.save()
	return doc.as_dict()
