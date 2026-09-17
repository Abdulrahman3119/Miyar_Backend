# Copyright (c) 2026, Miyar and contributors
# License: MIT. See LICENSE

import frappe
from frappe import _
from frappe.model.document import Document


class FieldSample(Document):
	def after_insert(self):
		self.seed_mandatory_tests()

	def seed_mandatory_tests(self):
		if self.tests:
			return
		if not self.sample_kind:
			return
		rules = frappe.get_all(
			"Mandatory Sample Test Rule",
			filters={"sample_kind": self.sample_kind},
			fields=["label_ar", "test_method", "requires_attachment", "uom", "sort_order"],
			order_by="sort_order",
		)
		for rule in rules:
			self.append(
				"tests",
				{
					"test_label": rule.label_ar,
					"test_method": rule.test_method,
					"mandatory": 1,
					"uom": rule.uom,
				},
			)
		if rules:
			self.save(ignore_permissions=True)

	def validate(self):
		# mandatory rows cannot be deleted — re-seed missing
		if not self.sample_kind:
			return
		existing = {row.test_method for row in (self.tests or []) if row.test_method}
		rules = frappe.get_all(
			"Mandatory Sample Test Rule",
			filters={"sample_kind": self.sample_kind},
			fields=["label_ar", "test_method", "uom"],
		)
		for rule in rules:
			if rule.test_method and rule.test_method not in existing:
				self.append(
					"tests",
					{
						"test_label": rule.label_ar,
						"test_method": rule.test_method,
						"mandatory": 1,
						"uom": rule.uom,
					},
				)
