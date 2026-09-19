app_name = "miyar"
app_title = "Miyar"
app_publisher = "Miyar"
app_description = "Backend for Miyar — Saudi Building Code testing and geotechnical marketplace"
app_email = "support@miyar.gov.sa"
app_license = "mit"

required_apps = ["erpnext"]

app_include_css = "/assets/miyar/css/miyar.css"
app_include_js = "/assets/miyar/js/miyar.js"

# Website SPA (React miyar-app) — same UI as the standalone Vite app
website_route_rules = [
	{"from_route": "/miyar-directory", "to_route": "miyar_directory"},
	{"from_route": "/miyar", "to_route": "miyar"},
	{"from_route": "/miyar/<path:app_path>", "to_route": "miyar"},
]

add_to_apps_screen = [
	{
		"name": "miyar",
		"logo": "/assets/miyar/brand/mark.png",
		"title": "معيار",
		"route": "/miyar",
	}
]

after_install = "miyar.install.after_install"
after_migrate = "miyar.install.after_migrate"

# Send any user with a Miyar role to the React portal after login
on_session_creation = "miyar.auth.on_session_creation"

role_home_page = {
	"Miyar Visitor": "miyar",
	"Miyar Contractor Principal": "miyar",
	"Miyar Contractor Employee": "miyar",
	"Miyar Lab Principal": "miyar",
	"Miyar Lab Employee": "miyar",
	"Miyar Consultant Principal": "miyar",
	"Miyar Consultant Employee": "miyar",
	"Miyar Supervisor": "miyar",
	"Miyar Admin": "miyar",
	"Miyar Support": "miyar",
}

export_python_type_annotations = True

default_currency = "SAR"

permission_query_conditions = {
	"Organization": "miyar.permissions.organization_query",
	"Organization Registration": "miyar.permissions.registration_query",
	"Organization User": "miyar.permissions.organization_user_query",
	"Lab Catalog Item": "miyar.permissions.catalog_query",
	"Miyar Quote": "miyar.permissions.quote_query",
	"Service Contract": "miyar.permissions.contract_query",
	"Test Request": "miyar.permissions.test_request_query",
	"Test Line": "miyar.permissions.test_line_query",
	"Geotechnical Study": "miyar.permissions.study_query",
	"Borehole": "miyar.permissions.borehole_query",
	"Borehole Layer": "miyar.permissions.borehole_layer_query",
	"Field Sample": "miyar.permissions.field_sample_query",
	"Delegation": "miyar.permissions.delegation_query",
	"Lab Rating": "miyar.permissions.rating_query",
	"Laboratory Invoice": "miyar.permissions.invoice_query",
	"Archived Sample": "miyar.permissions.archived_sample_query",
	"Photo Evidence": "miyar.permissions.photo_query",
	"Audit Event": "miyar.permissions.audit_query",
	"Support Ticket": "miyar.permissions.ticket_query",
	"Engine Run": "miyar.permissions.engine_run_query",
	"Platform Document": "miyar.permissions.platform_document_query",
	"Principal Transfer": "miyar.permissions.principal_transfer_query",
	"User Preference": "miyar.permissions.user_preference_query",
	"User Notification Pref": "miyar.permissions.user_notification_pref_query",
}

has_permission = {
	"Organization": "miyar.permissions.organization_has_permission",
	"Organization Registration": "miyar.permissions.registration_has_permission",
	"Organization User": "miyar.permissions.organization_user_has_permission",
	"Lab Catalog Item": "miyar.permissions.catalog_has_permission",
	"Miyar Quote": "miyar.permissions.quote_has_permission",
	"Service Contract": "miyar.permissions.contract_has_permission",
	"Test Request": "miyar.permissions.test_request_has_permission",
	"Test Line": "miyar.permissions.test_line_has_permission",
	"Geotechnical Study": "miyar.permissions.study_has_permission",
	"Borehole": "miyar.permissions.borehole_has_permission",
	"Borehole Layer": "miyar.permissions.borehole_layer_has_permission",
	"Field Sample": "miyar.permissions.field_sample_has_permission",
	"Delegation": "miyar.permissions.delegation_has_permission",
	"Lab Rating": "miyar.permissions.rating_has_permission",
	"Laboratory Invoice": "miyar.permissions.invoice_has_permission",
	"Archived Sample": "miyar.permissions.archived_sample_has_permission",
	"Photo Evidence": "miyar.permissions.photo_has_permission",
	"Audit Event": "miyar.permissions.audit_has_permission",
	"Support Ticket": "miyar.permissions.ticket_has_permission",
	"Engine Run": "miyar.permissions.engine_run_has_permission",
	"Platform Document": "miyar.permissions.platform_document_has_permission",
	"Principal Transfer": "miyar.permissions.principal_transfer_has_permission",
	"User Preference": "miyar.permissions.user_self_has_permission",
	"User Notification Pref": "miyar.permissions.user_self_has_permission",
}

doc_events = {
	"Asset": {
		"validate": "miyar.setup.custom_fields.sync_asset_miyar_status",
	},
	"File": {
		"after_insert": "miyar.utils.files.after_file_insert",
	},
}

scheduler_events = {
	"cron": {
		"*/5 * * * *": [
			"miyar.scheduler.expire_lab_deadlines",
			"miyar.scheduler.auto_approve_consultant_reviews",
		]
	},
	"daily": [
		"miyar.scheduler.expire_quotes",
		"miyar.scheduler.mark_overdue_invoices",
		"miyar.scheduler.warn_saac_expiry",
		"miyar.scheduler.run_scheduled_reports",
	],
}

override_whitelisted_methods = {}

export_fixtures = False
