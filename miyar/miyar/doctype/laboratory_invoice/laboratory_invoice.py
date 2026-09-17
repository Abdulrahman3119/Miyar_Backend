# Copyright (c) 2026, Miyar and contributors
# License: MIT. See LICENSE

import frappe
from frappe.model.document import Document
from frappe.utils import now_datetime, nowdate

from miyar.utils.audit import log_event


class LaboratoryInvoice(Document):
	def validate(self):
		self.amount = sum((row.amount or 0) for row in (self.items or []))
		rate = self.vat_rate or 0
		self.vat_amount = (self.amount or 0) * rate / 100
		self.grand_total = (self.amount or 0) + (self.vat_amount or 0)
		self.blocks_certificate = 1 if self.status == "Overdue" else 0

	def mark_paid(self, channel: str | None = None):
		self.status = "Paid"
		self.paid_at = now_datetime()
		self.blocks_certificate = 0
		if channel:
			self.payment_channel = channel
		self.save(ignore_permissions=True)
		log_event("سداد فاتورة مختبر", entity=self, organization=self.buyer_contractor)
