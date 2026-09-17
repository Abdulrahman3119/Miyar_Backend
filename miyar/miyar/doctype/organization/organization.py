# Copyright (c) 2026, Miyar and contributors
# License: MIT. See LICENSE

import re

import frappe
from frappe import _
from frappe.model.document import Document


class Organization(Document):
	def validate(self):
		if self.cr and not re.fullmatch(r"\d{10}", str(self.cr).strip()):
			frappe.throw(_("السجل التجاري يجب أن يكون 10 أرقام."))
		self.organization_name = (self.organization_name or "").strip()

	def on_update(self):
		if self.has_value_changed("active") or self.has_value_changed("directory_status"):
			from miyar.utils.audit import log_event

			log_event(
				"تحديث ظهور المنشأة",
				entity=self,
				organization=self.name,
				severity="notice",
				detail=f"active={self.active} directory={self.directory_status}",
			)


def recalc_lab_rating(lab: str):
	rows = frappe.get_all(
		"Lab Rating",
		filters={"lab": lab, "status": "STS06"},
		fields=["name"],
	)
	scores = []
	for row in rows:
		doc = frappe.get_doc("Lab Rating", row.name)
		vals = [cint_safe(s.score) for s in (doc.scores or []) if s.score]
		if vals:
			scores.append(sum(vals) / len(vals))
	avg = round(sum(scores) / len(scores), 2) if scores else 0
	frappe.db.set_value("Organization", lab, {"rating": avg, "reviews": len(scores)})


def cint_safe(v):
	try:
		return int(v)
	except Exception:
		return 0
