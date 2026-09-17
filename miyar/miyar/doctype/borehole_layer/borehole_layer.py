# Copyright (c) 2026, Miyar and contributors
# License: MIT. See LICENSE

import frappe
from frappe.model.document import Document


class BoreholeLayer(Document):
	def validate(self):
		n2 = int(self.spt_n2 or 0)
		n3 = int(self.spt_n3 or 0)
		self.n_value = n2 + n3
