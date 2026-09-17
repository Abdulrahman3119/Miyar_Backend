# Copyright (c) 2026, Miyar and contributors
# License: MIT. See LICENSE

import frappe
from frappe.model.document import Document


class Borehole(Document):
	def validate(self):
		if self.approved_n is not None and self.operational_n is not None:
			# simple Euclidean on n/e treated as meters
			from math import hypot

			if self.approved_n and self.operational_n:
				self.moved_m = hypot(
					float(self.operational_n or 0) - float(self.approved_n or 0),
					float(self.operational_e or 0) - float(self.approved_e or 0),
				)
		if self.operational_n is not None and self.actual_n is not None:
			from math import hypot

			self.geo_distance_m = hypot(
				float(self.actual_n or 0) - float(self.operational_n or 0),
				float(self.actual_e or 0) - float(self.operational_e or 0),
			)
		study = frappe.db.get_value("Geotechnical Study", self.study, ["plan_approved"], as_dict=True)
		if study and study.plan_approved:
			if self.has_value_changed("approved_depth"):
				frappe.throw("المختبر لا يغيّر العمق المعتمد بعد اعتماد الخطة.")
