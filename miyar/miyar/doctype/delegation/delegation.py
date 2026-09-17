# Copyright (c) 2026, Miyar and contributors
# License: MIT. See LICENSE

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import now_datetime

from miyar.constants import STS22, STS23, STS24, STS25
from miyar.utils.org import can_delegate, get_org_user, get_user_org
from miyar.utils.audit import log_event


class Delegation(Document):
	def before_insert(self):
		if self.delegation_type == "Direct":
			self.status = STS23
		else:
			self.status = STS22

	def validate(self):
		from_ou = frappe.db.get_value("Organization User", {"user": self.from_user}, ["organization", "position", "can_delegate"], as_dict=True)
		to_ou = frappe.db.get_value("Organization User", {"user": self.to_user}, ["organization"], as_dict=True)
		if not from_ou or not to_ou or from_ou.organization != to_ou.organization:
			frappe.throw(_("التفويض داخل المنشأة نفسها فقط (B.R.232)."))
		req = frappe.get_doc("Test Request", self.test_request)
		if from_ou.organization not in {req.contractor, req.lab, req.consultant}:
			frappe.throw(_("المنشأة ليست طرفاً في الطلب."))
		dup = frappe.db.exists(
			"Delegation",
			{
				"test_request": self.test_request,
				"test_line": self.test_line or ["in", ["", None]],
				"to_user": self.to_user,
				"status": ["in", [STS22, STS23]],
				"name": ["!=", self.name or ""],
			},
		)
		# simpler duplicate check
		for row in frappe.get_all(
			"Delegation",
			filters={"test_request": self.test_request, "to_user": self.to_user, "status": ["in", [STS22, STS23]]},
			fields=["name", "test_line", "scope"],
		):
			if row.name == self.name:
				continue
			if (self.scope == "Request" and row.scope == "Request") or (
				self.scope == "Test" and row.test_line == self.test_line
			):
				frappe.throw(_("لا تفويض مكرر فعّال/معلّق لنفس النطاق والمستلم."))
		if self.delegation_type == "Direct":
			if from_ou.position != "Principal" and not from_ou.can_delegate:
				frappe.throw(_("التفويض المباشر للمفوّض الرئيسي أو من يملك can_delegate."))

	def decide(self, accept: bool):
		if self.status != STS22:
			frappe.throw(_("القرار على التفويض غير المباشر بانتظار القبول فقط."))
		if frappe.session.user != self.to_user:
			frappe.throw(_("القبول/الرفض للمفوَّض إليه."))
		self.status = STS23 if accept else STS24
		self.decided_at = now_datetime()
		self.save(ignore_permissions=True)
		log_event("قرار تفويض", entity=self)

	def revoke(self):
		self.status = STS25
		self.save(ignore_permissions=True)
		log_event("إلغاء تفويض", entity=self)
