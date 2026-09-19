# Copyright (c) 2026, Miyar and contributors
# License: MIT. See LICENSE

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import now_datetime

from miyar.constants import STS22, STS23, STS24, STS25
from miyar.utils.audit import log_event
from miyar.utils.notify import field_work_started, notify_user
from miyar.utils.org import can_delegate, has_active_delegation, is_principal


class Delegation(Document):
	def before_insert(self):
		if self.delegation_type == "Direct":
			self.status = STS23
		else:
			self.status = STS22

	def validate(self):
		from_ou = frappe.db.get_value(
			"Organization User",
			{"user": self.from_user},
			["organization", "position", "can_delegate"],
			as_dict=True,
		)
		to_ou = frappe.db.get_value(
			"Organization User",
			{"user": self.to_user},
			["organization"],
			as_dict=True,
		)
		if not from_ou or not to_ou or from_ou.organization != to_ou.organization:
			frappe.throw(_("التفويض داخل المنشأة نفسها فقط (B.R.232)."))
		if self.from_user == self.to_user:
			frappe.throw(_("لا تفويض للذات."))
		req = frappe.get_doc("Test Request", self.test_request)
		if from_ou.organization not in {req.contractor, req.lab, req.consultant}:
			frappe.throw(_("المنشأة ليست طرفاً في الطلب."))
		if self.scope == "Test" and not self.test_line:
			frappe.throw(_("نطاق الاختبار يتطلب بند اختبار."))
		for row in frappe.get_all(
			"Delegation",
			filters={
				"test_request": self.test_request,
				"to_user": self.to_user,
				"status": ["in", [STS22, STS23]],
			},
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
				frappe.throw(_("التفويض المباشر للمفوّض الرئيسي أو من يملك can_delegate (B.R.233)."))
		else:
			# Indirect — employee may only re-delegate within an active STS23 scope (B.R.233)
			if from_ou.position != "Principal" and not from_ou.can_delegate:
				if not has_active_delegation(self.from_user, self.test_request, self.test_line):
					frappe.throw(_("التفويض غير المباشر ضمن نطاق تفويضك الفعّال فقط (B.R.233)."))

	def after_insert(self):
		status_ar = "فعّال فوراً" if self.status == STS23 else "بانتظار قبولك"
		notify_user(
			self.to_user,
			subject=f"تفويض جديد — {self.test_request}",
			body=f"وصلك تفويض ({'مباشر' if self.delegation_type == 'Direct' else 'غير مباشر'}) — {status_ar}.",
			document_type="Delegation",
			document_name=self.name,
		)
		log_event("إنشاء تفويض", entity=self)

	def assert_can_modify(self):
		"""B.R.235 — before field work: creator; after: principal / can_delegate only."""
		user = frappe.session.user
		is_creator = user == self.from_user
		privileged = is_principal(user) or can_delegate(user)
		if not is_creator and not privileged:
			frappe.throw(_("تعديل/إلغاء التفويض للمنشئ أو المفوّض الرئيسي (B.R.235)."))
		if field_work_started(self.test_request) and not privileged:
			frappe.throw(
				_(
					"بعد بدء الأعمال الميدانية لا يُعدَّل التفويض إلا بواسطة المفوّض الرئيسي أو من يملك صلاحية التفويض (B.R.235)."
				)
			)

	def decide(self, accept: bool):
		if self.status != STS22:
			frappe.throw(_("القرار على التفويض غير المباشر بانتظار القبول فقط (STS22)."))
		if frappe.session.user != self.to_user:
			frappe.throw(_("القبول/الرفض للمفوَّض إليه."))
		self.status = STS23 if accept else STS24
		self.decided_at = now_datetime()
		self.save(ignore_permissions=True)
		log_event("قرار تفويض", entity=self, detail="قبول" if accept else "رفض")
		notify_user(
			self.from_user,
			subject=f"{'قُبل' if accept else 'رُفض'} التفويض — {self.test_request}",
			body=f"الموظف المفوَّض {'قبل' if accept else 'رفض'} التفويض {self.name}.",
			document_type="Delegation",
			document_name=self.name,
		)

	def revoke(self):
		if self.status in (STS24, STS25):
			frappe.throw(_("التفويض منتهٍ مسبقاً."))
		if self.status not in (STS22, STS23):
			frappe.throw(_("الإلغاء لحالة بانتظار القبول أو فعّال فقط."))
		self.assert_can_modify()
		self.status = STS25
		self.decided_at = now_datetime()
		self.save(ignore_permissions=True)
		log_event("إلغاء تفويض", entity=self)
		notify_user(
			self.to_user,
			subject=f"أُلغي التفويض — {self.test_request}",
			body="فُقد الوصول للطلب/الاختبار المفوَّض فوراً (B.R.236/238).",
			document_type="Delegation",
			document_name=self.name,
		)

	def modify_assignee(self, to_user: str):
		"""B.R.235/236 — cancel current (keep record) and create a replacement."""
		self.assert_can_modify()
		if to_user == self.to_user:
			frappe.throw(_("اختر موظفاً مختلفاً."))
		old_scope = self.scope
		old_line = self.test_line
		old_request = self.test_request
		# After field work, replacement must be Direct so it is immediately active
		new_type = "Direct" if (field_work_started(old_request) or can_delegate()) else "Indirect"
		if can_delegate() or is_principal():
			new_type = "Direct"
		self.revoke()
		doc = frappe.get_doc(
			{
				"doctype": "Delegation",
				"test_request": old_request,
				"to_user": to_user,
				"from_user": frappe.session.user,
				"delegation_type": new_type,
				"scope": old_scope,
				"test_line": old_line,
				"amended_from": self.name,
			}
		)
		doc.insert()
		log_event("تعديل تفويض", entity=doc, detail=f"من {self.name}")
		return doc
