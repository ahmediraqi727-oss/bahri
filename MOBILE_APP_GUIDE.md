# 📱 دليل وتفاصيل تطبيق الجوال (Android & iOS) لمتجر "أحمد بحري"

تم إنشاء وتجهيز إطار عمل **Capacitor 6+ Native Framework** داخل مشروع متجر أحمد بحري، مما يتيح تشغيل وتحويل المتجر الإلكتروني إلى تطبيق هاتف ذكي رسمي للأندرويد والآيفون مع دعم كامل للميزات الأصلية.

---

## 🛠️ المواصفات والمكونات التقنية المجهزة

### 1. إطار العمل (Native Cross-Platform Architecture):
- **Capacitor Core & Android Native SDK** المدمج في المجلد `/android`.
- **معرف التطبيق (App Bundle ID):** `com.ahmedbahristore.app`
- **اسم التطبيق الرسمي:** `متجر أحمد بحري`
- **المزامنة والتوافق:** جميع مكونات الشاشة والـ Modals، والوضع الليلي، والترجمات، وحماية العين تعمل بتوافق 100% كما هي في المتجر الإلكتروني.

### 2. توحيد المصادقة والمزامنة (Supabase & Visitor Analytics Sync):
- التطبيق مرتبط مباشرة بمشروع **Supabase** الحالي.
- **تأكيد واستعادة الجلسة:** يعمل نظام الكوكيز و `localStorage` و `Capacitor Storage` بشكل موحد، بحيث إن سجل المستخدم أو دخل كـ (ضيف زائر مثل: علي ماجد - نجف)، تظل بياناته مسجلة ومحفوظة بجميع الأجهزة والمتصفحات.
- **تتبع التحليلات والزوار:** يتم إرسال سجل التصفح، ومدة البقاء، ومرعّف الزائر `visitor_id` تلقائياً من تطبيق الهاتف إلى لوحة التحكم الحالية `/dashboard/customers`.

---

## 🚀 كيفية بناء واستخراج ملفات التطبيق (APK / AAB / IPA)

### 🤖 1. استخراج تطبيق الأندرويد (Android APK & AAB):

#### الطريقة الأولى: عبر Android Studio (الموصى بها)
1. قم بفتح برنامج **Android Studio**.
2. اختر **Open** ثم حدد المجلد: `/home/al-adeeb/Downloads/313/احمد بحري 2/android`.
3. انتظر حتى ينتهي Android Studio من فحص ملحقات Gradle.
4. من القائمة العلوية اضغط على: `Build` -> `Build Bundle(s) / APK(s)` -> `Build APK(s)`.
5. ستجد ملف الـ **APK** الجاهز للتثبيت في المسار:
   `android/app/build/outputs/apk/debug/app-debug.apk`

#### الطريقة الثانية: عبر السطر الأوامر (Terminal)
```bash
cd android
./gradlew assembleDebug   # لاستخراج ملف APK تجريبي
./gradlew bundleRelease  # لاستخراج ملف AAB للنشر على متجر Google Play
```

---

### 🍏 2. استخراج تطبيق الآيفون (iOS IPA):

*(يتطلب نظام macOS وبرنامج Xcode)*

1. قم بإضافة منصة الآيفون (في حال كنت على جهاز Mac):
   ```bash
   npx cap add ios
   npx cap sync ios
   ```
2. افتح مشروع الآيفون في Xcode:
   ```bash
   npx cap open ios
   ```
3. من برنامج Xcode اختر الحساب والحزمة: `com.ahmedbahristore.app`.
4. اضغط على `Product` -> `Archive` لاستخراج ملف **.ipa** أو رفعه إلى **TestFlight / App Store Connect**.

---

## 🔔 ميزات الجوال التفاعلية (Native Features)

- **Push Notifications:** مجهزة عبر حزمة `@capacitor/push-notifications` لإرسال الإشعارات والخصومات للزبائن.
- **Status Bar & Dark Theme:** شريط الحالة باللون الكحلي الأنيق `#1e3a8a` متناسق مع شاشات AMOLED.
- **Splash Screen:** شاشة بدء سريعة لمدة ثانية مع شعار المتجر.
