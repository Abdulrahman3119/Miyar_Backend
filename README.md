# معيار — باك اند Frappe لمنصة وساطة الاختبارات والدراسات الجيوتقنية

تطبيق Frappe اسمه `miyar` (Module: `Miyar`) يطابق مواصفات `Miyar/docs/ERPNext-DocTypes.md`.

الفرونت اند (`Miyar/miyar-app`) يتكلم مع هذا التطبيق عبر `/api/method/miyar.api.*` وجلسة Frappe (كوكيز أو token).

## الواجهة الموحّدة

نفس نظام التصميم (ألوان وزارة البلديات / كود المنصات، IBM Plex Arabic، البطاقات والحالات STS) يُطبَّق في مكانين:

| السطح | المسار | ماذا ترى |
| --- | --- | --- |
| بوابة معيار (React) | `/miyar` | نفس تطبيق `miyar-app` مضمّناً في Frappe |
| Frappe Desk | `/desk` + DocTypes | ثيم Desk (`public/css/miyar.css`) + حبوب الحالة (`public/js/miyar.js`) — رابط معيار يفتح `/miyar` |

بناء الفرونت داخل التطبيق:

```bash
cd Miyar/miyar-app && npm run build
# يكتب إلى apps/miyar/miyar/public/frontend/
bench --site site1 clear-cache
bench build --app miyar   # اختياري إن لزم
```

في التطوير المستقل للفرونت يبقى `npm run dev` على المنفذ 5173 كما هو.

## ماذا بُني

1. **أدوار Frappe** العشرة (`Miyar Contractor Principal` … `Miyar Visitor`) وRole Profiles.
2. **كل الماسترز** في القسم 3 (أنواع، USCS، Table 2.1، اختبارات مرجعية، حدود قبول، معرفة v1.2، مساعدة…).
3. **التشغيل:** منشأة، تسجيل، كتالوج، عرض سعر، عقد ثلاثي، طلب اختبار، بند اختبار، دراسة جيوتقنية، جسة، طبقات، عينات، فاتورة مختبر، تفويض، تقييم، حوكمة.
4. **قواعد السيرفر** الأهم: B.R.113 / 116 / 117 / 119 / 127 / 132 / 142 / 145 / 147 / 149 / 151 / 152 / 153 / 163 / 174 / 175 / 178 / 179 / 192 / 232.
5. **مجدول كل 5 دقائق:** مهلة المختبر STS26، اعتماد استشاري تلقائي.
6. **API للفرونت** في `miyar/api/` — انظر `miyar/api/__init__.py`.

الحالات STS تُخزَّن كحقول Select وتُنفَّذ الانتقالات في المتحكّمات، لا Workflow Desk، حتى تبقى قواعد B.R.* مصدر حقيقة واحد.

## التثبيت

من جذر الـ bench:

```bash
bench setup requirements
# أو
./env/bin/pip install -e ./apps/miyar

bench --site <site> install-app miyar
```

`required_apps = ["erpnext"]` لأن الصنف والمجموعة والوحدات والأصول والأقاليم من ERPNext.

بعد التثبيت: `after_install` ينشئ الأدوار ويبذر الماسترز ويضيف حقول Asset.

## ربط الفرونت

الفرونت (`Miyar/miyar-app`) يحفظ عنوان الخادم في `localStorage` ويُضبط من **الإعدادات ← الاتصال بالخادم** أو من شاشة الدخول. بدون عنوان يعمل ببيانات العرض.

نقاط النهاية المستخدمة في الربط:

| الغرض | الاستدعاء | الضيف |
| --- | --- | --- |
| فحص العنوان والتأكد أن miyar مثبت | `miyar.api.auth.ping` | نعم |
| إرسال رمز التحقق للجوال | `miyar.api.auth.request_otp` | نعم |
| تأكيد الرمز وإصدار `api_key:api_secret` | `miyar.api.auth.verify_otp` | نعم |
| الدليل والاختبارات المرجعية والقواعد قبل الدخول | `miyar.api.session.public_boot` | نعم |
| الجلسة + الدليل + الكتالوج + الطلبات بعد الدخول | `miyar.api.session.get_boot` | لا |
| إنهاء الجلسة | `miyar.api.auth.logout` | لا |

- المصادقة عبر `Authorization: token api_key:api_secret` (يُصدره `verify_otp`) لأن الواجهة على نطاق آخر.
- في `developer_mode` رمز التحقق ثابت `1234` ويعاد في `dev_otp` — بوابة SMS غير مربوطة بعد.
- CORS على الموقع: `allow_cors` في `sites/<site>/site_config.json` (مضبوط `"*"` على site1) مع `allowed_referrers` لمنفذ Vite.
- التسجيل: `miyar.api.register.submit_registration`. القوائم الثابتة: `miyar.api.admin.masters`.
- `miyar.api.payload` هو مُحوِّل الأشكال بين DocTypes وأنواع المتجر في React (لا تُكرَّر أسماء الحقول في الفرونت).

لا تُنسخ قيم Select في كود الفرونت؛ المصدر هو الماستر.

### تشغيل الخادم للموقع الصحيح

`bench start` يخدم الموقع الافتراضي `via` على 8002، وmiyar مثبّت على `site1`، فيُشغَّل خادم للموقع:

```bash
bench --site site1 serve --port 8010   # ثم ضع http://localhost:8010 في إعدادات الواجهة
```

أو ثبّت التطبيق على الموقع الافتراضي: `bench --site via install-app miyar`.

### بيانات تجريبية

بعد كل `bench migrate` يعمل تلقائياً:

1. `after_migrate` → `miyar.install.after_migrate` → `seed_all()`
2. Patch `miyar.patches.v1_0.seed_all_doctypes`

`seed_all` يملأ:
- الماسترز (`setup/seed.py`)
- المنشآت والمستخدمين والكتالوج والعقود (`setup/demo.py`)
- الطلبات والفواتير والسياسات والأرشيف والتفويضات… (`setup/seed_ops.py`)

إعادة تشغيل يدوية:

```bash
bench --site site1 execute miyar.setup.seed.run_seed
```

أرقام الجوال التجريبية: `0551234567` (مقاول) و`0559876543` (مختبر) و`0550001111` (أدمن).

## إعادة توليد الـ DocTypes

التعريفات في `scripts/generate_doctypes.py`. بعد التعديل:

```bash
python3 apps/miyar/scripts/generate_doctypes.py
```

الملفات `*.py` الموجودة لا تُستبدل (المتحكمات تبقى).
# Miyar_Backend
# Miyar_Backend
