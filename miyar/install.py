# Copyright (c) 2026, Miyar and contributors
# License: MIT. See LICENSE

from miyar.setup.custom_fields import ensure_custom_fields
from miyar.setup.roles import ensure_roles
from miyar.setup.seed import seed_all


def after_install():
	ensure_roles()
	ensure_custom_fields()
	seed_all()


def after_migrate():
	"""Always re-seed masters + fill empty operational DocTypes (idempotent)."""
	ensure_roles()
	ensure_custom_fields()
	import frappe

	try:
		_fix_miyar_workspace_boot_fields()
		seed_all()
		frappe.logger("miyar").info("Miyar after_migrate seed completed")
	except Exception:
		frappe.log_error(title="Miyar after_migrate seed failed")
		# Re-raise in developer_mode so migrate shows the real error
		if frappe.conf.get("developer_mode"):
			raise


def _fix_miyar_workspace_boot_fields() -> None:
	"""Keep Miyar as a normal Workspace.

	If link_type is left as Report with an empty link_to, desk boot crashes in
	frappe.desk.desktop.get_workspaces (cannot unpack None).
	"""
	import frappe

	if not frappe.db.exists("Workspace", "Miyar"):
		return

	frappe.db.set_value(
		"Workspace",
		"Miyar",
		{
			"type": "Workspace",
			"link_type": "",
			"link_to": "",
			"external_link": "",
			"is_hidden": 0,
			"public": 1,
		},
		update_modified=False,
	)
