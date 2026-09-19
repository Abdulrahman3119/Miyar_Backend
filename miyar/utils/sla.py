# Copyright (c) 2026, Miyar and contributors
# License: MIT. See LICENSE

"""SLA / on-time KPIs (B.R.155 / B.R.156)."""

from __future__ import annotations

import frappe
from frappe.utils import get_datetime


def recalc_lab_on_time(lab: str | None):
	"""Recompute Organization.on_time from completed/submitted test lines for this lab."""
	if not lab:
		return
	rows = frappe.db.sql(
		"""
		select tl.submitted_at, tl.execution_deadline_at, ifnull(tl.delay_hours, 0) as delay_hours
		from `tabTest Line` tl
		inner join `tabTest Request` tr on tr.name = tl.test_request
		where tr.lab = %s
		  and tl.status in ('STS19', 'STS20', 'STS21')
		  and tl.submitted_at is not null
		""",
		lab,
		as_dict=True,
	)
	if not rows:
		return
	ok = 0
	for row in rows:
		late_start = float(row.delay_hours or 0) > 0
		late_exec = False
		if row.execution_deadline_at:
			late_exec = get_datetime(row.submitted_at) > get_datetime(row.execution_deadline_at)
		if not late_start and not late_exec:
			ok += 1
	pct = round(100.0 * ok / len(rows), 1)
	frappe.db.set_value("Organization", lab, "on_time", pct)


def record_execution_outcome(test_line) -> bool:
	"""Return True if the line was on-time; update lab KPI. Call after submit_output."""
	lab = frappe.db.get_value("Test Request", test_line.test_request, "lab")
	on_time = True
	if float(getattr(test_line, "delay_hours", 0) or 0) > 0:
		on_time = False
	if test_line.execution_deadline_at and test_line.submitted_at:
		if get_datetime(test_line.submitted_at) > get_datetime(test_line.execution_deadline_at):
			on_time = False
	recalc_lab_on_time(lab)
	return on_time
