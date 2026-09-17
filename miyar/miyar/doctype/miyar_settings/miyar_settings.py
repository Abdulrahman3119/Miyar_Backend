# Copyright (c) 2026, Miyar and contributors
# License: MIT. See LICENSE

from frappe.model.document import Document

from miyar.utils.audit import log_event


class MiyarSettings(Document):
	def on_update(self):
		log_event("تعديل إعدادات المنصة", entity=self, severity="critical")
