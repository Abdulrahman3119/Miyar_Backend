# Copyright (c) 2026, Miyar and contributors
# License: MIT. See LICENSE

from __future__ import annotations

import hashlib

import frappe


def sha256_bytes(content: bytes) -> str:
	return hashlib.sha256(content).hexdigest()


def after_file_insert(doc, method=None):
	"""Stamp content_hash onto Photo Evidence / Platform Document when a file lands."""
	if not doc.attached_to_doctype or not doc.attached_to_name:
		return
	if doc.attached_to_doctype not in ("Photo Evidence", "Platform Document", "Geotechnical Study"):
		return
	try:
		content = doc.get_content()
		if not content:
			return
		digest = sha256_bytes(content if isinstance(content, bytes) else str(content).encode())
		if doc.attached_to_doctype == "Photo Evidence" and frappe.db.has_column("Photo Evidence", "content_hash"):
			frappe.db.set_value("Photo Evidence", doc.attached_to_name, "content_hash", digest)
		if doc.attached_to_doctype == "Platform Document" and frappe.db.has_column("Platform Document", "content_hash"):
			frappe.db.set_value("Platform Document", doc.attached_to_name, "content_hash", digest)
		if doc.attached_to_doctype == "Geotechnical Study" and doc.attached_to_field == "report_file":
			frappe.db.set_value("Geotechnical Study", doc.attached_to_name, "report_hash", digest)
	except Exception:
		frappe.log_error(title="Miyar file hash failed")
