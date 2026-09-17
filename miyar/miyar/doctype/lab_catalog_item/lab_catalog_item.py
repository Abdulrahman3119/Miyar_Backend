# Copyright (c) 2026, Miyar and contributors
# License: MIT. See LICENSE

import frappe
from frappe import _
from frappe.model.document import Document

from miyar.constants import STS01, STS02, STS03


class LabCatalogItem(Document):
	def validate(self):
		self.set_status()
		if self.lab and frappe.db.get_value("Organization", self.lab, "organization_type") not in (
			"lab",
			frappe.db.get_value("Organization Type", {"code": "lab"}, "name"),
		):
			# organization_type is the DocType name which equals code when autonamed field:code
			org_type = frappe.db.get_value("Organization", self.lab, "organization_type")
			if org_type != "lab":
				frappe.throw(_("بند الكتالوج يُربط بمنشأة من نوع مختبر فقط."))
		existing = frappe.db.exists(
			"Lab Catalog Item",
			{"lab": self.lab, "reference_test": self.reference_test, "name": ["!=", self.name or ""]},
		)
		if existing:
			frappe.throw(_("هذا الاختبار موجود مسبقاً في قائمة المختبر."))

	def set_status(self):
		if self.status == STS02:
			return
		if not self.uom or not self.base_price or not self.methods:
			self.status = STS03
		else:
			self.status = STS01

	def on_trash(self):
		# B.R.117 — no delete; stop the item instead.
		frappe.throw(_("لا يُحذف بند الكتالوج. أوقِفه (STS02)."))
