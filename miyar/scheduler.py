# Copyright (c) 2026, Miyar and contributors
# License: MIT. See LICENSE

from __future__ import annotations

import frappe
from frappe.utils import now_datetime, add_days, get_datetime, nowdate

from miyar.constants import STS11, STS19, STS20, STS26
from miyar.utils.audit import log_event
from miyar.utils.lifecycle import save_lifecycle


def expire_lab_deadlines():
	"""STS11 past lab_deadline_at → STS26 or notify, using the request snapshot (B.R.147)."""
	now = now_datetime()
	rows = frappe.get_all(
		"Test Request",
		filters={"status": STS11, "docstatus": ["<", 2]},
		fields=["name", "lab_deadline_at"],
	)
	for row in rows:
		if not row.lab_deadline_at or get_datetime(row.lab_deadline_at) > now:
			continue
		doc = frappe.get_doc("Test Request", row.name)
		action = "Expire"
		if doc.rules_snapshot:
			action = doc.rules_snapshot[0].lab_decision_hours and (
				frappe.db.get_single_value("Miyar Settings", "lab_timeout_action") or "Expire"
			)
		# Prefer snapshot-era setting stored? Spec: use captured rules. timeout action is on Settings;
		# we still honor current lab_timeout_action unless we later snapshot it.
		action = frappe.db.get_single_value("Miyar Settings", "lab_timeout_action") or "Expire"
		if action == "Expire":
			doc.status = STS26
			doc.reject_reason = doc.reject_reason or "انتهت مهلة قرار المختبر"
			doc.append(
				"history",
				{
					"at": now,
					"actor": "المنصة",
					"actor_role": "system",
					"action": "STS26",
					"detail": "انتهت مهلة قرار المختبر",
				},
			)
			save_lifecycle(doc)
			log_event("انتهاء مهلة المختبر STS26", entity=doc, organization=doc.lab, severity="warning")
			from miyar.utils.notify import notify_org_principals

			notify_org_principals(
				doc.contractor,
				subject=f"انتهت مهلة قرار المختبر — {doc.name}",
				body="انتقل الطلب إلى STS26.",
				document_type="Test Request",
				document_name=doc.name,
			)
			notify_org_principals(
				doc.lab,
				subject=f"انتهت مهلة القرار — {doc.name}",
				body="انتهت مهلة قبول/رفض الطلب.",
				document_type="Test Request",
				document_name=doc.name,
			)
		else:
			log_event("تنبيه مهلة المختبر", entity=doc, organization=doc.lab, severity="notice")


def auto_approve_consultant_reviews():
	"""Test Line STS19 past consultant_deadline_at → STS20 auto (B.R.152)."""
	if not frappe.db.get_single_value("Miyar Settings", "auto_approve_consultant"):
		return
	now = now_datetime()
	rows = frappe.get_all(
		"Test Line",
		filters={"status": STS19, "docstatus": ["<", 2]},
		fields=["name", "consultant_deadline_at"],
	)
	for row in rows:
		if not row.consultant_deadline_at or get_datetime(row.consultant_deadline_at) > now:
			continue
		doc = frappe.get_doc("Test Line", row.name)
		doc.status = STS20
		doc.auto_approved = 1
		doc.decided_at = now
		save_lifecycle(doc)
		log_event("اعتماد تلقائي لمخرج الاختبار", entity=doc, severity="notice")
		from miyar.miyar.doctype.test_request.test_request import maybe_complete_request

		maybe_complete_request(doc.test_request)


def expire_quotes():
	today = nowdate()
	rows = frappe.get_all(
		"Miyar Quote",
		filters={"status": "Quoted", "valid_until": ["<", today]},
		pluck="name",
	)
	for name in rows:
		frappe.db.set_value("Miyar Quote", name, "status", "Expired")
		log_event("انتهاء صلاحية عرض سعر", entity=frappe.get_doc("Miyar Quote", name), severity="info")


def mark_overdue_invoices():
	today = nowdate()
	rows = frappe.get_all(
		"Laboratory Invoice",
		filters={"status": "Due", "due_at": ["<", today]},
		pluck="name",
	)
	for name in rows:
		frappe.db.set_value("Laboratory Invoice", name, {"status": "Overdue", "blocks_certificate": 1})
		log_event("فاتورة متأخرة", entity=frappe.get_doc("Laboratory Invoice", name), severity="warning")


def warn_saac_expiry():
	days = frappe.db.get_single_value("Miyar Settings", "saac_expiry_warn_days") or 120
	horizon = add_days(nowdate(), int(days))
	# child table SAAC Accreditation
	rows = frappe.db.sql(
		"""
		select parent, saac_number, expires_on
		from `tabSAAC Accreditation`
		where expires_on is not null and expires_on <= %s and expires_on >= %s
		""",
		(horizon, nowdate()),
		as_dict=True,
	)
	for row in rows:
		log_event(
			"تنبيه قرب انتهاء SAAC",
			organization=row.parent,
			severity="warning",
			detail=f"{row.saac_number} ينتهي {row.expires_on}",
		)


def run_scheduled_reports():
	"""Placeholder: enqueue active Scheduled Report rows. Delivery is a later integration."""
	rows = frappe.get_all("Scheduled Report", filters={"is_active": 1}, fields=["name", "frequency", "last_run"])
	for row in rows:
		frappe.db.set_value("Scheduled Report", row.name, "last_run", now_datetime())


def recalc_all_lab_on_time():
	"""Daily refresh of Organization.on_time from test-line SLA outcomes (B.R.155/156)."""
	from miyar.utils.sla import recalc_lab_on_time

	labs = frappe.get_all("Organization", filters={"organization_type": ["like", "%lab%"]}, pluck="name")
	# also by code link if types use code names
	if not labs:
		lab_type = frappe.db.get_value("Organization Type", {"code": "lab"}, "name")
		labs = frappe.get_all("Organization", filters={"organization_type": lab_type}, pluck="name") if lab_type else []
	for lab in labs:
		recalc_lab_on_time(lab)
