# Copyright (c) 2026, Miyar and contributors
# License: MIT. See LICENSE

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import add_days, nowdate


class ArchivedSample(Document):
	def validate(self):
		last = (self.custody or [None])[-1]
		if last and last.step:
			self.status = frappe.db.get_value("Custody Step", last.step, "maps_to_sample_status") or self.status
			if frappe.db.get_value("Custody Step", last.step, "code") == "dispose" and not last.note:
				frappe.throw(_("الإتلاف يتطلب محضراً / ملاحظة."))
		if not self.retention_until:
			days = None
			kind = frappe.db.get_value("Sample Archive Kind", self.archive_kind, "label_ar") or ""
			if "ترب" in kind:
				days = frappe.db.get_single_value("Miyar Settings", "sample_retention_soil_days") or 90
			elif "خرسان" in kind:
				days = frappe.db.get_single_value("Miyar Settings", "sample_retention_concrete_days") or 180
			if days:
				self.retention_until = add_days(nowdate(), int(days))
