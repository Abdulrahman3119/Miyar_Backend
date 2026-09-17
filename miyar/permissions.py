# Copyright (c) 2026, Miyar and contributors
# License: MIT. See LICENSE

"""Record-level visibility. DocPerm is the coarse gate; this is the org/delegation gate."""

from __future__ import annotations

import frappe

from miyar.constants import ADMIN_ROLES, ROLES, SUPERVISOR_ROLES, SUPPORT_ROLES
from miyar.utils.audit import log_denied
from miyar.utils.org import get_org_user, get_user_org, has_active_delegation


def _roles(user=None):
	return set(frappe.get_roles(user or frappe.session.user))


def _is_privileged(user=None) -> bool:
	return bool(_roles(user) & (ADMIN_ROLES | SUPERVISOR_ROLES | SUPPORT_ROLES | {"System Manager"}))


def _escape(value: str) -> str:
	return frappe.db.escape(value)


def _none():
	return "1=0"


def _all():
	return ""


def organization_query(user):
	if _is_privileged(user):
		return _all()
	roles = _roles(user)
	org = get_user_org(user)
	clauses = ["(`tabOrganization`.directory_status = 'STS04' AND `tabOrganization`.active = 1)"]
	if org:
		clauses.append(f"`tabOrganization`.name = {_escape(org)}")
	if ROLES["visitor"] in roles or user == "Guest":
		return clauses[0]
	return "(" + " OR ".join(clauses) + ")"


def organization_has_permission(doc, user=None, permission_type=None):
	user = user or frappe.session.user
	if _is_privileged(user):
		return True
	if permission_type in (None, "read", "select"):
		if doc.directory_status == "STS04" and doc.active:
			return True
		return get_user_org(user) == doc.name
	# write/create of own org for principal — enforced further in controller
	return get_user_org(user) == doc.name


def registration_query(user):
	if _is_privileged(user):
		return _all()
	if user in (None, "Guest"):
		return _none()
	return f"`tabOrganization Registration`.owner = {_escape(user)}"


def registration_has_permission(doc, user=None, permission_type=None):
	user = user or frappe.session.user
	if _is_privileged(user):
		return True
	return doc.owner == user


def organization_user_query(user):
	if _is_privileged(user):
		return _all()
	org = get_user_org(user)
	if not org:
		return _none()
	return f"`tabOrganization User`.organization = {_escape(org)}"


def organization_user_has_permission(doc, user=None, permission_type=None):
	if _is_privileged(user):
		return True
	return get_user_org(user) == doc.organization


def catalog_query(user):
	if _is_privileged(user):
		return _all()
	org = get_user_org(user)
	org_type = frappe.db.get_value("Organization", org, "organization_type") if org else None
	if org_type == "lab":
		return f"`tabLab Catalog Item`.lab = {_escape(org)}"
	# others may read active catalog of visible labs via API; desk list = own if lab else none
	return _none() if org_type != "lab" else _all()


def catalog_has_permission(doc, user=None, permission_type=None):
	if _is_privileged(user):
		return True
	org = get_user_org(user)
	if permission_type in (None, "read", "select"):
		return True if _is_privileged(user) else doc.lab == org
	return doc.lab == org


def _party_query(doctype, user, fields=("contractor", "lab", "consultant")):
	if _is_privileged(user):
		return _all()
	org = get_user_org(user)
	if not org:
		return _none()
	parts = [f"`tab{doctype}`.{f} = {_escape(org)}" for f in fields]
	return "(" + " OR ".join(parts) + ")"


def quote_query(user):
	return _party_query("Miyar Quote", user)


def quote_has_permission(doc, user=None, permission_type=None):
	if _is_privileged(user):
		return True
	org = get_user_org(user)
	return org in {doc.contractor, doc.lab, doc.consultant}


def contract_query(user):
	return _party_query("Service Contract", user)


def contract_has_permission(doc, user=None, permission_type=None):
	if _is_privileged(user):
		return True
	org = get_user_org(user)
	return org in {doc.contractor, doc.lab, doc.consultant}


def test_request_query(user):
	if _is_privileged(user):
		return _all()
	org = get_user_org(user)
	ou = get_org_user(user)
	if not org:
		return _none()
	party = _party_query("Test Request", user)
	if ou and ou.position == "Principal":
		return party
	# employee: delegated STS23 or owner of draft
	user_esc = _escape(user)
	return (
		f"(({party}) AND ("
		f"`tabTest Request`.owner = {user_esc} OR "
		f"`tabTest Request`.delegate = {user_esc} OR "
		f"exists (select 1 from `tabDelegation` d where d.test_request = `tabTest Request`.name "
		f"and d.to_user = {user_esc} and d.status = 'STS23')"
		f"))"
	)


def test_request_has_permission(doc, user=None, permission_type=None):
	user = user or frappe.session.user
	if _is_privileged(user):
		return True
	org = get_user_org(user)
	if org not in {doc.contractor, doc.lab, doc.consultant}:
		log_denied("محاولة وصول مرفوضة", entity=doc)
		return False
	ou = get_org_user(user)
	if ou and ou.position == "Principal":
		return True
	if doc.owner == user or doc.delegate == user:
		return True
	if has_active_delegation(user, doc.name):
		return True
	if permission_type in (None, "read", "select") and doc.status == "STS09" and doc.owner == user:
		return True
	log_denied("محاولة وصول مرفوضة", entity=doc, organization=org)
	return False


def test_line_query(user):
	if _is_privileged(user):
		return _all()
	org = get_user_org(user)
	if not org:
		return _none()
	return (
		f"`tabTest Line`.test_request in (select name from `tabTest Request` "
		f"where contractor = {_escape(org)} or lab = {_escape(org)} or consultant = {_escape(org)})"
	)


def test_line_has_permission(doc, user=None, permission_type=None):
	if _is_privileged(user):
		return True
	req = frappe.db.get_value(
		"Test Request",
		doc.test_request,
		["contractor", "lab", "consultant", "name"],
		as_dict=True,
	)
	if not req:
		return False
	org = get_user_org(user)
	return org in {req.contractor, req.lab, req.consultant}


def study_query(user):
	if _is_privileged(user):
		return _all()
	org = get_user_org(user)
	if not org:
		return _none()
	return (
		f"`tabGeotechnical Study`.test_request in (select name from `tabTest Request` "
		f"where contractor = {_escape(org)} or lab = {_escape(org)} or consultant = {_escape(org)})"
	)


def study_has_permission(doc, user=None, permission_type=None):
	return test_line_has_permission(frappe._dict(test_request=doc.test_request), user, permission_type)


def borehole_query(user):
	if _is_privileged(user):
		return _all()
	org = get_user_org(user)
	if not org:
		return _none()
	return (
		f"`tabBorehole`.study in (select s.name from `tabGeotechnical Study` s "
		f"inner join `tabTest Request` r on r.name = s.test_request "
		f"where r.contractor = {_escape(org)} or r.lab = {_escape(org)} or r.consultant = {_escape(org)})"
	)


def borehole_has_permission(doc, user=None, permission_type=None):
	study = frappe.db.get_value("Geotechnical Study", doc.study, "test_request")
	return study_has_permission(frappe._dict(test_request=study), user, permission_type)


def borehole_layer_query(user):
	if _is_privileged(user):
		return _all()
	org = get_user_org(user)
	if not org:
		return _none()
	return (
		f"`tabBorehole Layer`.borehole in (select name from `tabBorehole` where {borehole_query(user).replace('`tabBorehole`.', '')})"
		if False
		else f"`tabBorehole Layer`.borehole in (select b.name from `tabBorehole` b inner join `tabGeotechnical Study` s on s.name = b.study inner join `tabTest Request` r on r.name = s.test_request where r.contractor = {_escape(org)} or r.lab = {_escape(org)} or r.consultant = {_escape(org)})"
	)


def borehole_layer_has_permission(doc, user=None, permission_type=None):
	bh = frappe.db.get_value("Borehole", doc.borehole, "study")
	return borehole_has_permission(frappe._dict(study=bh), user, permission_type)


def field_sample_query(user):
	if _is_privileged(user):
		return _all()
	org = get_user_org(user)
	if not org:
		return _none()
	return (
		f"`tabField Sample`.borehole in (select b.name from `tabBorehole` b "
		f"inner join `tabGeotechnical Study` s on s.name = b.study "
		f"inner join `tabTest Request` r on r.name = s.test_request "
		f"where r.contractor = {_escape(org)} or r.lab = {_escape(org)} or r.consultant = {_escape(org)})"
	)


def field_sample_has_permission(doc, user=None, permission_type=None):
	bh = frappe.db.get_value("Borehole", doc.borehole, "study")
	return borehole_has_permission(frappe._dict(study=bh), user, permission_type)


def delegation_query(user):
	if _is_privileged(user):
		return _all()
	esc = _escape(user)
	return f"(`tabDelegation`.from_user = {esc} or `tabDelegation`.to_user = {esc})"


def delegation_has_permission(doc, user=None, permission_type=None):
	if _is_privileged(user):
		return True
	user = user or frappe.session.user
	return user in {doc.from_user, doc.to_user}


def rating_query(user):
	if _is_privileged(user):
		return _all()
	org = get_user_org(user)
	if not org:
		return _none()
	return f"(`tabLab Rating`.lab = {_escape(org)} or `tabLab Rating`.contractor = {_escape(org)})"


def rating_has_permission(doc, user=None, permission_type=None):
	if _is_privileged(user):
		return True
	org = get_user_org(user)
	return org in {doc.lab, doc.contractor}


def invoice_query(user):
	if _is_privileged(user):
		return _all()
	org = get_user_org(user)
	if not org:
		return _none()
	return f"(`tabLaboratory Invoice`.seller_lab = {_escape(org)} or `tabLaboratory Invoice`.buyer_contractor = {_escape(org)})"


def invoice_has_permission(doc, user=None, permission_type=None):
	if _is_privileged(user):
		return True
	org = get_user_org(user)
	return org in {doc.seller_lab, doc.buyer_contractor}


def archived_sample_query(user):
	if _is_privileged(user):
		return _all()
	org = get_user_org(user)
	if not org:
		return _none()
	return f"`tabArchived Sample`.lab = {_escape(org)}"


def archived_sample_has_permission(doc, user=None, permission_type=None):
	if _is_privileged(user):
		return True
	return get_user_org(user) == doc.lab or bool(doc.test_request)


def photo_query(user):
	if _is_privileged(user):
		return _all()
	org = get_user_org(user)
	if not org:
		return _none()
	return (
		f"(`tabPhoto Evidence`.test_request in (select name from `tabTest Request` "
		f"where contractor = {_escape(org)} or lab = {_escape(org)} or consultant = {_escape(org)}))"
	)


def photo_has_permission(doc, user=None, permission_type=None):
	if _is_privileged(user) or not doc.test_request:
		return True
	return test_request_has_permission(frappe.get_cached_doc("Test Request", doc.test_request), user, "read")


def audit_query(user):
	if _is_privileged(user):
		return _all()
	org = get_user_org(user)
	if not org:
		return _none()
	return f"`tabAudit Event`.organization = {_escape(org)}"


def audit_has_permission(doc, user=None, permission_type=None):
	if permission_type == "delete":
		return False
	if _is_privileged(user):
		return True
	return get_user_org(user) == doc.organization


def ticket_query(user):
	if _is_privileged(user):
		return _all()
	return f"`tabSupport Ticket`.raised_by = {_escape(user)}"


def ticket_has_permission(doc, user=None, permission_type=None):
	if _is_privileged(user):
		return True
	return doc.raised_by == (user or frappe.session.user)


def engine_run_query(user):
	if _is_privileged(user) or ROLES["lab_principal"] in _roles(user) or ROLES["lab_employee"] in _roles(user):
		return _all() if _is_privileged(user) else f"`tabEngine Run`.actor = {_escape(user)}"
	if ROLES["consultant_principal"] in _roles(user) or ROLES["consultant_employee"] in _roles(user):
		return f"`tabEngine Run`.actor = {_escape(user)}"
	return _none()


def engine_run_has_permission(doc, user=None, permission_type=None):
	if _is_privileged(user):
		return True
	return doc.actor == (user or frappe.session.user)


def platform_document_query(user):
	if _is_privileged(user):
		return _all()
	org = get_user_org(user)
	if not org:
		return _none()
	return (
		f"(`tabPlatform Document`.organization = {_escape(org)} or "
		f"`tabPlatform Document`.service_contract in (select name from `tabService Contract` "
		f"where contractor = {_escape(org)} or lab = {_escape(org)} or consultant = {_escape(org)}))"
	)


def platform_document_has_permission(doc, user=None, permission_type=None):
	if _is_privileged(user):
		return True
	org = get_user_org(user)
	return doc.organization == org


def principal_transfer_query(user):
	if _is_privileged(user):
		return _all()
	org = get_user_org(user)
	if not org:
		return _none()
	return f"`tabPrincipal Transfer`.organization = {_escape(org)}"


def principal_transfer_has_permission(doc, user=None, permission_type=None):
	if _is_privileged(user):
		return True
	return get_user_org(user) == doc.organization


def user_preference_query(user):
	if _is_privileged(user):
		return _all()
	return f"`tabUser Preference`.user = {_escape(user)}"


def user_notification_pref_query(user):
	if _is_privileged(user):
		return _all()
	return f"`tabUser Notification Pref`.user = {_escape(user)}"


def user_self_has_permission(doc, user=None, permission_type=None):
	if _is_privileged(user):
		return True
	return doc.user == (user or frappe.session.user)
