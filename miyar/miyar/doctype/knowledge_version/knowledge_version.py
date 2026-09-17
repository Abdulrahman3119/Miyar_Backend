# Copyright (c) 2026, Miyar and contributors
# License: MIT. See LICENSE

import frappe
from frappe.model.document import Document

from miyar.utils.audit import log_event


class KnowledgeVersion(Document):
	def on_submit(self):
		self.db_set("status", "ساري")
		# archive previous current
		for name in frappe.get_all(
			"Knowledge Version",
			filters={"status": "ساري", "name": ["!=", self.name]},
			pluck="name",
		):
			frappe.db.set_value("Knowledge Version", name, "status", "مؤرشف")
		log_event("نشر إصدار معرفة", entity=self, severity="critical")
