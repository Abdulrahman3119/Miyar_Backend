"""STS codes, Frappe roles, and closed operational selects for Miyar."""

from __future__ import annotations

ROLES = {
	"contractor_principal": "Miyar Contractor Principal",
	"contractor_employee": "Miyar Contractor Employee",
	"lab_principal": "Miyar Lab Principal",
	"lab_employee": "Miyar Lab Employee",
	"consultant_principal": "Miyar Consultant Principal",
	"consultant_employee": "Miyar Consultant Employee",
	"supervisor": "Miyar Supervisor",
	"admin": "Miyar Admin",
	"support": "Miyar Support",
	"visitor": "Miyar Visitor",
}

ALL_ROLES = list(ROLES.values())

ROLE_PROFILES = {
	"Miyar Contractor Principal": [ROLES["contractor_principal"]],
	"Miyar Contractor Employee": [ROLES["contractor_employee"]],
	"Miyar Lab Principal": [ROLES["lab_principal"]],
	"Miyar Lab Employee": [ROLES["lab_employee"]],
	"Miyar Consultant Principal": [ROLES["consultant_principal"]],
	"Miyar Consultant Employee": [ROLES["consultant_employee"]],
	"Miyar Supervisor": [ROLES["supervisor"]],
	"Miyar Admin": [ROLES["admin"]],
	"Miyar Support": [ROLES["support"]],
	"Miyar Visitor": [ROLES["visitor"]],
}

ORG_TYPE_TO_ROLES = {
	"contractor": {
		"Principal": ROLES["contractor_principal"],
		"Employee": ROLES["contractor_employee"],
	},
	"lab": {
		"Principal": ROLES["lab_principal"],
		"Employee": ROLES["lab_employee"],
	},
	"consultant": {
		"Principal": ROLES["consultant_principal"],
		"Employee": ROLES["consultant_employee"],
	},
	"supervisor": {
		"Principal": ROLES["supervisor"],
		"Employee": ROLES["supervisor"],
	},
	"ops": {
		"Principal": ROLES["admin"],
		"Employee": ROLES["support"],
	},
}

PRINCIPAL_ROLES = {
	ROLES["contractor_principal"],
	ROLES["lab_principal"],
	ROLES["consultant_principal"],
	ROLES["admin"],
}

ADMIN_ROLES = {ROLES["admin"], "System Manager", "Administrator"}
SUPPORT_ROLES = {ROLES["support"], ROLES["admin"], "System Manager", "Administrator"}
SUPERVISOR_ROLES = {ROLES["supervisor"], ROLES["admin"], "System Manager", "Administrator"}

# Catalog
STS01 = "STS01"
STS02 = "STS02"
STS03 = "STS03"
# Directory
STS04 = "STS04"
STS05 = "STS05"
# Rating
STS06 = "STS06"
STS07 = "STS07"
STS08 = "STS08"
# Request
STS09 = "STS09"
STS10 = "STS10"
STS11 = "STS11"
STS12 = "STS12"
STS13 = "STS13"
STS14 = "STS14"
STS15 = "STS15"
STS16 = "STS16"
STS26 = "STS26"
# Test line
STS17 = "STS17"
STS18 = "STS18"
STS19 = "STS19"
STS20 = "STS20"
STS21 = "STS21"
# Delegation
STS22 = "STS22"
STS23 = "STS23"
STS24 = "STS24"
STS25 = "STS25"

REQUEST_STATUSES = "\n".join(
	[STS09, STS10, STS11, STS12, STS13, STS14, STS15, STS16, STS26]
)
TEST_LINE_STATUSES = "\n".join([STS17, STS18, STS19, STS20, STS21])
CATALOG_STATUSES = "\n".join([STS01, STS02, STS03])
DIRECTORY_STATUSES = "\n".join([STS04, STS05])
RATING_STATUSES = "\n".join([STS06, STS07, STS08])
DELEGATION_STATUSES = "\n".join([STS22, STS23, STS24, STS25])

QUOTE_STATUSES = "Pending\nQuoted\nAccepted\nRejected\nExpired"
REGISTRATION_STATUSES = "Draft\nSubmitted\nUnder Review\nActivated\nRejected"
INVOICE_STATUSES = "Draft\nDue\nOverdue\nPaid"
KNOWLEDGE_STATUSES = "مسودة\nساري\nمؤرشف"
TEMPLATE_STATUSES = "ساري\nمسودة\nمؤرشف"
POLICY_STATUSES = "ساري\nمسودة\nمنتهٍ"
TICKET_STATUSES = "مفتوحة\nقيد المعالجة\nبانتظار الإدارة\nمغلقة"
BOREHOLE_STATUSES = "Ready\nIn Progress\nDone"
LAB_SAMPLE_STATUSES = "Ready\nIn Progress\nDone"
TRANSFER_STATUSES = "Draft\nPending OTP\nDone\nRejected\nClarification"
ENGINE_OVERALL = "COMPLIANT\nNON_COMPLIANT\nPARTIALLY_COMPLIANT\nNOT_EVALUABLE\nNOT_APPLICABLE"
INTEGRATION_STATUSES = "يعمل\nتأخر\nصيانة"
ASSET_MIYAR_STATUSES = "صالح\nقارب الانتهاء\nمنتهٍ\nخارج الخدمة"

CURRENCY = "SAR"
MODULE = "Miyar"
