# Copyright (c) 2026, Miyar and contributors
# License: MIT. See LICENSE

import frappe
from frappe import _
from frappe.model.document import Document

from miyar.constants import STS06
from miyar.miyar.doctype.organization.organization import recalc_lab_rating


class LabRating(Document):
	def validate(self):
		if frappe.db.exists("Lab Rating", {"service_contract": self.service_contract, "name": ["!=", self.name or ""]}):
			frappe.throw(_("تقييم واحد لكل عقد/مقاول (B.R.127)."))
		active = frappe.db.get_value("Service Contract", self.service_contract, "is_active")
		if active:
			frappe.throw(_("التقييم بعد انتهاء العقد فقط."))
		self.status = self.status or STS06

	def on_update(self):
		if self.lab:
			recalc_lab_rating(self.lab)
