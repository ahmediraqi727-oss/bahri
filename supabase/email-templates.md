# ✉️ قوالب البريد الإلكتروني الاحترافية لـ Supabase Auth
# Supabase Custom Email Templates (RTL Arabic)

يمكنك نسخ كود الـ HTML المرفق أدناه لكل قالب ولصقه مباشرة في لوحة تحكم Supabase:
**Supabase Dashboard -> Authentication -> Email Templates**

---

## 1️⃣ قالب تأكيد البريد الإلكتروني (Confirm Signup / Email Confirmation)

> **مكان اللصق:** `Supabase Dashboard -> Authentication -> Email Templates -> Confirm signup`

```html
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>تأكيد البريد الإلكتروني - متجر أحمد بحري</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #f4f6f9;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      direction: rtl;
      text-align: right;
      color: #1e293b;
    }
    .wrapper {
      width: 100%;
      background-color: #f4f6f9;
      padding: 30px 15px;
      box-sizing: border-box;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 20px;
      overflow: hidden;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.05);
      border: 1px solid #e2e8f0;
    }
    .header {
      background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%);
      padding: 35px 20px;
      text-align: center;
      color: #ffffff;
    }
    .header img {
      max-width: 90px;
      height: auto;
      border-radius: 16px;
      border: 3px solid rgba(255, 255, 255, 0.3);
      margin-bottom: 12px;
    }
    .header h1 {
      margin: 0;
      font-size: 24px;
      font-weight: 800;
      letter-spacing: -0.5px;
    }
    .header p {
      margin: 6px 0 0 0;
      font-size: 14px;
      opacity: 0.9;
    }
    .content {
      padding: 35px 30px;
      line-height: 1.7;
    }
    .greeting {
      font-size: 18px;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 15px;
    }
    .text {
      font-size: 15px;
      color: #475569;
      margin-bottom: 25px;
    }
    .btn-container {
      text-align: center;
      margin: 35px 0;
    }
    .btn {
      display: inline-block;
      padding: 16px 36px;
      background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
      color: #ffffff !important;
      text-decoration: none;
      font-weight: 800;
      font-size: 16px;
      border-radius: 14px;
      box-shadow: 0 8px 20px rgba(37, 99, 235, 0.3);
      transition: all 0.3s ease;
    }
    .otp-box {
      background-color: #f8fafc;
      border: 2px dashed #cbd5e1;
      border-radius: 14px;
      padding: 15px;
      text-align: center;
      margin: 25px 0;
    }
    .otp-code {
      font-size: 28px;
      font-weight: 900;
      letter-spacing: 6px;
      color: #2563eb;
      font-family: monospace;
    }
    .note {
      background-color: #eff6ff;
      border-right: 4px solid #3b82f6;
      padding: 14px 18px;
      border-radius: 8px;
      font-size: 13px;
      color: #1e40af;
      margin-top: 25px;
    }
    .footer {
      background-color: #f8fafc;
      padding: 25px 30px;
      text-align: center;
      border-top: 1px solid #e2e8f0;
      font-size: 13px;
      color: #94a3b8;
    }
    .footer p {
      margin: 5px 0;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <!-- Header -->
      <div class="header">
        <img src="https://ahmed-bahri.vercel.app/logo.jpg" alt="متجر أحمد بحري">
        <h1>متجر أحمد بحري</h1>
        <p>مرحباً بك في عالم التسوق الرقمي العصري</p>
      </div>

      <!-- Main Content -->
      <div class="content">
        <div class="greeting">مرحباً بك عزيزنا الزبون 👋</div>
        <div class="text">
          شكراً لتسجيلك في <strong>متجر أحمد بحري</strong>! يرجى تأكيد بريدك الإلكتروني لتفعيل حسابك والبدء بتجربة تسوق فريدة ومميزة.
        </div>

        <!-- Call to Action Button -->
        <div class="btn-container">
          <a href="{{ .ConfirmationURL }}" class="btn" target="_blank">تأكيد الحساب وتفعيل البريد الإلكتروني 🚀</a>
        </div>

        <!-- Optional OTP Code -->
        {{ if .Token }}
        <div class="otp-box">
          <div style="font-size: 12px; color: #64748b; margin-bottom: 5px;">أو استخدم رمز التحقق السريع المكون من 6 أرقام:</div>
          <div class="otp-code">{{ .Token }}</div>
        </div>
        {{ end }}

        <!-- Security Note -->
        <div class="note">
          🔒 <strong>تنويه أمني:</strong> هذا الرابط مخصص لك فقط وصالح للاستخدام لفترة محدودة. إذا لم تقم بإنشاء هذا الحساب، يمكنك تجاهل هذا البريد بأمان.
        </div>
      </div>

      <!-- Footer -->
      <div class="footer">
        <p>© 2026 متجر أحمد بحري - جميع الحقوق محفوظة.</p>
        <p>العراق - نينوى / بغداد | خدمة العملاء والدعم الفني متواجدون لخدمتكم 24/7</p>
      </div>
    </div>
  </div>
</body>
</html>
```

---

## 2️⃣ قالب إعادة تعيين كلمة المرور (Reset Password / Forgot Password)

> **مكان اللصق:** `Supabase Dashboard -> Authentication -> Email Templates -> Reset Password`

```html
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>إعادة تعيين كلمة المرور - متجر أحمد بحري</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #f4f6f9;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      direction: rtl;
      text-align: right;
      color: #1e293b;
    }
    .wrapper {
      width: 100%;
      background-color: #f4f6f9;
      padding: 30px 15px;
      box-sizing: border-box;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 20px;
      overflow: hidden;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.05);
      border: 1px solid #e2e8f0;
    }
    .header {
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
      padding: 35px 20px;
      text-align: center;
      color: #ffffff;
    }
    .header img {
      max-width: 90px;
      height: auto;
      border-radius: 16px;
      border: 3px solid rgba(255, 255, 255, 0.2);
      margin-bottom: 12px;
    }
    .header h1 {
      margin: 0;
      font-size: 24px;
      font-weight: 800;
    }
    .header p {
      margin: 6px 0 0 0;
      font-size: 14px;
      color: #cbd5e1;
    }
    .content {
      padding: 35px 30px;
      line-height: 1.7;
    }
    .greeting {
      font-size: 18px;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 15px;
    }
    .text {
      font-size: 15px;
      color: #475569;
      margin-bottom: 25px;
    }
    .btn-container {
      text-align: center;
      margin: 35px 0;
    }
    .btn {
      display: inline-block;
      padding: 16px 36px;
      background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);
      color: #ffffff !important;
      text-decoration: none;
      font-weight: 800;
      font-size: 16px;
      border-radius: 14px;
      box-shadow: 0 8px 20px rgba(220, 38, 38, 0.3);
      transition: all 0.3s ease;
    }
    .otp-box {
      background-color: #fff1f2;
      border: 2px dashed #fecdd3;
      border-radius: 14px;
      padding: 15px;
      text-align: center;
      margin: 25px 0;
    }
    .otp-code {
      font-size: 28px;
      font-weight: 900;
      letter-spacing: 6px;
      color: #e11d48;
      font-family: monospace;
    }
    .warning {
      background-color: #fef2f2;
      border-right: 4px solid #ef4444;
      padding: 14px 18px;
      border-radius: 8px;
      font-size: 13px;
      color: #991b1b;
      margin-top: 25px;
    }
    .footer {
      background-color: #f8fafc;
      padding: 25px 30px;
      text-align: center;
      border-top: 1px solid #e2e8f0;
      font-size: 13px;
      color: #94a3b8;
    }
    .footer p {
      margin: 5px 0;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <!-- Header -->
      <div class="header">
        <img src="https://ahmed-bahri.vercel.app/logo.jpg" alt="متجر أحمد بحري">
        <h1>طلب تعيين كلمة المرور 🔐</h1>
        <p>حماية حسابك وأمان بياناتك هي أولويتنا</p>
      </div>

      <!-- Content -->
      <div class="content">
        <div class="greeting">أهلاً بك 🔑</div>
        <div class="text">
          لقد تلقينا طلباً لإعادة تعيين كلمة المرور الخاصة بحسابك في <strong>متجر أحمد بحري</strong>. يمكنك استخدام الزر أدناه لتحديد كلمة مرور جديدة وأمنة:
        </div>

        <!-- Action Button -->
        <div class="btn-container">
          <a href="{{ .ConfirmationURL }}" class="btn" target="_blank">إعادة تعيين كلمة المرور الآن 🔑</a>
        </div>

        <!-- Optional OTP Code -->
        {{ if .Token }}
        <div class="otp-box">
          <div style="font-size: 12px; color: #9f1239; margin-bottom: 5px;">رمز التحقق السريع لتعيين كلمة المرور:</div>
          <div class="otp-code">{{ .Token }}</div>
        </div>
        {{ end }}

        <!-- Security Warning -->
        <div class="warning">
          ⚠️ <strong>تحذير أمني مهم:</strong> إذا لم تقم بطلب تغيير كلمة المرور بنفسك، يرجى تجاهل هذه الرسالة فوراً. كلمة المرور الخاصة بك ستظل كما هي ودون أي تغيير.
        </div>
      </div>

      <!-- Footer -->
      <div class="footer">
        <p>© 2026 متجر أحمد بحري - جميع الحقوق محفوظة.</p>
        <p>إذا كانت لديك أي استفسارات، يمكنك التواصل مع فريق الدعم الفني مباشرة عبر المتجر.</p>
      </div>
    </div>
  </div>
</body>
</html>
```
