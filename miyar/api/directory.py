# Copyright (c) 2026, Miyar and contributors
# License: MIT. See LICENSE

import frappe
from frappe.utils import nowdate

from miyar.api.payload import list_organizations


@frappe.whitelist(allow_guest=True)
def list_orgs(limit=200):
	"""Whole visible directory in the shape the SPA store expects."""
	return list_organizations(limit=limit)


@frappe.whitelist(allow_guest=True)
def list_labs(territory=None, specialty=None, min_rating=None, order="rating", limit_start=0, limit_page_length=20):
	"""Public directory — B.R.122. Visible labs with at least one STS01 catalog item."""
	filters = {"organization_type": "lab", "directory_status": "STS04", "active": 1}
	if territory:
		filters["territory"] = territory
	order_by = {"rating": "rating desc", "reviews": "reviews desc", "onTime": "on_time desc"}.get(order, "rating desc")
	rows = frappe.get_all(
		"Organization",
		filters=filters,
		fields=[
			"name",
			"organization_name",
			"territory",
			"about",
			"logo",
			"rating",
			"reviews",
			"on_time",
			"featured",
		],
		order_by=order_by,
		limit_start=int(limit_start or 0),
		limit_page_length=int(limit_page_length or 20),
	)
	out = []
	for row in rows:
		has_catalog = frappe.db.exists("Lab Catalog Item", {"lab": row.name, "status": "STS01"})
		if not has_catalog:
			continue
		if min_rating and (row.rating or 0) < float(min_rating):
			continue
		if specialty:
			if not frappe.db.exists("Organization Specialty", {"parent": row.name, "specialty": specialty}):
				continue
		saac_ok = frappe.db.sql(
			"""select saac_number from `tabSAAC Accreditation` where parent=%s and (expires_on is null or expires_on >= %s) limit 1""",
			(row.name, nowdate()),
		)
		row["saac"] = bool(saac_ok)
		out.append(row)
	return out


@frappe.whitelist(allow_guest=True)
def get_lab(name: str):
	org = frappe.get_doc("Organization", name)
	if org.directory_status != "STS04" or not org.active:
		if frappe.session.user == "Guest":
			frappe.throw("المنشأة غير ظاهرة في الدليل.")
	catalog = frappe.get_all(
		"Lab Catalog Item",
		filters={"lab": name, "status": "STS01"},
		fields=["name", "reference_test", "uom", "base_price", "sla_days", "status"],
	)
	ratings = frappe.get_all(
		"Lab Rating",
		filters={"lab": name, "status": "STS06"},
		fields=["name", "comment", "status"],
		limit=20,
	)
	return {"organization": org.as_dict(), "catalog": catalog, "ratings": ratings}
