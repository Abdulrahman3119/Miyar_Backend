# Copyright (c) 2026, Miyar and contributors
# License: MIT. See LICENSE

from __future__ import annotations

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.model.naming import make_autoname
from frappe.utils import add_to_date, now_datetime, time_diff_in_hours, get_datetime

from miyar.constants import STS09, STS10, STS11, STS12, STS13, STS14, STS15, STS16, STS17, STS26
from miyar.utils.audit import log_event
from miyar.utils.lifecycle import save_lifecycle
from miyar.utils.org import get_user_org, require_principal, is_party_or_admin


class TestRequest(Document):
	def before_insert(self):
		self.status = self.status or STS09
		self.naming_series = self.naming_series or "TST-DRAFT-."
		self.pull_contract()

	def validate(self):
		self.pull_contract()
		settings = frappe.get_single("Miyar Settings")
		max_tests = int((self.rules_snapshot[0].max_tests_per_request if self.rules_snapshot else None) or settings.max_tests_per_request or 10)
		n_lines = frappe.db.count("Test Line", {"test_request": self.name}) if self.name else 0
		if n_lines > max_tests:
			frappe.throw(_("تجاوز الحد الأقصى للاختبارات في الطلب ({0}).").format(max_tests))
		if self.service_type == "geotech" or _is_geotech(self.service_type):
			self.category = None

	def pull_contract(self):
		if not self.service_contract:
			return
		c = frappe.db.get_value(
			"Service Contract",
			self.service_contract,
			["contractor", "lab", "consultant", "project_name", "city", "is_active"],
			as_dict=True,
		)
		if not c:
			return
		self.contractor = c.contractor
		self.lab = c.lab
		self.consultant = c.consultant
		if not self.project_name:
			self.project_name = c.project_name
		if not self.city:
			self.city = c.city

	def capture_snapshot(self):
		s = frappe.get_single("Miyar Settings")
		self.rules_snapshot = []
		self.append(
			"rules_snapshot",
			{
				"lab_decision_hours": s.lab_decision_hours,
				"consultant_decision_hours": s.consultant_decision_hours,
				"vat_rate": s.vat_rate,
				"min_lead_hours": s.min_lead_hours,
				"geofence_meters": s.geofence_meters,
				"max_tests_per_request": s.max_tests_per_request,
				"proposed_slots": s.proposed_slots,
			},
		)

	def submit_request(self):
		"""B.R.145 — send from STS09 only."""
		if self.status != STS09:
			frappe.throw(_("الإرسال من المسودة فقط."))
		contract = frappe.get_doc("Service Contract", self.service_contract)
		if not contract.is_active:
			frappe.throw(_("العقد غير فعّال (B.R.132)."))
		self.capture_snapshot()
		self.submitted_at = now_datetime()
		hours = int(self.rules_snapshot[0].lab_decision_hours)
		geotech = _is_geotech(self.service_type)
		if geotech:
			self.status = STS10
			self.ensure_geotech_line()
		else:
			self.status = STS11
			self.lab_deadline_at = add_to_date(self.submitted_at, hours=hours)
		self.naming_series = "TST-.YYYY.-."
		self._append_history("إرسال", "أرسل المقاول الطلب")
		old = self.name
		save_lifecycle(self)
		if self.docstatus == 0:
			self.submit()
		# B.R.163/164 replace draft number
		if old and old.startswith("TST-DRAFT"):
			new_name = make_autoname("TST-.YYYY.-.###")
			from frappe.model.rename_doc import rename_doc

			rename_doc("Test Request", old, new_name, force=True, ignore_permissions=True)
			self = frappe.get_doc("Test Request", new_name)
		log_event("إرسال طلب اختبار", entity=self, organization=self.contractor)
		return self.name

	def ensure_geotech_line(self):
		if frappe.db.exists("Test Line", {"test_request": self.name, "reference_test": "RT-GEOTECH"}):
			return
		if not frappe.db.exists("Reference Test", "RT-GEOTECH"):
			return
		line = frappe.get_doc(
			{
				"doctype": "Test Line",
				"test_request": self.name,
				"reference_test": "RT-GEOTECH",
				"test_method": "SBC 303" if frappe.db.exists("Test Method", "SBC 303") else None,
				"status": STS17,
			}
		)
		# method is required — pick first available on the reference test
		if not line.test_method:
			m = frappe.db.get_value("Reference Test Method", {"parent": "RT-GEOTECH"}, "test_method")
			line.test_method = m
		line.insert(ignore_permissions=True)
		if not self.study:
			study = frappe.get_doc({"doctype": "Geotechnical Study", "test_request": self.name, "phase": 1})
			study.insert(ignore_permissions=True)
			self.db_set("study", study.name)

	def cancel_request(self, reason: str | None = None):
		# B.R.142 — only before STS12
		if self.status not in (STS09, STS10, STS11):
			frappe.throw(_("الإلغاء قبل قبول المختبر فقط."))
		self.status = STS16
		self.reject_reason = reason
		self._append_history("إلغاء", reason or "")
		save_lifecycle(self)
		if self.docstatus == 1:
			self.cancel()
		log_event("إلغاء طلب", entity=self, organization=self.contractor)

	def lab_decide(self, accept: bool, slot: dict | None = None, reason: str | None = None):
		require_principal(_("قرار القبول/الرفض للمفوّض الرئيسي للمختبر."))
		if not is_party_or_admin(self.lab):
			frappe.throw(_("ليس مختبر هذا الطلب."))
		if self.status != STS11:
			frappe.throw(_("القرار متاح في STS11 فقط."))
		if accept:
			if not slot or not slot.get("slot_date"):
				frappe.throw(_("قبول المختبر يتطلب اختيار موعد."))
			from miyar.utils.timefmt import to_frappe_time

			self.chosen_slot_date = slot.get("slot_date")
			self.chosen_slot_from = to_frappe_time(slot.get("from_time"))
			self.chosen_slot_to = to_frappe_time(slot.get("to_time"))
			self.status = STS12
			self._start_lines()
			self._maybe_draft_invoice()
			self._append_history("قبول المختبر", "")
		else:
			if not reason:
				frappe.throw(_("سبب الرفض إلزامي."))
			self.reject_reason = reason
			self.status = STS13
			self._append_history("رفض المختبر", reason)
		save_lifecycle(self)
		log_event("قرار المختبر على الطلب", entity=self, organization=self.lab)
		from miyar.utils.notify import notify_org_principals

		notify_org_principals(
			self.contractor,
			subject=f"{'قُبل' if accept else 'رُفض'} الطلب — {self.name}",
			body=reason or ("اختار المختبر موعداً للتنفيذ." if accept else "رُفض الطلب."),
			document_type="Test Request",
			document_name=self.name,
		)
		notify_org_principals(
			self.consultant,
			subject=f"تحديث طلب — {self.name}",
			body=f"قرار المختبر: {'قبول' if accept else 'رفض'}.",
			document_type="Test Request",
			document_name=self.name,
		)

	def _start_lines(self):
		for name in frappe.get_all("Test Line", filters={"test_request": self.name}, pluck="name"):
			frappe.db.set_value("Test Line", name, "status", STS17)

	def _maybe_draft_invoice(self):
		term = frappe.db.get_value("Service Contract", self.service_contract, "payment_term")
		if term == "advance":
			return
		if frappe.db.exists("Laboratory Invoice", {"test_request": self.name}):
			return
		inv = frappe.get_doc(
			{
				"doctype": "Laboratory Invoice",
				"service_contract": self.service_contract,
				"test_request": self.name,
				"seller_lab": self.lab,
				"buyer_contractor": self.contractor,
				"status": "Draft",
				"vat_rate": self.rules_snapshot[0].vat_rate if self.rules_snapshot else 15,
			}
		)
		for line in frappe.get_all("Test Line", filters={"test_request": self.name}, fields=["reference_test", "price"]):
			inv.append(
				"items",
				{
					"description": line.reference_test,
					"reference_test": line.reference_test,
					"qty": 1,
					"rate": line.price,
					"amount": line.price,
				},
			)
		inv.amount = sum((r.amount or 0) for r in inv.items)
		inv.vat_amount = (inv.amount or 0) * (inv.vat_rate or 0) / 100
		inv.grand_total = (inv.amount or 0) + (inv.vat_amount or 0)
		inv.insert(ignore_permissions=True)

	def _append_history(self, action, detail):
		user = frappe.session.user
		from miyar.api.payload import frontend_role
		from miyar import ui

		role_code = frontend_role()
		role_label = next((row["ar"] for row in ui.ROLE_LABELS if row["code"] == role_code), role_code)
		self.append(
			"history",
			{
				"at": now_datetime(),
				"actor": frappe.db.get_value("User", user, "full_name") or user,
				"actor_role": (role_label or "")[:140],
				"action": action,
				"detail": detail,
			},
		)


def _is_geotech(service_type: str | None) -> bool:
	if not service_type:
		return False
	if service_type == "geotech":
		return True
	return frappe.db.get_value("Service Type", service_type, "code") == "geotech"


def maybe_complete_request(test_request: str):
	lines = frappe.get_all("Test Line", filters={"test_request": test_request}, fields=["status"])
	if not lines:
		return
	if all(l.status in ("STS20", "STS21") for l in lines):
		doc = frappe.get_doc("Test Request", test_request)
		doc.status = STS15
		save_lifecycle(doc)
		inv = frappe.db.get_value("Laboratory Invoice", {"test_request": test_request, "status": "Draft"}, "name")
		if inv:
			due_days = frappe.db.get_single_value("Miyar Settings", "invoice_due_days") or 30
			from frappe.utils import add_days, nowdate

			frappe.db.set_value(
				"Laboratory Invoice",
				inv,
				{"status": "Due", "due_at": add_days(nowdate(), int(due_days)), "issued_at": now_datetime()},
			)
		log_event("اكتمال طلب اختبار", entity=doc, organization=doc.contractor)
