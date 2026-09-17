# Copyright (c) 2026, Miyar and contributors
# License: MIT. See LICENSE

import re

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import now_datetime

from miyar.utils.audit import log_event
from miyar.utils.org import sync_user_role


class OrganizationRegistration(Document):
	def validate(self):
		if self.cr and not re.fullmatch(r"\d{10}", str(self.cr).strip()):
			frappe.throw(_("السجل التجاري يجب أن يكون 10 أرقام."))
		if self.principal_national_id and not re.fullmatch(r"\d{10}", str(self.principal_national_id).strip()):
			frappe.throw(_("هوية المفوّض يجب أن تكون 10 أرقام."))
		if self.principal_mobile and not re.fullmatch(r"05\d{8}", str(self.principal_mobile).strip()):
			frappe.throw(_("الجوال يجب أن يبدأ بـ 05 ويتكون من 10 أرقام."))
		if self.organization_type:
			can = frappe.db.get_value("Organization Type", self.organization_type, "can_self_register")
			if not can and self.status in ("Draft", "Submitted"):
				frappe.throw(_("هذا النوع لا يُسجَّل ذاتياً."))

	def on_submit(self):
		if self.status == "Draft":
			self.db_set("status", "Submitted")

	def activate(self):
		if self.status == "Activated" and self.organization:
			return self.organization
		org = frappe.get_doc(
			{
				"doctype": "Organization",
				"organization_name": self.organization_name or self.cr,
				"organization_type": self.organization_type,
				"cr": self.cr,
				"directory_status": "STS04",
				"active": 1,
				"email": self.principal_email,
				"phone": self.principal_mobile,
			}
		)
		# Territory is mandatory — pick first available
		territory = frappe.db.get_value("Territory", {"is_group": 0}, "name") or frappe.db.get_value("Territory", {}, "name")
		if territory:
			org.territory = territory
		if self.saac_number:
			org.append("saac", {"saac_number": self.saac_number})
		org.insert(ignore_permissions=True)

		email = self.principal_email
		if frappe.db.exists("User", email):
			user = frappe.get_doc("User", email)
		else:
			user = frappe.get_doc(
				{
					"doctype": "User",
					"email": email,
					"first_name": self.principal_name,
					"mobile_no": self.principal_mobile,
					"send_welcome_email": 0,
					"user_type": "System User",
				}
			)
			user.insert(ignore_permissions=True)

		ou = frappe.get_doc(
			{
				"doctype": "Organization User",
				"organization": org.name,
				"user": user.name,
				"position": "Principal",
				"can_delegate": 1,
				"national_id": self.principal_national_id,
				"is_active": 1,
			}
		)
		ou.insert(ignore_permissions=True)
		sync_user_role(ou)

		self.db_set(
			{
				"status": "Activated",
				"organization": org.name,
				"activated_at": now_datetime(),
			}
		)
		if self.docstatus == 0:
			self.flags.ignore_permissions = True
			self.submit()
		log_event("تفعيل تسجيل منشأة", entity=self, organization=org.name, severity="notice")
		return org.name


@frappe.whitelist()
def activate_registration(name: str):
	doc = frappe.get_doc("Organization Registration", name)
	doc.flags.ignore_permissions = True
	return doc.activate()
