# Copyright (c) 2026, Miyar and contributors
# License: MIT. See LICENSE

from __future__ import annotations

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import add_days, now_datetime, time_diff_in_hours, get_datetime

from miyar.constants import STS12, STS14, STS17, STS18, STS19, STS20, STS21
from miyar.setup.custom_fields import asset_is_usable
from miyar.utils.audit import log_event
from miyar.utils.lifecycle import save_lifecycle
from miyar.utils.org import get_user_org, require_principal
from miyar.miyar.doctype.test_request.test_request import maybe_complete_request


class TestLine(Document):
	def validate(self):
		if self.spt_n_changed():
			pass
		self._validate_equipment()

	def spt_n_changed(self):
		return False

	def _validate_equipment(self):
		for row in self.equipment_used or []:
			if row.asset and not asset_is_usable(row.asset):
				frappe.throw(_("المعدة {0} معايرتها منتهية أو خارج الخدمة.").format(row.asset))

	def start_execution(self, sample: dict | None = None):
		req = frappe.get_doc("Test Request", self.test_request)
		if req.status not in (STS12, STS14):
			frappe.throw(_("لا يبدأ التنفيذ قبل قبول الطلب."))
		# B.R.149 — cannot start before chosen slot begins
		if req.chosen_slot_date and req.chosen_slot_from:
			start = get_datetime(f"{req.chosen_slot_date} {req.chosen_slot_from}")
			if now_datetime() < start:
				frappe.throw(_("لا يبدأ التنفيذ قبل بداية الموعد المعتمد."))
			end = get_datetime(f"{req.chosen_slot_date} {req.chosen_slot_to}") if req.chosen_slot_to else start
			if now_datetime() > end:
				self.delay_hours = int(time_diff_in_hours(now_datetime(), end) or 0)
		self.status = STS18
		self.started_at = now_datetime()
		if sample:
			self.sample_id = sample.get("sample_id") or self.sample_id
			self.sample_depth = sample.get("sample_depth") or self.sample_depth
			self.geo_distance_m = sample.get("geo_distance_m")
			fence = 3
			if req.rules_snapshot:
				fence = req.rules_snapshot[0].geofence_meters or 3
			self.geo_verified = 1 if (self.geo_distance_m or 0) <= fence else 0
		self._seed_result_fields()
		save_lifecycle(self)
		if req.status == STS12:
			req.status = STS14
			save_lifecycle(req)
		log_event("بدء تنفيذ اختبار", entity=self, organization=req.lab)

	def confirm_sample(self, confirmed: bool = True):
		if not confirmed:
			self.status = STS17
			self.sample_id = None
			self.contractor_confirmed = 0
			save_lifecycle(self)
			return
		self.contractor_confirmed = 1
		self.contractor_confirmed_at = now_datetime()
		if self.sla_days:
			self.execution_deadline_at = add_days(self.contractor_confirmed_at, int(self.sla_days))
		save_lifecycle(self)
		log_event("تأكيد عينة", entity=self)

	def submit_output(self):
		# B.R.151/198
		if self.status != STS18:
			frappe.throw(_("الرفع من STS18 فقط."))
		if not self.contractor_confirmed:
			frappe.throw(_("لا يُرفع المخرج قبل تأكيد المقاول للعينة."))
		if not self.report_file:
			frappe.throw(_("تقرير PDF إلزامي قبل الرفع."))
		if not any((r.value for r in (self.result_values or []))):
			if not frappe.db.get_value("Reference Test", self.reference_test, "is_geotech"):
				frappe.throw(_("أدخل نتيجة واحدة على الأقل."))
		self.status = STS19
		self.submitted_at = now_datetime()
		hours = 48
		req = frappe.get_doc("Test Request", self.test_request)
		if req.rules_snapshot:
			hours = req.rules_snapshot[0].consultant_decision_hours or 48
		self.consultant_deadline_at = add_to_date_hours(self.submitted_at, hours)
		self._fill_limits()
		save_lifecycle(self)
		log_event("رفع مخرج اختبار", entity=self, organization=req.lab)

	def review(self, approve: bool, reason: str | None = None):
		require_principal(_("اعتماد المخرج للمفوّض الرئيسي للاستشاري."))
		if self.status != STS19:
			frappe.throw(_("المراجعة في STS19 فقط."))
		if approve:
			self.status = STS20
		else:
			if not reason:
				frappe.throw(_("سبب الرفض إلزامي."))
			self.status = STS21
			self.reject_reason = reason
		self.decided_at = now_datetime()
		save_lifecycle(self)
		maybe_complete_request(self.test_request)
		log_event("قرار الاستشاري على المخرج", entity=self)

	def _seed_result_fields(self):
		if self.result_values:
			return
		fields = frappe.get_all(
			"Reference Test Result Field",
			filters={"parent": self.reference_test},
			fields=["field_key", "label_ar", "uom", "sort_order"],
			order_by="sort_order",
		)
		for row in fields:
			self.append(
				"result_values",
				{"field_key": row.field_key, "label_ar": row.label_ar, "uom": row.uom},
			)

	def _fill_limits(self):
		for row in self.result_values or []:
			limit = frappe.db.get_value(
				"Acceptance Limit",
				{"reference_test": self.reference_test, "field_key": row.field_key},
				"rule_text",
			)
			row.limit_text = limit


def add_to_date_hours(dt, hours):
	from frappe.utils import add_to_date

	return add_to_date(dt, hours=int(hours))
