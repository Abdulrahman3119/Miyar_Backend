# Copyright (c) 2026, Miyar and contributors
# License: MIT. See LICENSE

import frappe
from frappe import _
from frappe.model.document import Document

from miyar.utils.org import sync_user_role


class OrganizationUser(Document):
	def validate(self):
		if self.position == "Principal":
			self.can_delegate = 1
			others = frappe.db.get_all(
				"Organization User",
				filters={
					"organization": self.organization,
					"position": "Principal",
					"is_active": 1,
					"name": ["!=", self.name or ""],
				},
				pluck="name",
			)
			if others:
				frappe.throw(_("لا يجوز وجود مفوّضين رئيسيين في آن. استخدم نقل الصلاحيات."))

	def after_insert(self):
		sync_user_role(self)

	def on_update(self):
		if self.has_value_changed("position") or self.has_value_changed("is_active"):
			sync_user_role(self)
