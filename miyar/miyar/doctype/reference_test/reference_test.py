# Copyright (c) 2026, Miyar and contributors
# License: MIT. See LICENSE

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.model.naming import make_autoname

from miyar.constants import STS03
from miyar.utils.audit import log_event


class ReferenceTest(Document):
	def autoname(self):
		if self.code:
			self.name = self.code
		else:
			self.name = make_autoname("RT-.#####")
			self.code = self.name

	def before_insert(self):
		self.ensure_item()

	def validate(self):
		if not self.units:
			frappe.throw(_("وحدة قياس واحدة على الأقل مطلوبة."))
		if not self.methods:
			frappe.throw(_("طريقة واحدة على الأقل مطلوبة."))
		self.ensure_item()

	def ensure_item(self):
		if not frappe.db.exists("DocType", "Item"):
			return
		item_code = self.code or self.name or self.test_name_en
		if not item_code:
			return
		if frappe.db.exists("Item", item_code):
			self.item = item_code
			return
		item = frappe.get_doc(
			{
				"doctype": "Item",
				"item_code": item_code,
				"item_name": self.test_name_ar or item_code,
				"item_group": self.item_group,
				"stock_uom": (self.units[0].uom if self.units else "Ea"),
				"is_stock_item": 0,
				"include_item_in_manufacturing": 0,
			}
		)
		if item.meta.has_field("is_sales_item"):
			item.is_sales_item = 0
		if item.meta.has_field("is_purchase_item"):
			item.is_purchase_item = 0
		item.flags.ignore_permissions = True
		item.insert()
		self.item = item.name

	def on_update(self):
		# B.R.113 — drop catalog methods that are no longer offered; never auto-add tests to labs.
		if not self.has_value_changed("methods") and not self.has_value_changed("is_active"):
			return
		allowed = {row.test_method for row in (self.methods or [])}
		catalogs = frappe.get_all("Lab Catalog Item", filters={"reference_test": self.name}, pluck="name")
		for name in catalogs:
			cat = frappe.get_doc("Lab Catalog Item", name)
			kept = [m for m in cat.methods if m.test_method in allowed]
			if len(kept) != len(cat.methods):
				cat.methods = []
				for m in kept:
					cat.append("methods", {"test_method": m.test_method})
				if not cat.methods or not cat.base_price or not cat.uom:
					cat.status = STS03
				cat.flags.ignore_permissions = True
				cat.save()
				log_event(
					"مزامنة طرق الكتالوج بعد تعديل المرجع",
					entity=cat,
					organization=cat.lab,
					severity="notice",
					detail=self.name,
				)
