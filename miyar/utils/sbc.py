# Copyright (c) 2026, Miyar and contributors
# License: MIT. See LICENSE

"""SBC 303 Table 2.1 row selection and borehole count/depth (section 15.7)."""

from __future__ import annotations

import math

import frappe
from frappe.utils import flt, cint


def pick_table_21_row(floors: int, built_area: float) -> str | None:
	floors = cint(floors)
	built_area = flt(built_area)
	rows = frappe.get_all(
		"SBC Table 21 Row",
		fields=[
			"name",
			"floors_min",
			"floors_max",
			"built_area_min_m2",
			"built_area_max_m2",
			"is_special",
			"base_count",
			"extra_per_m2",
			"count_cap",
			"depth_one_third_m",
		],
		order_by="is_special desc, floors_min asc",
	)
	if floors >= 5 or built_area > 5000:
		for row in rows:
			if row.is_special:
				if floors >= 5 and cint(row.floors_min) >= 5:
					return row.name
				if built_area > 5000 and flt(row.built_area_min_m2) >= 5000:
					return row.name
		for row in rows:
			if row.is_special:
				return row.name
	for row in rows:
		if row.is_special:
			continue
		fmin, fmax = cint(row.floors_min), row.floors_max
		amin, amax = flt(row.built_area_min_m2), row.built_area_max_m2
		if floors < fmin:
			continue
		if fmax not in (None, "") and floors > cint(fmax):
			continue
		if built_area < amin:
			continue
		if amax not in (None, "") and built_area > flt(amax):
			continue
		return row.name
	return None


def compute_plan(floors: int, built_area: float, foundation_depth: float) -> dict:
	name = pick_table_21_row(floors, built_area)
	settings_depth = flt(frappe.db.get_single_value("Miyar Settings", "min_borehole_depth") or 10)
	if not name:
		return {
			"table_21_row": None,
			"engine_count": 0,
			"engine_depth": settings_depth,
			"engine_special": 1,
			"engine_ref": "لا يوجد صف مطابق في Table 2.1",
		}
	row = frappe.get_doc("SBC Table 21 Row", name)
	if row.is_special:
		count = 0
	else:
		count = cint(row.base_count) or 3
		extra = flt(row.extra_per_m2)
		if extra and built_area >= 600:
			count = count + math.ceil((flt(built_area) - 600) / extra)
		cap = cint(row.count_cap) or 10
		count = min(cap, count)
	depth_exec = max(settings_depth, flt(row.depth_one_third_m) + flt(foundation_depth))
	return {
		"table_21_row": row.name,
		"engine_count": count,
		"engine_depth": depth_exec,
		"engine_special": 1 if row.is_special else 0,
		"engine_ref": row.borehole_count_rule or row.label_ar or row.code,
	}
