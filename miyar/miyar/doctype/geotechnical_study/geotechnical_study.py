# Copyright (c) 2026, Miyar and contributors
# License: MIT. See LICENSE

from __future__ import annotations

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import now_datetime, flt

from miyar.constants import STS11, STS15, STS20
from miyar.utils.audit import log_event
from miyar.utils.org import require_principal
from miyar.utils.sbc import compute_plan


class GeotechnicalStudy(Document):
	def validate(self):
		self.phase = int(self.phase or 1)
		if self.plan_approved:
			# freeze knowledge version
			if not self.knowledge_version:
				current = frappe.db.get_value("Knowledge Version", {"status": "ساري"}, "name")
				self.knowledge_version = current
		self._protect_system_analysis_fields()

	def _protect_system_analysis_fields(self):
		"""B.R.218 — block Desk/API edits that alter system/engine analysis outputs."""
		if self.is_new() or getattr(frappe.flags, "miyar_allow_system_analysis", False):
			return
		before = self.get_doc_before_save()
		if not before:
			return
		prev_c = {r.field_key: r for r in (before.computed_fields or [])}
		for row in self.computed_fields or []:
			old = prev_c.get(row.field_key)
			if old and old.formula and row.formula and str(old.formula) != str(row.formula):
				frappe.throw(_("لا يُعدَّل الصيغة الحسابية الناتجة عن النظام (B.R.218)."))
		for fieldname in ("analytical_fields", "recommendations"):
			prev = {(r.label_ar or r.field_key): r for r in (before.get(fieldname) or [])}
			for row in self.get(fieldname) or []:
				key = row.label_ar or row.field_key
				old = prev.get(key)
				if not old:
					continue
				src = (old.source or "").lower()
				if src in ("engine", "knowledge") and str(old.value or "") != str(row.value or ""):
					frappe.throw(_("لا يُعدَّل الحقل «{0}» الناتج عن النظام/المحرك (B.R.218).").format(key))

	def run_plan_engine(self):
		# B.R.175 — no engine after plan_approved
		if self.plan_approved:
			frappe.throw(_("لا إعادة تشغيل للمحرك بعد اعتماد الخطة."))
		result = compute_plan(self.floors or 0, self.built_area or 0, self.foundation_depth or 0)
		self.table_21_row = result["table_21_row"]
		self.engine_count = result["engine_count"]
		self.engine_depth = result["engine_depth"]
		self.engine_special = result["engine_special"]
		self.engine_ref = result["engine_ref"]
		self.engine_basis = []
		self.append("engine_basis", {"line": result["engine_ref"]})
		self.phase = max(int(self.phase or 1), 2)
		self.save(ignore_permissions=True)
		return result

	def approve_prelim(self):
		require_principal(_("اعتماد البيانات الأولية للمفوّض الاستشاري."))
		if not self.deed_file:
			frappe.throw(_("القرار المساحي إلزامي."))
		if not self.owner_name or not self.building_type or not self.foundation_depth:
			frappe.throw(_("أكمل بيانات المالك والمشروع وعمق التأسيس."))
		self.prelim_approved = 1
		self.phase = max(int(self.phase or 1), 2)
		self.save(ignore_permissions=True)
		log_event("اعتماد البيانات الأولية", entity=self)

	def approve_plan(self, justification: str | None = None):
		require_principal(_("اعتماد خطة الاستكشاف للمفوّض الاستشاري."))
		count = frappe.db.count("Borehole", {"study": self.name})
		if count < 1:
			frappe.throw(_("جسة واحدة على الأقل مطلوبة."))
		if self.engine_count and count != int(self.engine_count) and not justification:
			frappe.throw(_("مبرر الانحراف عن مقترح المحرك إلزامي (B.R.174)."))
		self.plan_justification = justification or self.plan_justification
		self.plan_approved = 1
		self.plan_approved_at = now_datetime()
		if not self.knowledge_version:
			self.knowledge_version = frappe.db.get_value("Knowledge Version", {"status": "ساري"}, "name")
		self.phase = 3
		self.save(ignore_permissions=True)
		req = frappe.get_doc("Test Request", self.test_request)
		if req.status == "STS10":
			hours = req.rules_snapshot[0].lab_decision_hours if req.rules_snapshot else 12
			from frappe.utils import add_to_date
			from miyar.utils.lifecycle import save_lifecycle

			req.status = STS11
			req.lab_deadline_at = add_to_date(now_datetime(), hours=int(hours))
			save_lifecycle(req)
		log_event("اعتماد خطة الاستكشاف", entity=self)

	def approve_field_plan(self, reason: str | None = None, ack: int = 0):
		moved = frappe.db.count("Borehole", {"study": self.name, "moved_m": [">", 0]})
		added = frappe.db.count("Borehole", {"study": self.name, "added_by_lab": 1})
		if (moved or added) and not (reason and ack):
			frappe.throw(_("النقل أو الإضافة يتطلب مبرراً وإقرار التنسيق مع الاستشاري."))
		self.field_plan_reason = reason
		self.field_plan_ack = ack
		self.field_plan_reviewed = 1
		self.compliance_pct = self._compliance()
		self.save(ignore_permissions=True)

	def _compliance(self) -> float:
		move_p = frappe.db.get_single_value("Miyar Settings", "compliance_move_penalty_pct") or 2
		add_p = frappe.db.get_single_value("Miyar Settings", "compliance_added_bh_penalty_pct") or 4
		moved = sum(flt(r.moved_m) for r in frappe.get_all("Borehole", filters={"study": self.name}, fields=["moved_m"]))
		added = frappe.db.count("Borehole", {"study": self.name, "added_by_lab": 1})
		return max(0, 100 - moved * flt(move_p) - added * flt(add_p))

	def approve_field(self):
		# B.R.192 all boreholes Done
		pending = frappe.db.count("Borehole", {"study": self.name, "status": ["!=", "Done"]})
		if pending:
			frappe.throw(_("لا تُغلق الأعمال الميدانية قبل اكتمال كل الجسات."))
		self.field_approved = 1
		self.phase = 4
		self.save(ignore_permissions=True)

	def approve_lab_data(self, partial_reason: str | None = None):
		if not self.chemical_sample and not partial_reason:
			frappe.throw(_("عينة كيميائية واحدة على الأقل، أو سبب إكمال جزئي."))
		self.chemical_partial_reason = partial_reason
		self.chemical_done = 1
		self.phase = 5
		self.save(ignore_permissions=True)

	def complete_analysis(self):
		if self.computed_fields and any(not r.value for r in self.computed_fields):
			frappe.throw(_("كل الحقول الحسابية يجب أن تكون لها قيمة."))
		self.analysis_done = 1
		self.phase = 6
		self.save(ignore_permissions=True)

	def approve_report(self, approve: bool = True, reason: str | None = None):
		require_principal(_("اعتماد تقرير الدراسة للمفوّض الاستشاري."))
		if not approve:
			self.report_reject_reason = reason
			self.phase = 5
			self.report_approved = 0
			self.save(ignore_permissions=True)
			return
		if not (self.prelim_approved and self.plan_approved and self.field_approved and self.analysis_done):
			frappe.throw(_("لا اعتماد دون اكتمال مراحل الدراسة."))
		self.report_approved = 1
		self.report_approved_at = now_datetime()
		self.phase = 6
		self.save(ignore_permissions=True)
		# B.R.223 — auto-generate report from active template after consultant approval
		try:
			from miyar.utils.documents import generate_study_report

			generate_study_report(self.name)
		except Exception:
			frappe.log_error(title="Miyar generate_study_report failed")
		req = frappe.get_doc("Test Request", self.test_request)
		from miyar.utils.lifecycle import save_lifecycle
		from miyar.utils.notify import notify_org_principals

		req.status = STS15
		save_lifecycle(req)
		for name in frappe.get_all("Test Line", filters={"test_request": req.name}, pluck="name"):
			frappe.db.set_value("Test Line", name, "status", STS20)
		log_event("اعتماد تقرير جيوتقني", entity=self, organization=req.consultant, severity="notice")
		notify_org_principals(
			req.contractor,
			subject=f"تقرير الدراسة جاهز — {req.name}",
			body="اعتُمد التقرير الجيوتقني ووُلِّد الملف الرسمي.",
			document_type="Geotechnical Study",
			document_name=self.name,
		)
		notify_org_principals(
			req.lab,
			subject=f"اعتماد تقرير — {req.name}",
			body="اعتُمد تقرير الدراسة الجيوتقنية.",
			document_type="Geotechnical Study",
			document_name=self.name,
		)
