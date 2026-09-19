# Copyright (c) 2026, Miyar and contributors
# License: MIT. See LICENSE

"""Critical capability checks for Miyar gap-closure Phase A.

Run:
  bench --site <site> execute miyar.tests.permission_matrix.run
"""

from __future__ import annotations

import frappe

from miyar.api.common import has_capability, user_capabilities
from miyar.ui import PERMISSION_MATRIX, permissions_for


def _ok(name: str, cond: bool, detail: str = ""):
	status = "PASS" if cond else "FAIL"
	print(f"[{status}] {name}" + (f" — {detail}" if detail else ""))
	return cond


def run():
	"""Non-destructive checks on matrix integrity + identity helpers."""
	failed = 0

	# Matrix integrity
	for key, caps in PERMISSION_MATRIX.items():
		if not _ok(f"matrix key {key}", isinstance(caps, tuple) and len(caps) >= 0):
			failed += 1
		if key.startswith("supervisor:") and "engine.run" in caps:
			failed += 0 if _ok(f"supervisor no engine.run ({key})", False, "still has engine.run") else 1
		elif key.startswith("supervisor:"):
			_ok(f"supervisor no engine.run ({key})", True)

	# Supervisor must not have write-ish caps
	writeish = {
		"request.create",
		"request.cancel",
		"request.decide",
		"test.execute",
		"output.approve",
		"catalog.manage",
		"study.field",
		"study.prelim",
		"delegation.create",
		"admin.settings",
		"rating.create",
	}
	sup = set(permissions_for("supervisor", "principal"))
	overlap = writeish.intersection(sup)
	if not _ok("supervisor read-only vs writeish", not overlap, f"overlap={sorted(overlap)}"):
		failed += 1

	# Admin has engine + admin.settings
	admin = set(permissions_for("admin", "principal"))
	if not _ok("admin has engine.run", "engine.run" in admin):
		failed += 1
	if not _ok("admin has admin.settings", "admin.settings" in admin):
		failed += 1

	# Lab employee cannot decide request (principal can)
	lab_e = set(permissions_for("lab", "employee"))
	lab_p = set(permissions_for("lab", "principal"))
	if not _ok("lab employee no request.decide", "request.decide" not in lab_e):
		failed += 1
	if not _ok("lab principal has request.decide", "request.decide" in lab_p):
		failed += 1

	# Consultant employee cannot approve output
	c_e = set(permissions_for("consultant", "employee"))
	c_p = set(permissions_for("consultant", "principal"))
	if not _ok("consultant employee no output.approve", "output.approve" not in c_e):
		failed += 1
	if not _ok("consultant principal has output.approve", "output.approve" in c_p):
		failed += 1

	# Live user capabilities (Administrator typically maps to admin)
	user = frappe.session.user
	caps = user_capabilities(user)
	_ok(f"user_capabilities({user})", isinstance(caps, list), f"n={len(caps)}")
	_ok("has_capability helper", has_capability("directory.view") or has_capability("admin.settings"))

	print("---")
	print(f"Failed: {failed}")
	if failed:
		frappe.throw(f"Permission matrix checks failed: {failed}")
	return {"ok": True, "failed": failed}
