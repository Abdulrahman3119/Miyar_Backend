# Copyright (c) 2026, Miyar and contributors
# License: MIT. See LICENSE

"""The vocabulary the web client renders: status labels, tones, and the appendix-7.1
permission matrix.

Everything the React app used to hard-code lives here, so a label or a permission is
changed in one place. Values that belong to a business master (organization types,
document types, cities, USCS classes …) are read from the database instead —
see `miyar.api.masters`.
"""

from __future__ import annotations

# tone ∈ neutral | info | accent | ok | warn | danger — drives the badge colour only.
STATUS_DEFS: tuple[dict, ...] = (
	{"code": "STS01", "ar": "فعّال", "en": "Active", "tone": "ok", "entity": "catalog"},
	{"code": "STS02", "ar": "موقوف", "en": "Hold", "tone": "danger", "entity": "catalog"},
	{"code": "STS03", "ar": "بيانات ناقصة", "en": "Incomplete", "tone": "warn", "entity": "catalog"},
	{"code": "STS04", "ar": "ظاهرة", "en": "Visible", "tone": "ok", "entity": "directory"},
	{"code": "STS05", "ar": "مخفية", "en": "Hidden", "tone": "neutral", "entity": "directory"},
	{"code": "STS06", "ar": "معتمد", "en": "Approved", "tone": "ok", "entity": "rating"},
	{"code": "STS07", "ar": "مخفي", "en": "Hidden", "tone": "neutral", "entity": "rating"},
	{"code": "STS08", "ar": "محذوف", "en": "Deleted", "tone": "danger", "entity": "rating"},
	{"code": "STS09", "ar": "مسودة", "en": "Draft", "tone": "neutral", "entity": "request"},
	{"code": "STS10", "ar": "إعداد خطة التنفيذ", "en": "Execution Planning", "tone": "info", "entity": "request"},
	{"code": "STS11", "ar": "بانتظار قرار المختبر", "en": "Pending Laboratory Decision", "tone": "warn", "entity": "request"},
	{"code": "STS12", "ar": "مقبول", "en": "Accepted", "tone": "ok", "entity": "request"},
	{"code": "STS13", "ar": "مرفوض", "en": "Rejected", "tone": "danger", "entity": "request"},
	{"code": "STS14", "ar": "جارٍ التنفيذ", "en": "In Progress", "tone": "accent", "entity": "request"},
	{"code": "STS15", "ar": "مكتمل", "en": "Completed", "tone": "ok", "entity": "request"},
	{"code": "STS16", "ar": "ملغي", "en": "Cancelled", "tone": "neutral", "entity": "request"},
	{"code": "STS26", "ar": "منتهي المهلة", "en": "Expired", "tone": "danger", "entity": "request"},
	{"code": "STS17", "ar": "لم يتم البدء", "en": "Not Started", "tone": "neutral", "entity": "test"},
	{"code": "STS18", "ar": "جارٍ التنفيذ", "en": "In Progress", "tone": "accent", "entity": "test"},
	{"code": "STS19", "ar": "بانتظار قرار المكتب الاستشاري", "en": "Pending Consultant Decision", "tone": "warn", "entity": "test"},
	{"code": "STS20", "ar": "مقبول", "en": "Accepted", "tone": "ok", "entity": "test"},
	{"code": "STS21", "ar": "مرفوض", "en": "Rejected", "tone": "danger", "entity": "test"},
	{"code": "STS22", "ar": "بانتظار القبول", "en": "Pending Acceptance", "tone": "warn", "entity": "delegation"},
	{"code": "STS23", "ar": "فعّال", "en": "Active", "tone": "ok", "entity": "delegation"},
	{"code": "STS24", "ar": "مرفوض", "en": "Rejected", "tone": "danger", "entity": "delegation"},
	{"code": "STS25", "ar": "ملغي", "en": "Cancelled", "tone": "neutral", "entity": "delegation"},
)

# The geotechnical study shows progress, not a status (B.R.166).
STUDY_PHASES: tuple[dict, ...] = (
	{"n": 1, "label": "البيانات الأولية"},
	{"n": 2, "label": "خطة الاستكشاف"},
	{"n": 3, "label": "الأعمال الميدانية"},
	{"n": 4, "label": "البيانات المعملية"},
	{"n": 5, "label": "التحليل الهندسي"},
	{"n": 6, "label": "التقرير النهائي"},
)

BOREHOLE_STATUSES: tuple[dict, ...] = (
	{"code": "ready", "ar": "جاهزة للتنفيذ", "tone": "neutral", "doc": "Ready"},
	{"code": "in-progress", "ar": "قيد التنفيذ", "tone": "accent", "doc": "In Progress"},
	{"code": "done", "ar": "مكتملة", "tone": "ok", "doc": "Done"},
)

QUOTE_STATUSES: tuple[dict, ...] = (
	{"code": "pending", "ar": "بانتظار رد المختبر", "tone": "warn", "doc": "Pending"},
	{"code": "quoted", "ar": "عرض مقدَّم", "tone": "info", "doc": "Quoted"},
	{"code": "accepted", "ar": "مقبول — عقد", "tone": "ok", "doc": "Accepted"},
	{"code": "rejected", "ar": "مرفوض", "tone": "danger", "doc": "Rejected"},
	{"code": "expired", "ar": "منتهي الصلاحية", "tone": "neutral", "doc": "Expired"},
)

INVOICE_STATUSES: tuple[dict, ...] = (
	{"code": "draft", "ar": "مسودة", "tone": "neutral", "doc": "Draft"},
	{"code": "due", "ar": "مستحقة", "tone": "warn", "doc": "Due"},
	{"code": "overdue", "ar": "متأخرة", "tone": "danger", "doc": "Overdue"},
	{"code": "paid", "ar": "مسددة", "tone": "ok", "doc": "Paid"},
)

AUDIT_SEVERITIES: tuple[dict, ...] = (
	{"code": "info", "ar": "معلومة", "tone": "neutral"},
	{"code": "notice", "ar": "إشعار", "tone": "info"},
	{"code": "warning", "ar": "تنبيه", "tone": "warn"},
	{"code": "critical", "ar": "حرج", "tone": "danger"},
)

LAB_SAMPLE_STATUSES: tuple[dict, ...] = (
	{"code": "ready", "ar": "بانتظار الاختبار", "tone": "neutral", "doc": "Ready"},
	{"code": "in-progress", "ar": "قيد الاختبار", "tone": "accent", "doc": "In Progress"},
	{"code": "done", "ar": "مكتملة", "tone": "ok", "doc": "Done"},
)

# The six client-facing verdicts of the analysis engine's control pack, and what the
# platform calls them in Arabic. The codes are the engine's, the wording is ours.
ENGINE_EVAL_STATUSES: tuple[dict, ...] = (
	{"code": "COMPLIANT", "ar": "متوافق", "tone": "ok"},
	{"code": "NON_COMPLIANT", "ar": "غير متوافق", "tone": "danger"},
	{"code": "PARTIALLY_COMPLIANT", "ar": "متوافق جزئياً", "tone": "warn"},
	{"code": "NOT_EVALUABLE", "ar": "غير قابل للتقييم", "tone": "neutral"},
	{"code": "NOT_APPLICABLE", "ar": "غير منطبق", "tone": "neutral"},
)

ENGINE_RESULT_TYPES: tuple[dict, ...] = (
	{"code": "MEASURED_DATA", "ar": "بيانات مقاسة"},
	{"code": "CALCULATED_DATA", "ar": "بيانات محسوبة"},
	{"code": "ANALYTICAL_FINDING", "ar": "استنتاج تحليلي"},
	{"code": "RECOMMENDATION", "ar": "توصية"},
)

# Why each routing policy exists, in the ministry's own terms (B.R.230).
ENGINE_POLICY_DETAILS = {
	"screen-then-cloud": "يفحص المسار المحلي المستند أولاً بلا تكلفة، ولا يُستدعى السحابي إلا إذا كان المستند مستوفياً وصالحاً للتحليل العميق.",
	"local-first": "يُشغَّل المسار المحلي دائماً، ولا يُستدعى السحابي إلا عند تعذّر المحلي. أقل تكلفة وأعلى سيادة.",
	"cloud-first": "يُشغَّل المسار السحابي، ويتحوّل التشغيل تلقائياً إلى المحلي إذا توقف الاشتراك أو تعذّر الوصول.",
	"compare": "يُشغَّل المساران بالسياسة نفسها لقياس الفارق قبل اعتماد المحلي بديلاً دائماً.",
}

ROLE_LABELS: tuple[dict, ...] = (
	{"code": "contractor", "ar": "المقاول"},
	{"code": "lab", "ar": "المختبر"},
	{"code": "consultant", "ar": "المكتب الاستشاري"},
	{"code": "supervisor", "ar": "الجهة الإشرافية"},
	{"code": "admin", "ar": "مدير النظام"},
	{"code": "support", "ar": "الدعم التقني"},
	{"code": "visitor", "ar": "زائر"},
)

POSITION_LABELS: tuple[dict, ...] = (
	{"code": "principal", "ar": "المفوّض الرئيسي"},
	{"code": "employee", "ar": "موظف"},
)

_CONTRACTOR_PRINCIPAL = (
	"directory.view", "profile.manage", "rating.create", "results.view",
	"request.view", "request.create", "request.submit", "request.cancel", "request.retest",
	"study.view", "study.prelim", "study.report.view",
	"delegation.view", "delegation.create", "delegation.decide", "delegation.edit",
)
_CONTRACTOR_EMPLOYEE = (
	"directory.view", "results.view",
	"request.view", "request.create", "request.submit", "request.cancel", "request.retest",
	"study.view", "study.prelim", "study.report.view",
	"delegation.view", "delegation.create", "delegation.decide",
)
_LAB_PRINCIPAL = (
	"catalog.view", "catalog.manage", "directory.view", "profile.manage",
	"request.view", "request.plan", "request.decide", "test.execute", "test.submit",
	"study.view", "study.fieldplan", "study.field", "study.lab", "study.analysis", "study.report.view",
	"delegation.view", "delegation.create", "delegation.decide", "delegation.edit", "engine.run",
)
_LAB_EMPLOYEE = (
	"catalog.view", "directory.view",
	"request.view", "request.plan", "test.execute", "test.submit",
	"study.view", "study.fieldplan", "study.field", "study.lab", "study.analysis", "study.report.view",
	"delegation.view", "delegation.create", "delegation.decide", "engine.run",
)
_CONSULTANT_PRINCIPAL = (
	"directory.view", "profile.manage",
	"request.view", "request.plan", "output.review", "output.approve",
	"study.view", "study.plan.approve", "study.report.preview", "study.report.approve", "study.report.view",
	"delegation.view", "delegation.create", "delegation.decide", "delegation.edit", "engine.run",
)
_CONSULTANT_EMPLOYEE = (
	"directory.view",
	"request.view", "request.plan", "output.review",
	"study.view", "study.report.preview", "study.report.view",
	"delegation.view", "delegation.create", "delegation.decide", "engine.run",
)
# The supervising authority has no operational role (BRD 3.2.1) but does watch governance.
_SUPERVISOR = (
	"catalog.view", "directory.view", "request.view",
	"study.view", "study.report.view", "monitor.view",
)
_ADMIN = (
	"catalog.view", "catalog.manage", "directory.view", "profile.manage",
	"rating.create", "rating.moderate",
	"request.view", "request.create", "request.submit", "request.cancel", "request.retest",
	"request.plan", "request.decide", "test.execute", "test.submit", "output.review", "output.approve",
	"study.view", "study.prelim", "study.plan.approve", "study.fieldplan", "study.field", "study.lab",
	"study.analysis", "study.report.preview", "study.report.approve", "study.report.view",
	"delegation.view", "delegation.create", "delegation.decide", "delegation.edit",
	"admin.settings", "admin.reference", "admin.accounts", "admin.knowledge",
	"monitor.view", "results.view", "engine.run",
)
_SUPPORT_PRINCIPAL = (
	"catalog.view", "directory.view", "rating.moderate",
	"request.view", "request.cancel", "study.view", "study.report.view",
	"delegation.view", "delegation.create", "delegation.decide", "delegation.edit",
	"admin.accounts", "monitor.view",
)
_SUPPORT_EMPLOYEE = ("directory.view", "request.view", "study.view", "study.report.view")
_VISITOR = ("directory.view",)

PERMISSION_MATRIX: dict[str, tuple[str, ...]] = {
	"contractor:principal": _CONTRACTOR_PRINCIPAL,
	"contractor:employee": _CONTRACTOR_EMPLOYEE,
	"lab:principal": _LAB_PRINCIPAL,
	"lab:employee": _LAB_EMPLOYEE,
	"consultant:principal": _CONSULTANT_PRINCIPAL,
	"consultant:employee": _CONSULTANT_EMPLOYEE,
	"supervisor:principal": _SUPERVISOR,
	"supervisor:employee": _SUPERVISOR,
	"admin:principal": _ADMIN,
	"admin:employee": _ADMIN,
	"support:principal": _SUPPORT_PRINCIPAL,
	"support:employee": _SUPPORT_EMPLOYEE,
	"visitor:principal": _VISITOR,
	"visitor:employee": _VISITOR,
}

# Rows and columns of the appendix-7.1 matrix as the governance screen prints it.
PERMISSION_ROWS: tuple[dict, ...] = (
	{"key": "catalog.view", "label": "عرض قائمة الاختبارات"},
	{"key": "catalog.manage", "label": "إدارة قائمة الاختبارات (إضافة/تعديل/سعر/إيقاف/تفعيل)"},
	{"key": "directory.view", "label": "استعراض الدليل والبحث وتفاصيل المنشأة"},
	{"key": "profile.manage", "label": "إدارة الملف التعريفي"},
	{"key": "rating.create", "label": "تقييم المختبر"},
	{"key": "rating.moderate", "label": "إخفاء / حذف تقييم"},
	{"key": "request.view", "label": "عرض طلبات الاختبارات وتفاصيلها"},
	{"key": "request.create", "label": "إنشاء طلب اختبار"},
	{"key": "request.cancel", "label": "إرسال / إلغاء طلب"},
	{"key": "request.retest", "label": "إنشاء طلب إعادة اختبار"},
	{"key": "request.plan", "label": "إعداد واعتماد خطة التنفيذ"},
	{"key": "request.decide", "label": "مراجعة الطلب والرد عليه (قبول/رفض)"},
	{"key": "test.execute", "label": "تنفيذ الاختبار واستكمال المخرج"},
	{"key": "output.review", "label": "مراجعة مخرج الاختبار"},
	{"key": "output.approve", "label": "الموافقة على / رفض المخرج"},
	{"key": "study.view", "label": "عرض الدراسة الجيوتقنية وتقدمها"},
	{"key": "study.prelim", "label": "إدارة البيانات الأولية"},
	{"key": "study.plan.approve", "label": "مراجعة واعتماد خطة الاستكشاف"},
	{"key": "study.fieldplan", "label": "مراجعة خطة التنفيذ الميداني"},
	{"key": "study.field", "label": "الأعمال الميدانية وإدارة الجسات"},
	{"key": "study.lab", "label": "إدارة البيانات المعملية"},
	{"key": "study.analysis", "label": "إدارة البيانات الحسابية"},
	{"key": "study.report.preview", "label": "معاينة تقرير الدراسة"},
	{"key": "study.report.approve", "label": "الموافقة على / رفض مخرج الدراسة"},
	{"key": "study.report.view", "label": "عرض تقرير الدراسة"},
	{"key": "delegation.view", "label": "عرض التفاويض"},
	{"key": "delegation.create", "label": "إنشاء تفويض"},
	{"key": "delegation.decide", "label": "قبول / رفض تفويض"},
	{"key": "delegation.edit", "label": "تعديل تفويض"},
	{"key": "engine.run", "label": "تشغيل المحرك الذكي (سحابي / محلي)"},
	{"key": "admin.settings", "label": "قواعد الأعمال والقوالب"},
	{"key": "admin.reference", "label": "العناصر المرجعية"},
	{"key": "admin.knowledge", "label": "قاعدة المعرفة والمعادلات"},
	{"key": "admin.accounts", "label": "المنشآت والحسابات"},
	{"key": "monitor.view", "label": "سجل التدقيق الكامل والامتثال"},
)

PERMISSION_COLUMNS: tuple[dict, ...] = (
	{"key": "supervisor:principal", "label": "إشرافية — مفوّض"},
	{"key": "supervisor:employee", "label": "إشرافية — موظف"},
	{"key": "admin:principal", "label": "مدير النظام"},
	{"key": "support:principal", "label": "الدعم التقني"},
	{"key": "contractor:principal", "label": "مقاول — مفوّض"},
	{"key": "contractor:employee", "label": "مقاول — موظف"},
	{"key": "consultant:principal", "label": "استشاري — مفوّض"},
	{"key": "consultant:employee", "label": "استشاري — موظف"},
	{"key": "lab:principal", "label": "مختبر — مفوّض"},
	{"key": "lab:employee", "label": "مختبر — موظف"},
)


def permissions_for(role: str, position: str) -> list[str]:
	return list(PERMISSION_MATRIX.get(f"{role}:{position}", _VISITOR))


def status_map() -> dict[str, dict]:
	return {row["code"]: row for row in STATUS_DEFS}


def _doc_to_code(defs: tuple[dict, ...]) -> dict[str, str]:
	return {row["doc"]: row["code"] for row in defs if row.get("doc")}


QUOTE_STATUS_CODE = _doc_to_code(QUOTE_STATUSES)
INVOICE_STATUS_CODE = _doc_to_code(INVOICE_STATUSES)
BOREHOLE_STATUS_CODE = _doc_to_code(BOREHOLE_STATUSES)
LAB_SAMPLE_STATUS_CODE = _doc_to_code(LAB_SAMPLE_STATUSES)
