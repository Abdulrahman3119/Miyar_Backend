"""Helpers for generating Frappe DocType JSON + controller stubs."""

from __future__ import annotations

import json
import re
from pathlib import Path

MODULE = "Miyar"
NOW = "2026-09-15 00:00:00.000000"
OWNER = "Administrator"

SM = "System Manager"
ADMIN = "Miyar Admin"
VISITOR = "Miyar Visitor"
C_P = "Miyar Contractor Principal"
C_E = "Miyar Contractor Employee"
L_P = "Miyar Lab Principal"
L_E = "Miyar Lab Employee"
K_P = "Miyar Consultant Principal"
K_E = "Miyar Consultant Employee"
SUP = "Miyar Supervisor"
SPT = "Miyar Support"

PARTIES = (C_P, C_E, L_P, L_E, K_P, K_E)
CONTRACTORS = (C_P, C_E)
LABS = (L_P, L_E)
CONSULTANTS = (K_P, K_E)
OPS = (SUP, SPT, ADMIN, SM)


def scrub(name: str) -> str:
	s = re.sub(r"[^0-9a-zA-Z]+", "_", name).strip("_").lower()
	return re.sub(r"_+", "_", s)


def classname(name: str) -> str:
	parts = re.split(r"[^0-9a-zA-Z]+", name)
	out = []
	for p in parts:
		if not p:
			continue
		out.append(p[0].upper() + p[1:] if len(p) > 1 else p.upper())
	return "".join(out)


def f(fieldname: str, fieldtype: str, label: str, **kw):
	d = {"fieldname": fieldname, "fieldtype": fieldtype, "label": label}
	alias = {
		"reqd": "reqd",
		"unique": "unique",
		"ro": "read_only",
		"hidden": "hidden",
		"opt": "options",
		"default": "default",
		"in_list": "in_list_view",
		"in_std": "in_standard_filter",
		"fetch": "fetch_from",
		"desc": "description",
		"bold": "bold",
		"length": "length",
		"no_copy": "no_copy",
		"set_only_once": "set_only_once",
		"depends_on": "depends_on",
		"mandatory_depends_on": "mandatory_depends_on",
		"read_only_depends_on": "read_only_depends_on",
		"columns": "columns",
		"non_neg": "non_negative",
		"allow_on_submit": "allow_on_submit",
		"ignore_user_permissions": "ignore_user_permissions",
		"in_preview": "in_preview",
		"in_filter": "in_filter",
		"in_global_search": "in_global_search",
		"search_index": "search_index",
		"precision": "precision",
		"collapsible": "collapsible",
		"hide_border": "hide_border",
		"fetch_if_empty": "fetch_if_empty",
		"translatable": "translatable",
	}
	for src, dest in alias.items():
		if src in kw and kw[src] is not None:
			val = kw[src]
			if dest in {
				"reqd",
				"unique",
				"read_only",
				"hidden",
				"in_list_view",
				"in_standard_filter",
				"bold",
				"no_copy",
				"set_only_once",
				"non_negative",
				"allow_on_submit",
				"ignore_user_permissions",
				"in_preview",
				"in_filter",
				"in_global_search",
				"search_index",
				"collapsible",
				"hide_border",
				"fetch_if_empty",
				"translatable",
			}:
				val = 1 if val else 0
			d[dest] = val
	return d


def sec(label: str, fieldname: str | None = None, **kw):
	fn = fieldname or ("sec_" + scrub(label))
	return f(fn, "Section Break", label, **kw)


def col(fieldname: str):
	return f(fieldname, "Column Break", "")


def tab(label: str, fieldname: str | None = None):
	fn = fieldname or ("tab_" + scrub(label))
	return f(fn, "Tab Break", label)


def amended(doctype: str):
	return f(
		"amended_from",
		"Link",
		"Amended From",
		opt=doctype,
		hidden=1,
		no_copy=1,
		ro=1,
	)


def P(role, read=0, write=0, create=0, delete=0, submit=0, cancel=0, amend=0, **kw):
	return {
		"role": role,
		"read": int(read),
		"write": int(write),
		"create": int(create),
		"delete": int(delete),
		"submit": int(submit),
		"cancel": int(cancel),
		"amend": int(amend),
		"report": int(kw.get("report", 1 if read else 0)),
		"export": int(kw.get("export", 1 if read else 0)),
		"print": int(kw.get("print", 1 if read else 0)),
		"email": int(kw.get("email", 0)),
		"share": int(kw.get("share", 0)),
		"select": int(kw.get("select", 1 if read else 0)),
		**({"if_owner": 1} if kw.get("if_owner") else {}),
	}


def full(role, delete=1, submit=0, cancel=0, amend=0):
	return P(role, 1, 1, 1, delete, submit, cancel, amend, report=1, export=1, print=1, email=1, share=1)


def readp(role):
	return P(role, read=1, report=1, export=1, print=1)


def rwc(role, delete=0, submit=0, cancel=0):
	return P(role, 1, 1, 1, delete, submit, cancel, report=1, export=1, print=1)


def admin_full(delete=1, submit=0, cancel=0):
	return [full(SM, delete=delete, submit=submit, cancel=cancel, amend=cancel), full(ADMIN, delete=delete, submit=submit, cancel=cancel, amend=cancel)]


def master_perms():
	perms = admin_full(delete=1)
	for role in (*PARTIES, SUP, SPT, VISITOR):
		perms.append(readp(role))
	return perms


def naming_rule_for(autoname: str | None, istable: int, issingle: int) -> str | None:
	if istable or issingle or not autoname:
		return None
	if autoname.startswith("field:"):
		return "By fieldname"
	if autoname == "hash":
		return "Random"
	if autoname == "naming_series:" or autoname.startswith("naming_series"):
		return 'By "Naming Series" field'
	if autoname == "autoincrement":
		return "Autoincrement"
	return "Expression"


def dt(
	name: str,
	fields: list,
	*,
	autoname: str | None = None,
	istable: int = 0,
	issingle: int = 0,
	is_submittable: int = 0,
	title_field: str | None = None,
	search_fields: str | None = None,
	image_field: str | None = None,
	track_changes: int = 0,
	permissions: list | None = None,
	links: list | None = None,
	allow_rename: int = 0,
	quick_entry: int = 0,
	sort_field: str = "modified",
	sort_order: str = "DESC",
	is_calendar_and_gantt: int = 0,
	editable_grid: int | None = None,
	grid_page_length: int = 50,
	hide_toolbar: int = 0,
	show_name_in_global_search: int = 0,
	default_view: str | None = None,
	description: str | None = None,
):
	clean_fields = []
	field_order = []
	for fld in fields:
		if not fld.get("fieldname"):
			continue
		clean_fields.append(fld)
		field_order.append(fld["fieldname"])

	if is_submittable and not any(x["fieldname"] == "amended_from" for x in clean_fields):
		af = amended(name)
		clean_fields.append(af)
		field_order.append("amended_from")

	doc = {
		"actions": [],
		"allow_rename": allow_rename,
		"creation": NOW,
		"doctype": "DocType",
		"engine": "InnoDB",
		"field_order": field_order,
		"fields": clean_fields,
		"grid_page_length": grid_page_length,
		"index_web_pages_for_search": 1,
		"istable": istable,
		"links": links or [],
		"modified": NOW,
		"modified_by": OWNER,
		"module": MODULE,
		"name": name,
		"owner": OWNER,
		"permissions": [] if istable else (permissions if permissions is not None else admin_full()),
		"row_format": "Dynamic",
		"sort_field": sort_field,
		"sort_order": sort_order,
		"states": [],
		"track_changes": track_changes,
	}
	if description:
		doc["description"] = description
	if autoname:
		doc["autoname"] = autoname
		nr = naming_rule_for(autoname, istable, issingle)
		if nr:
			doc["naming_rule"] = nr
	if istable:
		doc["editable_grid"] = 1 if editable_grid is None else editable_grid
		doc["istable"] = 1
	if issingle:
		doc["issingle"] = 1
	if is_submittable:
		doc["is_submittable"] = 1
	if title_field:
		doc["title_field"] = title_field
	if search_fields:
		doc["search_fields"] = search_fields
	if image_field:
		doc["image_field"] = image_field
	if quick_entry:
		doc["quick_entry"] = 1
	if hide_toolbar:
		doc["hide_toolbar"] = 1
	if show_name_in_global_search:
		doc["show_name_in_global_search"] = 1
	if default_view:
		doc["default_view"] = default_view
	if allow_rename:
		doc["allow_rename"] = 1
	else:
		doc["allow_rename"] = 0
	return doc


def child(name: str, fields: list, **kw):
	# first few data fields visible in grid
	visible = 0
	for fld in fields:
		if fld["fieldtype"] in {
			"Data",
			"Link",
			"Select",
			"Int",
			"Float",
			"Currency",
			"Date",
			"Check",
			"Small Text",
			"Percent",
			"Time",
			"Datetime",
			"Attach",
			"Attach Image",
		} and visible < 4:
			fld["in_list_view"] = 1
			if "columns" not in fld:
				fld["columns"] = 2
			visible += 1
	return dt(name, fields, istable=1, **kw)


def write_doctype(app_root: Path, doc: dict):
	folder = app_root / "miyar" / "miyar" / "doctype" / scrub(doc["name"])
	folder.mkdir(parents=True, exist_ok=True)
	(folder / "__init__.py").write_text("", encoding="utf-8")
	json_path = folder / f"{scrub(doc['name'])}.json"
	json_path.write_text(json.dumps(doc, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")

	cls = classname(doc["name"])
	py_path = folder / f"{scrub(doc['name'])}.py"
	if not py_path.exists():
		py_path.write_text(
			f'''# Copyright (c) 2026, Miyar and contributors
# For license information, please see license.txt

from frappe.model.document import Document


class {cls}(Document):
	pass
''',
			encoding="utf-8",
		)

	if not doc.get("istable") and not doc.get("issingle"):
		js_path = folder / f"{scrub(doc['name'])}.js"
		if not js_path.exists():
			js_path.write_text(
				f'''// Copyright (c) 2026, Miyar and contributors
// For license information, please see license.txt

frappe.ui.form.on("{doc["name"]}", {{
	refresh(frm) {{}},
}});
''',
				encoding="utf-8",
			)

	test_path = folder / f"test_{scrub(doc['name'])}.py"
	if not test_path.exists():
		test_path.write_text(
			f'''# Copyright (c) 2026, Miyar and contributors
# See license.txt

from frappe.tests.utils import FrappeTestCase


class Test{cls}(FrappeTestCase):
	pass
''',
			encoding="utf-8",
		)
	return json_path
