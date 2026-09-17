# Copyright (c) 2026, Miyar and contributors
# License: MIT. See LICENSE

import json

import frappe
from frappe.utils import now_datetime

from miyar.api.common import require_login


@frappe.whitelist()
def run(profile, mode="cloud", source_file=None, test_request=None, study=None, result=None):
	"""Store an advisory Engine Run. Does not change request/study status (B.R.230)."""
	require_login()
	doc = frappe.get_doc(
		{
			"doctype": "Engine Run",
			"profile": profile,
			"mode": mode,
			"source_file": source_file,
			"test_request": test_request,
			"study": study,
			"actor": frappe.session.user,
			"ran_at": now_datetime(),
			"result": json.loads(result) if isinstance(result, str) and result.startswith("{") else result,
		}
	)
	doc.insert()
	return doc.as_dict()
