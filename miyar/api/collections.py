# Copyright (c) 2026, Miyar and contributors
# License: MIT. See LICENSE

"""Operational documents shaped for the web client's store.

One function per collection the client keeps. Each returns plain dicts with the
client's own key names, so the React side has no mapping layer and no fixtures.
"""

from __future__ import annotations

import frappe

from miyar import ui
from miyar.api.payload import GROUP_TO_CATEGORY, _ref_code, frontend_role

CATEGORY_OF_GROUP = GROUP_TO_CATEGORY


def iso(value) -> str | None:
	if not value:
		return None
	text = str(value)
	return text.replace(" ", "T") if " " in text else text


def _label(doctype: str, name: str | None) -> str:
	if not name:
		return ""
	return frappe.db.get_value(doctype, name, "label_ar") or name


def _code(doctype: str, name: str | None) -> str:
	if not name:
		return ""
	return frappe.db.get_value(doctype, name, "code") or name


def _size_text(size) -> str:
	if not size:
		return ""
	return str(size)


# ── contracts & quotes ──────────────────────────────────────────────────────


def list_contracts(limit=200) -> list[dict]:
	rows = frappe.get_all(
		"Service Contract",
		fields=[
			"name",
			"contractor",
			"lab",
			"consultant",
			"project_name",
			"payment_term",
			"city",
			"started_on",
			"ended_on",
			"is_active",
			"quote",
		],
		order_by="started_on desc",
		limit_page_length=int(limit),
	)
	out = []
	for row in rows:
		services = frappe.get_all("Contract Service", filters={"parent": row.name}, pluck="service_type")
		out.append(
			{
				"id": row.name,
				"contractorId": row.contractor,
				"labId": row.lab,
				"consultantId": row.consultant,
				"project": row.project_name or "",
				"city": row.city or "",
				"services": [_code("Service Type", s) for s in services if s],
				"payment": _code("Payment Term Code", row.payment_term),
				"startedAt": iso(row.started_on),
				"endedAt": iso(row.ended_on),
				"active": bool(row.is_active),
				"quoteId": row.quote or "",
			}
		)
	return out


def list_quotes(limit=200) -> list[dict]:
	rows = frappe.get_all(
		"Miyar Quote",
		fields=[
			"name",
			"contractor",
			"lab",
			"consultant",
			"status",
			"project_name",
			"city",
			"payment_term",
			"valid_until",
			"notes",
			"lab_notes",
			"reject_reason",
			"quoted_at",
			"decided_at",
			"service_contract",
			"creation",
		],
		order_by="creation desc",
		limit_page_length=int(limit),
	)
	out = []
	for row in rows:
		services = frappe.get_all("Quote Service", filters={"parent": row.name}, pluck="service_type")
		items = frappe.get_all(
			"Miyar Quote Item",
			filters={"parent": row.name},
			fields=["reference_test", "test_method", "base_price", "price", "sla_days"],
			order_by="idx",
		)
		out.append(
			{
				"id": row.name,
				"contractorId": row.contractor,
				"labId": row.lab,
				"consultantId": row.consultant,
				"project": row.project_name or "",
				"city": row.city or "",
				"services": [_code("Service Type", s) for s in services if s],
				"payment": _code("Payment Term Code", row.payment_term),
				"items": [
					{
						"refTestId": _ref_code(item.reference_test),
						"method": item.test_method or "",
						"basePrice": float(item.base_price or 0),
						"price": float(item.price or 0),
						"sla": int(item.sla_days or 0),
					}
					for item in items
				],
				"notes": row.notes or None,
				"labNotes": row.lab_notes or None,
				"rejectReason": row.reject_reason or None,
				"status": ui.QUOTE_STATUS_CODE.get(row.status, "pending"),
				"createdAt": iso(row.creation),
				"quotedAt": iso(row.quoted_at),
				"decidedAt": iso(row.decided_at),
				"validUntil": iso(row.valid_until),
				"contractId": row.service_contract or None,
			}
		)
	return out


# ── geotechnical studies ────────────────────────────────────────────────────


def _layers(borehole: str) -> list[dict]:
	rows = frappe.get_all(
		"Borehole Layer",
		filters={"borehole": borehole},
		fields=[
			"name",
			"layer_code",
			"depth_from",
			"depth_to",
			"uscs",
			"gradation",
			"color",
			"moisture",
			"spt_n1",
			"spt_n2",
			"spt_n3",
			"n_value",
			"rec_pct",
			"rqd_pct",
			"description",
			"offsite_reason",
			"photo",
		],
		order_by="depth_from asc",
	)
	out = []
	for row in rows:
		spt = [int(row.spt_n1 or 0), int(row.spt_n2 or 0), int(row.spt_n3 or 0)]
		out.append(
			{
				"id": row.layer_code or row.name,
				"from": float(row.depth_from or 0),
				"to": float(row.depth_to or 0),
				"uscs": _code("USCS Classification", row.uscs),
				"gradation": _label("Gradation", row.gradation) or None,
				"color": _label("Soil Color", row.color) or None,
				"moisture": _label("Moisture Description", row.moisture) or None,
				"description": row.description or "",
				"spt": spt if any(spt) else None,
				"n": int(row.n_value or 0) or None,
				"rec": float(row.rec_pct or 0) or None,
				"rqd": float(row.rqd_pct or 0) or None,
				"offsite": {"reason": row.offsite_reason} if row.offsite_reason else None,
				"photo": row.photo or None,
			}
		)
	return out


def _sample_tests(parent: str) -> list[dict]:
	rows = frappe.get_all(
		"Sample Test Row",
		filters={"parent": parent},
		fields=["name", "test_label", "test_method", "mandatory", "value", "uom", "attachment", "limit_text", "compliance"],
		order_by="idx",
	)
	return [
		{
			"id": row.name,
			"name": row.test_label or "",
			"method": row.test_method or "",
			"mandatory": bool(row.mandatory),
			"value": row.value or None,
			"unit": row.uom or None,
			"attachment": row.attachment or None,
			"limit": row.limit_text or None,
			"compliance": row.compliance or None,
		}
		for row in rows
	]


def _samples(borehole: str) -> list[dict]:
	rows = frappe.get_all(
		"Field Sample",
		filters={"borehole": borehole},
		fields=[
			"name",
			"layer",
			"sample_code",
			"lab_status",
			"sample_type",
			"sample_kind",
			"depth_from",
			"depth_to",
			"field_uscs",
			"lab_uscs",
		],
		order_by="depth_from asc",
	)
	out = []
	for row in rows:
		layer_code = frappe.db.get_value("Borehole Layer", row.layer, "layer_code") if row.layer else ""
		out.append(
			{
				"id": row.sample_code or row.name,
				"docId": row.name,
				"layerId": layer_code or "",
				"type": _code("Sample Type", row.sample_type) or "SPT",
				"kind": _code("Sample Kind", row.sample_kind) or "soil",
				"from": float(row.depth_from or 0),
				"to": float(row.depth_to or 0),
				"fieldUSCS": _code("USCS Classification", row.field_uscs) or None,
				"labUSCS": _code("USCS Classification", row.lab_uscs) or None,
				"labStatus": ui.LAB_SAMPLE_STATUS_CODE.get(row.lab_status, "ready"),
				"tests": _sample_tests(row.name),
			}
		)
	return out


def _boreholes(study: str) -> list[dict]:
	rows = frappe.get_all(
		"Borehole",
		filters={"study": study},
		fields=[
			"name",
			"code",
			"status",
			"added_by_lab",
			"added_reason",
			"approved_n",
			"approved_e",
			"operational_n",
			"operational_e",
			"actual_n",
			"actual_e",
			"moved_m",
			"geo_distance_m",
			"approved_depth",
			"executed_depth",
			"not_reached_reason",
			"borehole_method",
			"rig",
			"diameter_mm",
			"casing_m",
			"ground_level",
			"water_instant",
			"water_24h",
			"work_date",
			"weather",
			"technician",
		],
		order_by="code asc",
	)
	out = []
	for row in rows:
		photos = frappe.get_all("Borehole Photo Link", filters={"parent": row.name}, pluck="photo")
		head = None
		if row.borehole_method or row.rig or row.work_date:
			head = {
				"method": _label("Borehole Method", row.borehole_method),
				"rig": row.rig or None,
				"diameter": float(row.diameter_mm or 0),
				"casing": float(row.casing_m or 0) or None,
				"groundLevel": float(row.ground_level or 0) or None,
				"waterInstant": float(row.water_instant or 0) or None,
				"water24h": float(row.water_24h or 0) or None,
				"date": iso(row.work_date),
				"weather": _label("Weather Condition", row.weather) or None,
				"technician": frappe.db.get_value("User", row.technician, "full_name") if row.technician else None,
			}
		out.append(
			{
				"id": row.name,
				"code": row.code or row.name,
				"approved": {"n": float(row.approved_n or 0), "e": float(row.approved_e or 0)},
				"operational": {"n": float(row.operational_n or 0), "e": float(row.operational_e or 0)}
				if row.operational_n
				else None,
				"actual": {"n": float(row.actual_n or 0), "e": float(row.actual_e or 0)} if row.actual_n else None,
				"approvedDepth": float(row.approved_depth or 0),
				"executedDepth": float(row.executed_depth or 0) or None,
				"status": ui.BOREHOLE_STATUS_CODE.get(row.status, "ready"),
				"moved": float(row.moved_m or 0) or None,
				"notReachedReason": row.not_reached_reason or None,
				"addedByLab": {"reason": row.added_reason or ""} if row.added_by_lab else None,
				"geoVerified": {"distance": float(row.geo_distance_m or 0)} if row.geo_distance_m else None,
				"head": head,
				"layers": _layers(row.name),
				"samples": _samples(row.name),
				"photos": [p for p in photos if p],
			}
		)
	return out


def _analysis(doc) -> dict:
	computed = {}
	for row in doc.computed_fields or []:
		computed[row.field_key] = {
			"value": row.value or None,
			"formula": row.formula or "",
			"unit": row.unit or "",
			"label": row.label_ar or row.field_key,
			"inputs": frappe.parse_json(row.inputs) if row.inputs else {},
		}
	def kv(rows):
		return {row.label_ar or row.field_key: row.value or "" for row in rows or []}

	return {
		"computed": computed,
		"analytical": kv(doc.analytical_fields),
		"recommendations": kv(doc.recommendations),
		"manual": kv(doc.manual_fields),
		"attachments": [row.file for row in (doc.analysis_attachments or []) if row.file],
		"done": bool(doc.analysis_done),
	}


def _chemical(doc) -> dict:
	results = []
	for row in doc.chemical_results or []:
		results.append(
			{
				"id": _code("Chemical Test Def", row.chemical_test) or row.name,
				"name": row.label_ar or "",
				"method": row.method_code or "",
				"mandatory": True,
				"limit": row.limit_text or None,
				"unit": row.uom or "",
				"value": row.value or None,
				"attachment": row.attachment or None,
				"compliance": row.compliance or None,
			}
		)
	sample_code = frappe.db.get_value("Field Sample", doc.chemical_sample, "sample_code") if doc.chemical_sample else None
	suggested = (
		frappe.db.get_value("Field Sample", doc.chemical_suggested_sample, "sample_code")
		if doc.chemical_suggested_sample
		else None
	)
	return {
		"sampleId": sample_code,
		"engineSuggestedSampleId": suggested,
		"reasonOverride": doc.chemical_override_reason or None,
		"results": results,
		"done": bool(doc.chemical_done),
		"partialReason": doc.chemical_partial_reason or None,
	}


def study_payload(name: str) -> dict:
	doc = frappe.get_doc("Geotechnical Study", name)
	conditions = [_label("Site Condition", row.site_condition) for row in (doc.site_conditions or [])]
	basis = [row.line for row in (doc.engine_basis or []) if row.line]
	suggestion = None
	if doc.engine_count:
		suggestion = {
			"count": int(doc.engine_count or 0),
			"depth": float(doc.engine_depth or 0),
			"spacing": float(doc.engine_spacing or 0),
			"special": bool(doc.engine_special),
			"basis": basis,
			"ref": doc.engine_ref or "",
		}
	return {
		"id": doc.name,
		"requestId": doc.test_request,
		"ref": f"{doc.test_request}/GT-{str(doc.phase or 1).zfill(2)}" if doc.test_request else doc.name,
		"phase": int(doc.phase or 1),
		"knowledgeVersion": doc.knowledge_version or "",
		"prelim": {
			"deedFile": doc.deed_file or None,
			"parcel": doc.parcel or None,
			"plan": doc.plan_no or None,
			"district": doc.district or None,
			"city": doc.city or None,
			"region": doc.region or None,
			"deedNo": doc.deed_no or None,
			"deedDate": doc.deed_date or None,
			"area": float(doc.plot_area or 0) or None,
			"computedArea": float(doc.computed_area or 0) or None,
			"boundaryOk": bool(doc.boundary_ok),
			"owner": doc.owner_name or None,
			"ownerId": doc.owner_id or None,
			"buildingType": _code("Building Type", doc.building_type) or None,
			"structure": _code("Structure Type", doc.structure_type) or None,
			"floors": int(doc.floors or 0) or None,
			"builtArea": float(doc.built_area or 0) or None,
			"foundationType": _code("Foundation Type", doc.foundation_type) or None,
			"foundationDepth": float(doc.foundation_depth or 0) or None,
			"priorInfo": bool(doc.prior_info),
			"neighbors": bool(doc.neighbors),
			"siteConditions": [c for c in conditions if c],
			"permitNo": doc.permit_no or None,
			"approvedByConsultant": bool(doc.prelim_approved),
			"reviewNotes": doc.review_notes or None,
		},
		"polygon": [
			{"n": float(row.northing or 0), "e": float(row.easting or 0)}
			for row in sorted(doc.polygon or [], key=lambda r: r.seq or 0)
		],
		"plan": {
			"engineSuggestion": suggestion,
			"approved": bool(doc.plan_approved),
			"approvedAt": iso(doc.plan_approved_at),
			"justification": doc.plan_justification or None,
			"table21Row": doc.table_21_row or None,
		},
		"fieldPlanReviewed": bool(doc.field_plan_reviewed),
		"fieldPlanReason": doc.field_plan_reason or None,
		"fieldPlanAck": bool(doc.field_plan_ack),
		"compliance": float(doc.compliance_pct or 0) or None,
		"fieldApproved": bool(doc.field_approved),
		"boreholes": _boreholes(doc.name),
		"chemical": _chemical(doc),
		"analysis": _analysis(doc),
		"report": {
			"previewed": bool(doc.report_previewed),
			"approved": bool(doc.report_approved),
			"approvedAt": iso(doc.report_approved_at),
			"rejectReason": doc.report_reject_reason or None,
			"generatedFile": doc.report_file or None,
			"hash": doc.report_hash or None,
		},
	}


def list_studies(limit=50) -> list[dict]:
	names = frappe.get_all(
		"Geotechnical Study", pluck="name", order_by="modified desc", limit_page_length=int(limit)
	)
	return [study_payload(n) for n in names]


# ── delegation, ratings, invoices, documents ────────────────────────────────


def list_delegations(limit=200) -> list[dict]:
	rows = frappe.get_all(
		"Delegation",
		fields=[
			"name",
			"delegation_type",
			"scope",
			"status",
			"test_request",
			"test_line",
			"from_user",
			"to_user",
			"decided_at",
			"creation",
		],
		order_by="creation desc",
		limit_page_length=int(limit),
	)
	return [
		{
			"id": row.name,
			"type": "direct" if row.delegation_type == "Direct" else "indirect",
			"scope": "request" if row.scope == "Request" else "test",
			"requestId": row.test_request,
			"testId": row.test_line or None,
			"fromUserId": row.from_user,
			"toUserId": row.to_user,
			"status": row.status,
			"createdAt": iso(row.creation),
			"decidedAt": iso(row.decided_at),
		}
		for row in rows
	]


def list_ratings(limit=500) -> list[dict]:
	rows = frappe.get_all(
		"Lab Rating",
		fields=["name", "service_contract", "lab", "contractor", "status", "comment", "creation"],
		order_by="creation desc",
		limit_page_length=int(limit),
	)
	out = []
	for row in rows:
		scores = frappe.get_all(
			"Rating Score", filters={"parent": row.name}, fields=["dimension_key", "score"]
		)
		by_key = {s.dimension_key: int(s.score or 0) for s in scores}
		out.append(
			{
				"id": row.name,
				"contractId": row.service_contract or "",
				"labId": row.lab,
				"contractorId": row.contractor,
				"quality": by_key.get("quality", 0),
				"punctuality": by_key.get("punctuality", 0),
				"communication": by_key.get("communication", 0),
				"scores": by_key,
				"comment": row.comment or None,
				"createdAt": iso(row.creation),
				"status": row.status,
			}
		)
	return out


def list_invoices(limit=200) -> list[dict]:
	rows = frappe.get_all(
		"Laboratory Invoice",
		fields=[
			"name",
			"service_contract",
			"test_request",
			"seller_lab",
			"buyer_contractor",
			"status",
			"amount",
			"vat_rate",
			"vat_amount",
			"grand_total",
			"issued_at",
			"due_at",
			"paid_at",
			"payment_channel",
			"zatca_uuid",
			"blocks_certificate",
		],
		order_by="issued_at desc",
		limit_page_length=int(limit),
	)
	out = []
	for row in rows:
		items = frappe.get_all(
			"Invoice Item",
			filters={"parent": row.name},
			fields=["description", "reference_test", "qty", "rate", "amount"],
			order_by="idx",
		)
		out.append(
			{
				"id": row.name,
				"contractId": row.service_contract or "",
				"requestId": row.test_request or "",
				"contractorId": row.buyer_contractor,
				"labId": row.seller_lab,
				"amount": float(row.amount or 0),
				"vat": float(row.vat_amount or 0),
				"vatRate": float(row.vat_rate or 0),
				"total": float(row.grand_total or 0),
				"status": ui.INVOICE_STATUS_CODE.get(row.status, "draft"),
				"issuedAt": iso(row.issued_at),
				"dueAt": iso(row.due_at),
				"paidAt": iso(row.paid_at),
				"channel": _label("Payment Channel", row.payment_channel) or None,
				"zatcaUuid": row.zatca_uuid or None,
				"blocksCertificate": bool(row.blocks_certificate),
				"items": [
					{
						"description": item.description or "",
						"refTestId": _ref_code(item.reference_test) if item.reference_test else "",
						"qty": float(item.qty or 0),
						"rate": float(item.rate or 0),
						"amount": float(item.amount or 0),
					}
					for item in items
				],
			}
		)
	return out


def list_documents(limit=300) -> list[dict]:
	rows = frappe.get_all(
		"Platform Document",
		fields=[
			"name",
			"title",
			"document_type",
			"classification",
			"file",
			"test_request",
			"service_contract",
			"organization",
			"file_size",
			"version",
			"content_hash",
			"issued_at",
			"retention_until",
		],
		order_by="issued_at desc",
		limit_page_length=int(limit),
	)
	return [
		{
			"id": row.name,
			"name": row.title or row.name,
			"type": _code("Document Type", row.document_type),
			"requestId": row.test_request or None,
			"contractId": row.service_contract or None,
			"orgId": row.organization or "",
			"file": row.file or None,
			"size": _size_text(row.file_size),
			"at": iso(row.issued_at),
			"version": int(row.version or 1),
			"hash": row.content_hash or "",
			"retentionUntil": iso(row.retention_until),
			"classification": row.classification or "",
		}
		for row in rows
	]


def list_audit(limit=200) -> list[dict]:
	rows = frappe.get_all(
		"Audit Event",
		fields=[
			"name",
			"event_time",
			"actor_user",
			"actor_name",
			"actor_role",
			"organization",
			"action",
			"severity",
			"ip",
			"entity_doctype",
			"entity_name",
			"detail",
		],
		order_by="event_time desc",
		limit_page_length=int(limit),
	)
	return [
		{
			"id": row.name,
			"at": iso(row.event_time),
			"actor": row.actor_name or row.actor_user or "",
			"role": row.actor_role or "visitor",
			"org": frappe.db.get_value("Organization", row.organization, "organization_name")
			if row.organization
			else "",
			"action": row.action or "",
			"entity": row.entity_doctype or "",
			"entityId": row.entity_name or "",
			"ip": row.ip or "",
			"severity": row.severity or "info",
			"detail": row.detail or None,
		}
		for row in rows
	]


def list_notifications(limit=40) -> list[dict]:
	user = frappe.session.user
	if not user or user == "Guest":
		return []
	rows = frappe.get_all(
		"Notification Log",
		filters={"for_user": user},
		fields=["name", "subject", "email_content", "read", "creation", "document_type", "document_name", "type"],
		order_by="creation desc",
		limit_page_length=int(limit),
	)
	role = frontend_role()
	tone_of = {"Alert": "warn", "Share": "info", "Assignment": "info", "Energy Point": "ok"}
	return [
		{
			"id": row.name,
			"at": iso(row.creation),
			"title": frappe.utils.strip_html(row.subject or ""),
			"body": frappe.utils.strip_html(row.email_content or ""),
			"read": bool(row.read),
			"forRole": role,
			"link": f"{row.document_type}/{row.document_name}" if row.document_name else None,
			"tone": tone_of.get(row.type, "info"),
		}
		for row in rows
	]


def list_tickets(limit=100) -> list[dict]:
	rows = frappe.get_all(
		"Support Ticket",
		fields=[
			"name",
			"subject",
			"category",
			"ticket_status",
			"status",
			"raised_by",
			"related_request",
			"description",
			"creation",
			"modified",
		],
		order_by="creation desc",
		limit_page_length=int(limit),
	)
	return [
		{
			"id": row.name,
			"subject": row.subject or "",
			"category": _label("Ticket Category", row.category),
			"status": row.status or _label("Ticket Status", row.ticket_status),
			"by": frappe.db.get_value("User", row.raised_by, "full_name") if row.raised_by else "",
			"requestId": row.related_request or None,
			"description": row.description or "",
			"at": iso(row.creation),
			"updatedAt": iso(row.modified),
		}
		for row in rows
	]


# ── evidence: equipment, archived samples, photos, method sheets ────────────


def list_equipment(limit=200) -> list[dict]:
	if not frappe.db.exists("DocType", "Asset"):
		return []
	meta = frappe.get_meta("Asset")
	if not meta.has_field("miyar_lab"):
		return []
	fields = [
		"name",
		"asset_name",
		"miyar_lab",
		"miyar_equipment_type",
		"measuring_range",
		"resolution",
		"calibration_due",
		"calibration_certificate",
		"calibration_provider",
		"miyar_status",
		"lab_location",
	]
	if meta.has_field("serial_no"):
		fields.append("serial_no")
	rows = frappe.get_all(
		"Asset",
		filters={"miyar_lab": ["is", "set"]},
		fields=fields,
		order_by="name",
		limit_page_length=int(limit),
	)
	out = []
	for row in rows:
		calibration = frappe.get_all(
			"Calibration Record",
			filters={"asset": row.name},
			fields=["calibrated_on", "due_on", "certificate_no", "provider"],
			order_by="calibrated_on desc",
			limit=1,
		)
		last = calibration[0] if calibration else {}
		out.append(
			{
				"id": row.name,
				"labId": row.miyar_lab,
				"name": row.asset_name or row.name,
				"type": _label("Equipment Type", row.miyar_equipment_type),
				"serial": row.get("serial_no") or "",
				"range": row.measuring_range or "",
				"resolution": row.resolution or "",
				"calibratedAt": iso(last.get("calibrated_on")),
				"calibrationDue": iso(row.calibration_due or last.get("due_on")),
				"certificate": row.calibration_certificate or last.get("certificate_no") or "",
				"provider": row.calibration_provider or last.get("provider") or "",
				"status": row.miyar_status or "",
				"location": row.lab_location or "",
			}
		)
	return out


def list_photos(limit=500) -> list[dict]:
	rows = frappe.get_all(
		"Photo Evidence",
		fields=[
			"name",
			"file",
			"photo_kind",
			"caption",
			"taken_at",
			"lat",
			"lng",
			"accuracy_m",
			"device",
			"content_hash",
			"test_request",
			"test_line",
			"archived_sample",
			"borehole",
		],
		order_by="taken_at desc",
		limit_page_length=int(limit),
	)
	out = []
	for row in rows:
		borehole_code = frappe.db.get_value("Borehole", row.borehole, "code") if row.borehole else None
		out.append(
			{
				"id": row.name,
				"file": row.file or "",
				"kind": _code("Photo Kind", row.photo_kind) or "site",
				"caption": row.caption or "",
				"takenAt": iso(row.taken_at),
				"lat": float(row.lat or 0) or None,
				"lng": float(row.lng or 0) or None,
				"accuracyM": float(row.accuracy_m or 0) or None,
				"device": row.device or "",
				"hash": row.content_hash or "",
				"requestId": row.test_request or None,
				"testId": row.test_line or None,
				"sampleId": row.archived_sample or None,
				"boreholeCode": borehole_code,
			}
		)
	return out


def list_archived_samples(limit=300) -> list[dict]:
	rows = frappe.get_all(
		"Archived Sample",
		fields=[
			"name",
			"lab",
			"archive_kind",
			"designation",
			"test_request",
			"test_line",
			"borehole",
			"collected_at",
			"collected_by",
			"lat",
			"lng",
			"mass_g",
			"condition",
			"storage",
			"retention_until",
			"seal_no",
			"status",
		],
		order_by="collected_at desc",
		limit_page_length=int(limit),
	)
	out = []
	for row in rows:
		dims = frappe.get_all(
			"Sample Dimension", filters={"parent": row.name}, fields=["dim_key", "dim_value"], order_by="idx"
		)
		custody = frappe.get_all(
			"Custody Event",
			filters={"parent": row.name},
			fields=["at", "step", "by", "location", "note", "temp_c"],
			order_by="at asc",
		)
		photos = frappe.get_all("Archived Sample Photo", filters={"parent": row.name}, pluck="photo")
		borehole_code = frappe.db.get_value("Borehole", row.borehole, "code") if row.borehole else None
		out.append(
			{
				"id": row.name,
				"labId": row.lab,
				"kind": row.archive_kind or "",
				"designation": row.designation or "",
				"requestId": row.test_request or "",
				"testId": row.test_line or None,
				"boreholeCode": borehole_code,
				"collectedAt": iso(row.collected_at),
				"collectedBy": row.collected_by or "",
				"lat": float(row.lat or 0),
				"lng": float(row.lng or 0),
				"massG": float(row.mass_g or 0) or None,
				"condition": row.condition or "",
				"storage": row.storage or "",
				"retentionUntil": iso(row.retention_until),
				"sealNo": row.seal_no or "",
				"status": row.status or "",
				"dims": {d.dim_key: d.dim_value for d in dims},
				"custody": [
					{
						"at": iso(event.at),
						"step": _label("Custody Step", event.step),
						"by": event.by or "",
						"where": event.location or "",
						"note": event.note or None,
						"tempC": float(event.temp_c or 0) or None,
					}
					for event in custody
				],
				"photos": [p for p in photos if p],
			}
		)
	return out


def list_method_sheets() -> list[dict]:
	rows = frappe.get_all(
		"Method Sheet",
		fields=[
			"name",
			"reference_test",
			"test_method",
			"title",
			"form_code",
			"specimen_desc",
			"environment",
			"uncertainty",
			"reporting",
			"acceptance",
		],
		order_by="name",
		limit_page_length=0,
	)
	out = []
	for row in rows:
		steps = frappe.get_all(
			"Method Step", filters={"parent": row.name}, fields=["instruction"], order_by="step asc, idx asc"
		)
		specimen_fields = frappe.get_all(
			"Method Specimen Field",
			filters={"parent": row.name},
			fields=["field_key", "label_ar", "uom"],
			order_by="idx",
		)
		types = frappe.get_all("Method Equipment Type", filters={"parent": row.name}, pluck="equipment_type")
		equipment = []
		if types:
			equipment = frappe.get_all(
				"Asset",
				filters={"miyar_equipment_type": ["in", types], "miyar_lab": ["is", "set"]},
				pluck="name",
			) if frappe.get_meta("Asset").has_field("miyar_lab") else []
		out.append(
			{
				"refTestId": _ref_code(row.reference_test),
				"standard": row.test_method or "",
				"title": row.title or "",
				"form": row.form_code or "",
				"procedure": [s.instruction for s in steps if s.instruction],
				"specimen": row.specimen_desc or "",
				"specimenFields": [
					{"key": f.field_key, "label": f.label_ar or f.field_key, "unit": f.uom or ""}
					for f in specimen_fields
				],
				"equipmentTypes": [_label("Equipment Type", t) for t in types if t],
				"equipment": equipment,
				"environment": row.environment or "",
				"uncertainty": row.uncertainty or "",
				"reporting": row.reporting or "",
				"acceptance": row.acceptance or "",
			}
		)
	return out


# ── policies, templates, knowledge versions ────────────────────────────────


def list_policies() -> list[dict]:
	rows = frappe.get_all(
		"Policy",
		fields=["name", "title", "version_code", "effective_on", "policy_owner", "status", "scope", "reference_codes"],
		order_by="effective_on desc",
		limit_page_length=0,
	)
	return [
		{
			"id": row.name,
			"title": row.title or row.name,
			"version": row.version_code or "",
			"effective": iso(row.effective_on),
			"owner": row.policy_owner or "",
			"scope": row.scope or "",
			"status": row.status or "مسودة",
			"ref": row.reference_codes or "",
		}
		for row in rows
	]


def list_templates() -> list[dict]:
	rows = frappe.get_all(
		"Report Template",
		fields=[
			"name",
			"template_name",
			"template_key",
			"version_code",
			"standard_ref",
			"status",
			"usage_count",
			"modified",
		],
		order_by="template_key",
		limit_page_length=0,
	)
	out = []
	for row in rows:
		sections = frappe.get_all(
			"Report Template Section",
			filters={"parent": row.name},
			fields=["title"],
			order_by="sort_order asc, idx asc",
		)
		history = frappe.get_all(
			"Template Version History",
			filters={"parent": row.name},
			fields=["version_code", "published_on", "note", "status"],
			order_by="published_on desc",
		)
		out.append(
			{
				"id": row.template_key or row.name,
				"name": row.template_name or row.name,
				"ver": row.version_code or "",
				"ref": row.standard_ref or "",
				"fields": f"{len(sections)} قسماً",
				"updated": iso(row.modified),
				"used": int(row.usage_count or 0),
				"status": row.status or "مسودة",
				"sections": [s.title for s in sections if s.title],
				"history": [
					{
						"ver": h.version_code or "",
						"date": iso(h.published_on),
						"note": h.note or "",
						"status": h.status or "",
					}
					for h in history
				],
			}
		)
	return out


def list_knowledge_versions() -> list[dict]:
	rows = frappe.get_all(
		"Knowledge Version",
		fields=["name", "version_code", "published_on", "status", "studies_count", "changes"],
		order_by="published_on desc",
		limit_page_length=0,
	)
	return [
		{
			"ver": row.version_code or row.name,
			"date": iso(row.published_on) or "—",
			"changes": frappe.utils.strip_html(row.changes or ""),
			"studies": int(row.studies_count or 0),
			"status": row.status or "مسودة",
		}
		for row in rows
	]
