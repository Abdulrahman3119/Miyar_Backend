# Copyright (c) 2026, Miyar and contributors
# License: MIT. See LICENSE

"""Every closed list the web client renders in a select, a legend or a badge.

The client holds no vocabulary of its own: it asks for this once at boot and keeps
what it gets. Coded lists come from their master DocType; status codes, tones and the
appendix-7.1 matrix come from `miyar.ui`.
"""

from __future__ import annotations

import frappe

from miyar import ui
from miyar.api.payload import GROUP_TO_CATEGORY

# Masters that are only a code and an Arabic label, exposed under the client's own key.
CODED_LISTS = {
	"serviceTypes": "Service Type",
	"paymentTerms": "Payment Term Code",
	"paymentChannels": "Payment Channel",
	"priorities": "Priority",
	"siteConditions": "Site Condition",
	"gradations": "Gradation",
	"soilColors": "Soil Color",
	"moistures": "Moisture Description",
	"boreholeMethods": "Borehole Method",
	"weathers": "Weather Condition",
	"sampleKinds": "Sample Kind",
	"sampleTypes": "Sample Type",
	"sampleConditions": "Sample Condition",
	"archiveKinds": "Sample Archive Kind",
	"equipmentTypes": "Equipment Type",
	"photoKinds": "Photo Kind",
	"docTypes": "Document Type",
	"docClassifications": "Document Classification",
	"ticketCategories": "Ticket Category",
	"ticketStatuses": "Ticket Status",
	"buildingTypes": "Building Type",
	"structureTypes": "Structure Type",
	"foundationTypes": "Foundation Type",
	"specialties": "Organization Specialty Def",
	"enginePolicies": "Engine Policy",
	"engineProfiles": "Engine Profile",
}


def coded(doctype: str, extra: list[str] | None = None) -> list[dict]:
	if not frappe.db.exists("DocType", doctype):
		return []
	fields = ["name", "label_ar"] + (extra or [])
	meta = frappe.get_meta(doctype)
	if meta.has_field("code"):
		fields.append("code")
	filters = {"is_active": 1} if meta.has_field("is_active") else {}
	order = "sort_order asc, name asc" if meta.has_field("sort_order") else "name asc"
	rows = frappe.get_all(doctype, filters=filters, fields=fields, order_by=order, limit_page_length=0)
	out = []
	for row in rows:
		item = {"id": row.name, "code": row.get("code") or row.name, "label": row.label_ar or row.name}
		for key in extra or []:
			item[key] = row.get(key)
		out.append(item)
	return out


def cities() -> list[dict]:
	"""Territories with the coordinates the coverage map plots."""
	meta = frappe.get_meta("Territory")
	fields = ["name", "parent_territory", "is_group"]
	has_coords = meta.has_field("miyar_lat") and meta.has_field("miyar_lng")
	if has_coords:
		fields += ["miyar_lat", "miyar_lng"]
	rows = frappe.get_all("Territory", fields=fields, order_by="name", limit_page_length=0)
	out = []
	for row in rows:
		lat = float(row.get("miyar_lat") or 0) if has_coords else 0.0
		lng = float(row.get("miyar_lng") or 0) if has_coords else 0.0
		out.append(
			{
				"name": row.name,
				"parent": row.parent_territory or "",
				"isGroup": bool(row.is_group),
				"lat": lat or None,
				"lng": lng or None,
			}
		)
	return out


def categories() -> list[dict]:
	out = []
	for group, code in GROUP_TO_CATEGORY.items():
		if not frappe.db.exists("Item Group", group):
			continue
		out.append({"code": code, "label": group, "group": group})
	return out


def uscs() -> list[dict]:
	rows = frappe.get_all(
		"USCS Classification",
		filters={"is_active": 1},
		fields=["name", "code", "label_ar", "color_hex", "is_rock"],
		order_by="sort_order asc, name asc",
		limit_page_length=0,
	)
	return [
		{
			"code": row.code or row.name,
			"label": row.label_ar or row.name,
			"color": row.color_hex or "",
			"isRock": bool(row.is_rock),
		}
		for row in rows
	]


def custody_steps() -> list[dict]:
	rows = frappe.get_all(
		"Custody Step",
		filters={"is_active": 1},
		fields=["name", "code", "label_ar", "maps_to_sample_status"],
		order_by="sort_order asc, name asc",
		limit_page_length=0,
	)
	return [
		{
			"code": row.code or row.name,
			"label": row.label_ar or row.name,
			"sampleStatus": row.maps_to_sample_status or "",
		}
		for row in rows
	]


def optional_lab_tests() -> list[dict]:
	rows = frappe.get_all(
		"Optional Lab Test Def",
		filters={"is_active": 1},
		fields=["name", "code", "label_ar", "test_method"],
		order_by="name",
		limit_page_length=0,
	)
	return [
		{"code": row.code or row.name, "label": row.label_ar or row.name, "method": row.test_method or ""}
		for row in rows
	]


def org_types() -> list[dict]:
	rows = frappe.get_all(
		"Organization Type",
		filters={"is_active": 1},
		fields=["name", "code", "label_ar", "can_self_register", "appears_in_directory", "is_operational_party"],
		order_by="sort_order asc, name asc",
		limit_page_length=0,
	)
	return [
		{
			"code": row.code or row.name,
			"label": row.label_ar or row.name,
			"canSelfRegister": bool(row.can_self_register),
			"inDirectory": bool(row.appears_in_directory),
			"operational": bool(row.is_operational_party),
		}
		for row in rows
	]


def _seismic() -> list[dict]:
	rows = frappe.get_all(
		"Seismic Site Class",
		filters={"is_active": 1},
		fields=["name", "code", "label_ar", "vs30", "n_bar", "su"],
		order_by="sort_order asc, name asc",
		limit_page_length=0,
	)
	return [
		{
			"code": row.code or row.name,
			"label": row.label_ar or row.name,
			"vs30": row.vs30 or "",
			"nBar": row.n_bar or "",
			"su": row.su or "",
		}
		for row in rows
	]


def _spt_classes() -> list[dict]:
	rows = frappe.get_all(
		"Spt Density Class",
		filters={"is_active": 1},
		fields=["name", "code", "label_ar", "n_min", "n_max"],
		order_by="sort_order asc, name asc",
		limit_page_length=0,
	)
	return [
		{
			"code": row.code or row.name,
			"label": row.label_ar or row.name,
			"nMin": int(row.n_min or 0),
			"nMax": int(row.n_max or 0),
		}
		for row in rows
	]


def get_masters() -> dict:
	out = {key: coded(doctype) for key, doctype in CODED_LISTS.items()}
	for policy in out["enginePolicies"]:
		policy["detail"] = ui.ENGINE_POLICY_DETAILS.get(policy["code"], "")
	out.update(
		{
			"statuses": list(ui.STATUS_DEFS),
			"studyPhases": list(ui.STUDY_PHASES),
			"boreholeStatuses": list(ui.BOREHOLE_STATUSES),
			"labSampleStatuses": list(ui.LAB_SAMPLE_STATUSES),
			"quoteStatuses": list(ui.QUOTE_STATUSES),
			"invoiceStatuses": list(ui.INVOICE_STATUSES),
			"auditSeverities": list(ui.AUDIT_SEVERITIES),
			"engineStatuses": list(ui.ENGINE_EVAL_STATUSES),
			"engineResultTypes": list(ui.ENGINE_RESULT_TYPES),
			"roleLabels": list(ui.ROLE_LABELS),
			"positionLabels": list(ui.POSITION_LABELS),
			"permissionRows": list(ui.PERMISSION_ROWS),
			"permissionColumns": list(ui.PERMISSION_COLUMNS),
			"permissionMatrix": {key: list(value) for key, value in ui.PERMISSION_MATRIX.items()},
			"orgTypes": org_types(),
			"categories": categories(),
			"cities": cities(),
			"uscs": uscs(),
			"custodySteps": custody_steps(),
			"optionalLabTests": optional_lab_tests(),
			"seismicClasses": _seismic(),
			"sptClasses": _spt_classes(),
		}
	)
	return out


@frappe.whitelist(allow_guest=True)
def masters():
	return get_masters()
