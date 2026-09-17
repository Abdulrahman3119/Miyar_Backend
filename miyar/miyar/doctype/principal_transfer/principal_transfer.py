# Copyright (c) 2026, Miyar and contributors
# License: MIT. See LICENSE

import frappe
from frappe import _
from frappe.model.document import Document

from miyar.utils.audit import log_event
from miyar.utils.org import sync_user_role


class PrincipalTransfer(Document):
	def on_submit(self):
		if self.status not in ("Done",):
			self.db_set("status", "Pending OTP")

	def complete(self):
		if not (self.from_otp_ok and self.to_otp_ok):
			frappe.throw(_("يلزم OTP الطرفين."))
		from_ou = frappe.db.get_value(
			"Organization User",
			{"organization": self.organization, "user": self.from_user},
			"name",
		)
		to_ou = frappe.db.get_value(
			"Organization User",
			{"organization": self.organization, "user": self.to_user},
			"name",
		)
		if not from_ou or not to_ou:
			frappe.throw(_("المستخدمون يجب أن يكونوا موظفي نفس المنشأة."))
		frappe.db.set_value("Organization User", from_ou, {"position": "Employee", "can_delegate": 0})
		frappe.db.set_value("Organization User", to_ou, {"position": "Principal", "can_delegate": 1})
		sync_user_role(frappe.get_doc("Organization User", from_ou))
		sync_user_role(frappe.get_doc("Organization User", to_ou))
		self.db_set("status", "Done")
		if self.docstatus == 0:
			self.submit()
		log_event("نقل المفوّض الرئيسي", entity=self, organization=self.organization, severity="critical")
