# Copyright (c) 2026, Miyar and contributors
# License: MIT. See LICENSE

import frappe

from miyar import ui
from miyar.api.collections import (
	list_archived_samples,
	list_audit,
	list_contracts,
	list_delegations,
	list_documents,
	list_equipment,
	list_invoices,
	list_knowledge_versions,
	list_method_sheets,
	list_notifications,
	list_photos,
	list_policies,
	list_quotes,
	list_ratings,
	list_studies,
	list_templates,
	list_tickets,
)
from miyar.api.common import me as _me, require_login
from miyar.api.insights import analytics, help_center, knowledge, ref_limits
from miyar.api.masters import get_masters
from miyar.api.payload import (
	list_catalog,
	list_organizations,
	list_reference_tests,
	list_requests_payload,
	org_users,
	session_user,
	settings_payload,
)
from miyar.utils.org import get_user_org


def _org_type_code(name):
	if not name:
		return ""
	return frappe.db.get_value("Organization Type", name, "code") or name


def _user_preferences():
	user = frappe.session.user
	try:
		pref = frappe.db.get_value("User Preference", {"user": user}, ["calendar", "density", "home"], as_dict=True) or {}
		npref = frappe.db.get_value("User Notification Pref", {"user": user}, ["sms", "email", "push", "digest"], as_dict=True) or {}
	except Exception:
		pref, npref = {}, {}
	return {
		"calendar": pref.get("calendar") or "both",
		"density": pref.get("density") or "comfortable",
		"home": pref.get("home") or "dash",
		"sms": bool(npref.get("sms", 1)),
		"email": bool(npref.get("email", 1)),
		"push": bool(npref.get("push")),
		"digest": bool(npref.get("digest", 1)),
	}


def _sessions():
	user = frappe.session.user
	try:
		rows = frappe.db.sql(
			"select sid, lastupdate, status, ipaddress from `tabSessions` where user=%s order by lastupdate desc limit 8",
			user,
			as_dict=True,
		)
	except Exception:
		rows = []
	current = frappe.session.sid
	out = []
	for row in rows:
		out.append(
			{
				"id": row.sid,
				"at": str(row.lastupdate) if row.lastupdate else "",
				"ip": row.ipaddress or "",
				"status": row.status or "",
				"current": str(row.sid) == str(current),
			}
		)
	return out


def _scheduled_jobs():
	from miyar.hooks import scheduler_events

	labels = {
		"expire_lab_deadlines": "إنهاء الطلبات منتهية المهلة",
		"auto_approve_consultant_reviews": "الاعتماد التلقائي بعد المهلة",
		"expire_quotes": "إنهاء عروض الأسعار المنتهية",
		"mark_overdue_invoices": "وسم الفواتير المتأخرة",
		"warn_saac_expiry": "تنبيه اعتماد SAAC",
		"run_scheduled_reports": "تشغيل التقارير المجدولة",
	}
	out = []
	for kind, val in (scheduler_events or {}).items():
		if kind == "cron" and isinstance(val, dict):
			for expr, methods in val.items():
				for method in methods:
					key = str(method).rsplit(".", 1)[-1]
					out.append({"id": key, "label": labels.get(key, key), "schedule": expr})
		elif isinstance(val, list):
			for method in val:
				key = str(method).rsplit(".", 1)[-1]
				out.append({"id": key, "label": labels.get(key, key), "schedule": kind})
	return out


def _pending_registrations():
	pending = frappe.get_all(
		"Organization Registration",
		filters={"status": ["in", ["Submitted", "Under Review"]]},
		fields=["name", "organization_name", "organization_type", "status", "principal_name", "creation", "cr", "saac_number"],
		order_by="creation desc",
		limit_page_length=50,
	)
	return [
		{
			"id": row.name,
			"name": row.organization_name,
			"type": _org_type_code(row.organization_type),
			"status": row.status,
			"principal": row.principal_name,
			"city": "",
			"cr": row.cr,
			"saac": row.saac_number,
			"at": str(row.creation),
		}
		for row in pending
	]


@frappe.whitelist(allow_guest=True)
def me():
	front = session_user()
	legacy = _me()
	legacy["frontend"] = front
	return legacy


@frappe.whitelist(allow_guest=True)
def public_boot():
	"""What a visitor may see: the directory, the reference elements and the vocabulary."""
	return {
		"live": True,
		"user": None,
		"users": [],
		"permissions": ui.permissions_for("visitor", "employee"),
		"masters": get_masters(),
		"rules": settings_payload(),
		"settings": settings_payload(),
		"orgs": list_organizations(),
		"refTests": list_reference_tests(),
		"catalog": list_catalog(public_only=True),
		"ratings": list_ratings(),
		"policies": list_policies(),
		"help": help_center(),
		"knowledge": knowledge(),
		"refLimits": ref_limits(),
		"analytics": analytics(),
	}


@frappe.whitelist(allow_guest=True, methods=["GET", "POST"])
def get_boot():
	"""Everything the React shell renders, in one call.

	Guests receive the public boot; signed-in Desk users receive the full payload.
	"""
	if frappe.session.user == "Guest":
		return public_boot()

	require_login()
	front = session_user()
	org = get_user_org()
	badges = {}
	if org:
		badges["requests"] = frappe.db.count("Test Request", {"lab": org, "status": "STS11"})
		consultant_reqs = frappe.get_all("Test Request", filters={"consultant": org}, pluck="name") or ["__none__"]
		badges["approvals"] = frappe.db.count("Test Line", {"status": "STS19", "test_request": ["in", consultant_reqs]})
	users = org_users(org)
	if front and not any(u["id"] == front["id"] for u in users):
		users = [front, *users]
	settings = settings_payload()
	pending = _pending_registrations() if front and front.get("role") in ("admin", "support") else []
	return {
		"live": True,
		"session": _me(),
		"user": front,
		"users": users,
		"permissions": ui.permissions_for(front["role"], front["position"]) if front else [],
		"masters": get_masters(),
		"settings": settings,
		"rules": settings,
		"orgs": list_organizations(include_hidden=True),
		"refTests": list_reference_tests(),
		"catalog": list_catalog(public_only=False) if org else list_catalog(public_only=True),
		"requests": list_requests_payload(),
		"contracts": list_contracts(),
		"quotes": list_quotes(),
		"studies": list_studies(),
		"delegations": list_delegations(),
		"ratings": list_ratings(),
		"invoices": list_invoices(),
		"documents": list_documents(),
		"audit": list_audit(),
		"notifications": list_notifications(),
		"tickets": list_tickets(),
		"equipment": list_equipment(),
		"samples": list_archived_samples(),
		"photos": list_photos(),
		"methods": list_method_sheets(),
		"policies": list_policies(),
		"templates": list_templates(),
		"knowledgeVersions": list_knowledge_versions(),
		"knowledge": knowledge(),
		"refLimits": ref_limits(),
		"help": help_center(),
		"analytics": analytics(),
		"badges": badges,
		"pendingRegistrations": pending,
		"preferences": _user_preferences(),
		"sessions": _sessions(),
		"scheduledJobs": _scheduled_jobs(),
	}


@frappe.whitelist(methods=["GET", "POST"])
def poll():
	"""Lightweight keepalive for the SPA — notifications + badges only.

	Do not call get_boot on an interval; that payload rebuilds the whole workspace and
	saturates MariaDB under concurrent desk users.
	"""
	require_login()
	front = session_user()
	org = get_user_org()
	badges = {}
	if org:
		badges["requests"] = frappe.db.count("Test Request", {"lab": org, "status": "STS11"})
		consultant_reqs = frappe.get_all("Test Request", filters={"consultant": org}, pluck="name") or ["__none__"]
		badges["approvals"] = frappe.db.count("Test Line", {"status": "STS19", "test_request": ["in", consultant_reqs]})
	return {
		"ok": True,
		"at": frappe.utils.now_datetime().isoformat(),
		"user": front["id"] if front else frappe.session.user,
		"badges": badges,
		"notifications": list_notifications(),
		"pendingRegistrations": _pending_registrations() if front and front.get("role") in ("admin", "support") else [],
	}


@frappe.whitelist()
def save_preferences(calendar=None, density=None, home=None, sms=None, email=None, push=None, digest=None):
	require_login()
	user = frappe.session.user
	pref_name = frappe.db.get_value("User Preference", {"user": user}, "name")
	if pref_name:
		pref = frappe.get_doc("User Preference", pref_name)
	else:
		pref = frappe.get_doc({"doctype": "User Preference", "user": user})
	for key, val in (("calendar", calendar), ("density", density), ("home", home)):
		if val is not None:
			pref.set(key, val)
	pref.flags.ignore_permissions = True
	if pref.is_new():
		pref.insert()
	else:
		pref.save()
	nname = frappe.db.get_value("User Notification Pref", {"user": user}, "name")
	if nname:
		npref = frappe.get_doc("User Notification Pref", nname)
	else:
		npref = frappe.get_doc({"doctype": "User Notification Pref", "user": user})
	for key, val in (("sms", sms), ("email", email), ("push", push), ("digest", digest)):
		if val is not None:
			npref.set(key, int(val))
	npref.flags.ignore_permissions = True
	if npref.is_new():
		npref.insert()
	else:
		npref.save()
	return {"ok": True}
