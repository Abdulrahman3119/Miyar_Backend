# Copyright (c) 2026, Miyar and contributors
# License: MIT. See LICENSE

"""Normalize Frappe Time / timedelta values for MySQL and the React UI."""

from __future__ import annotations

import datetime
import re
from typing import Any


def format_hhmm(value: Any, *, with_seconds: bool = False) -> str:
	"""Return ``HH:MM`` (or ``HH:MM:SS``) from Time / timedelta / string.

	MariaDB often returns Time as ``datetime.timedelta``. ``str(timedelta(hours=9))``
	is ``'9:00:00'`` — slicing ``[:5]`` yields the invalid ``'9:00:'``.
	"""
	if value is None or value == "":
		return ""

	if isinstance(value, datetime.timedelta):
		total = int(value.total_seconds()) % (24 * 3600)
		h, rem = divmod(total, 3600)
		m, s = divmod(rem, 60)
		return f"{h:02d}:{m:02d}:{s:02d}" if with_seconds else f"{h:02d}:{m:02d}"

	if isinstance(value, datetime.time):
		return value.strftime("%H:%M:%S") if with_seconds else value.strftime("%H:%M")

	if isinstance(value, datetime.datetime):
		return value.strftime("%H:%M:%S") if with_seconds else value.strftime("%H:%M")

	text = str(value).strip()
	# Accept "9:00", "9:00:00", "09:00:", "09:00:00.000000"
	m = re.match(r"^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?", text)
	if not m:
		return text[:8]
	h, mi, s = int(m.group(1)), int(m.group(2)), int(m.group(3) or 0)
	h, mi, s = h % 24, mi % 60, s % 60
	return f"{h:02d}:{mi:02d}:{s:02d}" if with_seconds else f"{h:02d}:{mi:02d}"


def to_frappe_time(value: Any) -> str | None:
	"""Value safe to assign to a Frappe Time field / MySQL TIME column."""
	if value is None or value == "":
		return None
	return format_hhmm(value, with_seconds=True)
