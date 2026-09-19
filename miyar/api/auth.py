# Copyright (c) 2026, Miyar and contributors
# License: MIT. See LICENSE

"""OTP login for the Miyar SPA. Issues API keys so the browser can call APIs cross-origin."""

from __future__ import annotations

import re

import frappe
from frappe.utils import cint, now_datetime
from frappe.utils.password import get_decrypted_password

from miyar import __version__ as APP_VERSION
from miyar.api.payload import session_user

OTP_TTL = 300
OTP_COOLDOWN = 45
DEV_OTP = "1234"


def _otp_cooldown() -> int:
	return 3 if cint(frappe.conf.developer_mode) else OTP_COOLDOWN


def _digits(value: str | None) -> str:
	return re.sub(r"\D", "", value or "")


def normalize_mobile(mobile: str | None) -> str:
	digits = _digits(mobile)
	if digits.startswith("966") and len(digits) >= 12:
		digits = "0" + digits[3:]
	if len(digits) == 9 and digits.startswith("5"):
		digits = "0" + digits
	return digits


def _mobile_candidates(mobile: str) -> list[str]:
	norm = normalize_mobile(mobile)
	if not norm:
		return []
	out = [norm]
	if norm.startswith("05") and len(norm) == 10:
		out.extend([f"+966{norm[1:]}", f"966{norm[1:]}", norm[1:]])
	return list(dict.fromkeys(out))


def find_user_by_mobile(mobile: str) -> str | None:
	for candidate in _mobile_candidates(mobile):
		name = frappe.db.get_value("User", {"mobile_no": candidate, "enabled": 1}, "name")
		if name:
			return name
	return None


def _issue_keys(user: str) -> tuple[str, str]:
	"""Return api_key:api_secret without rotating the secret on every call."""
	doc = frappe.get_doc("User", user)
	changed = False
	if not doc.api_key:
		doc.api_key = frappe.generate_hash(length=15)
		changed = True
	api_secret = get_decrypted_password("User", user, "api_secret", raise_exception=False)
	if not api_secret:
		api_secret = frappe.generate_hash(length=15)
		doc.api_secret = api_secret
		changed = True
	if changed:
		doc.save(ignore_permissions=True)
	return doc.api_key, api_secret


def _csrf() -> str:
	try:
		from frappe.sessions import get_csrf_token

		token = get_csrf_token()
		frappe.db.commit()
		return token or ""
	except Exception:
		return (getattr(frappe.session, "data", None) or {}).get("csrf_token") or ""


def build_desk_auth():
	"""Shared by the API and the /miyar portal shell."""
	user = frappe.session.user
	if not user or user == "Guest":
		return {"ok": False, "guest": True, "user": None, "token": "", "csrf_token": _csrf()}

	api_key, api_secret = _issue_keys(user)
	return {
		"ok": True,
		"guest": False,
		"api_key": api_key,
		"api_secret": api_secret,
		"token": f"{api_key}:{api_secret}",
		"csrf_token": _csrf(),
		"session": session_user(),
		"logged_at": str(now_datetime()),
	}


@frappe.whitelist(allow_guest=True, methods=["GET", "POST"])
def ping():
	if "miyar" not in frappe.get_installed_apps():
		frappe.throw("تطبيق معيار غير مثبت على هذا الموقع. تحقق من اسم الموقع (مثلاً site1).")
	return {
		"ok": True,
		"app": "miyar",
		"version": APP_VERSION,
		"site": frappe.local.site,
		"developer_mode": bool(cint(frappe.conf.developer_mode)),
		"guest": frappe.session.user == "Guest",
		"user": frappe.session.user if frappe.session.user != "Guest" else None,
	}


@frappe.whitelist(allow_guest=True, methods=["POST"])
def request_otp(mobile: str):
	norm = normalize_mobile(mobile)
	if not re.fullmatch(r"05\d{8}", norm):
		frappe.throw("أدخل رقم جوال سعودي صحيح يبدأ بـ 05.")
	user = find_user_by_mobile(norm)
	if not user:
		frappe.throw("رقم الجوال غير مسجّل في المنصة.")

	cache = frappe.cache()
	cooldown_key = f"miyar:otp:cd:{norm}"
	if cache.get_value(cooldown_key):
		frappe.throw("انتظر لحظات قبل طلب رمز جديد.")

	otp = DEV_OTP if cint(frappe.conf.developer_mode) else f"{frappe.generate_hash(length=4)[:4]}"
	if not otp.isdigit():
		otp = f"{int(frappe.generate_hash(length=8), 16) % 10000:04d}"
	cache.set_value(f"miyar:otp:{norm}", otp, expires_in_sec=OTP_TTL)
	cache.set_value(cooldown_key, 1, expires_in_sec=_otp_cooldown())
	cache.set_value(f"miyar:otp:user:{norm}", user, expires_in_sec=OTP_TTL)

	out = {"ok": True, "ttl": OTP_TTL, "mobile": norm}
	if cint(frappe.conf.developer_mode):
		out["dev_otp"] = otp
	return out


@frappe.whitelist(allow_guest=True, methods=["POST"])
def verify_otp(mobile: str, otp: str):
	norm = normalize_mobile(mobile)
	code = re.sub(r"\D", "", otp or "")
	cache = frappe.cache()
	saved = cache.get_value(f"miyar:otp:{norm}")
	user = cache.get_value(f"miyar:otp:user:{norm}") or find_user_by_mobile(norm)
	if not saved or not user or saved != code:
		frappe.throw("رمز التحقق غير صحيح أو منتهٍ.")

	cache.delete_value(f"miyar:otp:{norm}")
	cache.delete_value(f"miyar:otp:user:{norm}")

	frappe.local.login_manager.login_as(user)
	api_key, api_secret = _issue_keys(user)
	return {
		"ok": True,
		"api_key": api_key,
		"api_secret": api_secret,
		"token": f"{api_key}:{api_secret}",
		"csrf_token": _csrf(),
		"session": session_user(),
		"logged_at": str(now_datetime()),
	}


@frappe.whitelist(allow_guest=True, methods=["GET", "POST"])
def desk_session():
	"""Reuse the Frappe Desk cookie session for the SPA — no OTP when already logged in."""
	return build_desk_auth()


@frappe.whitelist(allow_guest=True, methods=["GET", "POST"])
def logout():
	"""End the Frappe session the same way Desk does (`frappe.handler.logout`).

	Also rotates the user's API secret so a stored SPA token cannot silently
	re-auth after the cookie session is cleared.
	"""
	user = frappe.session.user if frappe.session.user != "Guest" else None
	if user:
		try:
			doc = frappe.get_doc("User", user)
			doc.api_secret = frappe.generate_hash(length=15)
			doc.save(ignore_permissions=True)
		except Exception:
			frappe.log_error(title="Miyar logout API key rotate failed")
	try:
		if getattr(frappe.local, "login_manager", None):
			frappe.local.login_manager.logout()
		else:
			from frappe.auth import clear_cookies

			clear_cookies()
	except Exception:
		from frappe.auth import clear_cookies

		clear_cookies()
	frappe.db.commit()
	return {"ok": True}
