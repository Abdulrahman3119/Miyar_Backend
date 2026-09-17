# Copyright (c) 2026, Miyar and contributors
# License: MIT. See LICENSE

import frappe
from frappe import _


no_cache = 1


def get_context(context):
	"""Serve the React SPA shell for /miyar with an optional server-side boot payload.

	When the visitor already has a Frappe Desk cookie, auth + boot are embedded in the
	page so the SPA logs in without a second API round-trip.
	"""
	context.no_header = True
	context.no_cache = True
	context.title = _("معيار")
	context.brand_title = _("المنصة الوطنية لاختبارات التربة والطرق")

	from miyar.api.auth import build_desk_auth

	auth = build_desk_auth()
	context.csrf_token = auth.get("csrf_token") or ""
	context.miyar_user = (auth.get("session") or {}).get("id") if auth.get("ok") else ""
	context.miyar_logged_in = 1 if auth.get("ok") else 0
	context.miyar_auth = auth

	boot = None
	if auth.get("ok"):
		try:
			from miyar.api.session import get_boot

			boot = get_boot()
		except Exception:
			frappe.log_error(title="Miyar portal boot failed")
			boot = None
	context.miyar_boot = boot
	return context
