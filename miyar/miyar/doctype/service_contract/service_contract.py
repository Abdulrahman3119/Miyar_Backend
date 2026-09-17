# Copyright (c) 2026, Miyar and contributors
# License: MIT. See LICENSE

from frappe.model.document import Document

from miyar.utils.audit import log_event


class ServiceContract(Document):
	def on_update(self):
		if self.has_value_changed("is_active") and not self.is_active:
			if not self.ended_on:
				from frappe.utils import nowdate

				self.db_set("ended_on", nowdate())
			log_event("إنهاء عقد ثلاثي", entity=self, organization=self.contractor, severity="notice")

	def after_insert(self):
		log_event("إنشاء عقد ثلاثي", entity=self, organization=self.contractor)
