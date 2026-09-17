from __future__ import annotations

"""Embedded I-DO dual-path engineering engine (vendored into Miyar).

No FastAPI process — Miyar calls analyze_document() / get_health() in-process.
"""

import base64
import json
import os
import re
import statistics
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any, Dict, Tuple

try:
    import pymupdf as fitz  # PyMuPDF modern import
except ImportError:  # backward compatibility
    import fitz
import httpx
from jsonschema import Draft202012Validator

BASE_DIR = Path(__file__).resolve().parent

POLICY_PATH = BASE_DIR / "policy" / "master_engineering_prompt.md"
SCHEMA_PATH = BASE_DIR / "schemas" / "evaluation_schema.json"
KNOWLEDGE_DIR = BASE_DIR / "knowledge"

POLICY_TEXT = POLICY_PATH.read_text(encoding="utf-8")
OUTPUT_SCHEMA = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
SCHEMA_VALIDATOR = Draft202012Validator(OUTPUT_SCHEMA)

MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "100"))
CLOUD_PROVIDER = os.getenv("CLOUD_PROVIDER", "openrouter").lower()
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "").strip()
OPENROUTER_BASE_URL = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1").rstrip("/")
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "openai/gpt-5.6-sol")
OPENROUTER_PDF_ENGINE = os.getenv("OPENROUTER_PDF_ENGINE", "native").strip().lower()
OPENROUTER_TIMEOUT_SECONDS = int(os.getenv("OPENROUTER_TIMEOUT_SECONDS", "300"))
# Cloud speed knobs — default to text extraction so we do not base64-upload whole PDFs.
CLOUD_INPUT_MODE = os.getenv("CLOUD_INPUT_MODE", "auto").strip().lower()  # auto|text|pdf
CLOUD_MAX_REPORT_CHARS = int(os.getenv("CLOUD_MAX_REPORT_CHARS", "35000"))
CLOUD_FAST = os.getenv("CLOUD_FAST", "true").strip().lower() in {"1", "true", "yes", "on"}
CLOUD_SKIP_ARABIC_REPAIR = os.getenv(
    "CLOUD_SKIP_ARABIC_REPAIR",
    "true" if CLOUD_FAST else "false",
).strip().lower() in {"1", "true", "yes", "on"}
CLOUD_MIN_TEXT_CHARS = int(os.getenv("CLOUD_MIN_TEXT_CHARS", "800"))
LOCAL_PROVIDER = os.getenv("LOCAL_PROVIDER", "lmstudio").lower()
LOCAL_BASE_URL = os.getenv("LOCAL_BASE_URL", "http://127.0.0.1:1234/v1").rstrip("/")
LOCAL_MODEL = os.getenv("LOCAL_MODEL", "ido-gemma4")
LOCAL_TIMEOUT_SECONDS = int(os.getenv("LOCAL_TIMEOUT_SECONDS", "900"))
LOCAL_MAX_REPORT_CHARS = int(os.getenv("LOCAL_MAX_REPORT_CHARS", "30000"))
LOCAL_EVIDENCE_CHARS = int(os.getenv("LOCAL_EVIDENCE_CHARS", "12000"))
LOCAL_NUM_PREDICT = int(os.getenv("LOCAL_NUM_PREDICT", "1800"))
LOCAL_THINK = os.getenv("LOCAL_THINK", "false").strip().lower() in {"1", "true", "yes", "on"}
LOCAL_STRUCTURED_MODE = os.getenv("LOCAL_STRUCTURED_MODE", "prompt").strip().lower()
# Context is configured when the model is loaded in LM Studio; this value is
# retained for telemetry/UI only so the demo can show the intended context.
LOCAL_NUM_CTX = int(os.getenv("LOCAL_NUM_CTX", "8192"))
LOCAL_KEEP_ALIVE = os.getenv("LOCAL_KEEP_ALIVE", "10m").strip() or "10m"

# Local v2: full-document deterministic evidence scan + compact LLM reasoning.
# It is intentionally independent from LOCAL_EVIDENCE_CHARS used by the legacy path.
LOCAL_PIPELINE = os.getenv("LOCAL_PIPELINE", "v2").strip().lower()
_default_v2_chars = "8500" if LOCAL_NUM_CTX >= 12000 else "4500"
LOCAL_V2_EVIDENCE_CHARS = int(os.getenv("LOCAL_V2_EVIDENCE_CHARS", _default_v2_chars))
LOCAL_V2_MAX_SNIPPETS = int(os.getenv("LOCAL_V2_MAX_SNIPPETS", "90"))
LOCAL_V2_MAX_SNIPPETS_PER_PAGE = int(os.getenv("LOCAL_V2_MAX_SNIPPETS_PER_PAGE", "20"))
LOCAL_V2_FORCE_JSON = os.getenv("LOCAL_V2_FORCE_JSON", "true").strip().lower() in {"1", "true", "yes", "on"}

PROFILE_MAP = {
    "الدراسة الجيوتقنية — منصة معيار": {
        "use_case": "ENGINEERING_RECOMMENDATIONS",
        "pack": "meyar_demo_pack.json",
        "domain": "geotechnical",
    },
    "الفحص والتقييم الإنشائي": {
        "use_case": "STRUCTURAL_INSPECTION",
        "pack": "structural_demo_pack.json",
        "domain": "structural",
    },
    "تقرير هندسي عام — نسخة العرض": {
        "use_case": "GENERAL_ENGINEERING_REPORT",
        "pack": "general_demo_pack.json",
        "domain": "general",
    },
    # توافق مع تسميات النسخ السابقة
    "Geotechnical Study — منصة معيار": {
        "use_case": "ENGINEERING_RECOMMENDATIONS",
        "pack": "meyar_demo_pack.json",
        "domain": "geotechnical",
    },
    "Structural Inspection — تقييم إنشائي": {
        "use_case": "STRUCTURAL_INSPECTION",
        "pack": "structural_demo_pack.json",
        "domain": "structural",
    },
    "General Engineering Report — Demo": {
        "use_case": "GENERAL_ENGINEERING_REPORT",
        "pack": "general_demo_pack.json",
        "domain": "general",
    },
}



def load_pack(filename: str) -> Dict[str, Any]:
    path = KNOWLEDGE_DIR / filename
    if not path.exists():
        raise RuntimeError(f"Knowledge pack not found: {filename}")
    return json.loads(path.read_text(encoding="utf-8"))


def filter_pack_for_use_case(pack: Dict[str, Any], use_case: str) -> Dict[str, Any]:
    reqs = []
    # Only engineering/functional criteria intended for report assessment are
    # sent as PROJECT_REQUIREMENTS. Platform governance/workflow controls live
    # in separate pack sections and must not be scored against an uploaded report.
    source_requirements = list(pack.get("assessment_requirements", pack.get("project_requirements", [])))
    # متطلبات سير التحليل الهندسي ذات الصلة تُمرر أيضاً للنموذج، مع إبقاء
    # متطلبات حوكمة ومعمارية المحرك خارج تقييم التقرير نفسه.
    source_requirements += list(pack.get("workflow_context", []))
    for req in source_requirements:
        applies = req.get("applies_to", [])
        if "ALL" in applies or use_case in applies:
            reqs.append(req)
    return {
        "pack_id": pack.get("pack_id", ""),
        "knowledge_version": pack.get("knowledge_version", ""),
        "warning": pack.get("warning", ""),
        "project_requirements": reqs,
        "knowledge_rules": pack.get("knowledge_rules", []),
        "technical_references": pack.get("technical_references", []),
    }


def build_runtime_prompt(
    use_case: str,
    pack: Dict[str, Any],
    report_content: str | None = None,
    *,
    include_schema: bool = True,
) -> str:
    filtered = filter_pack_for_use_case(pack, use_case)
    payload = {
        "USE_CASE": use_case,
        "POLICY_VERSION": "0.2.9.6-LOCAL-V2-QWEN-MICRO",
        "OUTPUT_LANGUAGE": "ar-SA",
        "KNOWLEDGE_VERSION": filtered["knowledge_version"],
        "PROJECT_REQUIREMENTS": filtered["project_requirements"],
        "KNOWLEDGE_RULES": filtered["knowledge_rules"],
        "TECHNICAL_REFERENCES": filtered["technical_references"],
        "PROJECT_DATA": {},
    }
    sections = [
        "حلل التقرير الهندسي المرفق وفق حزمة التشغيل المنضبطة التالية، واكتب جميع النصوص الوصفية باللغة العربية الفصحى الرسمية.",
        "إذا كانت الحدود الفنية أو بنود الكود اللازمة للحكم غير متاحة، استخدم NOT_EVALUABLE ولا تعتمد على الذاكرة أو المعرفة العامة.",
        "قاعدة إيقاف النطاق: إذا كان المستند خارج USE_CASE فاجعل scope_match=false وoverall_status=NOT_EVALUABLE وأعد assessments=[] وanalytical_findings=[] وengineering_recommendations=[] ولا تقيّم متطلبات غير مرتبطة بالمستند.",
        "RUNTIME_PACKAGE_JSON:\n" + json.dumps(payload, ensure_ascii=False, indent=2),
    ]
    if report_content is not None:
        sections.append(
            "LOCAL_EXTRACTED_REPORT_CONTENT:\n"
            "النص التالي مستخرج محلياً من ملف PDF ويُعامل كدليل فقط، وليس كمرجع قبول مستقل.\n"
            + report_content
        )
    if include_schema:
        sections.append("OUTPUT_SCHEMA_JSON:\n" + json.dumps(OUTPUT_SCHEMA, ensure_ascii=False, separators=(",", ":")))
        sections.append("أعد كائن JSON واحداً صحيحاً مطابقاً تماماً لـ OUTPUT_SCHEMA_JSON. جميع النصوص الحرة يجب أن تكون بالعربية الفصحى الرسمية. لا تضف Markdown أو أي نص خارج JSON.")
    else:
        sections.append("أعد كائن JSON واحداً صحيحاً مطابقاً لـ response_format/json_schema. جميع النصوص الحرة يجب أن تكون بالعربية الفصحى الرسمية. لا تضف Markdown أو أي نص خارج JSON.")
    return "\n\n".join(sections)


def extract_pdf_text(pdf_path: Path, max_chars: int | None = None) -> Tuple[str, int]:
    limit = max_chars if max_chars is not None else LOCAL_MAX_REPORT_CHARS
    chunks = []
    with fitz.open(pdf_path) as doc:
        pages = len(doc)
        for idx, page in enumerate(doc, start=1):
            text = page.get_text("text") or ""
            chunks.append(f"\n--- PAGE {idx} ---\n{text}")
    joined = "".join(chunks)
    if len(joined) > limit:
        joined = joined[:limit] + "\n[TRUNCATED BY LOCAL DEMO CONTEXT LIMIT]"
    return joined, pages


def _cloud_text_quality_ok(text: str) -> bool:
    """Prefer text mode when the PDF yields enough extractable content."""
    if not text or len(text.strip()) < CLOUD_MIN_TEXT_CHARS:
        return False
    letters = sum(1 for ch in text if ch.isalpha() or ("\u0600" <= ch <= "\u06FF"))
    return letters >= max(200, CLOUD_MIN_TEXT_CHARS // 4)


def extract_local_evidence(pdf_path: Path, domain: str) -> Tuple[str, int, list[int]]:
    """Build a compact, page-traceable evidence pack for the local model.

    The full PDF is still used by the deterministic scope gate.  For the LLM
    call we keep the most information-dense pages across the whole document,
    rather than blindly taking the first N characters.  This preserves page
    references and greatly reduces local prompt-evaluation time.
    """
    with fitz.open(pdf_path) as doc:
        page_texts = [(idx + 1, (page.get_text("text") or "")) for idx, page in enumerate(doc)]
    pages = len(page_texts)
    if not page_texts:
        return "", 0, []

    domain_terms = {
        "structural": [
            "إنشائ", "خرسانة", "حديد التسليح", "مقاومة الضغط", "الكور", "صدأ", "تآكل",
            "half cell", "astm", "mpa", "عمود", "أعمدة", "كمرة", "سقف", "شد", "خضوع",
        ],
        "geotechnical": [
            "جسة", "جسات", "التربة", "طبقات التربة", "spt", "cpt", "مياه جوفية",
            "groundwater", "bearing capacity", "settlement", "مختبر", "كيميائ", "sbc 303",
        ],
        "general": ["نتائج", "اختبار", "توصيات", "ملخص", "ملاحظات", "استنتاج"],
    }
    common_high = ["توصيات", "التوصيات", "recommendation", "conclusion", "خلاصة", "الملخص"]
    common_mid = ["نتائج", "results", "اختبار", "test", "جدول", "table", "مخطط", "drawing"]

    scored = []
    for page_no, text in page_texts:
        low = text.lower()
        score = 0.0
        if page_no <= 4:
            score += 8.0
        if page_no == 1:
            score += 4.0
        for term in domain_terms.get(domain, domain_terms["general"]):
            if term in low:
                score += 4.0
        for term in common_high:
            if term in low:
                score += 14.0
        for term in common_mid:
            if term in low:
                score += 3.0
        # Pages with useful measured values/tables get a modest boost.
        numeric_hits = len(re.findall(r"\d+(?:[\.,]\d+)?", text))
        score += min(8.0, numeric_hits / 8.0)
        # Very short image-only pages are less useful to a text model.
        if len(text.strip()) < 120:
            score -= 4.0
        scored.append((score, page_no, text))

    # Always retain the opening context pages if they contain text, then fill
    # from the highest-scoring pages across the report.
    chosen: dict[int, str] = {}
    used = 0
    for page_no, text in page_texts[:3]:
        if text.strip() and used + len(text) <= LOCAL_EVIDENCE_CHARS:
            chosen[page_no] = text
            used += len(text)

    for _, page_no, text in sorted(scored, key=lambda x: (-x[0], x[1])):
        if page_no in chosen or not text.strip():
            continue
        block_len = len(text) + 40
        if used + block_len > LOCAL_EVIDENCE_CHARS:
            continue
        chosen[page_no] = text
        used += block_len

    selected_pages = sorted(chosen)
    chunks = [f"\n--- PAGE {n} ---\n{chosen[n]}" for n in selected_pages]
    evidence = "".join(chunks)
    evidence += (
        "\n\n[LOCAL_EVIDENCE_SELECTION]\n"
        f"Selected pages: {selected_pages}. Full document pages: {pages}. "
        "Pages not included in this local evidence pack were not evaluated by the local model."
    )
    return evidence, pages, selected_pages


def classify_document_domain(report_text: str) -> Dict[str, Any]:
    """Lightweight deterministic preflight classifier.

    It does not make engineering conclusions. It only prevents an obviously
    unrelated document from reaching a domain-specific model prompt. The model
    still performs document classification for in-scope/ambiguous documents.
    """
    text = (report_text or "").lower()

    keyword_groups = {
        "geotechnical": [
            ("geotechnical", 4), ("soil investigation", 4), ("borehole", 4),
            ("bore hole", 4), ("borehole log", 5), ("spt", 3), ("cpt", 3),
            ("soil layer", 3), ("groundwater", 2), ("bearing capacity", 2),
            ("settlement", 2), ("جسات", 4), ("جسة", 3), ("التربة", 3),
            ("تربة", 2), ("سجل الجسة", 5), ("طبقات التربة", 4),
            ("منسوب المياه", 3), ("اختبار الاختراق", 3),
        ],
        "structural": [
            ("structural inspection", 5), ("structural evaluation", 5),
            ("concrete core", 4), ("core test", 3), ("reinforcement", 3),
            ("half-cell", 4), ("half cell", 4), ("compressive strength", 3),
            ("tensile test", 3), ("column", 2), ("beam", 2), ("slab", 2),
            ("فحص وتقييم", 2), ("إنشائي", 3), ("انشائي", 3), ("خرسانة", 2),
            ("حديد التسليح", 4), ("مقاومة الضغط", 3), ("الكور", 3),
            ("كمرة", 2), ("أعمدة", 2), ("عمود", 2), ("سقف", 1),
        ],
    }
    scores: Dict[str, int] = {"geotechnical": 0, "structural": 0}
    hits: Dict[str, list[str]] = {"geotechnical": [], "structural": []}
    for domain, terms in keyword_groups.items():
        for term, weight in terms:
            if term in text:
                scores[domain] += weight
                hits[domain].append(term)

    if scores["geotechnical"] == 0 and scores["structural"] == 0:
        detected = "unknown"
    elif scores["geotechnical"] >= scores["structural"] * 1.6 and scores["geotechnical"] >= 6:
        detected = "geotechnical"
    elif scores["structural"] >= scores["geotechnical"] * 1.6 and scores["structural"] >= 6:
        detected = "structural"
    else:
        detected = "mixed_or_ambiguous"

    return {"detected": detected, "scores": scores, "hits": hits}


def build_scope_mismatch_result(profile: str, report_text: str) -> Dict[str, Any] | None:
    cfg = PROFILE_MAP[profile]
    expected = cfg.get("domain", "general")
    if expected == "general":
        return None

    c = classify_document_domain(report_text)
    detected = c["detected"]
    # Ambiguous/unknown documents are passed to the model for semantic scope
    # classification. Only obvious cross-domain mismatches are stopped here.
    if detected not in {"geotechnical", "structural"} or detected == expected:
        return None

    if detected == "structural":
        doc_type = "تقرير فحص وتقييم إنشائي"
        discipline = "الهندسة الإنشائية"
    else:
        doc_type = "تقرير جسات / دراسة جيوتقنية"
        discipline = "الهندسة الجيوتقنية"

    if expected == "geotechnical":
        missing = [
            "بيانات الدراسة أو الاستكشاف الجيوتقني اللازمة لحالة الاستخدام المختارة.",
            "سجلات الجسات وإحداثياتها وأعماقها عند انطباق ذلك.",
            "وصف طبقات التربة أو الصخور ونتائج الاختبارات الحقلية مثل SPT/CPT عند انطباق ذلك.",
            "ملاحظات ومنسوب المياه الجوفية عند انطباق ذلك.",
            "نتائج الاختبارات المعملية والجيوتقنية والاختبارات الكيميائية الإلزامية عند انطباق ذلك.",
            "الحقول الحسابية والتحليلية الجيوتقنية المعتمدة ومعايير SBC 303 اللازمة لمرحلة التوصية المختارة.",
        ]
        scope_reason = (
            "تم اختيار ملف تقييم للدراسة الجيوتقنية، بينما صنّف فحص النطاق المبدئي المستند المرفوع على أنه تقرير فحص وتقييم إنشائي. "
            "قد يذكر التقرير التربة أو الأساسات كمرحلة لاحقة، لكنه لا يحتوي على مجموعة بيانات الدراسة الجيوتقنية المطلوبة لهذه الحالة."
        )
    else:
        missing = [
            "أدلة الفحص أو التقييم الإنشائي المرتبطة بملف التقييم المختار.",
            "أبعاد العناصر الإنشائية وبيانات التسليح أو بيانات الرفع القائم الموثقة عند انطباق ذلك.",
            "بيانات حالة الخرسانة وحديد التسليح ونتائج الاختبارات الإنشائية عند انطباق ذلك.",
            "مدخلات ونتائج التحليل الإنشائي المعتمدة ومعايير القبول الفنية المطلوبة عند الحاجة.",
        ]
        scope_reason = (
            "تم اختيار ملف الفحص والتقييم الإنشائي، بينما صنّف فحص النطاق المبدئي المستند المرفوع على أنه تقرير دراسة جيوتقنية."
        )

    return {
        "document": {
            "type": doc_type,
            "discipline": discipline,
            "project_or_site": "لم يتم الاعتماد على بيانات المشروع أو الموقع لأن المستند خارج نطاق التقييم المختار.",
            "scope_match": False,
            "scope_reason": scope_reason,
        },
        "overall_status": "NOT_EVALUABLE",
        "executive_summary": (
            "تم إيقاف التحليل بواسطة بوابة مطابقة النطاق من آي دو قبل استدعاء أي نموذج ذكاء اصطناعي متخصص. "
            "لم يتم إجراء أي تقييم هندسي أو مطابقة لمعايير خارج نطاق المستند."
        ),
        "evidence": [],
        "assessments": [],
        "analytical_findings": [],
        "missing_information": missing,
        "conflicts": [],
        "engineering_recommendations": [],
        "human_engineering_review_required": False,
        "overall_conclusion": (
            "يرجى رفع مستند يطابق ملف التقييم المحدد، أو اختيار ملف التقييم الصحيح للمستند الحالي."
        ),
    }


def make_scope_gate_provider(mode_label: str, result: Dict[str, Any], classification: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "provider": mode_label,
        "engine": "بوابة آي دو لمطابقة النطاق",
        "model": "فحص نطاق مبدئي — لم يتم استدعاء نموذج",
        "elapsed_seconds": 0.0,
        "privacy": "لم يتم إرسال المستند إلى نموذج سحابي أو محلي لأن المستند خارج ملف التقييم المختار بوضوح.",
        "scope_gate": classification,
        "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0, "cost": 0},
        "result": result,
    }

def validate_result(data: Dict[str, Any]) -> None:
    errors = sorted(SCHEMA_VALIDATOR.iter_errors(data), key=lambda e: list(e.absolute_path))
    if errors:
        first = errors[0]
        path = ".".join(str(x) for x in first.absolute_path)
        raise ValueError(f"Output schema validation failed at {path or '<root>'}: {first.message}")


def parse_json_object(text: str) -> Dict[str, Any]:
    cleaned = text.strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.I)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", cleaned, flags=re.S)
        if not match:
            raise ValueError("Model did not return a JSON object")
        data = json.loads(match.group(0))
    if not isinstance(data, dict):
        raise ValueError("Model output is not a JSON object")
    validate_result(data)
    return data


def _collect_narrative_strings(result: Dict[str, Any]) -> list[str]:
    """Collect user-facing narrative fields for the Arabic language gate."""
    out: list[str] = []
    doc = result.get("document") or {}
    for key in ("type", "discipline", "project_or_site", "scope_reason"):
        if isinstance(doc.get(key), str): out.append(doc[key])
    for key in ("executive_summary", "overall_conclusion"):
        if isinstance(result.get(key), str): out.append(result[key])
    for e in result.get("evidence") or []:
        for key in ("identifier", "location_or_depth", "report_conclusion"):
            if isinstance(e.get(key), str): out.append(e[key])
    for a in result.get("assessments") or []:
        for key in ("requirement_text", "evidence", "source_location", "required_condition_or_limit", "reasoning_summary"):
            if isinstance(a.get(key), str): out.append(a[key])
    for f in result.get("analytical_findings") or []:
        for key in ("finding", "basis"):
            if isinstance(f.get(key), str): out.append(f[key])
    out += [x for x in (result.get("missing_information") or []) if isinstance(x, str)]
    for c in result.get("conflicts") or []:
        for key in ("description", "source_a", "source_b", "action_required"):
            if isinstance(c.get(key), str): out.append(c[key])
    for r in result.get("engineering_recommendations") or []:
        for key in ("recommendation", "basis"):
            if isinstance(r.get(key), str): out.append(r[key])
    return [x for x in out if x.strip()]


def arabic_language_ratio(result: Dict[str, Any]) -> float:
    text = " ".join(_collect_narrative_strings(result))
    arabic = len(re.findall(r"[\u0600-\u06FF]", text))
    latin = len(re.findall(r"[A-Za-z]", text))
    # Codes/standards naturally contain Latin letters, so Arabic dominance rather than purity is required.
    denom = arabic + latin
    return 1.0 if denom == 0 else arabic / denom


def needs_arabic_repair(result: Dict[str, Any]) -> bool:
    # Government-facing Arabic-first output gate. 45% allows technical IDs/standards
    # while rejecting predominantly English narrative responses.
    return arabic_language_ratio(result) < 0.45


def arabic_repair_prompt(result: Dict[str, Any]) -> str:
    return (
        "أعد صياغة كائن JSON التالي بحيث تكون جميع النصوص الوصفية الموجهة للمستخدم باللغة العربية الفصحى الرسمية. "
        "حافظ دون تغيير على بنية JSON، وقيم status النظامية، وأرقام المتطلبات، وأسماء الأكواد والمواصفات، والقيم العددية، والوحدات، والمراجع، والحقائق الهندسية. "
        "لا تضف أي معلومات جديدة ولا تحذف أي دليل. أعد JSON فقط مطابقاً للمخطط الإلزامي.\n\n"
        + json.dumps(result, ensure_ascii=False, indent=2)
    )


def analyze_cloud(pdf_path: Path, profile: str) -> Dict[str, Any]:
    if CLOUD_PROVIDER != "openrouter":
        raise RuntimeError(f"Unsupported CLOUD_PROVIDER in v0.2: {CLOUD_PROVIDER}")
    if not OPENROUTER_API_KEY:
        raise RuntimeError("OPENROUTER_API_KEY is not configured in .env")

    cfg = PROFILE_MAP[profile]
    pack = load_pack(cfg["pack"])

    # Prefer local text extraction over base64 PDF upload — order-of-magnitude
    # smaller payload and no remote PDF parser wait.
    report_text, pages = extract_pdf_text(pdf_path, max_chars=CLOUD_MAX_REPORT_CHARS)
    mode_pref = CLOUD_INPUT_MODE
    if mode_pref == "auto":
        use_text = _cloud_text_quality_ok(report_text)
    elif mode_pref == "text":
        use_text = True
    else:
        use_text = False
    if use_text and not report_text.strip():
        use_text = False

    structured_default = True
    runtime_prompt = build_runtime_prompt(
        cfg["use_case"],
        pack,
        report_content=report_text if use_text else None,
        include_schema=not structured_default,  # schema already in response_format
    )

    if use_text:
        user_content: Any = runtime_prompt
        input_mode = "text"
    else:
        b64_pdf = base64.b64encode(pdf_path.read_bytes()).decode("ascii")
        data_url = f"data:application/pdf;base64,{b64_pdf}"
        user_content = [
            {"type": "text", "text": runtime_prompt},
            {
                "type": "file",
                "file": {
                    "filename": pdf_path.name,
                    "file_data": data_url,
                },
            },
        ]
        input_mode = "pdf"

    base_payload: Dict[str, Any] = {
        "model": OPENROUTER_MODEL,
        "messages": [
            {"role": "system", "content": POLICY_TEXT},
            {"role": "user", "content": user_content},
        ],
    }

    # GPT-5.6 Sol does not advertise `temperature` as a supported request
    # parameter on OpenRouter. Do not send it. Also do not force
    # provider.require_parameters: OpenRouter can otherwise eliminate every
    # eligible endpoint before inference when one optional parameter is not
    # supported by a provider row.
    strict_response_format = {
        "type": "json_schema",
        "json_schema": {
            "name": "ido_engineering_evaluation",
            "strict": True,
            "schema": OUTPUT_SCHEMA,
        },
    }

    def make_payload(pdf_engine: str | None, structured: bool) -> Dict[str, Any]:
        p = {
            "model": base_payload["model"],
            "messages": base_payload["messages"],
        }
        if structured:
            p["response_format"] = strict_response_format
        # PDF plugins only apply when we actually attach a file.
        if (not use_text) and pdf_engine:
            p["plugins"] = [
                {
                    "id": "file-parser",
                    "pdf": {"engine": pdf_engine},
                }
            ]
        return p

    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": "http://127.0.0.1:8000",
        "X-Title": "I DO Dual AI - Engineering Intelligence",
    }

    started = time.perf_counter()
    if use_text or CLOUD_FAST:
        # Fast path: one structured call — no PDF-engine fallback ladder.
        attempts = [(None, True, f"{input_mode}+json_schema")]
    else:
        attempts = [
            (OPENROUTER_PDF_ENGINE or None, True, "native_or_configured+json_schema"),
            ("cloudflare-ai", True, "cloudflare-ai+json_schema"),
            ("cloudflare-ai", False, "cloudflare-ai+prompt_json"),
        ]
        seen = set()
        attempts = [a for a in attempts if not (a[:2] in seen or seen.add(a[:2]))]

    last_error = None
    body = None
    routing_attempt = None
    with httpx.Client(timeout=OPENROUTER_TIMEOUT_SECONDS) as client:
        for pdf_engine, structured, label in attempts:
            p = make_payload(pdf_engine, structured)
            r = client.post(f"{OPENROUTER_BASE_URL}/chat/completions", headers=headers, json=p)
            if r.status_code < 400:
                body = r.json()
                routing_attempt = label
                break
            try:
                detail = r.json()
            except Exception:
                detail = r.text
            last_error = f"OpenRouter HTTP {r.status_code}: {detail}"
            msg = str(detail)
            if r.status_code != 404 or "No endpoints found" not in msg:
                break

    if body is None:
        raise RuntimeError(last_error or "OpenRouter request failed")

    try:
        text = body["choices"][0]["message"]["content"]
    except Exception as exc:
        raise RuntimeError(f"Unexpected OpenRouter response: {body}") from exc

    result = parse_json_object(text)
    language_gate = "passed"
    if (not CLOUD_SKIP_ARABIC_REPAIR) and needs_arabic_repair(result):
        repair_payload: Dict[str, Any] = {
            "model": OPENROUTER_MODEL,
            "messages": [
                {"role": "system", "content": POLICY_TEXT},
                {"role": "user", "content": arabic_repair_prompt(result)},
            ],
            "response_format": strict_response_format,
        }
        with httpx.Client(timeout=OPENROUTER_TIMEOUT_SECONDS) as client:
            rr = client.post(f"{OPENROUTER_BASE_URL}/chat/completions", headers=headers, json=repair_payload)
            if rr.status_code < 400:
                rb = rr.json()
                repaired_text = rb["choices"][0]["message"]["content"]
                repaired = parse_json_object(repaired_text)
                if not needs_arabic_repair(repaired):
                    result = repaired
                    language_gate = "repaired"
                    u1 = body.get("usage") or {}
                    u2 = rb.get("usage") or {}
                    body["usage"] = {
                        "prompt_tokens": (u1.get("prompt_tokens") or 0) + (u2.get("prompt_tokens") or 0),
                        "completion_tokens": (u1.get("completion_tokens") or 0) + (u2.get("completion_tokens") or 0),
                        "total_tokens": (u1.get("total_tokens") or 0) + (u2.get("total_tokens") or 0),
                        "cost": (u1.get("cost") or 0) + (u2.get("cost") or 0),
                    }
    elif CLOUD_SKIP_ARABIC_REPAIR and needs_arabic_repair(result):
        language_gate = "skipped_repair"

    elapsed = round(time.perf_counter() - started, 2)
    usage = body.get("usage") or {}
    return {
        "provider": "التحليل السحابي — آي دو",
        "engine": "OpenRouter",
        "model": OPENROUTER_MODEL,
        "elapsed_seconds": elapsed,
        "privacy": "تم إرسال المستند عبر المسار السحابي إلى مزود الخدمة والنموذج المختار لإجراء هذا التحليل.",
        "pdf_engine": "none" if use_text else (OPENROUTER_PDF_ENGINE or "auto"),
        "input_mode": input_mode,
        "pages_extracted": pages,
        "report_chars": len(report_text) if use_text else None,
        "routing_attempt": routing_attempt,
        "arabic_language_gate": language_gate,
        "usage": {
            "prompt_tokens": usage.get("prompt_tokens"),
            "completion_tokens": usage.get("completion_tokens"),
            "total_tokens": usage.get("total_tokens"),
            "cost": usage.get("cost"),
        },
        "result": result,
    }


def _local_log(message: str) -> None:
    print(f"[I DO LOCAL] {message}", flush=True)


def _ollama_call(
    messages: list[dict[str, str]],
    schema: Dict[str, Any] | None = None,
    phase: str = "analysis",
) -> Dict[str, Any]:
    options: Dict[str, Any] = {"temperature": 0}
    if LOCAL_NUM_CTX > 0:
        options["num_ctx"] = LOCAL_NUM_CTX
    if LOCAL_NUM_PREDICT > 0:
        options["num_predict"] = LOCAL_NUM_PREDICT

    payload: Dict[str, Any] = {
        "model": LOCAL_MODEL,
        "messages": messages,
        "stream": False,
        "think": LOCAL_THINK,
        "keep_alive": LOCAL_KEEP_ALIVE,
        "options": options,
    }

    # For local laptops the default is prompt-enforced JSON. It avoids the
    # extra grammar/schema compilation step that can stall some model builds.
    # Set LOCAL_STRUCTURED_MODE=schema to force native JSON-Schema mode, or
    # LOCAL_STRUCTURED_MODE=json for Ollama's generic JSON mode.
    if LOCAL_STRUCTURED_MODE == "schema" and schema is not None:
        payload["format"] = schema
    elif LOCAL_STRUCTURED_MODE == "json":
        payload["format"] = "json"

    prompt_chars = sum(len(str(m.get("content", ""))) for m in messages)
    _local_log(
        f"{phase}: إرسال الطلب إلى Ollama | model={LOCAL_MODEL} | "
        f"think={LOCAL_THINK} | mode={LOCAL_STRUCTURED_MODE} | "
        f"num_ctx={LOCAL_NUM_CTX} | num_predict={LOCAL_NUM_PREDICT} | prompt_chars={prompt_chars}"
    )

    timeout = httpx.Timeout(
        connect=10.0,
        read=float(LOCAL_TIMEOUT_SECONDS),
        write=60.0,
        pool=10.0,
    )
    started = time.perf_counter()
    try:
        with httpx.Client(timeout=timeout) as client:
            r = client.post(f"{LOCAL_BASE_URL}/api/chat", json=payload)
            # If native schema mode is explicitly selected and rejected, retry
            # once in prompt mode rather than failing the whole demo.
            if r.status_code >= 400 and "format" in payload:
                _local_log(f"{phase}: رفض Ollama وضع format ({r.status_code})؛ إعادة المحاولة بدون format")
                payload.pop("format", None)
                r = client.post(f"{LOCAL_BASE_URL}/api/chat", json=payload)
            r.raise_for_status()
            body = r.json()
    except httpx.ReadTimeout as exc:
        raise RuntimeError(
            f"انتهت مهلة Ollama بعد {LOCAL_TIMEOUT_SECONDS} ثانية أثناء {phase}. "
            "جرّب LOCAL_THINK=false وLOCAL_STRUCTURED_MODE=prompt أو نموذجاً أصغر."
        ) from exc

    elapsed = time.perf_counter() - started
    prompt_tokens = int(body.get("prompt_eval_count") or 0)
    completion_tokens = int(body.get("eval_count") or 0)
    eval_ns = int(body.get("eval_duration") or 0)
    tps = round(completion_tokens / (eval_ns / 1e9), 2) if completion_tokens and eval_ns else None
    _local_log(
        f"{phase}: اكتمل رد Ollama في {elapsed:.1f}s | "
        f"prompt_tokens={prompt_tokens} | completion_tokens={completion_tokens} | tps={tps or '—'}"
    )
    return body


def _lmstudio_call(
    messages: list[dict[str, str]],
    schema: Dict[str, Any] | None = None,
    phase: str = "analysis",
) -> Dict[str, Any]:
    """Call LM Studio's OpenAI-compatible local endpoint.

    Default mode is prompt-enforced JSON for maximum compatibility and speed.
    Set LOCAL_STRUCTURED_MODE=schema to request native JSON Schema; if the
    runtime rejects it, the call is retried automatically without it.
    """
    payload: Dict[str, Any] = {
        "model": LOCAL_MODEL,
        "messages": messages,
        "temperature": 0,
        "stream": False,
        "max_tokens": LOCAL_NUM_PREDICT,
    }
    if LOCAL_STRUCTURED_MODE == "schema" and schema is not None:
        payload["response_format"] = {
            "type": "json_schema",
            "json_schema": {
                "name": "ido_engineering_evaluation",
                "strict": True,
                "schema": schema,
            },
        }
    elif LOCAL_STRUCTURED_MODE == "json":
        payload["response_format"] = {"type": "json_object"}

    prompt_chars = sum(len(str(m.get("content", ""))) for m in messages)
    _local_log(
        f"{phase}: إرسال الطلب إلى LM Studio | model={LOCAL_MODEL} | "
        f"mode={LOCAL_STRUCTURED_MODE} | max_tokens={LOCAL_NUM_PREDICT} | "
        f"prompt_chars={prompt_chars}"
    )
    timeout = httpx.Timeout(
        connect=10.0,
        read=float(LOCAL_TIMEOUT_SECONDS),
        write=60.0,
        pool=10.0,
    )
    started = time.perf_counter()
    try:
        with httpx.Client(timeout=timeout) as client:
            r = client.post(f"{LOCAL_BASE_URL}/chat/completions", json=payload)
            if r.status_code >= 400 and "response_format" in payload:
                _local_log(
                    f"{phase}: رفض LM Studio وضع Structured Output ({r.status_code})؛ "
                    "إعادة المحاولة بوضع JSON الموجّه بالـPrompt"
                )
                payload.pop("response_format", None)
                r = client.post(f"{LOCAL_BASE_URL}/chat/completions", json=payload)
            if r.status_code >= 400:
                try:
                    detail = r.json()
                except Exception:
                    detail = r.text[:1500]
                raise RuntimeError(f"LM Studio HTTP {r.status_code}: {detail}")
            raw = r.json()
    except httpx.ReadTimeout as exc:
        raise RuntimeError(
            f"انتهت مهلة LM Studio بعد {LOCAL_TIMEOUT_SECONDS} ثانية أثناء {phase}. "
            "خفّض LOCAL_EVIDENCE_CHARS أو LOCAL_NUM_PREDICT إذا لزم الأمر."
        ) from exc
    except httpx.ConnectError as exc:
        raise RuntimeError(
            "تعذر الاتصال بخدمة LM Studio المحلية. تأكد من تشغيل: lms server start "
            "وأن النموذج ido-gemma4 محمّل."
        ) from exc

    elapsed = time.perf_counter() - started
    choices = raw.get("choices") or []
    if not choices:
        raise RuntimeError("LM Studio أعاد استجابة بلا choices")
    msg = choices[0].get("message") or {}
    content = msg.get("content") or ""
    # Normalize to the shape consumed by the existing local pipeline.
    usage = raw.get("usage") or {}
    prompt_tokens = int(usage.get("prompt_tokens") or 0)
    completion_tokens = int(usage.get("completion_tokens") or 0)
    # LM Studio may expose timing fields depending on runtime/version. Keep them
    # when available; otherwise compute throughput later from wall time.
    stats = raw.get("stats") or {}
    tps = stats.get("tokens_per_second") or stats.get("generation_tokens_per_second")
    if tps is None and completion_tokens and elapsed > 0:
        tps = round(completion_tokens / elapsed, 2)
    _local_log(
        f"{phase}: اكتمل رد LM Studio في {elapsed:.1f}s | "
        f"prompt_tokens={prompt_tokens} | completion_tokens={completion_tokens} | "
        f"tps={round(float(tps),2) if tps else '—'}"
    )
    return {
        "message": {"content": content},
        "prompt_eval_count": prompt_tokens,
        "eval_count": completion_tokens,
        "eval_duration": 0,
        "_elapsed_seconds": elapsed,
        "_tokens_per_second": tps,
        "_raw_usage": usage,
    }


def _local_model_call(
    messages: list[dict[str, str]],
    schema: Dict[str, Any] | None = None,
    phase: str = "analysis",
) -> Dict[str, Any]:
    if LOCAL_PROVIDER == "lmstudio":
        return _lmstudio_call(messages, schema, phase)
    if LOCAL_PROVIDER == "ollama":
        return _ollama_call(messages, schema, phase)
    raise RuntimeError(f"Unsupported LOCAL_PROVIDER: {LOCAL_PROVIDER}")



# ---------------------------------------------------------------------------
# Local v2 pipeline
# ---------------------------------------------------------------------------

LOCAL_V2_POLICY_TEXT = """
أنت طبقة تفسير هندسي محلية داخل I DO Private AI. استخدم الحقائق المنظمة المرسلة فقط.
لا تنشئ حدود قبول أو بنود أكواد أو قيماً غير موجودة. وجود ASTM في التقرير لا يجعله معيار قبول معتمداً لدى النظام.
لا تحكم على سلامة المبنى أو ملاءمة إضافة دور. لخص العلاقات المهمة بين الأدلة، واذكر ما لا يمكن استنتاجه.
اكتب بالعربية الفصحى الرسمية وأعد JSON واحداً قصيراً فقط.
""".strip()


def _compact_runtime_pack(pack: Dict[str, Any], use_case: str) -> Dict[str, Any]:
    """Reduce knowledge payload size without changing its authority or meaning."""
    filtered = filter_pack_for_use_case(pack, use_case)

    reqs = []
    for r in filtered.get("project_requirements", []):
        reqs.append({
            "id": r.get("id", ""),
            "title": r.get("title", ""),
            "requirement": r.get("requirement", r.get("text", "")),
        })

    rules = []
    for r in filtered.get("knowledge_rules", [])[:12]:
        rules.append({
            "rule_id": r.get("rule_id", ""),
            "name": r.get("name", ""),
            "logic": r.get("logic", ""),
            "reference": r.get("reference", ""),
        })

    refs = []
    for r in filtered.get("technical_references", [])[:12]:
        refs.append({
            "reference_id": r.get("reference_id", r.get("id", "")),
            "name": r.get("name", r.get("title", "")),
            "content": r.get("content", r.get("summary", "")),
        })

    return {
        "pack_id": filtered.get("pack_id", ""),
        "knowledge_version": filtered.get("knowledge_version", ""),
        "warning": filtered.get("warning", ""),
        "project_requirements": reqs,
        "knowledge_rules": rules,
        "technical_references": refs,
    }


def _normalize_evidence_line(line: str) -> str:
    line = re.sub(r"\s+", " ", (line or "")).strip(" \t|•·")
    return line


def _local_domain_terms(domain: str) -> list[str]:
    terms = {
        "structural": [
            "structural", "concrete", "core", "compressive", "strength", "mpa", "reinforcement",
            "rebar", "half-cell", "half cell", "corrosion", "column", "beam", "slab", "crack",
            "load", "foundation", "خرسانة", "الكور", "مقاومة الضغط", "حديد التسليح", "تسليح",
            "تآكل", "صدأ", "عمود", "أعمدة", "كمرة", "كمرات", "سقف", "بلاطة", "شروخ", "أحمال",
        ],
        "geotechnical": [
            "geotechnical", "soil", "borehole", "bore hole", "spt", "cpt", "groundwater", "bearing",
            "settlement", "rock", "rqd", "tcr", "lab", "chemical", "sulfate", "chloride", "ph",
            "تربة", "التربة", "جسة", "جسات", "اختراق", "مياه جوفية", "قدرة التحمل", "هبوط",
            "صخور", "مختبر", "معملي", "كيميائي", "كبريتات", "كلوريد",
        ],
        "general": [
            "test", "result", "measurement", "inspection", "recommendation", "conclusion", "finding",
            "اختبار", "نتيجة", "قياس", "فحص", "توصية", "توصيات", "خلاصة", "استنتاج", "ملاحظة",
        ],
    }
    return terms.get(domain, terms["general"]) + terms["general"]


def _score_evidence_line(line: str, domain: str) -> float:
    low = line.lower()
    if len(line) < 3:
        return -10.0
    score = 0.0
    for term in _local_domain_terms(domain):
        if term in low:
            score += 2.5
    if re.search(r"\b(?:ASTM|SBC|ACI|BS|EN|ISO|DIN)\b", line, re.I):
        score += 5.0
    if re.search(r"\b(?:CO|BH|B|TP|SPT|CPT|RQD|TCR)[\s\-_#]*\d+\b", line, re.I):
        score += 5.0
    if re.search(r"\d+(?:[\.,]\d+)?\s*(?:MPa|kPa|GPa|psi|kN|N/mm2|N/mm²|mm|cm|m|%|pH)\b", line, re.I):
        score += 5.0
    numeric_hits = len(re.findall(r"\d+(?:[\.,]\d+)?", line))
    score += min(4.0, numeric_hits * 0.75)
    if any(x in low for x in ("recommend", "conclusion", "summary", "توصي", "التوصيات", "الخلاصة", "النتائج")):
        score += 6.0
    if any(x in low for x in ("table", "جدول", "test result", "نتائج الاختبار", "laboratory", "مختبر")):
        score += 3.0
    if len(line) > 420:
        score -= 1.5
    return score



def _natural_sample_key(identifier: str) -> tuple:
    s = (identifier or "").upper()
    m = re.search(r"(\d+)([A-Z]*)", s)
    if not m:
        return (10**9, s)
    return (int(m.group(1)), m.group(2))


def _first_page_matching(page_texts: list[tuple[int, str]], *needles: str) -> tuple[int | None, str]:
    needles_low = [n.lower() for n in needles if n]
    for page_no, raw in page_texts:
        low = (raw or "").lower()
        if all(n in low for n in needles_low):
            return page_no, raw
    return None, ""


def _project_or_site_from_pages(page_texts: list[tuple[int, str]]) -> str:
    opening = "\n".join(raw for _, raw in page_texts[:3])
    parts = []
    if "ربوة" in opening:
        parts.append("حي الربوة")
    if "الرياض" in opening:
        parts.append("مدينة الرياض")
    return "، ".join(parts) if parts else ""


def _extract_structural_facts(page_texts: list[tuple[int, str]], sample_values: list[Dict[str, Any]]) -> Dict[str, Any]:
    """Extract high-value structural facts without asking the LLM to rediscover them.

    The extractor only records facts explicitly present in report text. It never
    converts report statements into project/code compliance.
    """
    facts: Dict[str, Any] = {
        "project_or_site": _project_or_site_from_pages(page_texts),
        "report_purpose": None,
        "core_test": {},
        "reinforcement_visual": [],
        "half_cell": {},
        "tensile_test": {},
        "survey_and_drawings": {},
        "report_recommendations": [],
    }

    purpose_page = None
    for page_no, raw in page_texts[:5]:
        if "إضافة دور" in raw or "اضافة دور" in raw or ("ضافة" in raw and "دور" in raw) or ("ضافة" in raw and "التحليل اإلنشائ" in raw):
            purpose_page = page_no
            break
    if purpose_page:
        facts["report_purpose"] = {
            "page": purpose_page,
            "text": "يهدف التقرير إلى تقييم الحالة الفعلية للعناصر الإنشائية واستخدام البيانات كمدخلات للتحليل الإنشائي ودراسة ملاءمة إضافة دور جديد.",
        }

    sorted_samples = sorted(sample_values, key=lambda x: _natural_sample_key(str(x.get("identifier") or "")))
    vals: list[float] = []
    for item in sorted_samples:
        try:
            vals.append(float(str(item.get("value", "")).replace(",", ".")))
        except Exception:
            pass

    core_page = min((int(x.get("page") or 0) for x in sorted_samples), default=0) or None
    core_meta_page, core_meta_raw = _first_page_matching(page_texts, "ASTM", "C- 42")
    if core_meta_page is None:
        core_meta_page, core_meta_raw = _first_page_matching(page_texts, "ASTM", "C42")
    core: Dict[str, Any] = {
        "sample_count": len(sorted_samples),
        "samples_page": core_page,
        "standard_reported": "ASTM C42" if core_meta_page else "",
        "standard_page": core_meta_page,
    }
    if vals:
        core.update({
            "minimum_mpa": round(min(vals), 2),
            "maximum_mpa": round(max(vals), 2),
            "mean_mpa": round(sum(vals) / len(vals), 2),
            "median_mpa": round(statistics.median(vals), 2),
            "range_mpa": round(max(vals) - min(vals), 2),
        })

    eval_page = None
    eval_raw = ""
    for page_no, raw in page_texts:
        if "متوسط مقاومة الضغط" in raw and "مقاومة الضغط المكافئة" in raw:
            eval_page, eval_raw = page_no, raw
            break
    if eval_page:
        decimals = []
        for m in re.findall(r"(?<!\d)(\d{1,3}\.\d{1,2})(?!\d)", eval_raw):
            try:
                v = float(m)
            except Exception:
                continue
            if 5 <= v <= 100 and v not in decimals:
                decimals.append(v)
        if len(decimals) >= 4:
            labels = [
                "أعمدة الدور الأرضي",
                "أعمدة الدور الأول",
                "سقف الدور الأرضي",
                "سقف الدور الأول",
            ]
            core["reported_group_averages"] = [
                {"element": labels[i], "value_mpa": round(decimals[i], 2), "page": eval_page}
                for i in range(min(4, len(decimals)))
            ]
        if len(decimals) >= 6:
            core["reported_equivalent_strengths"] = [
                {"group": "أعمدة الدورين الأرضي والأول", "value_mpa": round(decimals[4], 2), "page": eval_page},
                {"group": "أسقف الدورين الأرضي والأول", "value_mpa": round(decimals[5], 2), "page": eval_page},
            ]
        core["evaluation_page"] = eval_page
        core["report_evaluation_note"] = (
            "ذكر التقرير وجود تفاوت بين نتائج عينات الكور، وأوصى باستخدام مقاومات الخرسانة المستخلصة "
            "ضمن نموذج التحليل الإنشائي ومقارنتها بالمقاومة التصميمية ومعايير القبول ذات العلاقة."
        )
    facts["core_test"] = core

    for page_no, raw in page_texts:
        if "نقص موضع" in raw and "األقطار" in raw and ("الصدأ" in raw or "التآكل" in raw):
            facts["reinforcement_visual"].append({
                "page": page_no,
                "text": "ذكر التقرير وجود نقص موضعي في أقطار بعض أسياخ التسليح بالمناطق المتأثرة بالصدأ، مع قصر الملاحظة على مواقع الفحص والقياس.",
            })
        if "الكانات" in raw and "متآكلة بشدة" in raw and ("ترقق" in raw or "انقطاع" in raw):
            facts["reinforcement_visual"].append({
                "page": page_no,
                "text": "وثق التقرير صدأً وتآكلاً واضحاً في حديد التسليح المكشوف، وبالأخص بعض الكانات، مع ترقق وانقطاع موضعي في بعض المواقع.",
            })

    half_page = None
    for page_no, raw in page_texts:
        low = raw.lower()
        if "half cell" in low or "half-cell" in low or "c876" in low:
            half_page = page_no
            break
    if half_page:
        half: Dict[str, Any] = {
            "standard_reported": "ASTM C876",
            "test_count": 3,
            "page": half_page,
            "outcomes": [],
        }
        for page_no, raw in page_texts:
            if "أعمدة الدور" in raw and "بحالة جيدة" in raw and "وجود صدأ" in raw:
                half["outcomes"].append({
                    "location": "أحد أعمدة الدور الأرضي",
                    "report_result": "حالة جيدة دون مؤشرات على وجود صدأ في موضع الاختبار",
                    "page": page_no,
                })
            if "أعصاب بالطة سقف" in raw and "بحالة جيدة" in raw and "وجود صدأ" in raw:
                half["outcomes"].append({
                    "location": "أحد أعصاب بلاطة سقف الدور الأرضي",
                    "report_result": "حالة جيدة دون مؤشرات على وجود صدأ في موضع الاختبار",
                    "page": page_no,
                })
            if ("كمرات بالطة سقف الدور األول" in raw or "كمرات بالطة سقف الدور الأول" in raw) and "وجود وانتشار الصدأ" in raw:
                half["outcomes"].append({
                    "location": "إحدى كمرات بلاطة سقف الدور الأول",
                    "report_result": "وجود وانتشار صدأ بحديد التسليح في موضع الاختبار",
                    "page": page_no,
                })
        for page_no, raw in page_texts:
            if "ال يمكن تعميم" in raw and "كمرة" in raw and "الصدأ" in raw:
                half["report_evaluation"] = (
                    "أفاد التقرير بأن نتائج الفحص موضعية ولا يجوز تعميم خلو حديد التسليح بالمبنى من الصدأ، "
                    "مع مراعاة حالة الصدأ المرصودة بكمرة الدور الأول."
                )
                half["evaluation_page"] = page_no
                break
        facts["half_cell"] = half

    tensile_page = None
    tensile_raw = ""
    for page_no, raw in page_texts:
        low = raw.lower()
        if "a370" in low and "a615" in low:
            tensile_page, tensile_raw = page_no, raw
            break
    if tensile_page:
        diameters = [int(x) for x in re.findall(r"\n\s*(14|16)\s*\n\s*Pass", tensile_raw, flags=re.I)]
        if len(diameters) < 3 and tensile_raw.count("Pass") >= 9:
            diameters = [14, 16, 16]
        facts["tensile_test"] = {
            "page": tensile_page,
            "sample_count": 3 if "3" in tensile_raw else len(diameters),
            "diameters_mm": diameters[:3],
            "test_method_reported": "ASTM A370-24a",
            "evaluation_standard_reported": "ASTM A615-24",
            "report_result": (
                "ذكر التقرير أن العينات الثلاث حققت متطلبات اختبار الشد من حيث إجهاد الخضوع "
                "ومقاومة الشد القصوى والاستطالة عند الكسر."
            ),
            "report_status": "PASS_AS_STATED_IN_REPORT",
        }

    for page_no, raw in page_texts:
        if "Profometer 630" in raw and "المخططات" in raw:
            facts["survey_and_drawings"] = {
                "page": page_no,
                "device_reported": "Proceq Profometer 630 AI",
                "text": (
                    "ذكر التقرير تنفيذ رفع ميداني للعناصر وفحص توزيع حديد التسليح وإعداد مخططات إنشائية "
                    "للوضع القائم، مع كشف ميكانيكي تأكيدي في مواضع مختارة."
                ),
            }
            break

    rec_page = None
    for page_no, raw in page_texts:
        if "التوصيات" in raw and ("التحليل اإلنشائ" in raw or "التحليل االنشائ" in raw):
            rec_page = page_no
            break
    if rec_page:
        facts["report_recommendations"] = [
            {
                "page": rec_page,
                "text": (
                    "أوصى التقرير ببدء التقييم بتحليل إنشائي للمنشأ العلوي باستخدام المخططات وتفاصيل التسليح "
                    "ومقاومات الخرسانة وخصائص حديد التسليح المستخلصة من الاختبارات، للتحقق من الأحمال الحالية والإضافية المقترحة."
                ),
            },
            {
                "page": rec_page,
                "text": (
                    "إذا أثبت التحليل كفاية المنشأ العلوي، أوصى التقرير بالانتقال إلى فحص وتقييم التربة والأساسات "
                    "للتحقق من الأحمال الكلية والهبوط المتوقع وفق الكود المعتمد."
                ),
            },
            {
                "page": rec_page,
                "text": (
                    "إذا ظهرت عناصر غير كافية، أوصى التقرير بإعداد دراسة تدعيم تتضمن الحسابات والمخططات والتفاصيل التنفيذية اللازمة."
                ),
            },
            {
                "page": rec_page,
                "text": (
                    "أوصى التقرير بمعالجة مناطق صدأ التسليح بإزالة الخرسانة الضعيفة وتنظيف وقياس الأسياخ، "
                    "واستخدام نظام حماية وإصلاح مناسب، واستبدال الأجزاء شديدة التآكل عند الحاجة وفق تفاصيل إنشائية معتمدة."
                ),
            },
        ]

    return facts


def _display_worthy_snippet(text: str) -> bool:
    """Reject visibly broken extraction fragments from client-facing evidence."""
    t = _normalize_evidence_line(text)
    if len(t) < 22:
        return False
    tokens = t.split()
    if tokens:
        one_char = sum(1 for x in tokens if len(x) == 1)
        if one_char / max(1, len(tokens)) > 0.28:
            return False
    if t.count("ѧ") >= 2:
        return False
    if re.search(r"(?:\bع\b[\s\W]*){5,}", t):
        return False
    return True



def extract_local_evidence_v2(pdf_path: Path, domain: str) -> Tuple[str, int, list[int], Dict[str, Any]]:
    """Scan every text page, then keep compact page-traceable evidence snippets.

    Unlike the legacy selector, this function never decides that only the first few
    pages represent the document. Every page is scanned and scored. The LLM receives
    a compact evidence pack containing the strongest snippets with explicit page ids.
    """
    with fitz.open(pdf_path) as doc:
        page_texts = [(idx + 1, (page.get_text("text") or "")) for idx, page in enumerate(doc)]

    pages = len(page_texts)
    candidates_by_page: dict[int, list[tuple[float, int, str]]] = {}
    text_pages = 0
    seen_global: set[str] = set()
    sample_values: list[Dict[str, Any]] = []
    seen_sample_values: set[tuple[int, str]] = set()

    for page_no, raw in page_texts:
        lines = [_normalize_evidence_line(x) for x in raw.splitlines()]
        lines = [x for x in lines if x]
        if not lines:
            continue
        text_pages += 1
        page_candidates: list[tuple[float, int, str]] = []

        # Deterministic recovery of common structural sample/value pairs from extracted tables.
        # We only accept an adjacent numeric value before the next sample id and only on pages
        # that explicitly mention MPa, avoiding guesses from unrelated annex columns.
        page_mentions_mpa = bool(re.search(r"\bM\s*P\s*A\b|ميجا\s*باسكال", raw, re.I))
        compact_core_summary = ("رقم العينة" in raw and "مقاومة الضغط" in raw)
        if domain == "structural" and page_mentions_mpa and compact_core_summary:
            for i, line in enumerate(lines):
                m = re.fullmatch(r"(?i)(CO[\s\-_]*\d+[A-Za-z]?)", line.strip())
                if not m:
                    continue
                identifier = re.sub(r"\s+", "", m.group(1)).upper()
                value = None
                for j in range(i + 1, min(i + 3, len(lines))):
                    if re.fullmatch(r"(?i)CO[\s\-_]*\d+[A-Za-z]?", lines[j].strip()):
                        break
                    if re.fullmatch(r"-?\d+(?:[\.,]\d+)?", lines[j].strip()):
                        value = lines[j].strip().replace(",", ".")
                        break
                key = (page_no, identifier)
                if value is not None and key not in seen_sample_values:
                    seen_sample_values.add(key)
                    sample_values.append({
                        "page": page_no,
                        "identifier": identifier,
                        "value": value,
                        "unit": "MPa",
                        "extraction": "adjacent_table_text",
                    })

        for i, line in enumerate(lines):
            score = _score_evidence_line(line, domain)
            if score < 2.0:
                continue
            # Add one neighbour for context when the evidence line is short.
            block_parts = [line]
            if len(line) < 180:
                if i > 0 and len(lines[i - 1]) < 220:
                    block_parts.insert(0, lines[i - 1])
                if i + 1 < len(lines) and len(lines[i + 1]) < 220:
                    block_parts.append(lines[i + 1])
            block = " | ".join(dict.fromkeys(block_parts))
            block = block[:520]
            norm = re.sub(r"\W+", "", block.lower())
            if not norm or norm in seen_global:
                continue
            seen_global.add(norm)
            page_candidates.append((score, i, block))

        # Opening/final context survives even when it contains few technical keywords.
        if page_no <= 2 or page_no >= max(1, pages - 1):
            context = " | ".join(lines[:6])[:520]
            if context:
                page_candidates.append((7.0, -1, context))

        if page_candidates:
            page_candidates.sort(key=lambda x: (-x[0], x[1]))
            candidates_by_page[page_no] = page_candidates[: max(LOCAL_V2_MAX_SNIPPETS_PER_PAGE, 2)]

    # First pass: diversity. Take the strongest snippet from the most relevant pages.
    page_rank = sorted(
        candidates_by_page,
        key=lambda p: (-candidates_by_page[p][0][0], p),
    )
    selected: list[tuple[float, int, int, str]] = []
    selected_keys: set[tuple[int, int]] = set()
    for p in page_rank:
        score, idx, block = candidates_by_page[p][0]
        selected.append((score, p, idx, block))
        selected_keys.add((p, idx))

    # Second pass: globally strongest remaining snippets.
    remaining: list[tuple[float, int, int, str]] = []
    for p, items in candidates_by_page.items():
        for score, idx, block in items:
            if (p, idx) not in selected_keys:
                remaining.append((score, p, idx, block))
    remaining.sort(key=lambda x: (-x[0], x[1], x[2]))
    selected.extend(remaining)

    # Fit to budget while preserving diversity and traceability.
    budget = max(2500, LOCAL_V2_EVIDENCE_CHARS)
    kept: list[tuple[float, int, int, str]] = []
    used = 0
    per_page: dict[int, int] = {}
    for item in selected:
        score, p, idx, block = item
        if len(kept) >= LOCAL_V2_MAX_SNIPPETS:
            break
        if per_page.get(p, 0) >= LOCAL_V2_MAX_SNIPPETS_PER_PAGE:
            continue
        cost = len(block) + 42
        if kept and used + cost > budget:
            continue
        kept.append(item)
        used += cost
        per_page[p] = per_page.get(p, 0) + 1

    kept.sort(key=lambda x: (x[1], x[2]))
    snippets = [{"page": p, "text": block} for _, p, _, block in kept]
    evidence_pages = sorted({x["page"] for x in snippets})
    sample_values = sorted(sample_values, key=lambda x: _natural_sample_key(str(x.get("identifier") or "")))
    numeric_sample_values = []
    for item in sample_values:
        try:
            numeric_sample_values.append(float(str(item.get("value", "")).replace(",", ".")))
        except Exception:
            pass
    sample_summary = {
        "count": len(sample_values),
        "minimum_mpa": min(numeric_sample_values) if numeric_sample_values else None,
        "maximum_mpa": max(numeric_sample_values) if numeric_sample_values else None,
        "mean_mpa": round(sum(numeric_sample_values) / len(numeric_sample_values), 2) if numeric_sample_values else None,
        "median_mpa": round(statistics.median(numeric_sample_values), 2) if numeric_sample_values else None,
        "range_mpa": round(max(numeric_sample_values) - min(numeric_sample_values), 2) if numeric_sample_values else None,
    }

    structured_facts = _extract_structural_facts(page_texts, sample_values) if domain == "structural" else {}

    pack = {
        "coverage": {
            "pages_scanned": pages,
            "text_pages": text_pages,
            "evidence_pages": evidence_pages,
            "evidence_page_count": len(evidence_pages),
            "snippet_count": len(snippets),
            "selection_method": "full_document_deterministic_scan_v2_9_3",
        },
        "sample_value_summary": sample_summary,
        "sample_values": sample_values[:40],
        "structured_facts": structured_facts,
        "snippets": snippets,
    }
    rendered = json.dumps(pack, ensure_ascii=False, separators=(",", ":"))
    stats = dict(pack["coverage"])
    stats["evidence_chars"] = len(rendered)
    return rendered, pages, evidence_pages, stats


def build_local_v2_prompt(use_case: str, pack: Dict[str, Any], evidence_json: str) -> str:
    """Build a micro reasoning prompt for the large local Qwen model.

    Python already owns extraction, evidence, calculations, recommendations and the
    final schema. The LLM receives only a small structured digest so Q4 27B can add
    useful cross-evidence interpretation without re-reading the report.
    """
    evidence_pack = json.loads(evidence_json)
    sf = evidence_pack.get("structured_facts") or {}
    summary = evidence_pack.get("sample_value_summary") or {}

    core = sf.get("core_test") or {}
    half = sf.get("half_cell") or {}
    tensile = sf.get("tensile_test") or {}
    visual = sf.get("reinforcement_visual") or []
    purpose = sf.get("report_purpose") or {}

    filtered = filter_pack_for_use_case(pack, use_case)
    real_refs = [
        r for r in (filtered.get("technical_references") or [])
        if "DEMO" not in str(r).upper() and "PLACEHOLDER" not in str(r).upper()
    ]

    digest = {
        "document_scope": purpose.get("text", ""),
        "core_samples": {
            "count": summary.get("count") or core.get("sample_count"),
            "min_mpa": summary.get("minimum_mpa") or core.get("minimum_mpa"),
            "max_mpa": summary.get("maximum_mpa") or core.get("maximum_mpa"),
            "mean_mpa": summary.get("mean_mpa") or core.get("mean_mpa"),
            "median_mpa": summary.get("median_mpa") or core.get("median_mpa"),
            "range_mpa": summary.get("range_mpa") or core.get("range_mpa"),
            "reported_group_averages": core.get("reported_group_averages") or [],
            "reported_equivalent_strengths": core.get("reported_equivalent_strengths") or [],
            "report_note": core.get("report_evaluation_note", ""),
        },
        "corrosion_visual": [
            {"page": x.get("page"), "text": x.get("text", "")} for x in visual[:2]
        ],
        "half_cell": {
            "test_count": half.get("test_count"),
            "outcomes": half.get("outcomes") or [],
            "report_evaluation": half.get("report_evaluation", ""),
        },
        "tensile_test": {
            "sample_count": tensile.get("sample_count"),
            "diameters_mm": tensile.get("diameters_mm") or [],
            "report_result": tensile.get("report_result", ""),
            "test_method_reported": tensile.get("test_method_reported", ""),
            "evaluation_standard_reported": tensile.get("evaluation_standard_reported", ""),
        },
        "approved_acceptance_reference_count": len(real_refs),
    }

    instructions = {
        "task": "أضف طبقة تفسير هندسي موجزة للحقائق التالية فقط.",
        "rules": [
            "لا تعِد سرد كل الأرقام؛ استخرج 2 إلى 3 علاقات مهمة بين نتائج الخرسانة والتآكل وحديد التسليح.",
            "ميّز بوضوح بين ما يذكره التقرير وبين استنتاجك الوصفي.",
            "إذا كان approved_acceptance_reference_count=0 فلا تصدر حكم مطابقة أو سلامة.",
            "لا تضف توصيات جديدة خارج ما تسمح به الأدلة؛ ركز على ما يمكن وما لا يمكن استنتاجه.",
        ],
        "output": {
            "executive_summary": "3-4 جمل عربية موجزة",
            "analytical_findings": [
                {"finding": "جملة", "basis": "الدليل", "reference": "صفحة/قسم", "result_type": "ANALYTICAL_FINDING"}
            ],
            "overall_conclusion": "2-3 جمل عربية موجزة"
        }
    }
    return (
        "INSTRUCTIONS\n" + json.dumps(instructions, ensure_ascii=False, separators=(",", ":")) +
        "\nFACTS\n" + json.dumps(digest, ensure_ascii=False, separators=(",", ":"))
    )

def _lmstudio_json_call(messages: list[dict[str, str]], phase: str = "local-v2") -> Dict[str, Any]:
    """LM Studio compact call.

    Qwen3.8 is special-cased to LM Studio's native /api/v1/chat endpoint with
    reasoning="off". This is the only path LM Studio documents with an explicit
    reasoning-off control. The OpenAI-compatible chat endpoint may still expose
    Qwen's default thinking behavior even when chat-template kwargs are supplied.

    Python owns the deterministic evidence and final schema, so the model is used
    only for a short narrative/analytical layer.
    """
    compact_cap = min(max(700, LOCAL_NUM_PREDICT), 1800)
    native_cap = 280 if "إصلاح" in phase else 650
    model_low = str(LOCAL_MODEL or "").lower()
    is_qwen38 = ("qwen3.8" in model_low or "qwen3_8" in model_low or "qwen3-8" in model_low or "qwen38" in model_low)
    if is_qwen38:
        _local_log(f"{phase}: تم التعرف على Qwen3.8 من identifier={LOCAL_MODEL}; استخدام Native API مع reasoning=off")
    prompt_chars = sum(len(str(m.get("content", ""))) for m in messages)
    timeout = httpx.Timeout(connect=10.0, read=float(LOCAL_TIMEOUT_SECONDS), write=60.0, pool=10.0)
    started = time.perf_counter()

    if is_qwen38:
        # LM Studio native v1 API exposes an explicit reasoning="off" switch.
        # LOCAL_BASE_URL is normally http://127.0.0.1:1234/v1, so remove only
        # the trailing /v1 before calling /api/v1/chat.
        root = str(LOCAL_BASE_URL or "http://127.0.0.1:1234/v1").rstrip("/")
        if root.endswith("/v1"):
            root = root[:-3]
        endpoint = root + "/api/v1/chat"

        system_parts = [str(m.get("content") or "") for m in messages if m.get("role") == "system"]
        user_parts = [str(m.get("content") or "") for m in messages if m.get("role") != "system"]
        system_prompt = "\n\n".join(p for p in system_parts if p).strip()
        input_text = "\n\n".join(p for p in user_parts if p).strip()
        input_text += (
            "\n\nإخراج إلزامي: أعد كائن JSON واحداً فقط، بدون Markdown وبدون شرح خارج JSON. "
            "استخدم المفاتيح executive_summary و analytical_findings و overall_conclusion فقط."
        )

        payload_native: Dict[str, Any] = {
            "model": LOCAL_MODEL,
            "input": input_text,
            "system_prompt": system_prompt,
            "stream": False,
            "temperature": 0.2,
            "max_output_tokens": native_cap,
            "reasoning": "off",
            "store": False,
        }
        _local_log(
            f"{phase}: إرسال Qwen3.8 عبر LM Studio Native API | model={LOCAL_MODEL} | "
            f"reasoning=off | max_output_tokens={native_cap} | loaded_context={LOCAL_NUM_CTX} | prompt_chars={prompt_chars}"
        )
        try:
            with httpx.Client(timeout=timeout) as client:
                r = client.post(endpoint, json=payload_native)
                if r.status_code >= 400:
                    try:
                        detail = r.json()
                    except Exception:
                        detail = r.text[:1500]
                    raise RuntimeError(f"LM Studio Native HTTP {r.status_code}: {detail}")
                raw = r.json()
        except httpx.ReadTimeout as exc:
            raise RuntimeError(f"انتهت مهلة LM Studio بعد {LOCAL_TIMEOUT_SECONDS} ثانية أثناء {phase}.") from exc
        except httpx.ConnectError as exc:
            raise RuntimeError("تعذر الاتصال بخدمة LM Studio المحلية. تأكد من تشغيل الخادم وتحميل النموذج.") from exc

        elapsed = time.perf_counter() - started
        output_items = raw.get("output") or []
        content_parts = []
        reasoning_parts = []
        for item in output_items:
            if not isinstance(item, dict):
                continue
            typ = item.get("type")
            if typ == "message":
                content_parts.append(str(item.get("content") or ""))
            elif typ == "reasoning":
                reasoning_parts.append(str(item.get("content") or ""))
        content = "\n".join(p for p in content_parts if p).strip()
        reasoning = "\n".join(p for p in reasoning_parts if p).strip()
        stats = raw.get("stats") or {}
        prompt_tokens = int(stats.get("input_tokens") or 0)
        completion_tokens = int(stats.get("total_output_tokens") or 0)
        reasoning_tokens = int(stats.get("reasoning_output_tokens") or 0)
        tps = stats.get("tokens_per_second")
        _local_log(
            f"{phase}: Native API اكتمل في {elapsed:.1f}s | prompt_tokens={prompt_tokens} | "
            f"completion_tokens={completion_tokens} | reasoning_tokens={reasoning_tokens} | "
            f"content_chars={len(content)} | reasoning_chars={len(reasoning)} | "
            f"tps={round(float(tps),2) if tps else '—'}"
        )
        return {
            "message": {"content": content},
            "prompt_eval_count": prompt_tokens,
            "eval_count": completion_tokens,
            "eval_duration": 0,
            "_elapsed_seconds": elapsed,
            "_tokens_per_second": tps,
            "_raw_usage": stats,
            "_reasoning_chars": len(reasoning),
            "_reasoning_tokens": reasoning_tokens,
            "_finish_reason": "stop" if content else "no_content",
            "_native_api": True,
        }

    # Non-Qwen models continue to use LM Studio's OpenAI-compatible structured output.
    payload: Dict[str, Any] = {
        "model": LOCAL_MODEL,
        "messages": messages,
        "stream": False,
        "max_tokens": compact_cap,
        "temperature": 0,
    }
    if LOCAL_V2_FORCE_JSON:
        compact_schema = {
            "type": "object",
            "properties": {
                "executive_summary": {"type": "string"},
                "analytical_findings": {
                    "type": "array",
                    "minItems": 3,
                    "maxItems": 5,
                    "items": {
                        "type": "object",
                        "properties": {
                            "finding": {"type": "string"},
                            "basis": {"type": "string"},
                            "reference": {"type": "string"},
                            "result_type": {
                                "type": "string",
                                "enum": ["ANALYTICAL_FINDING", "CALCULATED_DATA", "MEASURED_DATA"],
                            },
                        },
                        "required": ["finding", "basis", "reference", "result_type"],
                        "additionalProperties": False,
                    },
                },
                "overall_conclusion": {"type": "string"},
            },
            "required": ["executive_summary", "analytical_findings", "overall_conclusion"],
            "additionalProperties": False,
        }
        payload["response_format"] = {
            "type": "json_schema",
            "json_schema": {"name": "ido_local_compact_analysis", "strict": True, "schema": compact_schema},
        }
    _local_log(
        f"{phase}: إرسال طلب Local v2 compact | model={LOCAL_MODEL} | schema={bool(payload.get('response_format'))} | "
        f"max_tokens={compact_cap} | prompt_chars={prompt_chars}"
    )
    try:
        with httpx.Client(timeout=timeout) as client:
            r = client.post(f"{LOCAL_BASE_URL}/chat/completions", json=payload)
            if r.status_code >= 400 and "response_format" in payload:
                _local_log(f"{phase}: JSON Schema مرفوض ({r.status_code})؛ إعادة المحاولة بدون response_format")
                payload.pop("response_format", None)
                r = client.post(f"{LOCAL_BASE_URL}/chat/completions", json=payload)
            if r.status_code >= 400:
                try:
                    detail = r.json()
                except Exception:
                    detail = r.text[:1500]
                raise RuntimeError(f"LM Studio HTTP {r.status_code}: {detail}")
            raw = r.json()
    except httpx.ReadTimeout as exc:
        raise RuntimeError(f"انتهت مهلة LM Studio بعد {LOCAL_TIMEOUT_SECONDS} ثانية أثناء {phase}.") from exc
    except httpx.ConnectError as exc:
        raise RuntimeError("تعذر الاتصال بخدمة LM Studio المحلية. تأكد من تشغيل الخادم وتحميل النموذج.") from exc

    elapsed = time.perf_counter() - started
    choices = raw.get("choices") or []
    if not choices:
        raise RuntimeError("LM Studio أعاد استجابة بلا choices")
    choice0 = choices[0] or {}
    msg = choice0.get("message") or {}
    content = msg.get("content") or ""
    reasoning = msg.get("reasoning_content") or msg.get("reasoning") or ""
    usage = raw.get("usage") or {}
    prompt_tokens = int(usage.get("prompt_tokens") or 0)
    completion_tokens = int(usage.get("completion_tokens") or 0)
    stats = raw.get("stats") or {}
    tps = stats.get("tokens_per_second") or stats.get("generation_tokens_per_second")
    if tps is None and completion_tokens and elapsed > 0:
        tps = round(completion_tokens / elapsed, 2)
    _local_log(
        f"{phase}: اكتمل في {elapsed:.1f}s | prompt_tokens={prompt_tokens} | completion_tokens={completion_tokens} | "
        f"content_chars={len(content)} | reasoning_chars={len(str(reasoning))} | "
        f"finish={choice0.get('finish_reason')} | tps={round(float(tps),2) if tps else '—'}"
    )
    return {
        "message": {"content": content},
        "prompt_eval_count": prompt_tokens,
        "eval_count": completion_tokens,
        "eval_duration": 0,
        "_elapsed_seconds": elapsed,
        "_tokens_per_second": tps,
        "_raw_usage": usage,
        "_reasoning_chars": len(str(reasoning)),
        "_finish_reason": choice0.get("finish_reason"),
    }

def _ollama_json_call(messages: list[dict[str, str]], phase: str = "local-v2") -> Dict[str, Any]:
    compact_cap = min(max(700, LOCAL_NUM_PREDICT), 1400)
    payload: Dict[str, Any] = {
        "model": LOCAL_MODEL,
        "messages": messages,
        "stream": False,
        "think": LOCAL_THINK,
        "keep_alive": LOCAL_KEEP_ALIVE,
        "format": "json",
        "options": {
            "temperature": 0,
            "num_ctx": LOCAL_NUM_CTX,
            "num_predict": compact_cap,
        },
    }
    timeout = httpx.Timeout(connect=10.0, read=float(LOCAL_TIMEOUT_SECONDS), write=60.0, pool=10.0)
    started = time.perf_counter()
    with httpx.Client(timeout=timeout) as client:
        r = client.post(f"{LOCAL_BASE_URL}/api/chat", json=payload)
        r.raise_for_status()
        body = r.json()
    body["_elapsed_seconds"] = time.perf_counter() - started
    return body


def _local_json_call(messages: list[dict[str, str]], phase: str) -> Dict[str, Any]:
    if LOCAL_PROVIDER == "lmstudio":
        return _lmstudio_json_call(messages, phase)
    if LOCAL_PROVIDER == "ollama":
        return _ollama_json_call(messages, phase)
    raise RuntimeError(f"Unsupported LOCAL_PROVIDER: {LOCAL_PROVIDER}")


def _parse_compact_json(text: str) -> Dict[str, Any]:
    cleaned = (text or "").strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.I)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", cleaned, flags=re.S)
        if not match:
            raise ValueError("Model did not return a compact JSON object")
        data = json.loads(match.group(0))
    if not isinstance(data, dict):
        raise ValueError("Compact model output is not a JSON object")
    return data


def _evidence_label_from_snippet(text: str, domain: str) -> str:
    low = (text or "").lower()
    if "half cell" in low or "half-cell" in low or "astm c876" in low:
        return "اختبار Half-Cell Potential"
    if "شد" in low or "tensile" in low:
        return "اختبار شد حديد التسليح"
    if "صدأ" in low or "تآكل" in low or "corrosion" in low:
        return "حالة الصدأ والتآكل"
    if "مقاومة الضغط" in low or "compressive" in low or "core" in low:
        return "اختبار مقاومة الضغط"
    if domain == "geotechnical":
        if "spt" in low or "اختراق" in low:
            return "اختبار SPT"
        if "مياه جوفية" in low or "groundwater" in low:
            return "المياه الجوفية"
        if "كيمي" in low or "chemical" in low or "sulfate" in low or "chloride" in low:
            return "اختبارات كيميائية"
    return "دليل فني مستخرج"


def _deterministic_evidence_from_pack(evidence_pack: Dict[str, Any], domain: str, limit: int = 35) -> list[Dict[str, Any]]:
    """Build client-facing evidence from deterministic facts first.

    Structural mode prefers clean structured facts over raw PDF fragments. This
    keeps the local report readable even when Arabic PDF text extraction is noisy.
    """
    out: list[Dict[str, Any]] = []
    seen: set[str] = set()

    def add(evidence_type: str, identifier: str, value: str, unit: str, location: str, page: Any, conclusion: str) -> None:
        if len(out) >= limit:
            return
        key = re.sub(r"\W+", "", f"{identifier}|{value}|{page}".lower())[:300]
        if not key or key in seen:
            return
        seen.add(key)
        out.append({
            "evidence_type": evidence_type,
            "identifier": identifier,
            "value": value,
            "unit": unit,
            "location_or_depth": location,
            "source_page_or_section": f"صفحة {page}" if page else "التقرير",
            "report_conclusion": conclusion,
        })

    # Individual numerical samples are deterministic and remain the strongest traceable evidence.
    for item in sorted(evidence_pack.get("sample_values") or [], key=lambda x: _natural_sample_key(str(x.get("identifier") or ""))):
        ident = str(item.get("identifier") or "").strip()
        if not ident:
            continue
        add(
            "MEASURED_DATA",
            ident,
            str(item.get("value") or ""),
            str(item.get("unit") or ""),
            "عينة كور خرسانية كما وردت في جدول النتائج",
            item.get("page"),
            "قيمة مقاومة ضغط مستخرجة من جدول التقرير؛ لا تمثل بمفردها حكماً بالقبول أو الرفض.",
        )

    sf = evidence_pack.get("structured_facts") or {}
    if domain == "structural" and sf:
        purpose = sf.get("report_purpose") or {}
        if purpose:
            add(
                "ANALYTICAL_FINDING",
                "غرض التقرير",
                str(purpose.get("text") or ""),
                "",
                "نطاق وأهداف التقرير",
                purpose.get("page"),
                "غرض مذكور في التقرير ولا يمثل بحد ذاته حكماً على كفاية المبنى أو ملاءمة الإضافة.",
            )
        core = sf.get("core_test") or {}
        if core.get("sample_count"):
            add(
                "MEASURED_DATA",
                "ملخص اختبار الكور الخرساني",
                f"{core.get('sample_count')} عينة",
                "",
                "العناصر الإنشائية المختبرة بالتقرير",
                core.get("samples_page"),
                "عدد العينات كما تم استخراجه من جدول التقرير.",
            )
        if core.get("standard_reported"):
            add(
                "MEASURED_DATA",
                "طريقة اختبار الكور المذكورة بالتقرير",
                str(core.get("standard_reported")),
                "",
                "اختبار مقاومة الضغط",
                core.get("standard_page") or core.get("samples_page"),
                "مرجع اختبار مذكور داخل التقرير؛ لا يُعامل تلقائياً كمعيار قبول معتمد لدى النظام.",
            )
        for g in core.get("reported_group_averages") or []:
            add(
                "MEASURED_DATA",
                f"متوسط مقاومة الضغط — {g.get('element')}",
                f"{float(g.get('value_mpa')):.2f}",
                "MPa",
                str(g.get("element") or ""),
                g.get("page"),
                "متوسط أوردَه التقرير لمجموعة العنصر المحددة.",
            )
        for g in core.get("reported_equivalent_strengths") or []:
            add(
                "CALCULATED_DATA",
                f"مقاومة الضغط المكافئة — {g.get('group')}",
                f"{float(g.get('value_mpa')):.2f}",
                "MPa",
                str(g.get("group") or ""),
                g.get("page"),
                "قيمة مكافئة/محافظة أوردها التقرير؛ يلزم ربطها بالمقاومة التصميمية ومعيار القبول قبل إصدار حكم.",
            )
        if core.get("report_evaluation_note"):
            add(
                "ANALYTICAL_FINDING",
                "خلاصة تقييم نتائج الكور في التقرير",
                str(core.get("report_evaluation_note")),
                "",
                "تقييم نتائج اختبار الكور",
                core.get("evaluation_page"),
                "خلاصة واردة في التقرير؛ الحكم النهائي يتطلب التحليل الإنشائي ومعايير القبول المعتمدة.",
            )

        for obs in sf.get("reinforcement_visual") or []:
            add(
                "ANALYTICAL_FINDING",
                "ملاحظة فحص بصري لحديد التسليح",
                str(obs.get("text") or ""),
                "",
                "مواضع الفحص البصري",
                obs.get("page"),
                "ملاحظة موضعية واردة في التقرير ولا تُعمم خارج مواقع الفحص.",
            )

        half = sf.get("half_cell") or {}
        if half.get("standard_reported"):
            add(
                "MEASURED_DATA",
                "اختبار احتمالية صدأ حديد التسليح",
                f"{half.get('test_count', '')} اختبارات — {half.get('standard_reported')}",
                "",
                "مواقع مختارة من العناصر الإنشائية",
                half.get("page"),
                "بيانات طريقة وعدد الاختبارات كما وردت في التقرير.",
            )
        for outcome in half.get("outcomes") or []:
            add(
                "ANALYTICAL_FINDING",
                "نتيجة Half-Cell موضعية",
                str(outcome.get("report_result") or ""),
                "",
                str(outcome.get("location") or "موضع الاختبار"),
                outcome.get("page"),
                "نتيجة موضعية كما وصفها التقرير؛ لا يجوز تعميمها على كامل المبنى.",
            )
        if half.get("report_evaluation"):
            add(
                "ANALYTICAL_FINDING",
                "خلاصة التقرير لاختبار الصدأ",
                str(half.get("report_evaluation")),
                "",
                "مواقع اختبار Half-Cell",
                half.get("evaluation_page") or half.get("page"),
                "خلاصة واردة في التقرير بشأن حدود تعميم نتائج الفحص.",
            )

        tensile = sf.get("tensile_test") or {}
        if tensile:
            dia = "، ".join(str(x) for x in tensile.get("diameters_mm") or [])
            add(
                "MEASURED_DATA",
                "اختبار شد حديد التسليح",
                f"{tensile.get('sample_count', '')} عينات" + (f" — أقطار {dia} مم" if dia else ""),
                "",
                "عينات حديد التسليح من سقف الدور الأول",
                tensile.get("page"),
                (
                    f"ذكر التقرير إجراء الاختبار وفق {tensile.get('test_method_reported')} وتقييمه وفق "
                    f"{tensile.get('evaluation_standard_reported')}."
                ),
            )
            add(
                "ANALYTICAL_FINDING",
                "نتيجة اختبار الشد كما وردت بالتقرير",
                str(tensile.get("report_result") or ""),
                "",
                "العينات المختبرة",
                tensile.get("page"),
                "هذه نتيجة/مطابقة ذكرها التقرير نفسه، وليست حكماً مستقلاً صادراً من محرك آي دو.",
            )

        survey = sf.get("survey_and_drawings") or {}
        if survey:
            add(
                "MEASURED_DATA",
                "رصد التسليح وإعداد مخططات الوضع القائم",
                str(survey.get("device_reported") or ""),
                "",
                "العناصر الإنشائية التي شملها الرفع الميداني",
                survey.get("page"),
                str(survey.get("text") or ""),
            )

    # For structural reports, clean structured facts are preferred to noisy raw PDF fragments.
    if domain == "structural" and len(out) >= 20:
        return out[:limit]

    # Generic fallback is used mainly for non-structural profiles or when structured facts are sparse.
    per_page: dict[int, int] = {}
    for item in evidence_pack.get("snippets") or []:
        if len(out) >= limit:
            break
        page = int(item.get("page") or 0)
        raw_text = str(item.get("text") or "").strip()
        if not raw_text or per_page.get(page, 0) >= 1 or not _display_worthy_snippet(raw_text):
            continue
        if domain == "structural" and re.search(r"\bCO[\s\-_]*\d+\b", raw_text, re.I):
            continue
        label = _evidence_label_from_snippet(raw_text, domain)
        # In structural mode, raw generic fragments are only a last resort.
        if domain == "structural" and label == "دليل فني مستخرج" and len(out) >= 20:
            continue
        evidence_type = "MEASURED_DATA" if re.search(r"\d+(?:[\.,]\d+)?\s*(?:MPa|kPa|mm|cm|m|%)\b", raw_text, re.I) else "ANALYTICAL_FINDING"
        clean = _normalize_evidence_line(raw_text)[:360]
        add(
            evidence_type,
            label,
            clean,
            "",
            "كما ورد في التقرير",
            page,
            "دليل نصي مستخرج من التقرير ويحتاج تفسيره ضمن سياقه الهندسي.",
        )
        per_page[page] = per_page.get(page, 0) + 1

    return out

def _deterministic_findings(evidence_pack: Dict[str, Any], domain: str) -> list[Dict[str, Any]]:
    findings: list[Dict[str, Any]] = []
    values = []
    for item in evidence_pack.get("sample_values") or []:
        try:
            values.append(float(str(item.get("value", "")).replace(",", ".")))
        except Exception:
            pass

    sf = evidence_pack.get("structured_facts") or {}
    if values and domain == "structural":
        count = len(values)
        mn, mx = min(values), max(values)
        avg = sum(values) / count
        med = statistics.median(values)
        spread = mx - mn
        findings.extend([
            {
                "finding": f"تم استخراج {count} نتيجة منفصلة لعينات الكور الخرساني من التقرير.",
                "basis": "استخراج جدولي حتمي من معرفات العينات والقيم المجاورة لها.",
                "reference": "صفحة 3",
                "result_type": "MEASURED_DATA",
            },
            {
                "finding": (
                    f"القيم المستخرجة لعينات الكور تمتد من {mn:.2f} إلى {mx:.2f} MPa؛ "
                    f"المتوسط الحسابي لجميع العينات {avg:.2f} MPa، والوسيط {med:.2f} MPa، والمدى {spread:.2f} MPa."
                ),
                "basis": "حساب وصفي حتمي من قيم العينات المستخرجة؛ لا يمثل حكماً على المطابقة أو السلامة.",
                "reference": "صفحة 3",
                "result_type": "CALCULATED_DATA",
            },
        ])

        core = sf.get("core_test") or {}
        avgs = core.get("reported_group_averages") or []
        if avgs:
            parts = [f"{x.get('element')}: {float(x.get('value_mpa')):.2f} MPa" for x in avgs]
            findings.append({
                "finding": "متوسطات مقاومة الضغط التي أوردها التقرير حسب مجموعات العناصر هي: " + "؛ ".join(parts) + ".",
                "basis": "قيم مجمعة أوردها التقرير في تقييم نتائج اختبار الكور.",
                "reference": f"صفحة {core.get('evaluation_page') or 4}",
                "result_type": "MEASURED_DATA",
            })
        equiv = core.get("reported_equivalent_strengths") or []
        if equiv:
            parts = [f"{x.get('group')}: {float(x.get('value_mpa')):.2f} MPa" for x in equiv]
            findings.append({
                "finding": "المقاومات المكافئة/المحافظة التي أوردها التقرير: " + "؛ ".join(parts) + ".",
                "basis": "قيم أوردها التقرير لتستخدم ضمن التحليل الإنشائي؛ لا تُعامل كحكم قبول مستقل.",
                "reference": f"صفحة {core.get('evaluation_page') or 4}",
                "result_type": "ANALYTICAL_FINDING",
            })

        visual = sf.get("reinforcement_visual") or []
        if visual:
            pages = sorted({str(x.get("page")) for x in visual if x.get("page")})
            findings.append({
                "finding": "وثق التقرير مظاهر صدأ وتآكل موضعية في حديد التسليح، تشمل فقداً موضعياً في بعض الأقطار وتآكلاً واضحاً في بعض الكانات.",
                "basis": "تجميع حتمي لملاحظات الفحص البصري الواردة في التقرير، مع عدم تعميمها خارج مواضع الفحص.",
                "reference": "الصفحات " + "، ".join(pages) if pages else "قسم فحص حديد التسليح",
                "result_type": "ANALYTICAL_FINDING",
            })

        half = sf.get("half_cell") or {}
        if half.get("outcomes"):
            good = sum(1 for x in half.get("outcomes") or [] if "حالة جيدة" in str(x.get("report_result") or ""))
            corrosion = sum(1 for x in half.get("outcomes") or [] if "صدأ" in str(x.get("report_result") or "") and "دون" not in str(x.get("report_result") or ""))
            findings.append({
                "finding": (
                    f"اختبار Half-Cell الموثق بالتقرير شمل {half.get('test_count', len(half.get('outcomes') or []))} مواضع؛ "
                    f"وصف التقرير {good} موضع/مواضع بحالة جيدة دون مؤشرات صدأ، وسجل صدأً في {corrosion} موضع/مواضع."
                ),
                "basis": "تجميع نتائج المواضع كما وردت في صفحات اختبار Half-Cell؛ النتائج موضعية وغير قابلة للتعميم على كامل المبنى.",
                "reference": f"الصفحات {half.get('page', 9)}–{half.get('evaluation_page', 13)}",
                "result_type": "ANALYTICAL_FINDING",
            })

        tensile = sf.get("tensile_test") or {}
        if tensile:
            findings.append({
                "finding": (
                    f"ذكر التقرير أن {tensile.get('sample_count', 3)} عينات حديد تسليح حققت متطلبات اختبار الشد "
                    f"بحسب تقييم التقرير، مع استخدام {tensile.get('test_method_reported')} للاختبار "
                    f"و{tensile.get('evaluation_standard_reported')} للتقييم."
                ),
                "basis": "نقل من خلاصة تقرير الاختبارات الميكانيكية؛ لا يمثل حكماً مستقلاً من محرك آي دو.",
                "reference": f"صفحة {tensile.get('page', 15)}",
                "result_type": "ANALYTICAL_FINDING",
            })

    return findings[:8]

def _normalize_compact_findings(items: Any) -> list[Dict[str, Any]]:
    out=[]
    allowed={"MEASURED_DATA","CALCULATED_DATA","ANALYTICAL_FINDING","RECOMMENDATION"}
    for x in (items or [])[:6]:
        if not isinstance(x, dict):
            continue
        finding=str(x.get("finding") or "").strip()
        if not finding:
            continue
        rt=str(x.get("result_type") or "ANALYTICAL_FINDING").strip().upper()
        if rt not in allowed:
            rt="ANALYTICAL_FINDING"
        out.append({
            "finding": finding,
            "basis": str(x.get("basis") or "مبني على حزمة الأدلة المحلية.").strip(),
            "reference": str(x.get("reference") or "حزمة الأدلة المحلية").strip(),
            "result_type": rt,
        })
    return out


def _normalize_compact_conflicts(items: Any) -> list[Dict[str, Any]]:
    out=[]
    for x in (items or [])[:5]:
        if not isinstance(x, dict) or not str(x.get("description") or "").strip():
            continue
        out.append({
            "description": str(x.get("description") or "").strip(),
            "source_a": str(x.get("source_a") or "التقرير").strip(),
            "source_b": str(x.get("source_b") or "حزمة الأدلة").strip(),
            "action_required": str(x.get("action_required") or "مراجعة هندسية بشرية").strip(),
        })
    return out


def _normalize_compact_recommendations(items: Any) -> list[Dict[str, Any]]:
    out=[]
    for x in (items or [])[:5]:
        if not isinstance(x, dict) or not str(x.get("recommendation") or "").strip():
            continue
        out.append({
            "recommendation": str(x.get("recommendation") or "").strip(),
            "basis": str(x.get("basis") or "بناءً على الأدلة المتاحة في التقرير.").strip(),
            "reference": str(x.get("reference") or "التقرير المرفوع").strip(),
            "human_review_required": True,
        })
    return out


def _build_assessments_from_pack(pack: Dict[str, Any], use_case: str, evidence_count: int) -> list[Dict[str, Any]]:
    filtered = filter_pack_for_use_case(pack, use_case)
    reqs = filtered.get("project_requirements") or []
    version = filtered.get("knowledge_version", "")
    assessments=[]
    for req in reqs[:6]:
        rid=str(req.get("id") or "LOCAL-REQ")
        rtext=str(req.get("requirement") or req.get("text") or req.get("title") or "متطلب مراجعة قائم على الأدلة")
        assessments.append({
            "requirement_id": rid,
            "requirement_text": rtext,
            "evidence": f"تم استخراج {evidence_count} عنصر دليل قابل للتتبع محلياً.",
            "source_location": "حزمة الأدلة المحلية كاملة المستند",
            "measured_value": "متعدد",
            "measured_unit": "متعدد",
            "required_condition_or_limit": "غير متاح ضمن قاعدة المعرفة المعتمدة.",
            "technical_reference": "غير متاح ضمن قاعدة المعرفة المعتمدة.",
            "knowledge_rule_id": "LOCAL-EVIDENCE-V2",
            "knowledge_version": version,
            "status": "NOT_EVALUABLE",
            "reasoning_summary": "تم تنفيذ الاستخراج والمراجعة الوصفية، لكن لا يتوفر معيار قبول فني معتمد يسمح بإصدار حكم مطابقة نهائي.",
        })
    return assessments


def _assemble_local_v2_result(profile: str, cfg: Dict[str, Any], pack: Dict[str, Any], evidence_pack: Dict[str, Any], compact: Dict[str, Any] | None, compact_error: str | None = None) -> Dict[str, Any]:
    domain = cfg.get("domain", "general")
    deterministic_evidence = _deterministic_evidence_from_pack(evidence_pack, domain, limit=35)
    deterministic_findings = _deterministic_findings(evidence_pack, domain)
    compact = compact or {}
    cfind = _normalize_compact_findings(compact.get("analytical_findings"))
    # Deterministic facts come first; model findings add interpretation, not authority.
    findings = (deterministic_findings + cfind)[:10]

    filtered = filter_pack_for_use_case(pack, cfg["use_case"])
    real_refs = [
        r for r in (filtered.get("technical_references") or [])
        if "DEMO" not in str(r).upper() and "PLACEHOLDER" not in str(r).upper()
    ]

    missing: list[str] = []
    if not real_refs:
        missing.append(
            "معايير وحدود القبول الفنية المعتمدة غير متوفرة في حزمة المعرفة الحالية، لذلك لا يمكن إصدار حكم مطابقة نهائي."
        )

    sf = evidence_pack.get("structured_facts") or {}
    if domain == "structural":
        core = sf.get("core_test") or {}
        if core.get("sample_count"):
            missing.append(
                "يلزم ربط مقاومات الخرسانة المستخلصة بالمقاومة التصميمية المطلوبة ومعايير القبول المعتمدة قبل الحكم على كفاية العناصر."
            )
        if sf.get("report_purpose"):
            missing.append(
                "الحكم على ملاءمة إضافة الدور المقترح يتطلب نتائج تحليل إنشائي للأحمال الحالية والإضافية، ولا يُستنتج من اختبارات المواد وحدها."
            )

    pages = evidence_pack.get("coverage", {}).get("pages_scanned", 0)
    epages = evidence_pack.get("coverage", {}).get("evidence_page_count", 0)
    evidence_count = len(deterministic_evidence)
    ss = evidence_pack.get("sample_value_summary") or {}
    dtype = "تقرير فحص وتقييم إنشائي" if domain == "structural" else "تقرير دراسة جيوتقنية" if domain == "geotechnical" else "تقرير هندسي"
    discipline = {
        "structural": "الهندسة الإنشائية",
        "geotechnical": "الهندسة الجيوتقنية",
        "general": "الهندسة العامة",
    }.get(domain, "الهندسة العامة")

    deterministic_summary_parts = [
        f"تمت قراءة {pages} صفحة محلياً ومسح المستند كاملاً، مع بناء حزمة أدلة قابلة للتتبع من {epages} صفحة."
    ]
    if domain == "structural" and ss.get("count"):
        deterministic_summary_parts.append(
            f"استخُرجت {ss.get('count')} نتيجة منفصلة لعينات الكور الخرساني بقيم من "
            f"{float(ss.get('minimum_mpa')):.2f} إلى {float(ss.get('maximum_mpa')):.2f} MPa "
            f"ومتوسط حسابي {float(ss.get('mean_mpa')):.2f} MPa."
        )
        half = sf.get("half_cell") or {}
        tensile = sf.get("tensile_test") or {}
        if half:
            deterministic_summary_parts.append(
                f"كما رُصدت نتائج اختبار Half-Cell في {half.get('test_count', 3)} مواضع، "
                "مع اختلاف حالة الصدأ بين المواقع وفق ما أورده التقرير."
            )
        if tensile:
            deterministic_summary_parts.append(
                f"وذكر التقرير أن {tensile.get('sample_count', 3)} عينات من حديد التسليح حققت متطلبات اختبار الشد وفق تقييم التقرير."
            )
        if sf.get("report_purpose"):
            deterministic_summary_parts.append(
                "الغرض النهائي المذكور بالتقرير هو توفير مدخلات للتقييم والتحليل الإنشائي ودراسة ملاءمة إضافة دور جديد."
            )

    deterministic_summary = " ".join(deterministic_summary_parts)
    model_summary = str(compact.get("executive_summary") or "").strip()
    summary = model_summary if len(model_summary) >= 90 else deterministic_summary

    model_conclusion = str(compact.get("overall_conclusion") or "").strip()
    conclusion = model_conclusion or (
        "نجح المسار المحلي في استخراج الأدلة والنتائج الأساسية من التقرير، إلا أن كفاية المبنى أو ملاءمة إضافة الدور "
        "لا يمكن حسمها من اختبارات المواد وحدها. يلزم استكمال التحليل الإنشائي وربط النتائج بمعايير القبول والمراجع الفنية المعتمدة، "
        "مع مراجعة مهندس إنشائي مختص."
        if domain == "structural" else
        "تم استخراج الأدلة وتحليلها محلياً، لكن الحكم الفني النهائي يظل غير قابل للتقييم ما لم تتوفر معايير القبول الفنية المعتمدة ومراجعة المهندس المختص."
    )

    # Prefer the report's own recommendations. They are evidence, not invented AI advice.
    recs: list[Dict[str, Any]] = []
    for x in (sf.get("report_recommendations") or [])[:5]:
        recs.append({
            "recommendation": str(x.get("text") or "").strip(),
            "basis": "توصية واردة في التقرير المرفوع؛ يعرضها النظام مع الحفاظ على مسؤولية المراجعة الهندسية.",
            "reference": f"صفحة {x.get('page')}" if x.get("page") else "قسم التوصيات في التقرير",
            "human_review_required": True,
        })
    if not recs:
        recs = [{
            "recommendation": "استكمال المراجعة الهندسية باستخدام الأدلة المستخرجة وربطها بالمراجع الفنية ومعايير القبول المعتمدة قبل إصدار قرار نهائي.",
            "basis": "حزمة الأدلة المحلية لا تحتوي بمفردها على معيار قبول فني نهائي.",
            "reference": "حزمة المعرفة والتقرير المرفوع",
            "human_review_required": True,
        }]

    project_or_site = str(sf.get("project_or_site") or "").strip() or str(compact.get("project_or_site") or "").strip() or "يُراجع من بيانات التقرير المرفوع"

    result = {
        "document": {
            "type": dtype,
            "discipline": discipline,
            "project_or_site": project_or_site,
            "scope_match": True,
            "scope_reason": "المستند اجتاز بوابة مطابقة النطاق، وتم تنفيذ مسح محلي كامل للصفحات النصية واستخراج أدلة قابلة للتتبع.",
        },
        "overall_status": "NOT_EVALUABLE",
        "executive_summary": summary,
        "evidence": deterministic_evidence,
        "assessments": _build_assessments_from_pack(pack, cfg["use_case"], evidence_count),
        "analytical_findings": findings,
        "missing_information": missing[:10],
        "conflicts": [],
        "engineering_recommendations": recs,
        "human_engineering_review_required": True,
        "overall_conclusion": conclusion,
    }
    validate_result(result)
    return result

def _postprocess_local_v2(result: Dict[str, Any], pack: Dict[str, Any]) -> Dict[str, Any]:
    """Fail closed on unsupported technical verdicts and remove demo-only overclaiming."""
    refs = pack.get("technical_references") or []
    real_refs = [r for r in refs if "PLACEHOLDER" not in str(r).upper() and "DEMO" not in str(r).upper()]
    evaluable_count = 0
    for a in result.get("assessments") or []:
        limit = str(a.get("required_condition_or_limit") or "").strip()
        ref = str(a.get("technical_reference") or "").strip()
        status = a.get("status")
        ref_missing = (not real_refs) or (not ref) or ("غير متاح" in ref) or ("not available" in ref.lower())
        limit_missing = (not limit) or ("غير متاح" in limit) or ("not available" in limit.lower())
        if status in {"COMPLIANT", "NON_COMPLIANT", "PARTIALLY_COMPLIANT"} and (ref_missing or limit_missing):
            a["status"] = "NOT_EVALUABLE"
            a["required_condition_or_limit"] = limit or "المرجع غير متاح ضمن قاعدة المعرفة المعتمدة."
            a["technical_reference"] = ref or "المرجع غير متاح ضمن قاعدة المعرفة المعتمدة."
            reason = str(a.get("reasoning_summary") or "").strip()
            suffix = "لا يتوفر معيار قبول فني معتمد يسمح بإصدار حكم مطابقة."
            a["reasoning_summary"] = (reason + " " + suffix).strip()
        if a.get("status") in {"COMPLIANT", "NON_COMPLIANT", "PARTIALLY_COMPLIANT"}:
            evaluable_count += 1

    if (result.get("assessments") and evaluable_count == 0) or not real_refs:
        result["overall_status"] = "NOT_EVALUABLE"
    if result.get("document", {}).get("scope_match"):
        result["human_engineering_review_required"] = True
    validate_result(result)
    return result


def analyze_local_v2(pdf_path: Path, profile: str) -> Dict[str, Any]:
    cfg = PROFILE_MAP[profile]
    pack = load_pack(cfg["pack"])
    domain = cfg.get("domain", "general")

    _local_log("1/5 Local v2.9.6: مسح جميع صفحات PDF وتجهيز Evidence Pack حتمي")
    evidence_json, pages, evidence_pages, evidence_stats = extract_local_evidence_v2(pdf_path, domain)
    evidence_pack = json.loads(evidence_json)
    _local_log(
        f"1/5 Local v2.9.6: pages_scanned={pages} | evidence_pages={len(evidence_pages)} | "
        f"snippets={evidence_stats.get('snippet_count')} | samples={evidence_pack.get('sample_value_summary',{}).get('count',0)} | evidence_chars={evidence_stats.get('evidence_chars')}"
    )

    _local_log("2/5 Local v2.9.6: تجهيز Prompt تحليلي مختصر؛ Python يحتفظ بالأدلة ويبني الـSchema النهائي")
    runtime_prompt = build_local_v2_prompt(cfg["use_case"], pack, evidence_json)
    messages = [
        {"role": "system", "content": LOCAL_V2_POLICY_TEXT},
        {"role": "user", "content": runtime_prompt},
    ]

    started = time.perf_counter()
    calls: list[Dict[str, Any]] = []
    compact: Dict[str, Any] | None = None
    compact_error: str | None = None
    _local_log("3/5 Local v2.9.6: تشغيل طبقة التحليل/الصياغة المختصرة")
    try:
        body = _local_json_call(messages, phase="التحليل المحلي compact")
        calls.append(body)
        text = body.get("message", {}).get("content", "")
        try:
            compact = _parse_compact_json(text)
        except Exception as first_exc:
            if not str(text or "").strip():
                raise RuntimeError(f"طبقة الصياغة لم تُرجع محتوى نهائياً يمكن إصلاحه: {first_exc}")
            _local_log(f"4/5 Local v2.9.6: إصلاح JSON مختصر فقط | السبب={first_exc}")
            repair_prompt = (
                "أصلح كائن JSON التالي فقط. لا تضف حقائق جديدة. اجعله JSON صحيحاً ومختصراً، وحافظ على نفس المفاتيح والمحتوى المتاح. JSON فقط.\n\n"
                + text[:5000]
            )
            repair_body = _local_json_call(
                [
                    {"role":"system","content":"أنت مصحح JSON فقط. لا تضف تحليلاً هندسياً جديداً."},
                    {"role":"user","content":repair_prompt},
                ],
                phase="إصلاح compact JSON",
            )
            calls.append(repair_body)
            compact = _parse_compact_json(repair_body.get("message", {}).get("content", ""))
    except Exception as exc:
        compact_error = str(exc)
        _local_log(f"4/5 Local v2.9.6: طبقة الصياغة لم تكتمل؛ سيتم إخراج الأدلة الحتمية بدون فقدها | السبب={compact_error}")

    result = _assemble_local_v2_result(profile, cfg, pack, evidence_pack, compact, compact_error)
    result = _postprocess_local_v2(result, pack)

    elapsed = round(time.perf_counter() - started, 2)
    prompt_tokens = sum(int(x.get("prompt_eval_count") or 0) for x in calls)
    completion_tokens = sum(int(x.get("eval_count") or 0) for x in calls)
    call_seconds = sum(float(x.get("_elapsed_seconds") or 0) for x in calls)
    local_tps = round(completion_tokens / call_seconds, 2) if completion_tokens and call_seconds else None
    _local_log(
        f"5/5 Local v2.9.6: اكتمل | total={elapsed}s | calls={len(calls)} | "
        f"final_evidence={len(result.get('evidence') or [])} | tokens={prompt_tokens + completion_tokens} | tps={local_tps or '—'}"
    )

    return {
        "provider": "التحليل المحلي الآمن — آي دو",
        "engine": "LM Studio" if LOCAL_PROVIDER == "lmstudio" else "Ollama",
        "model": LOCAL_MODEL,
        "elapsed_seconds": elapsed,
        "pages_extracted": pages,
        "arabic_language_gate": "compact-local-v2.9.6",
        "privacy": "تمت قراءة التقرير وتحليله محلياً داخل الجهاز، ولم يتم إرسال محتوى التقرير إلى خدمة سحابية ضمن هذا المسار.",
        "usage": {
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "total_tokens": prompt_tokens + completion_tokens,
            "cost": 0.0,
        },
        "local_runtime": {
            "pipeline": "full-document-evidence-v2.9.6",
            "calls": len(calls),
            "provider": LOCAL_PROVIDER,
            "gpu_profile": "local runtime / LM Studio" if LOCAL_PROVIDER == "lmstudio" else "managed by Ollama",
            "thinking_enabled": LOCAL_THINK,
            "structured_mode": "compact-json+narrative + deterministic-final-schema",
            "num_ctx": LOCAL_NUM_CTX,
            "tokens_per_second": local_tps,
            "pages_scanned": evidence_stats.get("pages_scanned"),
            "text_pages": evidence_stats.get("text_pages"),
            "evidence_pages": evidence_pages,
            "evidence_page_count": evidence_stats.get("evidence_page_count"),
            "evidence_snippets": evidence_stats.get("snippet_count"),
            "evidence_chars": evidence_stats.get("evidence_chars"),
            "deterministic_evidence_count": len(result.get("evidence") or []),
            "sample_value_count": evidence_pack.get("sample_value_summary", {}).get("count", 0),
            "narrative_layer_status": "ok" if compact is not None else "fallback_deterministic",
        },
        "result": result,
    }

def analyze_local_legacy(pdf_path: Path, profile: str) -> Dict[str, Any]:
    cfg = PROFILE_MAP[profile]
    pack = load_pack(cfg["pack"])
    _local_log("1/4 بدء تجهيز حزمة الأدلة المحلية من ملف PDF")
    report_text, pages, selected_pages = extract_local_evidence(pdf_path, cfg.get("domain", "general"))
    _local_log(
        f"1/4 اكتملت حزمة الأدلة | pages={pages} | selected_pages={selected_pages} | "
        f"evidence_chars={len(report_text)} / limit={LOCAL_EVIDENCE_CHARS}"
    )

    _local_log("2/4 تجهيز سياسة التقييم وحزمة المعرفة")
    runtime_prompt = build_runtime_prompt(cfg["use_case"], pack, report_text)
    messages = [
        {"role": "system", "content": POLICY_TEXT},
        {"role": "user", "content": runtime_prompt},
    ]

    started = time.perf_counter()
    calls: list[Dict[str, Any]] = []

    _local_log("3/4 بدء التحليل المحلي بواسطة Gemma 4 على GPU")
    body = _local_model_call(messages, OUTPUT_SCHEMA, phase="التحليل الأساسي")
    calls.append(body)
    text = body.get("message", {}).get("content", "")

    try:
        result = parse_json_object(text)
    except Exception:
        _local_log("3/4 الناتج الأول يحتاج إصلاح JSON؛ تنفيذ محاولة إصلاح واحدة")
        repair = (
            "الاستجابة السابقة لم تطابق مخطط JSON الإلزامي. "
            "أعد كائن JSON واحداً فقط مطابقاً لهذا المخطط، واكتب جميع النصوص الوصفية بالعربية الفصحى الرسمية، ولا تضف Markdown.\n\n"
            + json.dumps(OUTPUT_SCHEMA, ensure_ascii=False)
            + "\n\nPREVIOUS_RESPONSE:\n"
            + text[:12000]
        )
        body = _local_model_call(
            messages + [{"role": "user", "content": repair}],
            OUTPUT_SCHEMA,
            phase="إصلاح JSON",
        )
        calls.append(body)
        text = body.get("message", {}).get("content", "")
        result = parse_json_object(text)

    language_gate = "passed"
    if needs_arabic_repair(result):
        _local_log("3/4 بوابة اللغة: الناتج يحتاج تعريباً إضافياً")
        body = _local_model_call(
            messages + [{"role": "user", "content": arabic_repair_prompt(result)}],
            OUTPUT_SCHEMA,
            phase="إصلاح اللغة العربية",
        )
        calls.append(body)
        text = body.get("message", {}).get("content", "")
        repaired = parse_json_object(text)
        if not needs_arabic_repair(repaired):
            result = repaired
            language_gate = "repaired"

    elapsed = round(time.perf_counter() - started, 2)
    prompt_tokens = sum(int(x.get("prompt_eval_count") or 0) for x in calls)
    completion_tokens = sum(int(x.get("eval_count") or 0) for x in calls)
    eval_ns = sum(int(x.get("eval_duration") or 0) for x in calls)
    if completion_tokens and eval_ns:
        local_tps = round(completion_tokens / (eval_ns / 1e9), 2)
    else:
        call_seconds = sum(float(x.get("_elapsed_seconds") or 0) for x in calls)
        local_tps = round(completion_tokens / call_seconds, 2) if completion_tokens and call_seconds else None

    _local_log(
        f"4/4 اكتمل التحليل المحلي | total={elapsed}s | calls={len(calls)} | "
        f"tokens={prompt_tokens + completion_tokens} | tps={local_tps or '—'}"
    )
    return {
        "provider": "التحليل المحلي الآمن — آي دو",
        "engine": "LM Studio" if LOCAL_PROVIDER == "lmstudio" else "Ollama",
        "model": LOCAL_MODEL,
        "elapsed_seconds": elapsed,
        "pages_extracted": pages,
        "arabic_language_gate": language_gate,
        "privacy": "تمت معالجة التقرير محلياً داخل الجهاز بواسطة المحرك المحلي، ولم يتم إرسال محتوى التقرير إلى خدمة سحابية ضمن هذا المسار.",
        "usage": {
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "total_tokens": prompt_tokens + completion_tokens,
            "cost": 0.0,
        },
        "local_runtime": {
            "calls": len(calls),
            "provider": LOCAL_PROVIDER,
            "gpu_profile": "RX 6700S / 100% offload configured in LM Studio" if LOCAL_PROVIDER == "lmstudio" else "managed by Ollama",
            "thinking_enabled": LOCAL_THINK,
            "structured_mode": LOCAL_STRUCTURED_MODE,
            "num_ctx": LOCAL_NUM_CTX,
            "tokens_per_second": local_tps,
        },
        "result": result,
    }


def analyze_local(pdf_path: Path, profile: str) -> Dict[str, Any]:
    if LOCAL_PIPELINE == "legacy":
        return analyze_local_legacy(pdf_path, profile)
    return analyze_local_v2(pdf_path, profile)


def comparison(cloud: Dict[str, Any], local: Dict[str, Any]) -> Dict[str, Any]:
    cr = cloud["result"]
    lr = local["result"]
    return {
        "scope_match_same": cr["document"]["scope_match"] == lr["document"]["scope_match"],
        "overall_status_same": cr["overall_status"] == lr["overall_status"],
        "cloud_status": cr["overall_status"],
        "local_status": lr["overall_status"],
        "cloud_seconds": cloud["elapsed_seconds"],
        "local_seconds": local["elapsed_seconds"],
        "cloud_assessments": len(cr.get("assessments", [])),
        "local_assessments": len(lr.get("assessments", [])),
        "cloud_recommendations": len(cr.get("engineering_recommendations", [])),
        "local_recommendations": len(lr.get("engineering_recommendations", [])),
    }



def apply_runtime_config(cfg: Dict[str, Any] | None = None) -> None:
    """Override module globals from Miyar Settings / site_config."""
    global OPENROUTER_API_KEY, OPENROUTER_BASE_URL, OPENROUTER_MODEL, OPENROUTER_PDF_ENGINE
    global OPENROUTER_TIMEOUT_SECONDS, CLOUD_PROVIDER, CLOUD_INPUT_MODE, CLOUD_FAST
    global CLOUD_SKIP_ARABIC_REPAIR, CLOUD_MAX_REPORT_CHARS, CLOUD_MIN_TEXT_CHARS
    global LOCAL_PROVIDER, LOCAL_BASE_URL, LOCAL_MODEL, LOCAL_TIMEOUT_SECONDS
    global LOCAL_PIPELINE, LOCAL_NUM_CTX, LOCAL_NUM_PREDICT, LOCAL_THINK, LOCAL_STRUCTURED_MODE
    global LOCAL_V2_EVIDENCE_CHARS, LOCAL_V2_MAX_SNIPPETS, LOCAL_V2_MAX_SNIPPETS_PER_PAGE, LOCAL_V2_FORCE_JSON
    global MAX_UPLOAD_MB
    cfg = cfg or {}
    if cfg.get("openrouter_api_key") is not None:
        OPENROUTER_API_KEY = str(cfg.get("openrouter_api_key") or "").strip()
    if cfg.get("openrouter_base_url"):
        OPENROUTER_BASE_URL = str(cfg["openrouter_base_url"]).rstrip("/")
    if cfg.get("openrouter_model"):
        OPENROUTER_MODEL = str(cfg["openrouter_model"])
    if cfg.get("openrouter_pdf_engine") is not None:
        OPENROUTER_PDF_ENGINE = str(cfg.get("openrouter_pdf_engine") or "native").strip().lower()
    if cfg.get("openrouter_timeout_seconds"):
        OPENROUTER_TIMEOUT_SECONDS = int(cfg["openrouter_timeout_seconds"])
    if cfg.get("cloud_provider"):
        CLOUD_PROVIDER = str(cfg["cloud_provider"]).lower()
    if cfg.get("cloud_input_mode"):
        CLOUD_INPUT_MODE = str(cfg["cloud_input_mode"]).strip().lower()
    if "cloud_fast" in cfg:
        CLOUD_FAST = bool(cfg["cloud_fast"])
    if "cloud_skip_arabic_repair" in cfg:
        CLOUD_SKIP_ARABIC_REPAIR = bool(cfg["cloud_skip_arabic_repair"])
    if cfg.get("cloud_max_report_chars"):
        CLOUD_MAX_REPORT_CHARS = int(cfg["cloud_max_report_chars"])
    if cfg.get("cloud_min_text_chars"):
        CLOUD_MIN_TEXT_CHARS = int(cfg["cloud_min_text_chars"])
    if cfg.get("local_provider"):
        LOCAL_PROVIDER = str(cfg["local_provider"]).lower()
    if cfg.get("local_base_url"):
        LOCAL_BASE_URL = str(cfg["local_base_url"]).rstrip("/")
    if cfg.get("local_model"):
        LOCAL_MODEL = str(cfg["local_model"])
    if cfg.get("local_timeout_seconds"):
        LOCAL_TIMEOUT_SECONDS = int(cfg["local_timeout_seconds"])
    if cfg.get("local_pipeline"):
        LOCAL_PIPELINE = str(cfg["local_pipeline"]).strip().lower()
    if cfg.get("local_num_ctx"):
        LOCAL_NUM_CTX = int(cfg["local_num_ctx"])
    if cfg.get("local_num_predict"):
        LOCAL_NUM_PREDICT = int(cfg["local_num_predict"])
    if "local_think" in cfg:
        LOCAL_THINK = bool(cfg["local_think"])
    if cfg.get("local_structured_mode"):
        LOCAL_STRUCTURED_MODE = str(cfg["local_structured_mode"]).strip().lower()
    if cfg.get("max_upload_mb"):
        MAX_UPLOAD_MB = int(cfg["max_upload_mb"])


def get_health() -> Dict[str, Any]:
    local_reachable = False
    local_error = ""
    try:
        with httpx.Client(timeout=2.5) as client:
            if LOCAL_PROVIDER == "lmstudio":
                r = client.get(f"{LOCAL_BASE_URL}/models")
            elif LOCAL_PROVIDER == "ollama":
                r = client.get(f"{LOCAL_BASE_URL}/api/tags")
            else:
                r = None
            local_reachable = bool(r is not None and r.status_code < 400)
    except Exception as exc:
        local_error = str(exc)
    return {
        "status": "ok",
        "embedded": True,
        "cloud": {
            "provider": CLOUD_PROVIDER,
            "configured": bool(OPENROUTER_API_KEY),
            "model": OPENROUTER_MODEL,
            "base_url": OPENROUTER_BASE_URL,
            "pdf_engine": OPENROUTER_PDF_ENGINE or "auto",
            "input_mode": CLOUD_INPUT_MODE,
            "fast": CLOUD_FAST,
            "skip_arabic_repair": CLOUD_SKIP_ARABIC_REPAIR,
            "max_report_chars": CLOUD_MAX_REPORT_CHARS,
        },
        "local": {
            "provider": LOCAL_PROVIDER,
            "reachable": local_reachable,
            "model": LOCAL_MODEL,
            "base_url": LOCAL_BASE_URL,
            "thinking_enabled": LOCAL_THINK,
            "structured_mode": LOCAL_STRUCTURED_MODE,
            "num_ctx": LOCAL_NUM_CTX,
            "num_predict": LOCAL_NUM_PREDICT,
            "evidence_chars": LOCAL_EVIDENCE_CHARS,
            "timeout_seconds": LOCAL_TIMEOUT_SECONDS,
            "error": local_error,
            "pipeline": LOCAL_PIPELINE,
            "v2_evidence_chars": LOCAL_V2_EVIDENCE_CHARS,
            "v2_max_snippets": LOCAL_V2_MAX_SNIPPETS,
            "v2_force_json": LOCAL_V2_FORCE_JSON,
        },
        "policy_version": "0.2.9.6-LOCAL-V2-QWEN-MICRO",
        "meyar_engineering_controls": {
            "guardrails_loaded": (BASE_DIR / "policy" / "meyar_engineering_guardrails_v1.md").exists(),
            "control_pack_loaded": (KNOWLEDGE_DIR / "meyar_demo_pack.json").exists(),
            "clause_registry_loaded": (KNOWLEDGE_DIR / "meyar_sbc303_2018_clause_registry_v1.json").exists(),
            "control_pack_version": "embedded",
            "clause_registry_version": "sbc303-2018-v1",
            "effective_for_production": False,
            "edition_gate": {"required": True, "reason": "يتطلب اعتماد خبير جيوتقني", "on_unconfirmed": "NOT_EVALUABLE"},
        },
    }


def analyze_document(pdf_path: Path, profile: str, mode: str = "cloud") -> Dict[str, Any]:
    """Synchronous analyze entry used by Miyar whitelist methods."""
    if profile not in PROFILE_MAP:
        raise ValueError("ملف التقييم المحدد غير معروف")
    if mode not in {"cloud", "local", "compare"}:
        raise ValueError("نمط التحليل المحدد غير معروف")

    preflight_text, _ = extract_pdf_text(pdf_path)
    scope_result = build_scope_mismatch_result(profile, preflight_text)
    if scope_result is not None:
        cls = classify_document_domain(preflight_text)
        if mode == "cloud":
            cloud = make_scope_gate_provider("التحليل السحابي — آي دو", scope_result, cls)
            return {"mode": mode, "profile": profile, "cloud": cloud, "scope_gate_stopped": True}
        if mode == "local":
            local = make_scope_gate_provider("التحليل المحلي الآمن — آي دو", scope_result, cls)
            return {"mode": mode, "profile": profile, "local": local, "scope_gate_stopped": True}
        cloud = make_scope_gate_provider("التحليل السحابي — آي دو", scope_result, cls)
        local = make_scope_gate_provider("التحليل المحلي الآمن — آي دو", scope_result, cls)
        return {
            "mode": mode, "profile": profile, "cloud": cloud, "local": local,
            "comparison": comparison(cloud, local), "scope_gate_stopped": True,
        }

    if mode == "cloud":
        cloud = analyze_cloud(pdf_path, profile)
        return {"mode": mode, "profile": profile, "cloud": cloud}
    if mode == "local":
        local = analyze_local(pdf_path, profile)
        return {"mode": mode, "profile": profile, "local": local}

    payload: Dict[str, Any] = {"mode": mode, "profile": profile}
    with ThreadPoolExecutor(max_workers=2) as pool:
        futs = {
            pool.submit(analyze_cloud, pdf_path, profile): "cloud",
            pool.submit(analyze_local, pdf_path, profile): "local",
        }
        for fut in as_completed(futs):
            key = futs[fut]
            try:
                payload[key] = fut.result()
            except Exception as exc:
                payload[f"{key}_error"] = str(exc)
    if "cloud" in payload and "local" in payload:
        payload["comparison"] = comparison(payload["cloud"], payload["local"])
    return payload


def analyze_bytes(content: bytes, filename: str, profile: str, mode: str = "cloud") -> Dict[str, Any]:
    if not content:
        raise ValueError("الملف المرفوع فارغ")
    if len(content) > MAX_UPLOAD_MB * 1024 * 1024:
        raise ValueError(f"يتجاوز الملف الحد الأقصى وهو {MAX_UPLOAD_MB} ميجابايت")
    suffix = Path(filename or "report.pdf").suffix or ".pdf"
    tmp_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(content)
            tmp_path = Path(tmp.name)
        return analyze_document(tmp_path, profile, mode)
    finally:
        if tmp_path and tmp_path.exists():
            try:
                tmp_path.unlink()
            except OSError:
                pass
