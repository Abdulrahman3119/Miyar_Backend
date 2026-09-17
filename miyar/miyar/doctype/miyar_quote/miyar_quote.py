# Copyright (c) 2026, Miyar and contributors
# License: MIT. See LICENSE

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import add_days, now_datetime, nowdate, getdate

from miyar.constants import STS01, STS03
from miyar.utils.audit import log_event
from miyar.utils.org import get_user_org, require_principal, is_party_or_admin


class MiyarQuote(Document):
	def validate(self):
		if not self.items:
			frappe.throw(_("أضف بنداً واحداً على الأقل."))

	def on_submit(self):
		if self.status == "Pending":
			pass

	def respond(self, items: list | None = None, lab_notes: str | None = None):
		"""Lab principal replies with final prices. B.R.116 / B.R.119."""
		require_principal(_("رد عرض السعر للمفوّض الرئيسي للمختبر."))
		if not is_party_or_admin(self.lab):
			frappe.throw(_("هذا العرض ليس لمختبرك."))
		incomplete = frappe.db.exists("Lab Catalog Item", {"lab": self.lab, "status": STS03})
		if incomplete:
			frappe.throw(_("لا يمكن الرد وفي القائمة بنود بيانات ناقصة (STS03)."))
		if items:
			by_test = {row.reference_test: row for row in self.items}
			for incoming in items:
				row = by_test.get(incoming.get("reference_test"))
				if not row:
					continue
				# base_price stays as catalog snapshot — never written from the reply
				if incoming.get("price") is not None:
					row.price = incoming["price"]
				if incoming.get("sla_days") is not None:
					row.sla_days = incoming["sla_days"]
		self.lab_notes = lab_notes or self.lab_notes
		self.quoted_at = now_datetime()
		days = frappe.db.get_single_value("Miyar Settings", "quote_validity_days") or 14
		self.valid_until = add_days(nowdate(), int(days))
		self.status = "Quoted"
		self.save(ignore_permissions=True)
		log_event("رد على عرض سعر", entity=self, organization=self.lab)

	def accept(self, otp_verified: int = 0):
		require_principal(_("قبول العرض للمفوّض الرئيسي للمقاول."))
		if not is_party_or_admin(self.contractor):
			frappe.throw(_("هذا العرض ليس لمقاولك."))
		if self.status != "Quoted":
			frappe.throw(_("لا يُقبل إلا عرض تم الرد عليه."))
		if self.valid_until and getdate(self.valid_until) < getdate(nowdate()):
			self.status = "Expired"
			self.save(ignore_permissions=True)
			frappe.throw(_("انتهت صلاحية العرض."))
		if not otp_verified:
			frappe.throw(_("قبول العرض يتطلب تحقق OTP."))
		self.otp_verified = 1
		self.status = "Accepted"
		self.decided_at = now_datetime()
		contract = self._create_contract()
		self.service_contract = contract.name
		self.save(ignore_permissions=True)
		if self.docstatus == 0:
			self.submit()
		log_event("قبول عرض سعر", entity=self, organization=self.contractor)
		return contract.name

	def reject(self, reason: str):
		if not reason:
			frappe.throw(_("سبب الرفض إلزامي."))
		self.reject_reason = reason
		self.status = "Rejected"
		self.decided_at = now_datetime()
		self.save(ignore_permissions=True)
		log_event("رفض عرض سعر", entity=self, organization=get_user_org())

	def _create_contract(self):
		doc = frappe.get_doc(
			{
				"doctype": "Service Contract",
				"contractor": self.contractor,
				"lab": self.lab,
				"consultant": self.consultant,
				"project_name": self.project_name,
				"city": self.city,
				"payment_term": self.payment_term,
				"quote": self.name,
				"started_on": nowdate(),
				"is_active": 1,
			}
		)
		for row in self.services:
			doc.append("services", {"service_type": row.service_type})
		for row in self.items:
			doc.append(
				"items",
				{
					"reference_test": row.reference_test,
					"test_method": row.test_method,
					"uom": row.uom,
					"price": row.price,
					"sla_days": row.sla_days,
				},
			)
		doc.insert(ignore_permissions=True)
		doc.submit()
		frappe.get_doc(
			{
				"doctype": "Platform Document",
				"title": f"عقد {doc.name}",
				"document_type": "contract" if frappe.db.exists("Document Type", "contract") else None,
				"service_contract": doc.name,
				"issued_at": now_datetime(),
			}
		).insert(ignore_permissions=True)
		return doc
