# Copyright (c) 2026, Miyar and contributors
# License: MIT. See LICENSE

"""Custom fields on ERPNext Asset for laboratory equipment (section 4.19)."""

from __future__ import annotations

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields
from frappe.utils import getdate, nowdate, date_diff


ASSET_FIELDS = {
	"Asset": [
		{
			"fieldname": "miyar_section",
			"fieldtype": "Section Break",
			"label": "معيار — معدة مختبر",
			"insert_after": "asset_name",
		},
		{
			"fieldname": "miyar_lab",
			"label": "المختبر",
			"fieldtype": "Link",
			"options": "Organization",
			"insert_after": "miyar_section",
		},
		{
			"fieldname": "miyar_equipment_type",
			"label": "نوع المعدة",
			"fieldtype": "Link",
			"options": "Equipment Type",
			"insert_after": "miyar_lab",
		},
		{
			"fieldname": "measuring_range",
			"label": "مدى القياس",
			"fieldtype": "Data",
			"insert_after": "miyar_equipment_type",
		},
		{
			"fieldname": "resolution",
			"label": "الدقة",
			"fieldtype": "Data",
			"insert_after": "measuring_range",
		},
		{
			"fieldname": "column_break_miyar_cal",
			"fieldtype": "Column Break",
			"insert_after": "resolution",
		},
		{
			"fieldname": "calibration_due",
			"label": "استحقاق المعايرة",
			"fieldtype": "Date",
			"insert_after": "column_break_miyar_cal",
		},
		{
			"fieldname": "calibration_certificate",
			"label": "رقم شهادة المعايرة",
			"fieldtype": "Data",
			"insert_after": "calibration_due",
		},
		{
			"fieldname": "calibration_provider",
			"label": "جهة المعايرة",
			"fieldtype": "Data",
			"insert_after": "calibration_certificate",
		},
		{
			"fieldname": "miyar_status",
			"label": "حالة المعدة",
			"fieldtype": "Select",
			"options": "صالح\nقارب الانتهاء\nمنتهٍ\nخارج الخدمة",
			"insert_after": "calibration_provider",
		},
		{
			"fieldname": "lab_location",
			"label": "موقع المعدة في المختبر",
			"fieldtype": "Data",
			"insert_after": "miyar_status",
		},
	]
}


def ensure_custom_fields():
	if not frappe.db.exists("DocType", "Asset"):
		return
	create_custom_fields(ASSET_FIELDS, ignore_validate=True)


def sync_asset_miyar_status(doc, method=None):
	if not doc.meta.has_field("miyar_status"):
		return
	if (doc.miyar_status or "") == "خارج الخدمة":
		return
	if not doc.calibration_due:
		return
	due = getdate(doc.calibration_due)
	today = getdate(nowdate())
	delta = date_diff(due, today)
	if delta < 0:
		doc.miyar_status = "منتهٍ"
	elif delta <= 30:
		doc.miyar_status = "قارب الانتهاء"
	else:
		doc.miyar_status = "صالح"


def asset_is_usable(asset_name: str) -> bool:
	status, due = frappe.db.get_value("Asset", asset_name, ["miyar_status", "calibration_due"]) or (None, None)
	if status == "خارج الخدمة" or status == "منتهٍ":
		return False
	if due and getdate(due) < getdate(nowdate()):
		return False
	return True
