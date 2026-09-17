/*! معيار — Desk chrome + list/form polish (mirrors miyar-app design) */
(() => {
	"use strict";

	const BRAND_MARK = "/assets/miyar/brand/mark-on-dark.png";
	const PORTAL_PATH = "/miyar";

	/** Same vocabulary as miyar.ui.STATUS_DEFS / frontend StatusPill */
	const STATUS = {
		STS01: { ar: "فعّال", tone: "ok" },
		STS02: { ar: "موقوف", tone: "danger" },
		STS03: { ar: "بيانات ناقصة", tone: "warn" },
		STS04: { ar: "ظاهرة", tone: "ok" },
		STS05: { ar: "مخفية", tone: "neutral" },
		STS06: { ar: "معتمد", tone: "ok" },
		STS07: { ar: "مخفي", tone: "neutral" },
		STS08: { ar: "محذوف", tone: "danger" },
		STS09: { ar: "مسودة", tone: "neutral" },
		STS10: { ar: "إعداد خطة التنفيذ", tone: "info" },
		STS11: { ar: "بانتظار قرار المختبر", tone: "warn" },
		STS12: { ar: "مقبول", tone: "ok" },
		STS13: { ar: "مرفوض", tone: "danger" },
		STS14: { ar: "جارٍ التنفيذ", tone: "accent" },
		STS15: { ar: "مكتمل", tone: "ok" },
		STS16: { ar: "ملغي", tone: "neutral" },
		STS26: { ar: "منتهي المهلة", tone: "danger" },
		STS17: { ar: "لم يتم البدء", tone: "neutral" },
		STS18: { ar: "جارٍ التنفيذ", tone: "accent" },
		STS19: { ar: "بانتظار قرار المكتب الاستشاري", tone: "warn" },
		STS20: { ar: "مقبول", tone: "ok" },
		STS21: { ar: "مرفوض", tone: "danger" },
		STS22: { ar: "بانتظار القبول", tone: "warn" },
		STS23: { ar: "فعّال", tone: "ok" },
		STS24: { ar: "مرفوض", tone: "danger" },
		STS25: { ar: "ملغي", tone: "neutral" },
		Draft: { ar: "مسودة", tone: "neutral" },
		Due: { ar: "مستحقة", tone: "warn" },
		Overdue: { ar: "متأخرة", tone: "danger" },
		Paid: { ar: "مسددة", tone: "ok" },
		Pending: { ar: "بانتظار رد المختبر", tone: "warn" },
		Quoted: { ar: "عرض مقدَّم", tone: "info" },
		Accepted: { ar: "مقبول — عقد", tone: "ok" },
		Rejected: { ar: "مرفوض", tone: "danger" },
		Expired: { ar: "منتهي الصلاحية", tone: "neutral" },
		Ready: { ar: "جاهزة للتنفيذ", tone: "neutral" },
		"In Progress": { ar: "قيد التنفيذ", tone: "accent" },
		Done: { ar: "مكتملة", tone: "ok" },
		Active: { ar: "فعّال", tone: "ok" },
		Hold: { ar: "موقوف", tone: "danger" },
		Submitted: { ar: "مُرسل", tone: "info" },
		Approved: { ar: "معتمد", tone: "ok" },
		Open: { ar: "مفتوح", tone: "info" },
		Closed: { ar: "مغلق", tone: "neutral" },
	};

	const TONE_TO_FRAPPE = {
		neutral: "darkgrey",
		info: "blue",
		accent: "green",
		ok: "green",
		warn: "orange",
		danger: "red",
	};

	function statusDef(code) {
		if (!code) return { ar: "", tone: "neutral" };
		return STATUS[code] || { ar: String(code), tone: "neutral" };
	}

	function indicatorFor(code) {
		const d = statusDef(code);
		return [__(d.ar), TONE_TO_FRAPPE[d.tone] || "darkgrey", `status,=,${code}`];
	}

	function pillHtml(code) {
		const d = statusDef(code);
		return `<span class="miyar-pill miyar-tone miyar-tone-${d.tone}" title="${frappe.utils.escape_html(
			code
		)}">${frappe.utils.escape_html(d.ar)}</span>`;
	}

	function decorateIndicators(root) {
		(root || document).querySelectorAll(".indicator-pill, .indicator").forEach((el) => {
			if (el.dataset.miyarTone) return;
			const text = (el.textContent || "").trim();
			// Match STS codes or known labels
			let code = null;
			if (/^STS\d{2}$/.test(text)) code = text;
			else {
				const hit = Object.entries(STATUS).find(([, v]) => v.ar === text);
				if (hit) code = hit[0];
			}
			if (!code) return;
			const d = statusDef(code);
			el.dataset.miyarTone = d.tone;
			el.classList.add("miyar-tone", `miyar-tone-${d.tone}`);
			if (/^STS\d{2}$/.test(text)) el.textContent = d.ar;
		});
	}

	function injectNavBrand() {
		const nav = document.querySelector(".navbar .container, .navbar .navbar-nav, header.navbar");
		if (!nav || document.querySelector(".miyar-nav-brand")) return;
		const anchor =
			document.querySelector(".navbar-brand") ||
			document.querySelector("#navbar-breadcrumbs") ||
			nav.firstElementChild;
		const a = document.createElement("a");
		a.href = PORTAL_PATH;
		a.rel = "noopener";
		a.title = "فتح واجهة معيار";
		a.className = "miyar-nav-brand";
		a.addEventListener("click", (e) => {
			e.preventDefault();
			window.location.assign(PORTAL_PATH);
		});
		a.innerHTML = `<img src="${BRAND_MARK}" alt="معيار" /><span class="miyar-nav-titles"><strong>معيار</strong><span>المنصة الوطنية لاختبارات التربة والطرق</span></span>`;
		if (anchor && anchor.parentNode) {
			anchor.parentNode.insertBefore(a, anchor);
		} else {
			nav.prepend(a);
		}
	}

	/** Desk workspace /app/miyar → /desk/miyar must open the React UI, not the Workspace page. */
	function redirectWorkspaceToPortal() {
		const path = (window.location.pathname || "").replace(/\/+$/, "");
		if (path === "/desk/miyar" || path === "/app/miyar") {
			window.location.replace(PORTAL_PATH);
			return true;
		}
		const route = (frappe.get_route && frappe.get_route()) || [];
		const page = String(route[1] || "");
		if (route[0] === "Workspaces" && (page === "Miyar" || page === "معيار" || page.toLowerCase() === "miyar")) {
			window.location.replace(PORTAL_PATH);
			return true;
		}
		return false;
	}

	function tagMiyarModule() {
		const route = (frappe.get_route_str && frappe.get_route_str()) || "";
		const miyarish =
			/^(Workspaces\/Miyar|List\/(Test Request|Test Line|Miyar Quote|Service Contract|Organization|Lab Catalog Item|Geotechnical Study|Borehole|Delegation|Laboratory Invoice|Lab Rating|Audit Event|Miyar Settings|Reference Test|Engine Run|Support Ticket|Platform Document|Organization Registration|Field Sample|Photo Evidence|Archived Sample|Principal Transfer)|Form\/(Test Request|Test Line|Miyar Quote|Service Contract|Organization|Lab Catalog Item|Geotechnical Study|Borehole|Delegation|Laboratory Invoice|Lab Rating|Audit Event|Miyar Settings|Reference Test|Engine Run|Support Ticket|Platform Document|Organization Registration|Field Sample|Photo Evidence|Archived Sample|Principal Transfer)|miyar)/i.test(
				route
			);
		document.body.classList.toggle("miyar-module", miyarish);
		document.documentElement.setAttribute("dir", document.documentElement.dir || "rtl");
	}

	function registerListviews() {
		const withStatus = [
			"Test Request",
			"Test Line",
			"Lab Catalog Item",
			"Miyar Quote",
			"Laboratory Invoice",
			"Delegation",
			"Lab Rating",
			"Borehole",
			"Organization Registration",
			"Support Ticket",
			"Policy",
			"Knowledge Version",
			"Report Template",
			"Archived Sample",
			"Principal Transfer",
			"Integration Endpoint",
		];

		withStatus.forEach((dt) => {
			frappe.listview_settings[dt] = frappe.listview_settings[dt] || {};
			const prev = frappe.listview_settings[dt];
			prev.add_fields = Array.from(new Set([...(prev.add_fields || []), "status"]));
			prev.get_indicator = function (doc) {
				return indicatorFor(doc.status);
			};
			prev.formatters = prev.formatters || {};
			prev.formatters.status = (value) => pillHtml(value);
		});

		frappe.listview_settings["Test Request"] = Object.assign(
			frappe.listview_settings["Test Request"] || {},
			{
				add_fields: ["status", "project_name", "contractor", "lab", "priority"],
				onload(listview) {
					listview.page.add_inner_button(__("بوابة معيار"), () => {
						window.open(PORTAL_PATH, "_blank");
					});
				},
			}
		);

		frappe.listview_settings["Geotechnical Study"] = Object.assign(
			frappe.listview_settings["Geotechnical Study"] || {},
			{
				add_fields: ["phase", "test_request"],
				get_indicator(doc) {
					const phase = Number(doc.phase) || 1;
					const tones = ["neutral", "info", "accent", "warn", "ok", "ok"];
					const labels = [
						"البيانات الأولية",
						"خطة الاستكشاف",
						"الأعمال الميدانية",
						"البيانات المعملية",
						"التحليل الهندسي",
						"التقرير النهائي",
					];
					const i = Math.min(Math.max(phase, 1), 6) - 1;
					return [labels[i], TONE_TO_FRAPPE[tones[i]], `phase,=,${phase}`];
				},
			}
		);
	}

	function enhanceForm(frm) {
		if (!frm || !frm.doctype) return;
		const meta = frappe.get_meta(frm.doctype);
		if (!meta || meta.module !== "Miyar") return;
		frm.page.wrapper.addClass("miyar-form");
		const status = frm.doc.status;
		if (status && STATUS[status]) {
			const d = statusDef(status);
			frm.page.set_indicator(__(d.ar), TONE_TO_FRAPPE[d.tone] || "darkgrey");
		}
		// Soft-format STS selects in the form
		frm.fields_dict.status &&
			frm.fields_dict.status.$wrapper.find(".control-value, .like-disabled-input").each(function () {
				const el = this;
				const code = (el.textContent || "").trim();
				if (STATUS[code]) el.innerHTML = pillHtml(code);
			});
	}

	function boot() {
		document.body.classList.add("miyar-brand");
		if (redirectWorkspaceToPortal()) return;
		injectNavBrand();
		tagMiyarModule();
		decorateIndicators(document);
		registerListviews();

		// Portal shortcut in awesomebar apps
		if (frappe.ui && frappe.ui.keys) {
			/* no-op: keep desk shortcuts intact */
		}
	}

	frappe.ready(() => {
		boot();
		$(document).on("page-change", () => {
			if (redirectWorkspaceToPortal()) return;
			tagMiyarModule();
			injectNavBrand();
			setTimeout(() => decorateIndicators(document), 80);
		});
	});

	frappe.after_ajax &&
		$(document).ajaxComplete(() => {
			decorateIndicators(document);
		});

	$(document).on("form-refresh", (e, frm) => enhanceForm(frm));

	// Expose for client scripts / console
	window.miyar_desk = {
		statusDef,
		pillHtml,
		indicatorFor,
		STATUS,
		openPortal: () => window.open(PORTAL_PATH, "_blank"),
	};
})();
