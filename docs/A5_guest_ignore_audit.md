# مراجعة allow_guest / ignore_permissions (A5)

**التاريخ:** 2026-09-19  
**النطاق:** إنفاذ الصلاحيات دون تعطيل مسارات التسجيل/الضيف الشرعية.

## `allow_guest=True` (مقصود)

| المسار | السبب |
| --- | --- |
| `miyar.api.write.submit_registration` | تسجيل منشأة قبل الدخول |
| مسارات `miyar.api.auth` للـ OTP / login إن وُجدت | دخول الزائر |

**قاعدة:** أي `allow_guest` جديد يتطلب مراجعة أمنية + عدم كشف بيانات تشغيلية.

## `ignore_permissions` (مقصود / مقبول)

| الموضع | السبب |
| --- | --- |
| `Delegation.decide/revoke` بعد فحوصات الدور | المفوَّض إليه قد لا يملك Write على السجل |
| `Geotechnical Study.approve_*` بعد `require_principal` | انتقال حالة عبر API محروس |
| `notify_user` → Notification Log | إنشاء إشعار للمستخدم الهدف |
| `Platform Document` عند توليد تقرير/شهادة | أرشفة نظامية |
| `utils/audit.log_event` | سجل تدقيق لا يفشل العملية |

## ما يجب تجنّبه

- `ignore_permissions=True` على مسارات كتابة يطلبها المستخدم مباشرة دون `require_capability`.
- `allow_guest` على أي `write.*` تشغيلي (طلبات، جسات، تفويض، تقييم).

## حالة الإغلاق

- [x] توثيق القائمة  
- [x] إشعارات القراءة عبر Notification Log (بدل Platform Notification غير الموجود)  
- [ ] مراجعة دورية عند كل Sprint (يُحدَّث هذا الملف)
