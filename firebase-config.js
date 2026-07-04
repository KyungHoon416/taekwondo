/**
 * 태권커리어 Firebase Configuration
 * ─────────────────────────────────────────────────────────────
 * Firebase Console → 프로젝트 설정 → 내 앱 → SDK 설정에서
 * 아래 값들을 복사해서 채워주세요.
 * ─────────────────────────────────────────────────────────────
 */

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBkjo_qu3WNeqTFIaLGKu0ghEziSzR--c0",
  authDomain: "taekwondo-2026-kh.firebaseapp.com",
  projectId: "taekwondo-2026-kh",
  storageBucket: "taekwondo-2026-kh.firebasestorage.app",
  messagingSenderId: "728853787725",
  appId: "YOUR_APP_ID1:728853787725:web:f0fec15256e167b1591804"
};

const EMAILJS_CONFIG = {
  publicKey: "YOUR_PUBLIC_KEY",       // EmailJS에서 발급받은 Public Key를 적어주세요.
  serviceId: "YOUR_SERVICE_ID",       // EmailJS에서 추가한 Service ID를 적어주세요.
  templateId: "YOUR_TEMPLATE_ID"      // EmailJS에서 생성한 이메일 Template ID를 적어주세요.
};