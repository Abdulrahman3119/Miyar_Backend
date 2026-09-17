# Copyright (c) 2026, Miyar and contributors
# License: MIT. See LICENSE

import frappe
from frappe.model.document import Document
from frappe.utils import add_days, getdate


class CalibrationRecord(Document):
	def validate(self):
		if self.calibrated_on and not self.due_on:
			self.due_on = add_days(self.calibrated_on, 365)

	def on_update(self):
		if self.sets_status_valid and self.asset:
			frappe.db.set_value(
				"Asset",
				self.asset,
				{
					"calibration_due": self.due_on,
					"calibration_certificate": self.certificate_no,
					"calibration_provider": self.provider,
					"miyar_status": "صالح",
				},
			)
