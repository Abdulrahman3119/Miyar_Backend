# Copyright (c) 2026, Miyar and contributors
# License: MIT. See LICENSE

"""Delegation STS / B.R.232–239 edge-case checks.

Run:
  bench --site <site> execute miyar.tests.delegation_matrix.run
"""

from __future__ import annotations

import frappe

from miyar.constants import STS22, STS23, STS24, STS25
from miyar.utils.notify import field_work_started
from miyar.utils.org import has_active_delegation


def _ok(name: str, cond: bool, detail: str = "") -> bool:
	status = "PASS" if cond else "FAIL"
	print(f"[{status}] {name}" + (f" — {detail}" if detail else ""))
	return cond


def run():
	failed = 0

	# Status vocabulary (B.R.239 + STS25 cancel)
	for code in (STS22, STS23, STS24, STS25):
		if not _ok(f"status code {code}", bool(code)):
			failed += 1

	# field_work_started helper exists and is callable
	if not _ok("field_work_started callable", callable(field_work_started)):
		failed += 1

	# has_active_delegation: pending must NOT grant
	pending = frappe.get_all(
		"Delegation",
		filters={"status": STS22},
		fields=["name", "to_user", "test_request"],
		limit=1,
	)
	if pending:
		row = pending[0]
		granted = has_active_delegation(row.to_user, row.test_request)
		if not _ok("STS22 does not grant access (B.R.238)", not granted, row.name):
			failed += 1
	else:
		_ok("STS22 sample (skip)", True, "no pending rows")

	# Active grants
	active = frappe.get_all(
		"Delegation",
		filters={"status": STS23},
		fields=["name", "to_user", "test_request"],
		limit=1,
	)
	if active:
		row = active[0]
		granted = has_active_delegation(row.to_user, row.test_request)
		if not _ok("STS23 grants access (B.R.238)", granted, row.name):
			failed += 1
	else:
		_ok("STS23 sample (skip)", True, "no active rows")

	# Rejected / cancelled must not grant
	for st, label in ((STS24, "rejected"), (STS25, "cancelled")):
		rows = frappe.get_all(
			"Delegation",
			filters={"status": st},
			fields=["to_user", "test_request", "name"],
			limit=3,
		)
		bad = [r.name for r in rows if has_active_delegation(r.to_user, r.test_request)]
		# Only fail if the SAME user has no other STS23 — filter carefully
		still_bad = []
		for r in rows:
			# if user also has STS23 on same request, skip
			if frappe.db.exists(
				"Delegation",
				{"to_user": r.to_user, "test_request": r.test_request, "status": STS23},
			):
				continue
			if has_active_delegation(r.to_user, r.test_request):
				still_bad.append(r.name)
		if not _ok(f"{label} does not grant (B.R.238)", not still_bad, str(still_bad)):
			failed += 1

	# Cross-org guard is in Document.validate — smoke: method exists
	from miyar.miyar.doctype.delegation.delegation import Delegation

	if not _ok("Delegation.modify_assignee", hasattr(Delegation, "modify_assignee")):
		failed += 1
	if not _ok("Delegation.assert_can_modify", hasattr(Delegation, "assert_can_modify")):
		failed += 1

	print(f"\nFailed: {failed}")
	return {"failed": failed}
