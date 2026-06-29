/* ==========================================================================
   TaekwonJob Admin Panel — admin.js
   ========================================================================== */

/* ==========================================================================
   Firebase 초기화 & 관리자 접근 제어
   ========================================================================== */
let auth, db, storage;
let bannerDialogMode = 'create';
let editingBanner = null;
let bannerCache = {};
let selectedBannerFile = null;
let selectedBannerPreviewUrl = null;

const DEFAULT_RESUME_PASS_PRODUCTS = [
  { id: 'month_1', name: '1개월 구독권', months: 1, price: 20000, active: true, sort: 1 },
  { id: 'month_2', name: '2개월 구독권', months: 2, price: 30000, active: true, sort: 2 },
  { id: 'month_3', name: '3개월 구독권', months: 3, price: 40000, active: true, sort: 3 }
];

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

(function initAdminAuth() {
  // Firebase 초기화
  try {
    // 이미 초기화된 경우 기존 app 재사용
    try { firebase.app(); } catch (_) { firebase.initializeApp(FIREBASE_CONFIG); }
    auth    = firebase.auth();
    db      = firebase.firestore();
    storage = (firebase.storage) ? firebase.storage() : null;
  } catch (e) {
    console.error('Firebase 초기화 실패:', e);
    return;
  }

  const overlay      = document.getElementById('admin-auth-overlay');
  const denied       = document.getElementById('admin-access-denied');
  const loginFormWrap = document.getElementById('admin-login-form-wrap');
  const checking     = document.getElementById('admin-checking');
  const errorEl      = document.getElementById('admin-login-error');
  const loginBtn     = document.getElementById('admin-login-btn');
  const sidebar      = document.getElementById('admin-sidebar');
  const mainContent  = document.querySelector('.admin-main');

  // 대시보드 숨기기 (초기 상태)
  if (sidebar)     sidebar.style.display = 'none';
  if (mainContent) mainContent.style.display = 'none';

  // ── 오류 메시지 표시/숨기기 헬퍼 ──
  function showError(msg) {
    if (errorEl) { errorEl.textContent = msg; errorEl.style.display = 'block'; }
  }
  function clearError() {
    if (errorEl) { errorEl.textContent = ''; errorEl.style.display = 'none'; }
  }

  // ── 로그인 버튼 클릭 ──
  if (loginBtn) {
    loginBtn.addEventListener('click', async () => {
      clearError();
      const email    = document.getElementById('admin-login-email')?.value?.trim();
      const password = document.getElementById('admin-login-password')?.value;
      if (!email || !password) { showError('이메일과 비밀번호를 입력해주세요.'); return; }

      loginBtn.textContent = '로그인 중...';
      loginBtn.disabled = true;
      try {
        await auth.signInWithEmailAndPassword(email, password);
        // onAuthStateChanged에서 처리
      } catch (err) {
        const msg = (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found')
          ? '이메일 또는 비밀번호가 올바르지 않습니다.'
          : err.code === 'auth/too-many-requests'
          ? '로그인 시도 횟수를 초과했습니다. 잠시 후 다시 시도하세요.'
          : '로그인에 실패했습니다. (' + err.code + ')';
        showError(msg);
        loginBtn.textContent = '로그인하기';
        loginBtn.disabled = false;
      }
    });

    // Enter 키 로그인
    document.getElementById('admin-login-password')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') loginBtn.click();
    });
  }

  // ── 인증 상태 감지 → 접근 제어 ──
  auth.onAuthStateChanged(async (user) => {
    if (!user) {
      // 비로그인 → 로그인 화면 표시
      if (loginFormWrap) loginFormWrap.style.display = 'block';
      if (checking)     checking.style.display = 'none';
      if (overlay)      overlay.style.display = 'flex';
      if (denied)       denied.style.display  = 'none';
      if (sidebar)      sidebar.style.display  = 'none';
      if (mainContent)  mainContent.style.display = 'none';
      loginBtn.textContent = '로그인하기';
      loginBtn.disabled = false;
      return;
    }

    // 로그인됨 → 권한 확인 중 표시
    if (loginFormWrap) loginFormWrap.style.display = 'none';
    if (checking)     checking.style.display = 'block';

    try {
      const snap = await db.collection('users').doc(user.uid).get();
      const data = snap.data();

      const adminEmails = ['admin@taekwonjob.com', 'admin2@taekwonjob.com', 'admin3@taekwonjob.com'];
      if (data && user.email && adminEmails.includes(user.email.toLowerCase())) {
        // ✅ 지정된 어드민 계정만 대시보드 허용
        if (overlay)     overlay.style.display = 'none';
        if (denied)      denied.style.display  = 'none';
        if (sidebar)     sidebar.style.display  = '';
        if (mainContent) mainContent.style.display = '';

        // 관리자 이름 표시
        const adminNameEl = document.querySelector('.sidebar-admin-info div div:first-child');
        if (adminNameEl) adminNameEl.textContent = data.name || user.email;

        // Firestore 실시간 데이터 로드 및 렌더링
        await fetchFirestoreData();
        await loadResumePassProducts();
        populateDashboard();
        updateDashboardStats();

        // 테이블 뷰 갱신
        filterMembers();
        filterJobs();
        filterResumes();
        filterApplications();

        // 로그아웃 버튼 연결
        const logoutArea = document.querySelector('.sidebar-footer');
        if (logoutArea && !logoutArea.querySelector('#sidebar-logout-btn')) {
          const btn = document.createElement('button');
          btn.id = 'sidebar-logout-btn';
          btn.textContent = '로그아웃';
          btn.style.cssText = 'width:100%;margin-top:0.5rem;padding:0.5rem;background:rgba(255,255,255,0.08);color:rgba(255,255,255,0.6);border:none;border-radius:6px;font-size:0.8rem;font-weight:600;cursor:pointer;font-family:inherit;transition:all 0.15s';
          btn.onmouseover = () => { btn.style.background='rgba(255,255,255,0.15)'; btn.style.color='#fff'; };
          btn.onmouseout  = () => { btn.style.background='rgba(255,255,255,0.08)'; btn.style.color='rgba(255,255,255,0.6)'; };
          btn.onclick = () => auth.signOut();
          logoutArea.appendChild(btn);
        }

      } else {
        // ❌ 사범(구직자) 또는 Firestore 데이터 없음 → 접근 거부
        if (overlay) overlay.style.display = 'none';
        if (denied)  { denied.style.display = 'flex'; }
        if (sidebar)     sidebar.style.display  = 'none';
        if (mainContent) mainContent.style.display = 'none';
      }
    } catch (e) {
      console.error('권한 확인 오류:', e);
      showError('권한 확인 중 오류가 발생했습니다.');
      if (loginFormWrap) loginFormWrap.style.display = 'block';
      if (checking)     checking.style.display = 'none';
      loginBtn.textContent = '로그인하기';
      loginBtn.disabled = false;
    }
  });
})();


// ─── Mock Data ───────────────────────────────────────────────────────────────
const MEMBERS = [
  { id: 1, name: '이강남', email: 'leegangnam@gmail.com', businessNumber: '107-81-83669', type: 'gym', joinDate: '2026-05-01', status: 'active' },
  { id: 2, name: '김사범', email: 'kimsabum@naver.com', businessNumber: '-', type: 'instructor', joinDate: '2026-05-03', status: 'active' },
  { id: 3, name: '박관장', email: 'parkgj@kakao.com', businessNumber: '214-82-01928', type: 'gym', joinDate: '2026-05-05', status: 'active' },
  { id: 4, name: '최사범', email: 'choijabum@naver.com', businessNumber: '-', type: 'instructor', joinDate: '2026-05-07', status: 'active' },
  { id: 5, name: '정관장', email: 'junggj@gmail.com', businessNumber: '110-23-45678', type: 'gym', joinDate: '2026-05-09', status: 'inactive' },
  { id: 6, name: '한사범', email: 'hansabum@naver.com', businessNumber: '-', type: 'instructor', joinDate: '2026-05-10', status: 'active' },
  { id: 7, name: '조관장', email: 'jodojang@kakao.com', businessNumber: '120-11-22334', type: 'gym', joinDate: '2026-05-12', status: 'active' },
  { id: 8, name: '윤사범', email: 'yoonsabum@gmail.com', businessNumber: '-', type: 'instructor', joinDate: '2026-05-13', status: 'banned' },
  { id: 9, name: '강관장', email: 'kangdojang@naver.com', businessNumber: '220-44-55667', type: 'gym', joinDate: '2026-05-14', status: 'active' },
  { id: 10, name: '임사범', email: 'yimsabum@gmail.com', businessNumber: '-', type: 'instructor', joinDate: '2026-05-15', status: 'active' },
  { id: 11, name: '신관장', email: 'shingj@naver.com', businessNumber: '105-07-88990', type: 'gym', joinDate: '2026-05-16', status: 'active' },
  { id: 12, name: '오사범', email: 'ohsabum@kakao.com', businessNumber: '-', type: 'instructor', joinDate: '2026-05-17', status: 'active' },
  { id: 13, name: '서관장', email: 'seogj@gmail.com', businessNumber: '113-14-15161', type: 'gym', joinDate: '2026-05-18', status: 'inactive' },
  { id: 14, name: '권사범', email: 'kwonsabum@naver.com', businessNumber: '-', type: 'instructor', joinDate: '2026-05-19', status: 'active' },
  { id: 15, name: '황관장', email: 'hwanggj@kakao.com', businessNumber: '101-12-34567', type: 'gym', joinDate: '2026-05-20', status: 'active' },
];

const JOBS = [
  { id: 128, title: '강남 태권도장 메인사범 모집', gym: '강남 태권도장', region: '서울', district: '강남구', salary: '월 320만원', position: '메인사범', exp: '경력 3년↑', regDate: '2026-05-18', views: 45, status: '게시중' },
  { id: 127, title: '송파 태권도장 보조사범 모집', gym: '송파 태권도장', region: '서울', district: '송파구', salary: '월 260만원', position: '보조사범', exp: '신입 가능', regDate: '2026-05-18', views: 32, status: '게시중' },
  { id: 126, title: '분당 태권도장 메인사범 모집', gym: '분당 태권도장', region: '경기', district: '성남시', salary: '시급 15,000', position: '파트타임', exp: '경력 1년↑', regDate: '2026-05-17', views: 28, status: '검토중' },
  { id: 125, title: '일산 태권도장 메인사범 모집', gym: '일산 태권도장', region: '경기', district: '고양시', salary: '월 300만원', position: '메인사범', exp: '경력 2년↑', regDate: '2026-05-17', views: 15, status: '마감됨' },
  { id: 124, title: '인천 태권도장 보조사범 모집', gym: '인천 태권도장', region: '인천', district: '연수구', salary: '월 250만원', position: '보조사범', exp: '신입 가능', regDate: '2026-05-16', views: 25, status: '게시중' },
  { id: 123, title: '대전 도장 수석사범 모집', gym: '대전 태권도장', region: '대전', district: '서구', salary: '월 380만원', position: '수석사범', exp: '경력 5년↑', regDate: '2026-05-15', views: 67, status: '게시중' },
  { id: 122, title: '부산 해운대 메인사범 채용', gym: '해운대 태권도장', region: '부산', district: '해운대구', salary: '월 310만원', position: '메인사범', exp: '경력 2년↑', regDate: '2026-05-14', views: 52, status: '게시중' },
  { id: 121, title: '수원 유치부 전임 사범 모집', gym: '수원 태권도장', region: '경기', district: '수원시', salary: '월 280만원', position: '유치부 전임', exp: '경력 1년↑', regDate: '2026-05-13', views: 38, status: '마감됨' },
  { id: 120, title: '광주 메인사범 채용공고', gym: '광주 태권도장', region: '광주', district: '서구', salary: '월 295만원', position: '메인사범', exp: '경력 2년↑', regDate: '2026-05-12', views: 41, status: '게시중' },
  { id: 119, title: '구리 보조사범 모집', gym: '구리 태권도장', region: '경기', district: '구리시', salary: '월 240만원', position: '보조사범', exp: '신입 가능', regDate: '2026-05-11', views: 19, status: '마감됨' },
];

const RESUMES = [
  { id: 1, name: '김사범', gender: '남', position: '메인사범', exp: '경력 5년', area: '서울', salary: '월 320만원↑', grade: '3단', cert: '생활스포츠지도사 2급', regDate: '2026-05-18' },
  { id: 2, name: '이사범', gender: '남', position: '보조사범', exp: '경력 2년', area: '경기', salary: '월 260만원↑', grade: '2단', cert: '태권도 지도자', regDate: '2026-05-17' },
  { id: 3, name: '박사범', gender: '여', position: '유치부 전임', exp: '경력 3년', area: '서울/경기', salary: '월 280만원↑', grade: '3단', cert: '유아체육지도사', regDate: '2026-05-16' },
  { id: 4, name: '최사범', gender: '남', position: '수석사범', exp: '경력 8년', area: '전국', salary: '월 400만원↑', grade: '5단', cert: '체육지도자, 생스지 1급', regDate: '2026-05-15' },
  { id: 5, name: '메인사범', gender: '남', position: '메인사범', exp: '신입', area: '수도권', salary: '월 250만원↑', grade: '2단', cert: '태권도 지도자', regDate: '2026-05-14' },
  { id: 6, name: '한사범', gender: '여', position: '보조사범', exp: '경력 1년', area: '부산', salary: '월 220만원↑', grade: '2단', cert: '생활스포츠지도사 2급', regDate: '2026-05-13' },
  { id: 7, name: '조사범', gender: '남', position: '파트타임', exp: '경력 2년', area: '대전/세종', salary: '시급 15,000↑', grade: '3단', cert: '태권도 지도자', regDate: '2026-05-12' },
];

const APPLICATIONS = [
  { id: 215, applicant: '김사범', job: '강남 태권도장 메인사범 모집', gym: '강남 태권도장', applyDate: '2026-05-18', status: '검토중' },
  { id: 214, applicant: '이사범', job: '송파 태권도장 보조사범 모집', gym: '송파 태권도장', applyDate: '2026-05-18', status: '면접제안' },
  { id: 213, applicant: '박사범', job: '대전 도장 수석사범 모집', gym: '대전 태권도장', applyDate: '2026-05-17', status: '합격' },
  { id: 212, applicant: '최사범', job: '부산 해운대 메인사범 채용', gym: '해운대 태권도장', applyDate: '2026-05-16', status: '검토중' },
  { id: 211, applicant: '메인사범', job: '광주 메인사범 채용공고', gym: '광주 태권도장', applyDate: '2026-05-15', status: '불합격' },
  { id: 210, applicant: '한사범', job: '일산 태권도장 메인사범 모집', gym: '일산 태권도장', applyDate: '2026-05-14', status: '합격' },
  { id: 209, applicant: '조사범', job: '인천 태권도장 보조사범 모집', gym: '인천 태권도장', applyDate: '2026-05-13', status: '검토중' },
  { id: 208, applicant: '윤사범', job: '분당 태권도장 메인사범 모집', gym: '분당 태권도장', applyDate: '2026-05-12', status: '면접제안' },
];

const INQUIRIES = [];

// ─── Pagination State ────────────────────────────────────────────────────────
const PAGE_SIZE = 7;
const state = {
  members: { page: 1, filtered: [...MEMBERS] },
  jobs: { page: 1, filtered: [...JOBS] },
  resumes: { page: 1, filtered: [...RESUMES] },
  applications: { page: 1, filtered: [...APPLICATIONS] },
};

// ─── Navigation ──────────────────────────────────────────────────────────────
const VIEW_TITLES = {
  dashboard: '대시보드',
  members: '회원 목록',
  jobs: '채용공고 목록',
  resumes: '이력서 목록',
  applications: '지원 목록',
  inquiries: '문의 목록',
  notices: '공지사항 관리',
  analytics: '통계 대시보드',
  banners: '배너 등록 / 관리',
  terms: '약관 등록 / 관리',
  settings: '설정',
};

async function navigateTo(viewId, clickedItem) {
  // Update views
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + viewId)?.classList.add('active');

  // Update nav
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  clickedItem?.classList.add('active');

  // Update breadcrumb & header
  const title = VIEW_TITLES[viewId] || viewId;
  const el = document.getElementById('breadcrumb-current');
  if (el) el.textContent = title;

  // 탭 이동 시 최신 Firestore 데이터를 자동으로 동기화(새로 가져오기)
  if (['dashboard', 'members', 'jobs', 'resumes', 'applications', 'inquiries'].includes(viewId)) {
    try {
      await fetchFirestoreData();
    } catch (e) {
      console.error('탭 데이터 자동 로드 실패:', e);
    }
  }

  // Init/Refresh view
  if (viewId === 'dashboard') {
    populateDashboard();
    updateDashboardStats();
  }
  if (viewId === 'members') filterMembers();
  if (viewId === 'jobs') filterJobs();
  if (viewId === 'resumes') filterResumes();
  if (viewId === 'applications') filterApplications();
  if (viewId === 'inquiries') populateInquiries();
  if (viewId === 'analytics') initAnalyticsCharts();
  if (viewId === 'banners') loadBanners();
  if (viewId === 'terms') {
    // 기본적으로 gym 약관 선택 로드
    selectAdminTerms('gym');
  }
}


// 수동 새로고침 함수
window.refreshAdminData = async function(viewId) {
  showToast('데이터를 새로고침하는 중...', 'warning');
  try {
    await fetchFirestoreData();

    // 현재 뷰 갱신
    if (viewId === 'dashboard') {
      populateDashboard();
      updateDashboardStats();
    } else if (viewId === 'members') {
      filterMembers();
    } else if (viewId === 'jobs') {
      filterJobs();
    } else if (viewId === 'resumes') {
      filterResumes();
    } else if (viewId === 'applications') {
      filterApplications();
    } else if (viewId === 'inquiries') {
      populateInquiries();
    } else if (viewId === 'notices') {
      // 공지사항은 현재 정적 마크업이므로 로딩 지연 시뮬레이션
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    showToast('데이터 새로고침 완료', 'success');
  } catch (err) {
    console.error('데이터 새로고침 중 오류:', err);
    showToast('새로고침 실패: ' + err.message, 'error');
  }
};

async function fetchFirestoreData() {
  if (typeof db === 'undefined' || !db) return;

  // 1. 회원 목록 (users 컬렉션)
  try {
    const userSnap = await db.collection('users').get();
    const dbMembers = [];
    userSnap.forEach((doc) => {
      const u = doc.data();
      dbMembers.push({
        id: doc.id.substring(0, 8),
        fullId: doc.id,
        name: u.name || '이름 없음',
        email: u.email || '',
        phone: u.phone || '-',
        businessNumber: u.business_number || '-',
        businessStatus: u.business_status || '',
        businessStatusCode: u.business_status_code || '',
        businessValid: u.business_valid || '',
        testPaymentEnabled: u.testPaymentEnabled === true,
        resumeSubscriptionUntil: u.resumeSubscriptionUntil || null,
        resumeSubscriptionMonths: u.resumeSubscriptionMonths || 0,
        type: u.type || 'instructor',
        joinDate: u.created_at ? (u.created_at.toDate ? u.created_at.toDate().toISOString().split('T')[0] : '2026-06-11') : '2026-06-11',
        status: 'active'
      });
    });
    if (dbMembers.length > 0) {
      MEMBERS.length = 0;
      MEMBERS.push(...dbMembers);
      state.members.filtered = [...MEMBERS];
    }
  } catch (err) {
    console.warn('Firestore 회원 데이터 조회 중 실패 (보안규칙 등):', err);
    showToast('회원 목록 조회 실패: ' + err.message, 'error');
  }

  // 2. 이력서 목록 (resumes 컬렉션)
  try {
    const resumeSnap = await db.collection('resumes').get();
    const dbResumes = [];
    resumeSnap.forEach((doc) => {
      const r = doc.data();
      dbResumes.push({
        id: doc.id.substring(0, 8),
        fullId: doc.id,
        userId: r.user_id || '',
        name: r.name || '사범',
        gender: r.gender || '남성',
        position: r.hope_position || r.hope_position || '메인사범',
        exp: r.career || '경력무관',
        area: r.hope_area || '전국',
        salary: r.hope_salary || '월 280만원↑',
        grade: r.certificate ? r.certificate.split(',')[0].trim() : '태권도 3단',
        cert: r.certificate ? r.certificate.split(',').slice(1).join(',').trim() : '태권도 지도자',
        regDate: r.created_at ? (r.created_at.toDate ? r.created_at.toDate().toISOString().split('T')[0] : '2026-06-11') : '2026-06-11',
        content: r.content || '자기소개 본문이 없습니다.'
      });
    });
    if (dbResumes.length > 0) {
      RESUMES.length = 0;
      RESUMES.push(...dbResumes);
      state.resumes.filtered = [...RESUMES];
    }
  } catch (err) {
    console.warn('Firestore 이력서 데이터 조회 중 실패:', err);
    showToast('이력서 목록 조회 실패: ' + err.message, 'error');
  }

  // 3. 채용공고 목록 (jobs 컬렉션)
  try {
    const jobSnap = await db.collection('jobs').get();
    const dbJobs = [];
    jobSnap.forEach((doc) => {
      const j = doc.data();
      const parts = String(j.location || '').split(/\s+/);
      const region = parts[0] || '전국';
      const district = parts.slice(1).join(' ') || '';

      // 작성자(관장님) 정보 조인
      const creator = MEMBERS.find(m => m.fullId === j.user_id);
      const userName = creator ? creator.name : (j.gymName || '관장님');
      const userEmail = creator ? creator.email : '이메일 정보 없음';

      dbJobs.push({
        id: doc.id.substring(0, 8),
        fullId: doc.id,
        userId: j.user_id || '',
        userName: userName,
        userEmail: userEmail,
        title: j.title || '채용공고',
        gym: j.gymName || '태권도장',
        region: region,
        district: district,
        salary: j.salary || '협의',
        position: j.position || '메인사범',
        exp: j.career || '경력무관',
        regDate: j.created_at ? (j.created_at.toDate ? j.created_at.toDate().toISOString().split('T')[0] : '2026-06-11') : '2026-06-11',
        views: j.views || 0,
        uniqueViews: j.viewed_users ? j.viewed_users.length : 0,
        viewedUsers: j.viewed_users || [],
        status: j.status === 'active' ? '게시중' : '마감됨',
        pinned: j.pinned || false,
        content: j.content || '공고 본문 내용이 없습니다.'
      });
    });
    if (dbJobs.length > 0) {
      JOBS.length = 0;
      JOBS.push(...dbJobs);
      state.jobs.filtered = [...JOBS];
    }
  } catch (err) {
    console.warn('Firestore 채용공고 데이터 조회 중 실패:', err);
    showToast('채용공고 목록 조회 실패: ' + err.message, 'error');
  }

  // 4. 지원 목록 (apply 컬렉션)
  try {
    const applySnap = await db.collection('apply').get();
    const dbApplies = [];
    applySnap.forEach((doc) => {
      const a = doc.data();
      const matchedResume = RESUMES.find(r => r.fullId === a.resume_id);
      const matchedJob = JOBS.find(j => j.fullId === a.job_id);

      let applicantEmail = '';
      if (matchedResume) {
        const matchedMember = MEMBERS.find(m => m.fullId === matchedResume.userId);
        if (matchedMember) {
          applicantEmail = matchedMember.email;
        }
      }

      dbApplies.push({
        id: doc.id.substring(0, 8),
        fullId: doc.id,
        applicant: matchedResume ? matchedResume.name : '지원자',
        email: applicantEmail,
        job: matchedJob ? matchedJob.title : '채용공고',
        gym: matchedJob ? matchedJob.gym : '도장',
        applyDate: a.created_at ? (a.created_at.toDate ? a.created_at.toDate().toISOString().split('T')[0] : '2026-06-11') : '2026-06-11',
        status: a.status === 'pending' ? '검토중' : a.status === 'interview' ? '면접제안' : (a.status === 'accepted' || a.status === 'pass') ? '합격' : '불합격',
        resumeId: a.resume_id || '',
        jobId: a.job_id || ''
      });
    });
    if (dbApplies.length > 0) {
      APPLICATIONS.length = 0;
      APPLICATIONS.push(...dbApplies);
      state.applications.filtered = [...APPLICATIONS];
    }
  } catch (err) {
    console.warn('Firestore 지원 데이터 조회 중 실패:', err);
    showToast('지원 목록 조회 실패: ' + err.message, 'error');
  }

  // 5. 문의 목록 (inquiries 컬렉션)
  try {
    const inquirySnap = await db.collection('inquiries').get();
    const dbInquiries = [];
    inquirySnap.forEach((doc) => {
      const i = doc.data();
      dbInquiries.push({
        id: doc.id,
        name: i.name || '이름 없음',
        email: i.email || '',
        phone: i.phone || '',
        type: i.type || '일반 문의',
        title: i.title || '',
        content: i.content || '',
        status: i.status || 'pending',
        answer: i.answer || '',
        created_at: i.created_at ? (i.created_at.toDate ? i.created_at.toDate().toISOString() : '2026-06-11T00:00:00Z') : '2026-06-11T00:00:00Z',
        answered_at: i.answered_at ? (i.answered_at.toDate ? i.answered_at.toDate().toISOString() : '') : ''
      });
    });
    // 정렬 (timestamp 기준 내림차순 정렬)
    dbInquiries.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    INQUIRIES.length = 0;
    INQUIRIES.push(...dbInquiries);
  } catch (err) {
    console.warn('Firestore 문의 데이터 조회 중 실패:', err);
    showToast('문의 목록 조회 실패: ' + err.message, 'error');
  }

  // 사이드바 메뉴 뱃지 일괄 갱신
  updateSidebarBadges();
}

function updateSidebarBadges() {
  // 1. 지원 목록 뱃지 ('검토중' 건수)
  const pendingApps = APPLICATIONS.filter(a => a.status === '검토중').length;
  const appBadge = document.getElementById('pending-badge');
  if (appBadge) {
    appBadge.textContent = pendingApps;
    appBadge.style.display = pendingApps > 0 ? 'inline-flex' : 'none';
  }

  // 2. 문의 목록 뱃지 (미답변 'pending' 건수)
  const pendingInquiries = INQUIRIES.filter(i => i.status === 'pending').length;
  const inqBadge = document.getElementById('inquiries-badge');
  if (inqBadge) {
    inqBadge.textContent = pendingInquiries;
    inqBadge.style.display = pendingInquiries > 0 ? 'inline-flex' : 'none';
  }

  // 3. 이력서 목록 뱃지 (최근 3일 이내 신규 등록 건수)
  const today = new Date();
  const threeDaysAgo = new Date(today);
  threeDaysAgo.setDate(today.getDate() - 3);
  
  const newResumesCount = RESUMES.filter(r => {
    if (!r.regDate) return false;
    const reg = new Date(r.regDate);
    return reg >= threeDaysAgo;
  }).length;

  const resumeBadge = document.getElementById('resumes-badge');
  if (resumeBadge) {
    resumeBadge.textContent = newResumesCount;
    resumeBadge.style.display = newResumesCount > 0 ? 'inline-flex' : 'none';
  }
}

function updateDashboardStats() {
  const membersVal = document.getElementById('stat-members-count');
  const jobsVal = document.getElementById('stat-jobs-count');
  const resumesVal = document.getElementById('stat-resumes-count');
  const appsVal = document.getElementById('stat-applications-count');

  if (membersVal) membersVal.textContent = MEMBERS.length.toLocaleString('ko-KR');
  if (jobsVal) jobsVal.textContent = JOBS.length.toLocaleString('ko-KR');
  if (resumesVal) resumesVal.textContent = RESUMES.length.toLocaleString('ko-KR');
  if (appsVal) appsVal.textContent = APPLICATIONS.length.toLocaleString('ko-KR');
}

// ─── Dashboard Tables ────────────────────────────────────────────────────────
function populateDashboard() {
  // Recent jobs (5 rows)
  const tbody = document.getElementById('dash-jobs-tbody');
  if (tbody) {
    tbody.innerHTML = JOBS.slice(0, 5).map(j => `
      <tr>
        <td><span style="color:var(--muted);font-size:0.78rem">#${j.id}</span></td>
        <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600">${j.title}</td>
        <td>${j.gym}</td>
        <td>${j.region} ${j.district}</td>
        <td style="color:var(--blue);font-weight:700">${j.salary}</td>
        <td style="color:var(--muted)">${j.regDate}</td>
        <td>${statusBadge(j.status)}</td>
      </tr>`).join('');
  }

  // Recent applications (5 rows)
  const atbody = document.getElementById('dash-apps-tbody');
  if (atbody) {
    atbody.innerHTML = APPLICATIONS.slice(0, 5).map(a => `
      <tr>
        <td style="font-weight:700">${a.applicant}</td>
        <td style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--muted)">${a.job}</td>
        <td>${appStatusBadge(a.status)}</td>
      </tr>`).join('');
  }
}

// ─── Members Table ───────────────────────────────────────────────────────────
function filterMembers() {
  const q = document.getElementById('member-search')?.value.toLowerCase() || '';
  const type = document.getElementById('member-type-filter')?.value || '';
  const status = document.getElementById('member-status-filter')?.value || '';

  state.members.filtered = MEMBERS.filter(m => {
    const matchQ = !q || m.name.includes(q) || m.email.includes(q);
    const matchType = !type || m.type === type;
    const matchStatus = !status || m.status === status;
    return matchQ && matchType && matchStatus;
  });
  state.members.page = 1;
  renderMembers();
}

function renderMembers() {
  const { filtered, page } = state.members;
  const start = (page - 1) * PAGE_SIZE;
  const items = filtered.slice(start, start + PAGE_SIZE);

  const countEl = document.getElementById('member-count');
  if (countEl) countEl.innerHTML = `전체 <strong>${filtered.length}</strong>명`;

  const tbody = document.getElementById('members-tbody');
  if (!tbody) return;

  if (items.length === 0) {
    tbody.innerHTML = `<tr><td colspan="11"><div class="empty-state"><svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg><p>검색 결과가 없습니다.</p></div></td></tr>`;
  } else {
    tbody.innerHTML = items.map(m => `
      <tr>
        <td style="color:var(--muted);font-size:0.78rem">${m.id}</td>
        <td style="font-weight:700">${m.name}</td>
        <td style="color:var(--muted)">${m.email}</td>
        <td style="color:var(--muted)">${m.phone}</td>
        <td style="color:var(--muted)">${m.businessNumber}</td>
        <td>${m.type === 'gym' ? '<span class="badge badge-blue">도장(관장)</span>' : '<span class="badge badge-green">사범(구직자)</span>'}</td>
        <td style="color:var(--muted)">${m.joinDate}</td>
        <td>
          ${memberStatusBadge(m.status)}
          ${m.type === 'gym' ? (
            m.businessValid === '01' && m.businessStatusCode === '01'
              ? '<span class="badge badge-blue" style="margin-left:4px">검증완료</span>'
              : '<span class="badge badge-amber" style="margin-left:4px">확인중</span>'
          ) : ''}
        </td>
        <td>
          ${m.type === 'gym' ? `
            <div class="member-payment-toggle">
              <label class="toggle-switch" title="이 회원의 테스트 결제 허용">
                <input type="checkbox" ${m.testPaymentEnabled ? 'checked' : ''} onchange="toggleMemberTestPayment('${m.id}', this.checked)">
                <span class="toggle-slider"></span>
              </label>
              <span class="${m.testPaymentEnabled ? 'toggle-state-on' : 'toggle-state-off'}">${m.testPaymentEnabled ? 'ON' : 'OFF'}</span>
            </div>
          ` : '<span style="color:var(--muted);font-size:0.78rem">-</span>'}
        </td>
        <td>${renderMemberSubscriptionBadge(m)}</td>
        <td>
          <div class="action-btns">
            <button class="btn-icon" title="상세보기" onclick="showDetail('member', '${m.id}')">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
            <button class="btn-icon ${m.status === 'banned' ? 'success' : 'danger'}" title="${m.status === 'banned' ? '정지 해제' : '회원 정지'}" onclick="toggleMemberBan('${m.id}')">
              ${m.status === 'banned'
                ? '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>'
                : '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>'
              }
            </button>
          </div>
        </td>
      </tr>`).join('');
  }
  renderPagination('members-pagination', filtered.length, page, 'members');
}

function getAdminMillisFromDateLike(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function formatMemberSubscriptionDate(value) {
  const millis = getAdminMillisFromDateLike(value);
  if (!millis) return '-';
  return new Date(millis).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
}

function renderMemberSubscriptionBadge(member) {
  if (member.type !== 'gym') return '<span style="color:var(--muted);font-size:0.78rem">-</span>';
  const untilMillis = getAdminMillisFromDateLike(member.resumeSubscriptionUntil);
  if (!untilMillis) return '<span class="badge badge-amber">미구독</span>';
  if (untilMillis <= Date.now()) {
    return `<span class="badge badge-red">만료</span><div class="subscription-date">${formatMemberSubscriptionDate(member.resumeSubscriptionUntil)}</div>`;
  }
  const months = Number(member.resumeSubscriptionMonths) || '';
  const monthText = months ? `${months}개월 ` : '';
  return `<span class="badge badge-blue">${monthText}구독중</span><div class="subscription-date">~ ${formatMemberSubscriptionDate(member.resumeSubscriptionUntil)}</div>`;
}

async function toggleMemberTestPayment(id, enabled) {
  const member = MEMBERS.find(m => m.id === id);
  if (!member) return;

  member.testPaymentEnabled = enabled;
  renderMembers();

  try {
    await db.collection('users').doc(member.fullId).update({
      testPaymentEnabled: enabled
    });
    showToast(`${member.name}님 테스트 결제를 ${enabled ? 'ON' : 'OFF'} 처리했습니다.`, enabled ? 'success' : 'warning');
  } catch (err) {
    member.testPaymentEnabled = !enabled;
    renderMembers();
    console.error('테스트 결제 플래그 변경 실패:', err);
    showToast('테스트 결제 설정 저장 실패: ' + err.message, 'error');
  }
}

function toggleMemberBan(id) {
  const member = MEMBERS.find(m => m.id === id);
  if (!member) return;
  if (member.status === 'banned') {
    member.status = 'active';
    showToast(`${member.name}님의 정지가 해제되었습니다.`, 'success');
  } else {
    member.status = 'banned';
    showToast(`${member.name}님을 정지 처리했습니다.`, 'warning');
  }
  filterMembers();
}

// ─── Jobs Table ──────────────────────────────────────────────────────────────
function filterJobs() {
  const q = document.getElementById('job-search')?.value.toLowerCase() || '';
  const region = document.getElementById('job-region-filter')?.value || '';
  const status = document.getElementById('job-status-filter')?.value || '';

  state.jobs.filtered = JOBS.filter(j => {
    const matchQ = !q || j.title.toLowerCase().includes(q) || j.gym.toLowerCase().includes(q);
    const matchRegion = !region || j.region === region;
    const matchStatus = !status || j.status === status;
    return matchQ && matchRegion && matchStatus;
  });
  state.jobs.page = 1;
  renderJobs();
}

function renderJobs() {
  const { filtered, page } = state.jobs;
  const start = (page - 1) * PAGE_SIZE;
  const items = filtered.slice(start, start + PAGE_SIZE);

  const countEl = document.getElementById('jobs-count');
  if (countEl) countEl.innerHTML = `전체 <strong>${filtered.length}</strong>건`;

  const tbody = document.getElementById('jobs-tbody');
  if (!tbody) return;

  if (items.length === 0) {
    tbody.innerHTML = `<tr><td colspan="12"><div class="empty-state"><p>검색 결과가 없습니다.</p></div></td></tr>`;
  } else {
    tbody.innerHTML = items.map(j => `
      <tr>
        <td style="color:var(--muted);font-size:0.78rem">#${j.id}</td>
        <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600">${j.title}</td>
        <td>${j.gym}</td>
        <td>${j.region} ${j.district}</td>
        <td style="color:var(--blue);font-weight:700">${j.salary}</td>
        <td><span class="badge badge-gray">${j.position}</span></td>
        <td style="color:var(--muted)">${j.regDate}</td>
        <td style="color:var(--muted)">${j.views}회</td>
        <td style="color:var(--muted);font-weight:600">${j.uniqueViews}회</td>
        <td>${statusBadge(j.status)}</td>
        <td style="text-align:center">
          <input type="checkbox" ${j.pinned ? 'checked' : ''} onchange="toggleJobPinned('${j.fullId || j.id}', this)" style="transform: scale(1.15); cursor: pointer; vertical-align: middle;">
        </td>
        <td>
          <div class="action-btns">
            <button class="btn-icon" title="상세보기" onclick="showDetail('job', '${j.id}')">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
            <button class="btn-icon danger" title="삭제" onclick="deleteJob('${j.id}')">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
            </button>
          </div>
        </td>
      </tr>`).join('');
  }
  renderPagination('jobs-pagination', filtered.length, page, 'jobs');
}

function deleteJob(id) {
  const idx = JOBS.findIndex(j => j.id === id);
  if (idx !== -1) {
    JOBS.splice(idx, 1);
    showToast('채용공고가 삭제되었습니다.', 'error');
    filterJobs();
  }
}

async function submitJob() {
  if (typeof db === 'undefined' || !db) {
    showToast('데이터베이스가 연결되어 있지 않습니다.', 'error');
    return;
  }

  const gymName = document.getElementById('dlg-gym-name')?.value?.trim();
  const title = document.getElementById('dlg-job-title')?.value?.trim();
  const region = document.getElementById('dlg-job-region')?.value;
  const position = document.getElementById('dlg-job-pos')?.value || '메인사범';
  const salary = document.getElementById('dlg-job-salary')?.value?.trim() || '협의';
  const exp = document.getElementById('dlg-job-exp')?.value?.trim() || '경력 무관';
  const statusStr = document.getElementById('dlg-job-status')?.value || '게시중';
  const desc = document.getElementById('dlg-job-desc')?.value?.trim() || '상세 모집 안내가 없습니다.';
  const isPinned = document.getElementById('dlg-job-pinned')?.checked || false;

  if (!gymName || !title) {
    showToast('도장 이름과 공고 제목을 입력해주세요.', 'warning');
    return;
  }

  const currentUser = auth.currentUser;
  if (!currentUser) {
    showToast('로그인이 필요합니다.', 'error');
    return;
  }

  try {
    if (isPinned) {
      // 1. 이미 상위 노출 중인 다른 공고가 있는지 조회
      const querySnap = await db.collection('jobs').where('pinned', '==', true).get();
      let existingPinnedJob = null;
      querySnap.forEach(doc => {
        existingPinnedJob = { id: doc.id, ...doc.data() };
      });

      if (existingPinnedJob) {
        const confirmMsg = `이미 상위 노출된 공고("${existingPinnedJob.title}")가 있습니다.\n기존 공고를 해제하고 현재 공고로 변경하시겠습니까?`;
        if (!confirm(confirmMsg)) {
          // 사용자가 취소를 클릭하면 등록 프로세스 자체를 중단
          return;
        }

        showToast('공고를 등록하고 상위 노출을 갱신 중입니다...', 'warning');

        // 기존 상위 노출 해제 + 새 상위 노출 공고 생성 (Batch)
        const batch = db.batch();
        batch.update(db.collection('jobs').doc(existingPinnedJob.id), { pinned: false });

        const newJobRef = db.collection('jobs').doc();
        batch.set(newJobRef, {
          user_id: currentUser.uid,
          gymName: gymName,
          title: title,
          location: region,
          salary: salary,
          type: '정규직',
          career: exp,
          position: position,
          status: statusStr === '게시중' ? 'active' : 'closed',
          content: desc,
          pinned: true,
          views: 0,
          created_at: firebase.firestore.FieldValue.serverTimestamp()
        });

        await batch.commit();
        showToast('상위 노출 공고가 성공적으로 등록 및 변경되었습니다.', 'success');
      } else {
        // 기존 상위 노출 공고가 없는 경우
        showToast('공고를 등록하는 중입니다...', 'warning');
        await db.collection('jobs').add({
          user_id: currentUser.uid,
          gymName: gymName,
          title: title,
          location: region,
          salary: salary,
          type: '정규직',
          career: exp,
          position: position,
          status: statusStr === '게시중' ? 'active' : 'closed',
          content: desc,
          pinned: true,
          views: 0,
          created_at: firebase.firestore.FieldValue.serverTimestamp()
        });
        showToast('채용공고가 상위 노출로 등록되었습니다.', 'success');
      }
    } else {
      // 2. 상위 노출이 아닌 일반 등록
      showToast('공고를 등록하는 중입니다...', 'warning');
      await db.collection('jobs').add({
        user_id: currentUser.uid,
        gymName: gymName,
        title: title,
        location: region,
        salary: salary,
        type: '정규직',
        career: exp,
        position: position,
        status: statusStr === '게시중' ? 'active' : 'closed',
        content: desc,
        pinned: false,
        views: 0,
        created_at: firebase.firestore.FieldValue.serverTimestamp()
      });
      showToast('채용공고가 성공적으로 등록되었습니다.', 'success');
    }

    // 폼 인풋 초기화
    document.getElementById('dlg-gym-name').value = '';
    document.getElementById('dlg-job-title').value = '';
    document.getElementById('dlg-job-salary').value = '';
    document.getElementById('dlg-job-exp').value = '';
    document.getElementById('dlg-job-desc').value = '';
    const pinnedCheckbox = document.getElementById('dlg-job-pinned');
    if (pinnedCheckbox) pinnedCheckbox.checked = false;

    closeDialog('job-dialog');
    await fetchFirestoreData();
    filterJobs();

  } catch (err) {
    console.error('채용공고 등록 실패:', err);
    showToast('등록 중 오류가 발생했습니다: ' + err.message, 'error');
  }
}

// ─── Resumes Table ───────────────────────────────────────────────────────────
function filterResumes() {
  const q = document.getElementById('resume-search')?.value.toLowerCase() || '';
  const pos = document.getElementById('resume-position-filter')?.value || '';

  state.resumes.filtered = RESUMES.filter(r => {
    const matchQ = !q || r.name.includes(q) || r.area.includes(q);
    const matchPos = !pos || r.position === pos;
    return matchQ && matchPos;
  });
  state.resumes.page = 1;
  renderResumes();
}

function renderResumes() {
  const { filtered, page } = state.resumes;
  const start = (page - 1) * PAGE_SIZE;
  const items = filtered.slice(start, start + PAGE_SIZE);

  const countEl = document.getElementById('resumes-count');
  if (countEl) countEl.innerHTML = `전체 <strong>${filtered.length}</strong>건`;

  const tbody = document.getElementById('resumes-tbody');
  if (!tbody) return;

  tbody.innerHTML = items.map(r => `
    <tr>
      <td style="color:var(--muted);font-size:0.78rem">${r.id}</td>
      <td style="font-weight:700">${r.name}</td>
      <td>${r.gender}</td>
      <td><span class="badge badge-purple">${r.position}</span></td>
      <td>${r.exp}</td>
      <td>${r.area}</td>
      <td style="color:var(--blue);font-weight:700">${r.salary}</td>
      <td>${r.grade}</td>
      <td style="color:var(--muted)">${r.cert}</td>
      <td style="color:var(--muted)">${r.regDate}</td>
      <td>
        <div class="action-btns">
          <button class="btn-icon" title="상세보기" onclick="showDetail('resume', '${r.id}')">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
          <button class="btn-icon danger" onclick="showToast('이력서가 삭제되었습니다.','error')">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
          </button>
        </div>
      </td>
    </tr>`).join('');

  renderPagination('resumes-pagination', filtered.length, page, 'resumes');
}

// ─── Applications Table ──────────────────────────────────────────────────────
function filterApplications() {
  const q = document.getElementById('app-search')?.value.toLowerCase() || '';
  const status = document.getElementById('app-status-filter')?.value || '';

  state.applications.filtered = APPLICATIONS.filter(a => {
    const matchQ = !q || a.applicant.includes(q) || a.job.includes(q);
    const matchStatus = !status || a.status === status;
    return matchQ && matchStatus;
  });
  state.applications.page = 1;
  renderApplications();
}

function renderApplications() {
  const { filtered, page } = state.applications;
  const start = (page - 1) * PAGE_SIZE;
  const items = filtered.slice(start, start + PAGE_SIZE);

  const countEl = document.getElementById('apps-count');
  if (countEl) countEl.innerHTML = `전체 <strong>${filtered.length}</strong>건`;

  const tbody = document.getElementById('apps-tbody');
  if (!tbody) return;

  tbody.innerHTML = items.map(a => `
    <tr>
      <td style="color:var(--muted);font-size:0.78rem">${a.id}</td>
      <td style="font-weight:700">${a.applicant}</td>
      <td style="color:var(--muted)">${a.job}</td>
      <td>${a.gym}</td>
      <td style="color:var(--muted)">${a.applyDate}</td>
      <td>${appStatusBadge(a.status)}</td>
      <td>
        <div class="action-btns">
          <button class="btn-icon" title="상세보기" onclick="showDetail('application', '${a.id}')">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
        </div>
      </td>
    </tr>`).join('');

  // Update badge
  updateSidebarBadges();

  renderPagination('apps-pagination', filtered.length, page, 'applications');
}

async function changeAppStatus(id, newStatus) {
  const app = APPLICATIONS.find(a => a.id === id);
  if (!app) return;

  const dbStatus = newStatus === '합격' ? 'accepted' : (newStatus === '불합격' ? 'rejected' : newStatus === '면접제안' ? 'interview' : 'pending');

  if (db && app.fullId) {
    try {
      await db.collection('apply').doc(app.fullId).update({
        status: dbStatus
      });
      app.status = newStatus;
      showToast(`${app.applicant}님 상태가 "${newStatus}"로 변경되었습니다.`, newStatus === '합격' ? 'success' : 'error');
      
      // 이메일 전송 시도
      sendEmailNotification(app, newStatus);
      
    } catch (err) {
      console.error('지원 상태 업데이트 실패:', err);
      showToast('상태 업데이트 중 에러가 발생했습니다: ' + err.message, 'error');
    }
  } else {
    app.status = newStatus;
    showToast(`${app.applicant}님 상태가 "${newStatus}"로 변경되었습니다.`, newStatus === '합격' ? 'success' : 'error');
  }
  filterApplications();
  updateSidebarBadges();
}

// ─── Inquiries (1:1 문의) ───────────────────────────────────────────────────
function populateInquiries() {
  const totalCountEl = document.getElementById('inquiries-total-count');
  const pendingCountEl = document.getElementById('inquiries-pending-count');
  const tbody = document.getElementById('inquiries-tbody');
  
  if (totalCountEl) totalCountEl.textContent = INQUIRIES.length;
  const pendingCount = INQUIRIES.filter(i => i.status === 'pending').length;
  if (pendingCountEl) pendingCountEl.textContent = pendingCount;
  
  updateSidebarBadges();
  
  if (!tbody) return;
  
  if (INQUIRIES.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:2rem;">등록된 1:1 문의사항이 없습니다.</td></tr>`;
    return;
  }
  
  tbody.innerHTML = INQUIRIES.map((i, index) => {
    const num = INQUIRIES.length - index;
    const typeBadge = i.type === '신고' ? 'badge-red' : 
                      i.type === '결제 문의' ? 'badge-amber' : 
                      i.type === '이용 방법' ? 'badge-blue' : 'badge-amber';
    
    const statusBadge = i.status === 'pending' ? '<span class="badge badge-red">미답변</span>' : '<span class="badge badge-green">답변완료</span>';
    
    const actionBtn = i.status === 'pending' ? 
      `<button class="btn btn-sm btn-primary" onclick="openInquiryDetailDialog('${i.id}')">답변</button>` :
      `<button class="btn btn-sm btn-secondary" onclick="openInquiryDetailDialog('${i.id}')">보기</button>`;
      
    const dateStr = i.created_at ? i.created_at.split('T')[0] : '2026-06-11';
    
    return `
      <tr>
        <td>${num}</td>
        <td><span class="badge ${typeBadge}">${i.type}</span></td>
        <td style="font-weight:700; text-align:left; max-width:300px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${i.title}</td>
        <td>${i.name}</td>
        <td>${dateStr}</td>
        <td>${statusBadge}</td>
        <td>
          <div class="action-btns">
            ${actionBtn}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

let activeInquiryId = null;

window.openInquiryDetailDialog = function(id) {
  const inq = INQUIRIES.find(x => x.id === id);
  if (!inq) return;
  
  activeInquiryId = id;
  
  const typeEl = document.getElementById('inquiry-dialog-type');
  const statusEl = document.getElementById('inquiry-dialog-status');
  const titleEl = document.getElementById('inquiry-dialog-title');
  const nameEl = document.getElementById('inquiry-dialog-name');
  const emailEl = document.getElementById('inquiry-dialog-email');
  const dateEl = document.getElementById('inquiry-dialog-date');
  const contentEl = document.getElementById('inquiry-dialog-content');
  const answerInput = document.getElementById('inquiry-dialog-answer');
  const saveBtn = document.getElementById('btn-save-inquiry-answer');
  
  if (typeEl) {
    typeEl.textContent = inq.type;
    typeEl.className = 'badge ' + (inq.type === '신고' ? 'badge-red' : 
                                   inq.type === '결제 문의' ? 'badge-amber' : 
                                   inq.type === '이용 방법' ? 'badge-blue' : 'badge-amber');
  }
  
  if (statusEl) {
    statusEl.textContent = inq.status === 'pending' ? '미답변' : '답변완료';
    statusEl.className = 'badge ' + (inq.status === 'pending' ? 'badge-red' : 'badge-green');
  }
  
  if (titleEl) titleEl.textContent = inq.title;
  if (nameEl) nameEl.textContent = inq.name;
  if (emailEl) emailEl.textContent = inq.email;
  
  const dateStr = inq.created_at ? inq.created_at.replace('T', ' ').substring(0, 16) : '2026-06-11';
  if (dateEl) dateEl.textContent = dateStr;
  if (contentEl) contentEl.textContent = inq.content;
  
  if (answerInput) {
    answerInput.value = inq.answer || '';
  }
  
  // 저장 버튼 핸들러 설정
  if (saveBtn) {
    const newSaveBtn = saveBtn.cloneNode(true);
    saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
    
    newSaveBtn.addEventListener('click', async () => {
      const answerVal = answerInput.value.trim();
      if (!answerVal) {
        alert('답변 내용을 입력해 주세요.');
        return;
      }
      
      newSaveBtn.disabled = true;
      newSaveBtn.textContent = '저장 중...';
      
      try {
        if (db) {
          await db.collection('inquiries').doc(activeInquiryId).update({
            status: 'answered',
            answer: answerVal,
            answered_at: firebase.firestore.FieldValue.serverTimestamp()
          });
          
          showToast('답변이 등록되었습니다.', 'success');
          closeDialog('inquiry-dialog');
          
          // 데이터 리로드 및 갱신
          await fetchFirestoreData();
          populateInquiries();
        } else {
          showToast('Firestore 데이터베이스에 연결할 수 없습니다.', 'error');
        }
      } catch (err) {
        console.error('답변 저장 실패:', err);
        showToast('답변 저장 실패: ' + err.message, 'error');
      } finally {
        newSaveBtn.disabled = false;
        newSaveBtn.textContent = '답변 저장하기';
      }
    });
  }
  
  openDialog('inquiry-dialog');
};

function sendEmailNotification(app, status) {
  if (typeof emailjs === 'undefined') {
    console.warn('EmailJS SDK가 로드되지 않았습니다.');
    return;
  }
  if (!EMAILJS_CONFIG || EMAILJS_CONFIG.publicKey === 'YOUR_PUBLIC_KEY') {
    console.log('EmailJS 설정값이 비어 있어 이메일 발송을 건너뜁니다. (Public Key가 YOUR_PUBLIC_KEY 상태)');
    return;
  }

  const toEmail = app.email;
  if (!toEmail) {
    console.warn(`${app.applicant}님의 이메일 주소가 없어서 이메일을 발송할 수 없습니다.`);
    return;
  }

  emailjs.init(EMAILJS_CONFIG.publicKey);

  const templateParams = {
    to_email: toEmail,
    to_name: app.applicant,
    job_title: app.job,
    gym_name: app.gym,
    status: status,
    result_message: status === '합격' 
      ? '축하드립니다! 태권도장에 합격하셨습니다. 도장에서 곧 출근 일정 등 추가 안내를 위해 연락드릴 예정입니다.' 
      : '안타깝게도 이번 채용에는 불합격 소식을 전하게 되었습니다. 지원해 주셔서 대단히 감사드립니다.'
  };

  showToast('이메일 안내 발송 중...', 'warning');

  emailjs.send(EMAILJS_CONFIG.serviceId, EMAILJS_CONFIG.templateId, templateParams)
    .then((response) => {
      console.log('이메일 발송 성공:', response.status, response.text);
      showToast(`${app.applicant}님께 이메일 안내장이 성공적으로 발송되었습니다!`, 'success');
    })
    .catch((err) => {
      console.error('이메일 발송 실패:', err);
      showToast('이메일 발송에 실패했습니다: ' + err.message, 'error');
    });
}

// ─── Pagination ──────────────────────────────────────────────────────────────
function renderPagination(containerId, total, currentPage, key) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  if (totalPages <= 1) { container.innerHTML = ''; return; }

  let html = '';
  html += `<button class="page-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="goPage('${key}',${currentPage - 1})">‹</button>`;
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
      html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" onclick="goPage('${key}',${i})">${i}</button>`;
    } else if (i === currentPage - 2 || i === currentPage + 2) {
      html += `<span style="color:var(--light);padding:0 4px">…</span>`;
    }
  }
  html += `<button class="page-btn" ${currentPage === totalPages ? 'disabled' : ''} onclick="goPage('${key}',${currentPage + 1})">›</button>`;
  container.innerHTML = html;
}

function goPage(key, page) {
  state[key].page = page;
  if (key === 'members') renderMembers();
  if (key === 'jobs') renderJobs();
  if (key === 'resumes') renderResumes();
  if (key === 'applications') renderApplications();
}

// ─── Badge Helpers ────────────────────────────────────────────────────────────
function statusBadge(status) {
  if (status === '게시중') return '<span class="badge badge-green">게시중</span>';
  if (status === '마감됨') return '<span class="badge badge-red">마감됨</span>';
  if (status === '검토중') return '<span class="badge badge-amber">검토중</span>';
  return `<span class="badge badge-gray">${status}</span>`;
}

function memberStatusBadge(status) {
  if (status === 'active') return '<span class="badge badge-green">활성</span>';
  if (status === 'inactive') return '<span class="badge badge-gray">비활성</span>';
  if (status === 'banned') return '<span class="badge badge-red">정지</span>';
  return `<span class="badge badge-gray">${status}</span>`;
}

function appStatusBadge(status) {
  if (status === '검토중') return '<span class="badge badge-amber">검토중</span>';
  if (status === '합격') return '<span class="badge badge-green">합격</span>';
  if (status === '불합격') return '<span class="badge badge-red">불합격</span>';
  if (status === '면접제안') return '<span class="badge badge-blue">면접 제안</span>';
  return `<span class="badge badge-gray">${status}</span>`;
}

// ─── Dialog ───────────────────────────────────────────────────────────────────
function openDialog(id) {
  const dlg = document.getElementById(id);
  if (dlg) dlg.showModal();
}
function closeDialog(id) {
  const dlg = document.getElementById(id);
  if (dlg) dlg.close();
}

// ─── Settings ────────────────────────────────────────────────────────────────
function switchSettings(el, sectionId) {
  document.querySelectorAll('.settings-nav-item').forEach(i => i.classList.remove('active'));
  document.querySelectorAll('.settings-section').forEach(s => s.classList.remove('active'));
  el.classList.add('active');
  document.getElementById(sectionId)?.classList.add('active');
}

async function ensureDefaultResumePassProducts() {
  const snap = await db.collection('resume_pass_products').limit(1).get();
  if (!snap.empty) return;
  const batch = db.batch();
  DEFAULT_RESUME_PASS_PRODUCTS.forEach((product) => {
    batch.set(db.collection('resume_pass_products').doc(product.id), {
      name: product.name,
      months: product.months,
      price: product.price,
      active: product.active,
      sort: product.sort,
      created_at: firebase.firestore.FieldValue.serverTimestamp(),
      updated_at: firebase.firestore.FieldValue.serverTimestamp()
    });
  });
  await batch.commit();
}

window.loadResumePassProducts = async function() {
  const tbody = document.getElementById('resume-pass-products-tbody');
  if (!tbody || !db) return;
  tbody.innerHTML = `<tr><td colspan="4" style="color:var(--muted);padding:1rem">상품 정보를 불러오는 중입니다.</td></tr>`;

  try {
    await ensureDefaultResumePassProducts();
    const snap = await db.collection('resume_pass_products').orderBy('sort', 'asc').get();
    const products = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    renderResumePassProducts(products);
  } catch (err) {
    console.error('이력서 열람권 상품 로드 실패:', err);
    tbody.innerHTML = `<tr><td colspan="4" style="color:#dc2626;padding:1rem">상품 정보를 불러오지 못했습니다.</td></tr>`;
    showToast('이력서 열람권 상품 로드 실패: ' + err.message, 'error');
  }
};

function renderResumePassProducts(products) {
  const tbody = document.getElementById('resume-pass-products-tbody');
  if (!tbody) return;
  const rows = products.length ? products : DEFAULT_RESUME_PASS_PRODUCTS;
  tbody.innerHTML = rows.map((product, index) => `
    <tr data-product-id="${product.id || `month_${index + 1}`}" data-product-sort="${Number(product.sort || index + 1)}">
      <td>
        <label class="toggle-switch">
          <input type="checkbox" class="resume-product-active" ${product.active !== false ? 'checked' : ''}>
          <span class="toggle-slider"></span>
        </label>
      </td>
      <td>
        <input class="form-control resume-product-name" value="${escapeHtml(product.name || `${product.months || index + 1}개월 구독권`)}">
      </td>
      <td>
        <div class="product-input-inline">
          <input class="form-control resume-product-months" type="number" min="1" max="36" value="${Number(product.months || index + 1)}">
          <span>개월</span>
        </div>
      </td>
      <td>
        <div class="product-input-inline">
          <input class="form-control resume-product-price" type="number" min="0" step="1000" value="${Number(product.price || 0)}">
          <span>원</span>
        </div>
      </td>
    </tr>
  `).join('');
}

window.saveResumePassProducts = async function() {
  const rows = Array.from(document.querySelectorAll('#resume-pass-products-tbody tr[data-product-id]'));
  if (!rows.length || !db) return;

  try {
    const batch = db.batch();
    rows.forEach((row, index) => {
      const id = row.dataset.productId;
      const name = row.querySelector('.resume-product-name')?.value?.trim() || `${index + 1}개월 구독권`;
      const months = Math.max(1, parseInt(row.querySelector('.resume-product-months')?.value, 10) || index + 1);
      const price = Math.max(0, parseInt(row.querySelector('.resume-product-price')?.value, 10) || 0);
      const active = row.querySelector('.resume-product-active')?.checked === true;
      batch.set(db.collection('resume_pass_products').doc(id), {
        name,
        months,
        price,
        active,
        sort: Number(row.dataset.productSort || index + 1),
        updated_at: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    });
    await batch.commit();
    showToast('이력서 열람권 상품 설정이 저장되었습니다.', 'success');
    await loadResumePassProducts();
  } catch (err) {
    console.error('이력서 열람권 상품 저장 실패:', err);
    showToast('상품 설정 저장 실패: ' + err.message, 'error');
  }
};

// ─── Region Sync ────────────────────────────────────────────────────────────
function formatRegionSyncDate(value) {
  if (!value) return '-';
  const date = typeof value.toDate === 'function' ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' });
}

function setRegionSyncMessage(msg, type = '') {
  const el = document.getElementById('region-sync-message');
  if (!el) return;
  el.textContent = msg || '';
  el.classList.toggle('success', type === 'success');
  el.classList.toggle('error', type === 'error');
}

async function refreshRegionMeta() {
  if (!window.RegionSync) return;
  try {
    const meta = await RegionSync.loadMeta();
    document.getElementById('region-sync-last').textContent = formatRegionSyncDate(meta?.lastSyncedAt);
    document.getElementById('region-sync-count').textContent = Number(meta?.totalCount || 0).toLocaleString('ko-KR');
    if (meta?.status === 'failed') setRegionSyncMessage(meta.errorMessage || '최근 갱신에 실패했습니다.', 'error');
    else if (meta?.status === 'success') setRegionSyncMessage('정상 갱신 상태입니다.', 'success');
  } catch (err) {
    setRegionSyncMessage('지역 데이터 상태를 불러오지 못했습니다.', 'error');
  }
}

async function loadAdminRegions() {
  if (!window.RegionSync) return;
  const regions = await RegionSync.loadRegions();
  RegionSync.populateSelect(document.getElementById('dlg-job-region'), regions, '지역을 선택하세요');
}

async function syncRegionsFromAdmin() {
  if (!window.RegionSync) return;
  const btn = document.getElementById('btn-region-sync');
  if (!btn) return;

  btn.disabled = true;
  btn.textContent = '갱신 중...';
  setRegionSyncMessage('공공데이터포털에서 지역 데이터를 수집 중입니다.', '');
  try {
    const regions = await RegionSync.fetchAllRegions(({ page, pageCount, count }) => {
      setRegionSyncMessage(`수집 중 ${page}/${pageCount}페이지, ${count.toLocaleString('ko-KR')}개 추출`, '');
    });
    await RegionSync.saveRegions(regions);
    await refreshRegionMeta();
    await loadAdminRegions();
    showToast(`지역 데이터 ${regions.length.toLocaleString('ko-KR')}개가 갱신되었습니다.`, 'success');
  } catch (err) {
    await RegionSync.markSyncFailed(err.message);
    await refreshRegionMeta();
    showToast(err.message || '지역 데이터 갱신에 실패했습니다.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '지역 데이터 갱신';
  }
}

// ─── Toast ───────────────────────────────────────────────────────────────────
function showToast(msg, type = '') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast${type ? ' ' + type : ''}`;
  const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : type === 'warning' ? '⚠️' : 'ℹ️';
  toast.innerHTML = `<span>${icon}</span><span>${msg}</span>`;
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateX(20px)'; toast.style.transition = '0.3s'; setTimeout(() => toast.remove(), 300); }, 3000);
}

// ─── Export CSV ──────────────────────────────────────────────────────────────
function exportCSV(type) {
  showToast('CSV 파일을 내보냅니다.', 'success');
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btn-region-sync')?.addEventListener('click', syncRegionsFromAdmin);
  refreshRegionMeta();
  loadAdminRegions();
});

// ─── Charts ──────────────────────────────────────────────────────────────────
let activityChartInst = null;
let memberTypeChartInst = null;
let analyticsChartsInit = false;

function initDashboardCharts() {
  // Activity Line Chart
  const activityCtx = document.getElementById('activityChart');
  if (activityCtx && !activityChartInst) {
    activityChartInst = new Chart(activityCtx, {
      type: 'line',
      data: {
        labels: ['06/02', '06/03', '06/04', '06/05', '06/06', '06/07', '06/08'],
        datasets: [
          {
            label: '가입자',
            data: [18, 22, 15, 28, 24, 30, 23],
            borderColor: '#2563eb',
            backgroundColor: 'rgba(37,99,235,0.06)',
            fill: true,
            tension: 0.4,
            pointRadius: 4,
            pointBackgroundColor: '#2563eb',
          },
          {
            label: '채용공고',
            data: [8, 12, 10, 15, 9, 14, 11],
            borderColor: '#10b981',
            backgroundColor: 'rgba(16,185,129,0.06)',
            fill: true,
            tension: 0.4,
            pointRadius: 4,
            pointBackgroundColor: '#10b981',
          },
          {
            label: '지원수',
            data: [24, 35, 28, 42, 38, 45, 33],
            borderColor: '#f59e0b',
            backgroundColor: 'rgba(245,158,11,0.06)',
            fill: true,
            tension: 0.4,
            pointRadius: 4,
            pointBackgroundColor: '#f59e0b',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'top', labels: { font: { size: 11, weight: '700', family: 'Pretendard' }, boxWidth: 14, usePointStyle: true } } },
        scales: {
          x: { grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { font: { size: 11 } } },
          y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { font: { size: 11 } } },
        },
      },
    });
  }

  // Donut Chart
  const memberTypeCtx = document.getElementById('memberTypeChart');
  if (memberTypeCtx && !memberTypeChartInst) {
    memberTypeChartInst = new Chart(memberTypeCtx, {
      type: 'doughnut',
      data: {
        labels: ['도장(관장)', '사범(구직자)'],
        datasets: [{
          data: [623, 625],
          backgroundColor: ['#2563eb', '#10b981'],
          borderWidth: 3,
          borderColor: '#fff',
          hoverOffset: 6,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '72%',
        plugins: { legend: { display: false }, tooltip: { callbacks: {
          label: ctx => ` ${ctx.label}: ${ctx.formattedValue}명`,
        }}},
      },
    });
  }
}

function initAnalyticsCharts() {
  if (analyticsChartsInit) return;
  analyticsChartsInit = true;

  // Region Bar Chart
  const regionCtx = document.getElementById('regionChart');
  if (regionCtx) {
    new Chart(regionCtx, {
      type: 'bar',
      data: {
        labels: ['서울', '경기', '인천', '부산', '대전', '광주', '기타'],
        datasets: [{ label: '공고 수', data: [42, 31, 12, 14, 9, 7, 13], backgroundColor: '#2563eb', borderRadius: 6 }],
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.04)' } } } },
    });
  }

  // Position Pie Chart
  const posCtx = document.getElementById('positionChart');
  if (posCtx) {
    new Chart(posCtx, {
      type: 'pie',
      data: {
        labels: ['지도관장', '메인사범', '보조사범', '수석사범', '파트타임', '유치부'],
        datasets: [{ data: [15, 55, 28, 10, 15, 20], backgroundColor: ['#3b82f6','#2563eb','#10b981','#8b5cf6','#f59e0b','#ef4444'], borderWidth: 3, borderColor: '#fff' }],
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { font: { size: 11 }, boxWidth: 12, usePointStyle: true } } } },
    });
  }

  // Monthly Line Chart
  const monthCtx = document.getElementById('monthlyJoinChart');
  if (monthCtx) {
    new Chart(monthCtx, {
      type: 'line',
      data: {
        labels: ['1월','2월','3월','4월','5월','6월'],
        datasets: [
          { label: '관장', data: [80,95,110,130,145,160], borderColor: '#2563eb', backgroundColor: 'rgba(37,99,235,0.07)', fill: true, tension: 0.4, pointRadius: 4 },
          { label: '사범', data: [75,90,108,125,148,165], borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.07)', fill: true, tension: 0.4, pointRadius: 4 },
        ],
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top', labels: { font: { size: 11 }, boxWidth: 12, usePointStyle: true } } }, scales: { x: { grid: { display: false } }, y: { beginAtZero: false, grid: { color: 'rgba(0,0,0,0.04)' } } } },
    });
  }

  // Salary Bar Chart
  const salaryCtx = document.getElementById('salaryChart');
  if (salaryCtx) {
    new Chart(salaryCtx, {
      type: 'bar',
      data: {
        labels: ['200만↓', '200~250', '250~300', '300~350', '350~400', '400만↑'],
        datasets: [{ label: '공고 수', data: [5, 12, 32, 44, 21, 14], backgroundColor: '#8b5cf6', borderRadius: 6 }],
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.04)' } } } },
    });
  }

  // App Status Donut
  const appCtx = document.getElementById('appStatusChart');
  if (appCtx) {
    new Chart(appCtx, {
      type: 'doughnut',
      data: {
        labels: ['검토중', '합격', '불합격', '면접 제안'],
        datasets: [{ data: [89, 65, 42, 19], backgroundColor: ['#f59e0b','#10b981','#ef4444','#2563eb'], borderWidth: 3, borderColor: '#fff', hoverOffset: 6 }],
      },
      options: { responsive: true, maintainAspectRatio: false, cutout: '65%', plugins: { legend: { position: 'bottom', labels: { font: { size: 11 }, boxWidth: 12, usePointStyle: true } } } },
    });
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  populateDashboard();
  initDashboardCharts();

  // Pre-init state
  filterMembers();
  filterJobs();
  filterResumes();
  filterApplications();
});

// ─── Notices Data & CRUD ─────────────────────────────────────────────────────
const DEFAULT_NOTICES = [
  {
    id: 'notice-1',
    category: '필독',
    categoryClass: 'badge-red',
    isPinned: true,
    title: '태권잡 서비스 이용약관 개정 안내',
    date: '2026-06-01',
    views: '1,205',
    content: `안녕하세요, 태권잡 운영팀입니다.

태권잡 서비스를 이용해 주시는 회원님들께 깊은 감사를 드리며, 새로운 서비스 이용약관 개정 사항에 대해 안내해 드립니다.

■ 개정 대상: 태권잡 서비스 이용약관 및 개인정보 처리방침
■ 개정 공지일: 2026-06-01
■ 개정 적용일: 2026-07-01

■ 주요 개정 내용:
1. 국내 PG사(토스페이먼츠) 연동에 따른 결제 조항 정비
2. 채용공고 최상단 고정 노출(상위 노출) 권한 관련 약관 구체화
3. 1:1 문의 채널 고도화에 따른 개인정보 수집 항목(연락처 삭제 등) 현행화

본 개정 약관에 동의하지 않으시는 경우 회원 탈퇴를 요청하실 수 있으며, 적용일 전까지 별도의 거부 의사를 표시하지 않으실 경우 본 개정 약관에 동의하신 것으로 간주됩니다. 관련 문의 사항은 고객센터를 통해 문의해 주시기 바랍니다.`
  },
  {
    id: 'notice-2',
    category: '공지',
    categoryClass: 'badge-blue',
    isPinned: true,
    title: '2026년 6월 서버 점검 안내 (06/15 02:00~04:00)',
    date: '2026-05-30',
    views: '892',
    content: `안녕하세요, 태권잡 운영팀입니다.

더욱 안정적이고 빠른 서비스 제공을 위해 시스템 정기 점검 및 인프라 서버 확장을 진행할 예정입니다.
점검 시간 동안에는 플랫폼 전체 서비스 이용(로그인, 공고 등록, 이력서 열람 등)이 일시 중단되오니 서비스 이용에 참고하시기 바랍니다.

■ 점검 일시: 2026년 6월 15일 (월) 02:00 ~ 04:00 (약 2시간)
■ 점검 내용: 데이터베이스 처리 성능 최적화 및 보안 패치 적용
■ 영향 범위: 태권잡 웹사이트 및 관리자 웹 콘솔 전체 서비스 접속 불가

점검 작업은 예정된 시간 내에 신속히 완료할 수 있도록 최선을 다하겠습니다. 이용에 불편을 드려 대단히 죄송합니다.`
  },
  {
    id: 'notice-3',
    category: '업데이트',
    categoryClass: 'badge-green',
    isPinned: false,
    title: '프리미엄 채용공고 기능 업데이트 안내',
    date: '2026-05-20',
    views: '445',
    content: `안녕하세요, 태권잡 운영팀입니다.

관장님들의 빠르고 확실한 사범님 채용을 지원하기 위해 '채용공고 상위 노출 30일권' 서비스가 공식 오픈되었습니다!

■ 주요 내용:
- 채용공고 관리 화면에서 [상위노출 결제]를 진행할 수 있습니다.
- 상위 노출이 설정된 공고는 메인 화면 최상단 구역에 고정 노출되어 높은 주목도를 보장합니다.
- 토스페이먼츠(Toss Payments)를 통한 편리한 신용카드 및 페이 결제(카카오페이, 네이버페이 등)를 제공합니다.

많은 이용 바라며, 관장님들의 원활한 인재 채용을 위해 최선을 다하겠습니다. 감사합니다.`
  },
  {
    id: 'notice-4',
    category: '일반',
    categoryClass: 'badge-gray',
    isPinned: false,
    title: '개인정보 처리방침 개정 안내',
    date: '2026-05-10',
    views: '312',
    content: `안녕하세요, 태권잡 운영팀입니다.

개인정보 처리 위탁 정보 및 개인정보 수집 최소화 방침에 따라 개인정보 처리방침이 일부 변경되어 안내해 드립니다.

■ 개정 공지일: 2026-05-10
■ 개정 적용일: 2026-05-17

■ 개정 내용:
1. 1:1 문의 폼 내 전화번호(연락처) 수집 정보 제외 및 불필요한 개인정보 보유 파기 기준 정비
2. 서비스 연동 외부 결제 대행업체 정보 현행화 (토스페이먼츠 추가)

개정 사항에 대한 문의는 고객센터 이메일을 통해 접수해 주시면 성심껏 답변해 드리겠습니다. 감사합니다.`
  }
];

let NOTICES = [];
try {
  const localData = localStorage.getItem('taekwondo_admin_notices');
  if (localData) {
    NOTICES = JSON.parse(localData);
  } else {
    NOTICES = [...DEFAULT_NOTICES];
    localStorage.setItem('taekwondo_admin_notices', JSON.stringify(NOTICES));
  }
} catch (e) {
  console.error('공지사항 초기화 에러:', e);
  NOTICES = [...DEFAULT_NOTICES];
}

window.populateNotices = function() {
  const container = document.getElementById('notice-list-container');
  const countEl = document.getElementById('notice-count');
  if (!container) return;

  container.innerHTML = '';
  if (countEl) countEl.textContent = NOTICES.length;

  // 상단 고정(isPinned === true) 항목을 가장 앞으로 오게 하고, 나머지는 등록일 역순 정렬
  const sorted = [...NOTICES].sort((a, b) => {
    const aPinned = a.isPinned === true || a.isPinned === 'true';
    const bPinned = b.isPinned === true || b.isPinned === 'true';
    if (aPinned && !bPinned) return -1;
    if (!aPinned && bPinned) return 1;
    return new Date(b.date) - new Date(a.date);
  });

  sorted.forEach(n => {
    const isPinned = n.isPinned === true || n.isPinned === 'true';
    const row = document.createElement('div');
    row.className = 'notice-row';
    row.style.cursor = 'pointer';
    row.onclick = () => showDetail('notice', n.id);

    row.innerHTML = `
      ${isPinned
        ? `<svg class="notice-pin" viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 2l2.5 6H21l-5 3.5 2 6L12 14l-6 3.5 2-6L3 8h6.5z"/></svg>`
        : `<span style="width:14px"></span>`}
      <span class="notice-category"><span class="badge ${n.categoryClass || 'badge-gray'}">${n.category}</span></span>
      <span class="notice-title">${n.title}</span>
      <span class="notice-date">${n.date}</span>
      <span class="notice-views">👁 ${n.views || 0}</span>
      <div class="action-btns" onclick="event.stopPropagation()">
        <button class="btn-icon" onclick="openEditNoticeDialog('${n.id}')">✏️</button>
        <button class="btn-icon danger" onclick="deleteNotice('${n.id}')">🗑️</button>
      </div>
    `;
    container.appendChild(row);
  });
};

let editingNoticeId = null;

window.openCreateNoticeDialog = function() {
  editingNoticeId = null;
  const header = document.getElementById('notice-dlg-header');
  const submitBtn = document.getElementById('notice-dlg-submit-btn');
  if (header) header.textContent = '공지사항 작성';
  if (submitBtn) submitBtn.textContent = '등록하기';

  const categorySelect = document.getElementById('notice-dlg-category');
  const pinnedSelect = document.getElementById('notice-dlg-pinned');
  const titleInput = document.getElementById('notice-dlg-title');
  const contentInput = document.getElementById('notice-dlg-content');

  if (categorySelect) categorySelect.value = '공지';
  if (pinnedSelect) pinnedSelect.value = 'false';
  if (titleInput) titleInput.value = '';
  if (contentInput) contentInput.value = '';

  openDialog('notice-dialog');
};

window.openEditNoticeDialog = function(id) {
  const n = NOTICES.find(x => x.id === id);
  if (!n) { showToast('공지사항을 찾을 수 없습니다.', 'error'); return; }

  editingNoticeId = id;
  const header = document.getElementById('notice-dlg-header');
  const submitBtn = document.getElementById('notice-dlg-submit-btn');
  if (header) header.textContent = '공지사항 수정';
  if (submitBtn) submitBtn.textContent = '수정완료';

  const categorySelect = document.getElementById('notice-dlg-category');
  const pinnedSelect = document.getElementById('notice-dlg-pinned');
  const titleInput = document.getElementById('notice-dlg-title');
  const contentInput = document.getElementById('notice-dlg-content');

  if (categorySelect) categorySelect.value = n.category;
  if (pinnedSelect) pinnedSelect.value = (n.isPinned === true || n.isPinned === 'true') ? 'true' : 'false';
  if (titleInput) titleInput.value = n.title;
  if (contentInput) contentInput.value = n.content;

  openDialog('notice-dialog');
};

window.submitNotice = function() {
  const categorySelect = document.getElementById('notice-dlg-category');
  const pinnedSelect = document.getElementById('notice-dlg-pinned');
  const titleInput = document.getElementById('notice-dlg-title');
  const contentInput = document.getElementById('notice-dlg-content');

  const category = categorySelect ? categorySelect.value : '공지';
  const isPinned = pinnedSelect ? pinnedSelect.value === 'true' : false;
  const title = titleInput ? titleInput.value.trim() : '';
  const content = contentInput ? contentInput.value.trim() : '';

  if (!title) { showToast('제목을 입력해 주세요.', 'error'); return; }
  if (!content) { showToast('내용을 입력해 주세요.', 'error'); return; }

  const categoryClasses = {
    '필독': 'badge-red',
    '공지': 'badge-blue',
    '업데이트': 'badge-green',
    '일반': 'badge-gray'
  };
  const categoryClass = categoryClasses[category] || 'badge-gray';

  if (editingNoticeId) {
    const idx = NOTICES.findIndex(x => x.id === editingNoticeId);
    if (idx !== -1) {
      NOTICES[idx].category = category;
      NOTICES[idx].categoryClass = categoryClass;
      NOTICES[idx].isPinned = isPinned;
      NOTICES[idx].title = title;
      NOTICES[idx].content = content;
      showToast('공지사항이 수정되었습니다.', 'success');
    }
  } else {
    const today = new Date().toISOString().split('T')[0];
    const newNotice = {
      id: 'notice-' + Date.now(),
      category: category,
      categoryClass: categoryClass,
      isPinned: isPinned,
      title: title,
      date: today,
      views: '0',
      content: content
    };
    NOTICES.push(newNotice);
    showToast('공지사항이 등록되었습니다.', 'success');
  }

  localStorage.setItem('taekwondo_admin_notices', JSON.stringify(NOTICES));
  window.populateNotices();
  closeDialog('notice-dialog');
};

window.deleteNotice = function(id) {
  if (!confirm('정말 이 공지사항을 삭제하시겠습니까?')) return;
  NOTICES = NOTICES.filter(x => x.id !== id);
  localStorage.setItem('taekwondo_admin_notices', JSON.stringify(NOTICES));
  window.populateNotices();
  showToast('삭제하였습니다.', 'error');
};

// ─── Detail Modal populator ──────────────────────────────────────────────────
window.showDetail = function(type, id) {
  const dialog = document.getElementById('detail-dialog');
  const titleEl = document.getElementById('detail-dialog-title');
  const bodyEl = document.getElementById('detail-dialog-body');
  if (!dialog || !bodyEl) return;

  let title = '';
  let html = '';

  if (type === 'member') {
    const m = MEMBERS.find(x => x.id === id);
    if (!m) { showToast('회원을 찾을 수 없습니다.', 'error'); return; }
    title = '회원 상세 정보';
    html = `
      <div class="detail-grid">
        <div class="detail-item"><strong>회원 ID</strong><span>${m.id}</span></div>
        <div class="detail-item"><strong>이름</strong><span>${m.name}</span></div>
        <div class="detail-item"><strong>이메일</strong><span>${m.email}</span></div>
        <div class="detail-item"><strong>사업자등록번호</strong><span>${m.businessNumber || '-'}</span></div>
        <div class="detail-item"><strong>회원 유형</strong><span>${m.type === 'gym' ? '<span class="badge badge-blue">도장(관장)</span>' : '<span class="badge badge-green">사범(구직자)</span>'}</span></div>
        ${m.type === 'gym' ? `
          <div class="detail-item"><strong>사업자 검증</strong>
            <span>
              ${m.businessValid === '01' && m.businessStatusCode === '01'
                ? '<span class="badge badge-blue">검증완료</span>'
                : '<span class="badge badge-amber">확인중</span>'}
            </span>
          </div>
          <div class="detail-item"><strong>테스트 결제</strong><span>${m.testPaymentEnabled ? '<span class="badge badge-blue">ON</span>' : '<span class="badge badge-amber">OFF</span>'}</span></div>
          <div class="detail-item"><strong>구독기간</strong><span>${renderMemberSubscriptionBadge(m)}</span></div>
        ` : ''}
        <div class="detail-item"><strong>가입일</strong><span>${m.joinDate}</span></div>
        <div class="detail-item"><strong>상태</strong><span>${m.status === 'banned' ? '<span class="badge badge-red">정지</span>' : '<span class="badge badge-green">정상</span>'}</span></div>
      </div>
    `;
  } else if (type === 'job') {
    const j = JOBS.find(x => x.id === id);
    if (!j) { showToast('채용공고를 찾을 수 없습니다.', 'error'); return; }
    title = '채용공고 상세 정보';
    html = `
      <div class="detail-grid">
        <div class="detail-item"><strong>공고 ID</strong><span>#${j.id}</span></div>
        <div class="detail-item"><strong>공고 제목</strong><span>${j.title}</span></div>
        <div class="detail-item"><strong>도장명</strong><span>${j.gym}</span></div>
        <div class="detail-item"><strong>근무 지역</strong><span>${j.region} ${j.district}</span></div>
        <div class="detail-item"><strong>급여 정보</strong><span style="color:var(--blue);font-weight:700">${j.salary}</span></div>
        <div class="detail-item"><strong>모집 직무</strong><span>${j.position}</span></div>
        <div class="detail-item"><strong>요구 경력</strong><span>${j.exp}</span></div>
        <div class="detail-item"><strong>등록일</strong><span>${j.regDate}</span></div>
        <div class="detail-item"><strong>누적 조회수</strong><span>${j.views}회</span></div>
        <div class="detail-item"><strong>실제 조회수</strong><span style="font-weight:600">${j.uniqueViews}회</span></div>
        <div class="detail-item"><strong>게시 상태</strong><span>${statusBadge(j.status === '게시중' ? 'active' : 'closed')}</span></div>
        <div class="detail-item"><strong>상위 노출</strong>
          <span>
            <input type="checkbox" id="job-detail-pinned-chk" ${j.pinned ? 'checked' : ''} onchange="toggleJobPinned('${j.fullId || j.id}')" style="transform: scale(1.2); cursor: pointer; vertical-align: middle; margin-right: 6px;">
            <label for="job-detail-pinned-chk" style="cursor: pointer; font-weight: 500; vertical-align: middle; color: var(--blue);">최상단 고정 노출</label>
          </span>
        </div>
        <div class="detail-full" style="margin-top: 0.5rem; padding: 1.25rem; background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%); border-radius: 12px; border: 1.5px solid #e2e8f0; display: flex; flex-direction: column; gap: 0.6rem; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); box-sizing: border-box;">
          <strong style="color: var(--blue); font-size: 0.92rem; display: flex; align-items: center; gap: 6px; margin-bottom: 0.2rem; font-family: inherit;">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            채용 담당자 정보
          </strong>
          <div style="display: grid; grid-template-columns: 1fr; gap: 0.5rem; font-size: 0.88rem; color: #475569;">
            <div><strong>담당 관장님:</strong> <span style="font-weight: 700; color: #0f172a; margin-left: 6px;">${j.userName || '관장님'}</span></div>
            <div><strong>연락 이메일:</strong> <span style="font-weight: 600; color: var(--blue); margin-left: 6px;">${j.userEmail || '이메일 정보 없음'}</span></div>
          </div>
        </div>
        <div class="detail-full">
          <strong>공고 상세 설명</strong>
          <div class="detail-desc">${(j.content || '설명 없음').replace(/\n/g, '<br>')}</div>
        </div>
      </div>
    `;
  } else if (type === 'resume') {
    const r = RESUMES.find(x => x.id === id);
    if (!r) { showToast('이력서를 찾을 수 없습니다.', 'error'); return; }
    title = '이력서 상세 정보';
    html = `
      <div class="detail-grid">
        <div class="detail-item"><strong>이력서 ID</strong><span>${r.id}</span></div>
        <div class="detail-item"><strong>이름</strong><span>${r.name}</span></div>
        <div class="detail-item"><strong>성별</strong><span>${r.gender}</span></div>
        <div class="detail-item"><strong>희망 직무</strong><span><span class="badge badge-purple">${r.position}</span></span></div>
        <div class="detail-item"><strong>경력 사항</strong><span>${r.exp}</span></div>
        <div class="detail-item"><strong>희망 근무지역</strong><span>${r.area}</span></div>
        <div class="detail-item"><strong>희망 급여</strong><span style="color:var(--blue);font-weight:700">${r.salary}</span></div>
        <div class="detail-item"><strong>태권도 단수</strong><span>${r.grade}</span></div>
        <div class="detail-item"><strong>보유 자격증</strong><span>${r.cert}</span></div>
        <div class="detail-item"><strong>등록일</strong><span>${r.regDate}</span></div>
        <div class="detail-full">
          <strong>자기소개 및 포부</strong>
          <div class="detail-desc">${(r.content || '자기소개 없음').replace(/\n/g, '<br>')}</div>
        </div>
      </div>
    `;
  } else if (type === 'application') {
    const a = APPLICATIONS.find(x => x.id === id);
    if (!a) { showToast('지원 내역을 찾을 수 없습니다.', 'error'); return; }
    title = '입사지원 상세 정보';
    html = `
      <div class="detail-grid">
        <div class="detail-item"><strong>지원 ID</strong><span>${a.id}</span></div>
        <div class="detail-item"><strong>지원자명</strong><span>${a.applicant}</span></div>
        <div class="detail-item"><strong>지원 공고</strong><span>${a.job}</span></div>
        <div class="detail-item"><strong>도장명</strong><span>${a.gym}</span></div>
        <div class="detail-item"><strong>지원일</strong><span>${a.applyDate}</span></div>
        <div class="detail-item"><strong>진행 상태</strong><span>${appStatusBadge(a.status === '검토중' ? 'pending' : a.status === '면접제안' ? 'interview' : a.status === '합격' ? 'accepted' : 'rejected')}</span></div>
      </div>
    `;
  } else if (type === 'notice') {
    const n = NOTICES.find(x => x.id === id);
    if (!n) { showToast('공지사항을 찾을 수 없습니다.', 'error'); return; }
    title = '공지사항 상세 정보';
    html = `
      <div class="detail-grid">
        <div class="detail-item"><strong>구분</strong><span><span class="badge ${n.categoryClass}">${n.category}</span></span></div>
        <div class="detail-item"><strong>등록일</strong><span>${n.date}</span></div>
        <div class="detail-item"><strong>조회수</strong><span>${n.views}회</span></div>
        <div class="detail-full"><strong>공지사항 제목</strong><span style="font-size: 1.05rem; font-weight: 800; color: #0f172a;">${n.title}</span></div>
        <div class="detail-full">
          <strong>공지 내용</strong>
          <div class="detail-desc" style="white-space: pre-wrap; line-height: 1.65; font-size: 0.88rem; color: #334155; max-height: 380px; overflow-y: auto; padding: 1.25rem; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; box-sizing: border-box;">${n.content}</div>
        </div>
      </div>
    `;
  }

  if (titleEl) titleEl.textContent = title;
  if (bodyEl) bodyEl.innerHTML = html;
  openDialog('detail-dialog');
};

window.toggleJobPinned = async function(jobId, element) {
  if (typeof db === 'undefined' || !db) return;
  const checkbox = element || document.getElementById('job-detail-pinned-chk');
  if (!checkbox) return;

  const isChecked = checkbox.checked;

  if (isChecked) {
    try {
      showToast('상위 노출 정보를 업데이트 중입니다...', 'warning');

      // 1. 이미 상위 노출된 다른 공고가 있는지 조회
      const querySnap = await db.collection('jobs').where('pinned', '==', true).get();
      let existingPinnedJob = null;
      querySnap.forEach(doc => {
        if (doc.id !== jobId) {
          existingPinnedJob = { id: doc.id, ...doc.data() };
        }
      });

      if (existingPinnedJob) {
        // 이미 노출 중인 공고가 있다면 사용자에게 변경 동의를 물어봅니다.
        const confirmMsg = `이미 상위 노출된 공고("${existingPinnedJob.title}")가 있습니다.\n기존 공고를 해제하고 현재 공고로 변경하시겠습니까?`;
        if (!confirm(confirmMsg)) {
          checkbox.checked = false; // 체크 복구(취소)
          return;
        }

        // 기존 상위 노출 해제 + 신규 설정 (배치 트랜잭션)
        const batch = db.batch();
        batch.update(db.collection('jobs').doc(existingPinnedJob.id), { pinned: false });
        batch.update(db.collection('jobs').doc(jobId), { pinned: true });
        await batch.commit();
      } else {
        // 단독 설정
        await db.collection('jobs').doc(jobId).update({ pinned: true });
      }

      showToast('상위 노출 설정이 완료되었습니다.', 'success');

      // 데이터 새로고침 및 UI 업데이트
      await fetchFirestoreData();
      filterJobs();

      // 모달이 열려있다면 상세화면도 최신 정보로 갱신
      const detailDialog = document.getElementById('detail-dialog');
      if (detailDialog && detailDialog.open) {
        showDetail('job', jobId.substring(0, 8));
      }
    } catch (err) {
      console.error('상위 노출 설정 실패:', err);
      showToast('설정 오류가 발생했습니다: ' + err.message, 'error');
      checkbox.checked = false; // 오류 시 원래 상태(off) 복구
    }
  } else {
    // 끄려고 할 때 -> 결제 없이 바로 해제 진행
    try {
      showToast('상위 노출 정보를 업데이트 중입니다...', 'warning');
      await db.collection('jobs').doc(jobId).update({ pinned: false });
      showToast('상위 노출이 해제되었습니다.', 'success');

      // 데이터 새로고침 및 UI 업데이트
      await fetchFirestoreData();
      filterJobs();

      // 모달이 열려있다면 상세화면도 최신 정보로 갱신
      const detailDialog = document.getElementById('detail-dialog');
      if (detailDialog && detailDialog.open) {
        showDetail('job', jobId.substring(0, 8));
      }
    } catch (err) {
      console.error('상위 노출 설정 실패:', err);
      showToast('설정 오류가 발생했습니다: ' + err.message, 'error');
      checkbox.checked = true; // 복구
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  if (window.populateNotices) {
    window.populateNotices();
  }
});

// =============================================================================
// 배너 관리 (Banner Management)
// =============================================================================

// 배너 목록 로드
async function loadBanners() {
  const list = document.getElementById('banners-list');
  const countEl = document.getElementById('banners-count');
  if (!list) return;

  if (!db) {
    list.innerHTML = '<div style="text-align:center;padding:3rem;color:#94a3b8;grid-column:1/-1;">Firebase 연결 필요</div>';
    return;
  }

  try {
    const snap = await db.collection('banners').orderBy('created_at', 'desc').get();
    const banners = [];
    snap.forEach(doc => banners.push({ id: doc.id, ...doc.data() }));
    bannerCache = {};
    banners.forEach(b => { bannerCache[b.id] = b; });

    if (countEl) countEl.textContent = banners.length;

    if (banners.length === 0) {
      list.innerHTML = '<div style="text-align:center;padding:3rem;color:#94a3b8;grid-column:1/-1;">등록된 배너가 없습니다.</div>';
      return;
    }

    list.innerHTML = banners.map(b => `
      <div style="
        background:#fff; border-radius:12px; overflow:hidden;
        box-shadow:0 2px 8px rgba(0,0,0,0.08); border:1px solid #e2e8f0;
      ">
        <div style="position:relative;">
          <img src="${b.url}" alt="${b.name || '배너'}"
            style="width:100%;height:140px;object-fit:cover;display:block;"
            onerror="this.style.display='none'">
          <div style="
            position:absolute;top:8px;right:8px;
            display:flex;gap:6px;
          ">
            <a href="${b.url}" target="_blank" rel="noopener"
              style="background:rgba(255,255,255,0.9);border:none;border-radius:6px;padding:5px 8px;font-size:0.75rem;font-weight:600;cursor:pointer;color:#0f172a;text-decoration:none;display:inline-flex;align-items:center;gap:3px;">
              <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
              원본
            </a>
            <button onclick="openEditBannerDialog('${b.id}')"
              style="background:rgba(37,99,235,0.92);border:none;border-radius:6px;padding:5px 8px;font-size:0.75rem;font-weight:600;cursor:pointer;color:#fff;display:inline-flex;align-items:center;gap:3px;">
              <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
              수정
            </button>
            <button onclick="deleteBanner('${b.id}', '${b.storagePath || ''}')"
              style="background:rgba(239,68,68,0.9);border:none;border-radius:6px;padding:5px 8px;font-size:0.75rem;font-weight:600;cursor:pointer;color:#fff;display:inline-flex;align-items:center;gap:3px;">
              <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
              삭제
            </button>
          </div>
        </div>
        <div style="padding:0.75rem 1rem;">
          <div style="font-size:0.82rem;font-weight:700;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${b.name || '배너'}</div>
          <div style="font-size:0.75rem;color:#64748b;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${b.linkUrl ? `연결: ${b.linkUrl}` : '연결 URL 없음'}</div>
          <div style="font-size:0.75rem;color:#94a3b8;margin-top:2px;">${b.created_at ? new Date(b.created_at.seconds * 1000).toLocaleDateString('ko-KR') : ''}</div>
        </div>
      </div>
    `).join('');
  } catch (e) {
    console.error('배너 로드 실패:', e);
    list.innerHTML = '<div style="text-align:center;padding:3rem;color:#ef4444;grid-column:1/-1;">배너를 불러오는 중 오류가 발생했습니다.</div>';
  }
}

function resetBannerDialogState() {
  const linkInput = document.getElementById('banner-link-url');
  const fileInput = document.getElementById('banner-file-input');
  const progressWrap = document.getElementById('banner-upload-progress');
  const filenameEl = document.getElementById('banner-upload-filename');
  const pctEl = document.getElementById('banner-upload-pct');
  const barEl = document.getElementById('banner-upload-bar');
  const zone = document.getElementById('banner-upload-zone');
  const titleEl = document.getElementById('banner-dialog-title');
  const previewWrap = document.getElementById('banner-current-preview');
  const previewImg = document.getElementById('banner-current-image');
  const previewLabel = document.getElementById('banner-current-preview-label');
  const uploadTitle = document.getElementById('banner-upload-zone-title');
  const saveUrlBtn = document.getElementById('banner-save-url-btn');
  const selectImageBtn = document.getElementById('banner-select-image-btn');
  const submitBtn = document.getElementById('banner-submit-btn');

  bannerDialogMode = 'create';
  editingBanner = null;
  selectedBannerFile = null;
  if (selectedBannerPreviewUrl) {
    URL.revokeObjectURL(selectedBannerPreviewUrl);
    selectedBannerPreviewUrl = null;
  }
  if (linkInput) linkInput.value = '';
  if (fileInput) fileInput.value = '';
  if (progressWrap) progressWrap.style.display = 'none';
  if (filenameEl) filenameEl.textContent = '';
  if (pctEl) pctEl.textContent = '0%';
  if (barEl) barEl.style.width = '0%';
  if (titleEl) titleEl.textContent = '배너 이미지 추가';
  if (previewWrap) previewWrap.style.display = 'none';
  if (previewImg) previewImg.removeAttribute('src');
  if (previewLabel) previewLabel.textContent = '선택한 배너 이미지';
  if (uploadTitle) uploadTitle.textContent = '클릭하거나 이미지를 드래그하여 업로드';
  if (saveUrlBtn) saveUrlBtn.style.display = 'none';
  if (selectImageBtn) selectImageBtn.textContent = '이미지 선택';
  if (submitBtn) submitBtn.textContent = '등록하기';
  if (zone) {
    zone.style.borderColor = '#cbd5e1';
    zone.style.background = '#f8fafc';
  }
}

function openBannerDialog() {
  resetBannerDialogState();
  const dialog = document.getElementById('banner-dialog');
  if (dialog && !dialog.open) dialog.showModal();
}

function openEditBannerDialog(bannerId) {
  const banner = bannerCache[bannerId];
  if (!banner) {
    showToast('수정할 배너 정보를 찾을 수 없습니다.', 'error');
    return;
  }

  resetBannerDialogState();
  bannerDialogMode = 'edit';
  editingBanner = banner;

  const titleEl = document.getElementById('banner-dialog-title');
  const linkInput = document.getElementById('banner-link-url');
  const previewWrap = document.getElementById('banner-current-preview');
  const previewImg = document.getElementById('banner-current-image');
  const previewLabel = document.getElementById('banner-current-preview-label');
  const uploadTitle = document.getElementById('banner-upload-zone-title');
  const saveUrlBtn = document.getElementById('banner-save-url-btn');
  const selectImageBtn = document.getElementById('banner-select-image-btn');
  const submitBtn = document.getElementById('banner-submit-btn');

  if (titleEl) titleEl.textContent = '배너 수정';
  if (linkInput) linkInput.value = banner.linkUrl || '';
  if (previewImg) previewImg.src = banner.url || '';
  if (previewLabel) previewLabel.textContent = '현재 배너 이미지';
  if (previewWrap) previewWrap.style.display = banner.url ? 'block' : 'none';
  if (uploadTitle) uploadTitle.textContent = '새 이미지로 교체하려면 클릭하거나 드래그하세요';
  if (saveUrlBtn) saveUrlBtn.style.display = 'inline-flex';
  if (selectImageBtn) selectImageBtn.textContent = '이미지 교체';
  if (submitBtn) submitBtn.textContent = '수정 저장';

  const dialog = document.getElementById('banner-dialog');
  if (dialog && !dialog.open) dialog.showModal();
}

function closeBannerDialog() {
  const dialog = document.getElementById('banner-dialog');
  if (dialog?.open) dialog.close();
}

function setSelectedBannerFile(file) {
  const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (!allowed.includes(file.type)) {
    showToast('JPG, PNG, WebP 형식의 이미지만 선택 가능합니다.', 'error');
    return;
  }

  if (selectedBannerPreviewUrl) URL.revokeObjectURL(selectedBannerPreviewUrl);
  selectedBannerFile = file;
  selectedBannerPreviewUrl = URL.createObjectURL(file);

  const previewWrap = document.getElementById('banner-current-preview');
  const previewImg = document.getElementById('banner-current-image');
  const previewLabel = document.getElementById('banner-current-preview-label');
  const uploadTitle = document.getElementById('banner-upload-zone-title');
  const filenameEl = document.getElementById('banner-upload-filename');

  if (previewImg) previewImg.src = selectedBannerPreviewUrl;
  if (previewWrap) previewWrap.style.display = 'block';
  if (previewLabel) previewLabel.textContent = '선택한 배너 이미지';
  if (uploadTitle) uploadTitle.textContent = `${file.name} 선택됨`;
  if (filenameEl) filenameEl.textContent = `${file.name} 선택됨 · 저장 버튼을 누르면 업로드됩니다.`;
}

async function submitBannerDialog() {
  if (selectedBannerFile) {
    await uploadBannerFile(selectedBannerFile);
    return;
  }

  if (bannerDialogMode === 'edit') {
    await saveBannerLinkOnly();
    return;
  }

  showToast('등록할 배너 이미지를 선택해주세요.', 'error');
}

async function saveBannerLinkOnly() {
  if (bannerDialogMode !== 'edit' || !editingBanner?.id) return;
  if (!db) {
    showToast('Firebase 연결이 필요합니다.', 'error');
    return;
  }

  const linkInput = document.getElementById('banner-link-url');
  const linkUrl = normalizeBannerLinkUrl(linkInput?.value);
  if (linkUrl === null) {
    showToast('배너 클릭 URL 형식이 올바르지 않습니다. 예: https://example.com', 'error');
    return;
  }

  try {
    await db.collection('banners').doc(editingBanner.id).update({ linkUrl });
    closeBannerDialog();
    showToast('배너 URL이 수정되었습니다.', 'success');
    loadBanners();
  } catch (e) {
    console.error('배너 URL 수정 실패:', e);
    showToast('배너 URL 수정 중 오류가 발생했습니다.', 'error');
  }
}

// 드래그앤드롭 핸들러
function handleBannerDrop(event) {
  event.preventDefault();
  const zone = document.getElementById('banner-upload-zone');
  if (zone) { zone.style.borderColor = '#cbd5e1'; zone.style.background = '#f8fafc'; }
  const file = event.dataTransfer.files[0];
  if (file) setSelectedBannerFile(file);
}

// 파일 선택 핸들러
function handleBannerFileSelect(event) {
  const file = event.target.files[0];
  if (file) setSelectedBannerFile(file);
  // 같은 파일 재선택 가능하도록 초기화
  event.target.value = '';
}

function formatBannerFileSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function normalizeBannerLinkUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;

  try {
    const url = new URL(withProtocol);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.href;
  } catch (_) {
    return null;
  }
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('이미지 압축에 실패했습니다.'));
    }, type, quality);
  });
}

async function compressBannerImage(file, maxBytes = 800 * 1024) {
  const imageUrl = URL.createObjectURL(file);

  try {
    const img = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('이미지 파일을 읽을 수 없습니다.'));
      image.src = imageUrl;
    });

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('이미지 압축을 지원하지 않는 브라우저입니다.');

    let maxWidth = 1600;
    const outputType = 'image/webp';
    let bestBlob = null;

    for (let resizeAttempt = 0; resizeAttempt < 5; resizeAttempt++) {
      const scale = Math.min(1, maxWidth / img.naturalWidth);
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      for (let quality = 0.86; quality >= 0.48; quality -= 0.08) {
        const blob = await canvasToBlob(canvas, outputType, quality);
        bestBlob = blob;
        if (blob.size <= maxBytes) {
          const safeBaseName = file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9._-]/g, '_') || 'banner';
          return new File([blob], `${safeBaseName}.webp`, {
            type: outputType,
            lastModified: Date.now()
          });
        }
      }

      maxWidth = Math.round(maxWidth * 0.78);
    }

    if (!bestBlob) throw new Error('이미지 압축에 실패했습니다.');
    const safeBaseName = file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9._-]/g, '_') || 'banner';
    return new File([bestBlob], `${safeBaseName}.webp`, {
      type: outputType,
      lastModified: Date.now()
    });
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

// 배너 업로드 핵심 함수
async function uploadBannerFile(file) {
  // 파일 타입 검증
  const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (!allowed.includes(file.type)) {
    showToast('JPG, PNG, WebP 형식의 이미지만 업로드 가능합니다.', 'error');
    return;
  }

  if (!storage) {
    showToast('Firebase Storage가 초기화되지 않았습니다.', 'error');
    return;
  }

  const linkInput = document.getElementById('banner-link-url');
  const linkUrl = normalizeBannerLinkUrl(linkInput?.value);
  if (linkUrl === null) {
    showToast('배너 클릭 URL 형식이 올바르지 않습니다. 예: https://example.com', 'error');
    return;
  }

  // 진행 바 표시
  const progressWrap = document.getElementById('banner-upload-progress');
  const filenameEl   = document.getElementById('banner-upload-filename');
  const pctEl        = document.getElementById('banner-upload-pct');
  const barEl        = document.getElementById('banner-upload-bar');

  if (progressWrap) progressWrap.style.display = 'block';
  if (filenameEl) filenameEl.textContent = `${file.name} 압축 중...`;
  if (pctEl) pctEl.textContent = '0%';
  if (barEl) barEl.style.width = '0%';

  let uploadFile;
  try {
    uploadFile = await compressBannerImage(file);
    if (filenameEl) {
      filenameEl.textContent = `${file.name} (${formatBannerFileSize(file.size)} → ${formatBannerFileSize(uploadFile.size)})`;
    }
  } catch (e) {
    console.error('배너 압축 실패:', e);
    if (progressWrap) progressWrap.style.display = 'none';
    showToast(e.message || '이미지 압축 중 오류가 발생했습니다.', 'error');
    return;
  }

  const timestamp = Date.now();
  const storagePath = `banners/${timestamp}_${uploadFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const ref = storage.ref(storagePath);
  const uploadTask = ref.put(uploadFile, { contentType: uploadFile.type });

  uploadTask.on('state_changed',
    (snapshot) => {
      const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
      if (pctEl) pctEl.textContent = `${pct}%`;
      if (barEl) barEl.style.width = `${pct}%`;
    },
    (err) => {
      console.error('배너 업로드 실패:', err);
      if (progressWrap) progressWrap.style.display = 'none';
      showToast('업로드 중 오류: ' + err.message, 'error');
    },
    async () => {
      try {
        const downloadURL = await uploadTask.snapshot.ref.getDownloadURL();

        if (db && bannerDialogMode === 'edit' && editingBanner?.id) {
          const oldStoragePath = editingBanner.storagePath;
          await db.collection('banners').doc(editingBanner.id).update({
            name: file.name,
            url: downloadURL,
            linkUrl,
            storagePath,
            size: uploadFile.size
          });

          if (storage && oldStoragePath && oldStoragePath !== storagePath) {
            try { await storage.ref(oldStoragePath).delete(); } catch (_) {}
          }
        } else if (db) {
          await db.collection('banners').add({
            name: file.name,
            url: downloadURL,
            linkUrl,
            storagePath,
            size: uploadFile.size,
            created_at: firebase.firestore.FieldValue.serverTimestamp()
          });
        }

        if (progressWrap) progressWrap.style.display = 'none';
        if (linkInput) linkInput.value = '';
        selectedBannerFile = null;
        if (selectedBannerPreviewUrl) {
          URL.revokeObjectURL(selectedBannerPreviewUrl);
          selectedBannerPreviewUrl = null;
        }
        closeBannerDialog();
        showToast(
          bannerDialogMode === 'edit'
            ? `"${file.name}" 배너가 수정되었습니다.`
            : `"${file.name}" 배너가 압축되어 등록되었습니다.`,
          'success'
        );
        loadBanners();
      } catch (e) {
        console.error('배너 메타데이터 저장 실패:', e);
        if (progressWrap) progressWrap.style.display = 'none';
        showToast('배너 등록 중 오류가 발생했습니다.', 'error');
      }
    }
  );
}

// 배너 삭제
async function deleteBanner(docId, storagePath) {
  if (!confirm('이 배너를 삭제하시겠습니까?')) return;
  try {
    // Firestore 문서 삭제
    if (db) await db.collection('banners').doc(docId).delete();

    // Storage 파일 삭제 (경로가 있을 경우)
    if (storage && storagePath) {
      try { await storage.ref(storagePath).delete(); } catch (_) {}
    }

    showToast('배너가 삭제되었습니다.', 'success');
    loadBanners();
  } catch (e) {
    console.error('배너 삭제 실패:', e);
    showToast('배너 삭제 중 오류가 발생했습니다.', 'error');
  }
}

// ─── 약관 등록 / 관리 어드민 기능 ──────────────────────────────────────────────
let currentSelectedTermsType = 'gym'; // 기본값

// 약관 선택 전환
window.selectAdminTerms = async function(termsType) {
  currentSelectedTermsType = termsType;
  
  // 버튼 액티브 스타일 교체
  document.querySelectorAll('#terms-admin-list button').forEach(btn => {
    btn.classList.remove('active-terms-btn');
    btn.style.background = '';
    btn.style.color = '';
    btn.style.borderColor = '';
  });
  
  const activeBtn = document.getElementById(`terms-btn-${termsType}`);
  if (activeBtn) {
    activeBtn.classList.add('active-terms-btn');
    activeBtn.style.background = 'linear-gradient(135deg, #eff6ff, #dbeafe)';
    activeBtn.style.color = 'var(--accent-blue)';
    activeBtn.style.borderColor = 'rgba(37,99,235,0.2)';
  }
  
  // 상태 초기화
  document.getElementById('terms-admin-status').textContent = '데이터 로딩 중...';
  
  try {
    if (!db) {
      document.getElementById('terms-admin-status').textContent = '⚠️ Firestore 연결이 없습니다.';
      return;
    }
    
    // Firestore terms 컬렉션에서 데이터 로드
    const docRef = db.collection('terms').doc(termsType);
    const doc = await docRef.get();
    
    if (doc.exists) {
      const data = doc.data();
      document.getElementById('terms-admin-title').value = data.title || '';
      document.getElementById('terms-admin-effective').value = data.effectiveDate || '';
      document.getElementById('terms-admin-content').value = data.content || '';
      
      const lastUpdated = data.updatedAt ? new Date(data.updatedAt.toDate()).toLocaleString() : '미기록';
      document.getElementById('terms-admin-status').textContent = `✅ 최근 수정일: ${lastUpdated}`;
    } else {
      // 문서가 없는 경우, 서버 txt 파일에서 데이터 원본 가져오기 시도
      document.getElementById('terms-admin-status').textContent = '📝 신규 작성 상태 (Firestore에 데이터가 없음)';
      await loadTermsOriginalFiles(true); // silent load
    }
  } catch (e) {
    console.error('약관 데이터 로드 실패:', e);
    document.getElementById('terms-admin-status').textContent = '❌ 데이터 로드 실패';
    showToast('약관 데이터를 불러오지 못했습니다.', 'error');
  }
}

// 서버 txt 파일 원본 불러오기
window.loadTermsOriginalFiles = async function(isSilent = false) {
  if (!isSilent && !confirm('서버의 정적 텍스트 파일 원본을 불러오시겠습니까?\n현재 작성 중이던 내용은 덮어씌워집니다.')) return;
  
  let filename = '';
  let defaultTitle = '';
  let defaultEffective = '2026년 07월 04일';
  
  if (currentSelectedTermsType === 'gym') {
    filename = 'gym-terms-20260704.txt';
    defaultTitle = '관장회원 이용약관';
  } else if (currentSelectedTermsType === 'instructor') {
    filename = 'instructor-terms-20260704.txt';
    defaultTitle = '사범회원 이용약관';
  } else if (currentSelectedTermsType === 'paid') {
    filename = 'paid-terms-20260704.txt';
    defaultTitle = '유료서비스 이용약관';
  }
  
  try {
    const response = await fetch(`/legal/${filename}`);
    if (!response.ok) throw new Error('파일 fetch 실패');
    
    let text = await response.text();
    
    // 텍스트 파일에서 제목 및 시행일 파싱
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length > 0) {
      defaultTitle = lines[0];
      const match = lines[1] ? lines[1].match(/(시행일:\s*)(.+)$/) : null;
      if (match && match[2]) {
        defaultEffective = match[2].trim();
      }
      
      // 제목과 시행일은 textarea에서 뺀 약관 알짜 본문만 넣을 것인지, 아니면 전체를 넣을 것인지 선택
      // UI에서는 제목과 시행일을 별도 필드로 분리하고 있으므로, 파싱하여 텍스트에리어에는 조항부터 넣을 수도 있습니다.
      // 하지만 이용약관에 파일 내용 그대로가 저장되는 것이 안전하므로, 텍스트에리어에는 원문 파일 전체를 그대로 넣도록 하겠습니다.
      // (혹은 첫줄, 둘째줄을 제외한 나머지 본문만 넣어줄 수도 있습니다.)
      // 여기서는 사용자가 보기 편하도록 원문 전체를 textarea에 그대로 로드합니다.
    }
    
    document.getElementById('terms-admin-title').value = defaultTitle;
    document.getElementById('terms-admin-effective').value = defaultEffective;
    document.getElementById('terms-admin-content').value = text;
    
    if (!isSilent) {
      document.getElementById('terms-admin-status').textContent = '🔄 원본 파일이 정상적으로 로드되었습니다. 저장하기를 눌러 적용하세요.';
      showToast('원본 파일을 불러왔습니다. 저장 버튼을 클릭해야 실시간 서비스에 적용됩니다.', 'success');
    }
  } catch (err) {
    console.error('원본 파일 로드 실패:', err);
    if (!isSilent) {
      showToast('서버 원본 파일을 불러오지 못했습니다.', 'error');
    }
  }
}

// 약관 저장하기
window.saveAdminTerms = async function() {
  const title = document.getElementById('terms-admin-title').value.trim();
  const effectiveDate = document.getElementById('terms-admin-effective').value.trim();
  const content = document.getElementById('terms-admin-content').value.trim();
  
  if (!title) {
    alert('약관 제목을 입력해 주세요.');
    return;
  }
  if (!effectiveDate) {
    alert('시행일을 입력해 주세요.');
    return;
  }
  if (!content) {
    alert('약관 본문 내용을 입력해 주세요.');
    return;
  }
  
  if (!confirm(`[${title}] 약관의 변경사항을 저장하고 실시간 반영하시겠습니까?`)) return;
  
  try {
    if (!db) {
      alert('Firestore 연결 정보가 존재하지 않습니다.');
      return;
    }
    
    await db.collection('terms').doc(currentSelectedTermsType).set({
      title: title,
      effectiveDate: effectiveDate,
      content: content,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    
    const nowStr = new Date().toLocaleString();
    document.getElementById('terms-admin-status').textContent = `✅ 최근 수정일: ${nowStr} (저장 완료)`;
    showToast('약관이 안전하게 저장되었으며, 서비스에 실시간 적용되었습니다.', 'success');
  } catch (e) {
    console.error('약관 저장 실패:', e);
    showToast('약관 저장 중 오류가 발생했습니다.', 'error');
  }
}
