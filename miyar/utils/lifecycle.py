# Copyright (c) 2026, Miyar and contributors
# License: MIT. See LICENSE

"""Helpers for Miyar status-machine docs that stay Submitted while status changes."""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
	from frappe.model.document import Document


def save_lifecycle(doc: Document, *, ignore_permissions: bool = True):
	"""Persist intentional post-submit status / slot / history updates.

	Miyar uses Frappe ``is_submittable`` for audit locking, but the business
	lifecycle (STS11→STS12, etc.) continues after submit. Without this flag
	Frappe raises UpdateAfterSubmitError on fields without allow_on_submit.
	"""
	doc.flags.ignore_validate_update_after_submit = True
	doc.flags.ignore_permissions = ignore_permissions
	return doc.save(ignore_permissions=ignore_permissions)
