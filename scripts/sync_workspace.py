"""Sync Miyar workspace JSON into the site DB."""

from __future__ import annotations

import json
from pathlib import Path

import frappe


def run():
	path = Path(frappe.get_app_path("miyar")) / "miyar" / "workspace" / "miyar" / "miyar.json"
	data = json.loads(path.read_text())
	if frappe.db.exists("Workspace", "Miyar"):
		ws = frappe.get_doc("Workspace", "Miyar")
	else:
		ws = frappe.new_doc("Workspace")
		ws.name = "Miyar"

	ws.update(
		{
			"title": data.get("title") or "معيار",
			"label": data.get("label") or "Miyar",
			"module": data.get("module") or "Miyar",
			"icon": data.get("icon") or "tool",
			"public": 1,
			"content": data.get("content"),
			"sequence_id": data.get("sequence_id") or 5,
			"app": data.get("app") or "miyar",
		}
	)
	ws.set("shortcuts", [])
	for row in data.get("shortcuts") or []:
		ws.append("shortcuts", row)
	ws.set("links", [])
	for row in data.get("links") or []:
		ws.append("links", row)

	ws.flags.ignore_links = True
	ws.flags.ignore_validate = True
	ws.save(ignore_permissions=True)
	frappe.db.commit()
	print("saved", ws.name, "shortcuts", [(s.label, s.type, s.url) for s in ws.shortcuts])
