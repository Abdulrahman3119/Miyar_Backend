# Copyright (c) 2026, Miyar and contributors
# License: MIT. See LICENSE

"""Miyar frontend API.

Call via /api/method/miyar.api.<module>.<fn>

Auth:        miyar.api.auth.ping | request_otp | verify_otp | logout
Session:     miyar.api.session.me | get_boot | poll | public_boot | save_preferences
Directory:   miyar.api.directory.list_labs | list_orgs | get_lab          (guest allowed)
Catalog:     miyar.api.catalog.list_items | upsert_item
Quotes:      miyar.api.quotes.create_quote | respond | accept | reject
Requests:    miyar.api.requests.list_requests | get_request | create_draft | submit_request | cancel_request | lab_decide
Tests:       miyar.api.tests.start | confirm_sample | submit_output | review | retest
Geotech:     miyar.api.geotech.get_study | save_prelim | approve_prelim | run_plan_engine | approve_plan | approve_report
Invoices:    miyar.api.invoices.list_invoices | pay
Delegations: miyar.api.delegations.create | decide | revoke
Help:        miyar.api.help.articles | faqs | integrations | useful_links | create_ticket
Engine:      miyar.api.engine.config | health | diagnose | analyze | list_runs | get_run | run  (embedded dual AI)
Admin:       miyar.api.admin.pending_registrations | activate | reject_registration | masters
Writes:      miyar.api.write.*   (client-shaped mutations used by the React store)
"""
