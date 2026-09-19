# Copyright (c) 2026, Miyar and contributors
# License: MIT. See LICENSE

"""Post-login routing for Miyar portal users."""

from __future__ import annotations

import frappe

from miyar.constants import ALL_ROLES

MIYAR_HOME = "/miyar"


def user_has_miyar_role(user: str | None = None) -> bool:
	"""True when the user holds any Miyar role (desk or portal)."""
	user = user or frappe.session.user
	if not user or user == "Guest":
		return False
	roles = set(frappe.get_roles(user))
	return bool(roles.intersection(ALL_ROLES))


def on_session_creation(login_manager=None):
	"""Send Miyar-role users to the React portal after login.

	- System Users: ``frappe.local.flags.home_page`` is read by ``get_home_page()``
	  during ``LoginManager.set_user_info``.
	- Website Users: ``redirect_after_login`` is consumed as ``redirect_to`` for the
	  ``No App`` login response path.
	"""
	user = getattr(login_manager, "user", None) or frappe.session.user
	if not user_has_miyar_role(user):
		return

	frappe.local.flags.home_page = MIYAR_HOME
	frappe.cache.hset("redirect_after_login", user, MIYAR_HOME)
