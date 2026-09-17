# Copyright (c) 2026, Miyar and contributors
# License: MIT. See LICENSE

import frappe

from miyar.miyar.doctype.organization_registration.organization_registration import OrganizationRegistration


@frappe.whitelist(allow_guest=True)
def submit_registration(
	cr,
	organization_type,
	organization_name,
	principal_name,
	principal_national_id,
	principal_mobile,
	principal_email,
	saac_number=None,
	agreed_terms=0,
	wathq_payload=None,
):
	if not int(agreed_terms or 0):
		frappe.throw("موافقة الشروط إلزامية.")
	doc = frappe.get_doc(
		{
			"doctype": "Organization Registration",
			"cr": cr,
			"organization_type": organization_type,
			"organization_name": organization_name,
			"principal_name": principal_name,
			"principal_national_id": principal_national_id,
			"principal_mobile": principal_mobile,
			"principal_email": principal_email,
			"saac_number": saac_number,
			"agreed_terms": 1,
			"wathq_payload": wathq_payload,
			"status": "Submitted",
		}
	)
	doc.insert(ignore_permissions=True)
	doc.submit()
	return {"name": doc.name, "status": doc.status}
