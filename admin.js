/* ==========================================================================
   TaekwonJob Admin Panel — admin.js
   ========================================================================== */

/* ==========================================================================
   Firebase 초기화 & 관리자 접근 제어
   ========================================================================== */
(function initAdminAuth() {
  let auth, db;

  // Firebase 초기화
  try {
    // 이미 초기화된 경우 기존 app 재사용
    try { firebase.app(); } catch (_) { firebase.initializeApp(FIREBASE_CONFIG); }
    auth = firebase.auth();
    db   = firebase.firestore();
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

      if (data && data.type === 'gym') {
        // ✅ 도장(관장) → 대시보드 허용
        if (overlay)     overlay.style.display = 'none';
        if (denied)      denied.style.display  = 'none';
        if (sidebar)     sidebar.style.display  = '';
        if (mainContent) mainContent.style.display = '';

        // 관리자 이름 표시
        const adminNameEl = document.querySelector('.sidebar-admin-info div div:first-child');
        if (adminNameEl) adminNameEl.textContent = data.name || user.email;

        // Firestore 실시간 데이터 로드 및 렌더링
        await fetchFirestoreData();
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
  { id: 1, name: '이강남', email: 'leegangnam@gmail.com', phone: '010-1234-5678', type: 'gym', joinDate: '2026-05-01', status: 'active' },
  { id: 2, name: '김사범', email: 'kimsabum@naver.com', phone: '010-2345-6789', type: 'instructor', joinDate: '2026-05-03', status: 'active' },
  { id: 3, name: '박관장', email: 'parkgj@kakao.com', phone: '010-3456-7890', type: 'gym', joinDate: '2026-05-05', status: 'active' },
  { id: 4, name: '최사범', email: 'choijabum@naver.com', phone: '010-4567-8901', type: 'instructor', joinDate: '2026-05-07', status: 'active' },
  { id: 5, name: '정관장', email: 'junggj@gmail.com', phone: '010-5678-9012', type: 'gym', joinDate: '2026-05-09', status: 'inactive' },
  { id: 6, name: '한사범', email: 'hansabum@naver.com', phone: '010-6789-0123', type: 'instructor', joinDate: '2026-05-10', status: 'active' },
  { id: 7, name: '조관장', email: 'jodojang@kakao.com', phone: '010-7890-1234', type: 'gym', joinDate: '2026-05-12', status: 'active' },
  { id: 8, name: '윤사범', email: 'yoonsabum@gmail.com', phone: '010-8901-2345', type: 'instructor', joinDate: '2026-05-13', status: 'banned' },
  { id: 9, name: '강관장', email: 'kangdojang@naver.com', phone: '010-9012-3456', type: 'gym', joinDate: '2026-05-14', status: 'active' },
  { id: 10, name: '임사범', email: 'yimsabum@gmail.com', phone: '010-0123-4567', type: 'instructor', joinDate: '2026-05-15', status: 'active' },
  { id: 11, name: '신관장', email: 'shingj@naver.com', phone: '010-1111-2222', type: 'gym', joinDate: '2026-05-16', status: 'active' },
  { id: 12, name: '오사범', email: 'ohsabum@kakao.com', phone: '010-2222-3333', type: 'instructor', joinDate: '2026-05-17', status: 'active' },
  { id: 13, name: '서관장', email: 'seogj@gmail.com', phone: '010-3333-4444', type: 'gym', joinDate: '2026-05-18', status: 'inactive' },
  { id: 14, name: '권사범', email: 'kwonsabum@naver.com', phone: '010-4444-5555', type: 'instructor', joinDate: '2026-05-19', status: 'active' },
  { id: 15, name: '황관장', email: 'hwanggj@kakao.com', phone: '010-5555-6666', type: 'gym', joinDate: '2026-05-20', status: 'active' },
];

const JOBS = [
  { id: 128, title: '강남 태권도장 정사범 모집', gym: '강남 태권도장', region: '서울', district: '강남구', salary: '월 320만원', position: '정사범', exp: '경력 3년↑', regDate: '2026-05-18', views: 45, status: '게시중' },
  { id: 127, title: '송파 태권도장 보조사범 모집', gym: '송파 태권도장', region: '서울', district: '송파구', salary: '월 260만원', position: '보조사범', exp: '신입 가능', regDate: '2026-05-18', views: 32, status: '게시중' },
  { id: 126, title: '분당 태권도장 정사범 모집', gym: '분당 태권도장', region: '경기', district: '성남시', salary: '시급 15,000', position: '파트타임', exp: '경력 1년↑', regDate: '2026-05-17', views: 28, status: '검토중' },
  { id: 125, title: '일산 태권도장 정사범 모집', gym: '일산 태권도장', region: '경기', district: '고양시', salary: '월 300만원', position: '정사범', exp: '경력 2년↑', regDate: '2026-05-17', views: 15, status: '마감됨' },
  { id: 124, title: '인천 태권도장 보조사범 모집', gym: '인천 태권도장', region: '인천', district: '연수구', salary: '월 250만원', position: '보조사범', exp: '신입 가능', regDate: '2026-05-16', views: 25, status: '게시중' },
  { id: 123, title: '대전 도장 수석사범 모집', gym: '대전 태권도장', region: '대전', district: '서구', salary: '월 380만원', position: '수석사범', exp: '경력 5년↑', regDate: '2026-05-15', views: 67, status: '게시중' },
  { id: 122, title: '부산 해운대 정사범 채용', gym: '해운대 태권도장', region: '부산', district: '해운대구', salary: '월 310만원', position: '정사범', exp: '경력 2년↑', regDate: '2026-05-14', views: 52, status: '게시중' },
  { id: 121, title: '수원 유치부 전임 사범 모집', gym: '수원 태권도장', region: '경기', district: '수원시', salary: '월 280만원', position: '유치부 전임', exp: '경력 1년↑', regDate: '2026-05-13', views: 38, status: '마감됨' },
  { id: 120, title: '광주 정사범 채용공고', gym: '광주 태권도장', region: '광주', district: '서구', salary: '월 295만원', position: '정사범', exp: '경력 2년↑', regDate: '2026-05-12', views: 41, status: '게시중' },
  { id: 119, title: '구리 보조사범 모집', gym: '구리 태권도장', region: '경기', district: '구리시', salary: '월 240만원', position: '보조사범', exp: '신입 가능', regDate: '2026-05-11', views: 19, status: '마감됨' },
];

const RESUMES = [
  { id: 1, name: '김사범', gender: '남', position: '정사범', exp: '경력 5년', area: '서울', salary: '월 320만원↑', grade: '3단', cert: '생활스포츠지도사 2급', regDate: '2026-05-18' },
  { id: 2, name: '이사범', gender: '남', position: '보조사범', exp: '경력 2년', area: '경기', salary: '월 260만원↑', grade: '2단', cert: '태권도 지도자', regDate: '2026-05-17' },
  { id: 3, name: '박사범', gender: '여', position: '유치부 전임', exp: '경력 3년', area: '서울/경기', salary: '월 280만원↑', grade: '3단', cert: '유아체육지도사', regDate: '2026-05-16' },
  { id: 4, name: '최사범', gender: '남', position: '수석사범', exp: '경력 8년', area: '전국', salary: '월 400만원↑', grade: '5단', cert: '체육지도자, 생스지 1급', regDate: '2026-05-15' },
  { id: 5, name: '정사범', gender: '남', position: '정사범', exp: '신입', area: '수도권', salary: '월 250만원↑', grade: '2단', cert: '태권도 지도자', regDate: '2026-05-14' },
  { id: 6, name: '한사범', gender: '여', position: '보조사범', exp: '경력 1년', area: '부산', salary: '월 220만원↑', grade: '2단', cert: '생활스포츠지도사 2급', regDate: '2026-05-13' },
  { id: 7, name: '조사범', gender: '남', position: '파트타임', exp: '경력 2년', area: '대전/세종', salary: '시급 15,000↑', grade: '3단', cert: '태권도 지도자', regDate: '2026-05-12' },
];

const APPLICATIONS = [
  { id: 215, applicant: '김사범', job: '강남 태권도장 정사범 모집', gym: '강남 태권도장', applyDate: '2026-05-18', status: '검토중' },
  { id: 214, applicant: '이사범', job: '송파 태권도장 보조사범 모집', gym: '송파 태권도장', applyDate: '2026-05-18', status: '면접제안' },
  { id: 213, applicant: '박사범', job: '대전 도장 수석사범 모집', gym: '대전 태권도장', applyDate: '2026-05-17', status: '합격' },
  { id: 212, applicant: '최사범', job: '부산 해운대 정사범 채용', gym: '해운대 태권도장', applyDate: '2026-05-16', status: '검토중' },
  { id: 211, applicant: '정사범', job: '광주 정사범 채용공고', gym: '광주 태권도장', applyDate: '2026-05-15', status: '불합격' },
  { id: 210, applicant: '한사범', job: '일산 태권도장 정사범 모집', gym: '일산 태권도장', applyDate: '2026-05-14', status: '합격' },
  { id: 209, applicant: '조사범', job: '인천 태권도장 보조사범 모집', gym: '인천 태권도장', applyDate: '2026-05-13', status: '검토중' },
  { id: 208, applicant: '윤사범', job: '분당 태권도장 정사범 모집', gym: '분당 태권도장', applyDate: '2026-05-12', status: '면접제안' },
];

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
  settings: '설정',
};

function navigateTo(viewId, clickedItem) {
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

  // Init view if first visit
  if (viewId === 'members') renderMembers();
  if (viewId === 'jobs') renderJobs();
  if (viewId === 'resumes') renderResumes();
  if (viewId === 'applications') renderApplications();
  if (viewId === 'analytics') initAnalyticsCharts();
}

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
        name: u.name || '이름 없음',
        email: u.email || '',
        phone: u.phone || '010-0000-0000',
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
        name: r.name || '사범',
        gender: r.gender || '남성',
        position: r.hope_position || r.position || '정사범',
        exp: r.career || '경력무관',
        area: r.hope_area || '전국',
        salary: r.hope_salary || '월 280만원↑',
        grade: r.certificate ? r.certificate.split(',')[0].trim() : '태권도 3단',
        cert: r.certificate ? r.certificate.split(',').slice(1).join(',').trim() : '태권도 지도자',
        regDate: r.created_at ? (r.created_at.toDate ? r.created_at.toDate().toISOString().split('T')[0] : '2026-06-11') : '2026-06-11'
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
      dbJobs.push({
        id: doc.id.substring(0, 8),
        title: j.title || '채용공고',
        gym: j.gymName || '태권도장',
        region: region,
        district: district,
        salary: j.salary || '협의',
        position: j.position || '정사범',
        exp: j.career || '경력무관',
        regDate: j.created_at ? (j.created_at.toDate ? j.created_at.toDate().toISOString().split('T')[0] : '2026-06-11') : '2026-06-11',
        views: j.views || 0,
        status: j.status === 'active' ? '게시중' : '마감됨'
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
      dbApplies.push({
        id: doc.id.substring(0, 8),
        applicant: a.applicant_name || '지원자',
        job: a.job_title || '채용공고',
        gym: a.gym_name || '도장',
        applyDate: a.created_at ? (a.created_at.toDate ? a.created_at.toDate().toISOString().split('T')[0] : '2026-06-11') : '2026-06-11',
        status: a.status === 'pending' ? '검토중' : a.status === 'interview' ? '면접제안' : a.status === 'pass' ? '합격' : '불합격'
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
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg><p>검색 결과가 없습니다.</p></div></td></tr>`;
  } else {
    tbody.innerHTML = items.map(m => `
      <tr>
        <td style="color:var(--muted);font-size:0.78rem">${m.id}</td>
        <td style="font-weight:700">${m.name}</td>
        <td style="color:var(--muted)">${m.email}</td>
        <td style="color:var(--muted)">${m.phone}</td>
        <td>${m.type === 'gym' ? '<span class="badge badge-blue">도장(관장)</span>' : '<span class="badge badge-green">사범(구직자)</span>'}</td>
        <td style="color:var(--muted)">${m.joinDate}</td>
        <td>${memberStatusBadge(m.status)}</td>
        <td>
          <div class="action-btns">
            <button class="btn-icon" title="상세보기" onclick="showToast('회원 상세 정보','')">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
            <button class="btn-icon ${m.status === 'banned' ? 'success' : 'danger'}" title="${m.status === 'banned' ? '정지 해제' : '회원 정지'}" onclick="toggleMemberBan(${m.id})">
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
    tbody.innerHTML = `<tr><td colspan="10"><div class="empty-state"><p>검색 결과가 없습니다.</p></div></td></tr>`;
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
        <td style="color:var(--muted)">${j.views}</td>
        <td>${statusBadge(j.status)}</td>
        <td>
          <div class="action-btns">
            <button class="btn-icon" title="수정" onclick="showToast('공고 수정 페이지로 이동합니다.','')">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="btn-icon danger" title="삭제" onclick="deleteJob(${j.id})">
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

function submitJob() {
  const title = document.getElementById('dlg-job-title')?.value;
  const gym = document.getElementById('dlg-gym-name')?.value;
  if (!title || !gym) { showToast('제목과 도장 이름을 입력해주세요.', 'warning'); return; }
  const newJob = {
    id: Math.max(...JOBS.map(j => j.id)) + 1,
    title, gym,
    region: (document.getElementById('dlg-job-region')?.value || '서울').split(' ')[0],
    district: (document.getElementById('dlg-job-region')?.value || '서울').split(' ')[1] || '',
    salary: document.getElementById('dlg-job-salary')?.value || '협의',
    position: document.getElementById('dlg-job-pos')?.value || '정사범',
    exp: document.getElementById('dlg-job-exp')?.value || '경력 무관',
    regDate: new Date().toISOString().split('T')[0],
    views: 0,
    status: document.getElementById('dlg-job-status')?.value || '검토중',
  };
  JOBS.unshift(newJob);
  closeDialog('job-dialog');
  showToast('채용공고가 등록되었습니다.', 'success');
  filterJobs();
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
          <button class="btn-icon" onclick="showToast('이력서 상세 보기','')">
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
          <button class="btn btn-sm btn-success" onclick="changeAppStatus(${a.id},'합격')">합격</button>
          <button class="btn btn-sm btn-danger" onclick="changeAppStatus(${a.id},'불합격')">불합격</button>
        </div>
      </td>
    </tr>`).join('');

  // Update badge
  const pendingCount = APPLICATIONS.filter(a => a.status === '검토중').length;
  const badge = document.getElementById('pending-badge');
  if (badge) badge.textContent = pendingCount;

  renderPagination('apps-pagination', filtered.length, page, 'applications');
}

function changeAppStatus(id, newStatus) {
  const app = APPLICATIONS.find(a => a.id === id);
  if (app) {
    app.status = newStatus;
    showToast(`${app.applicant}님 상태가 "${newStatus}"로 변경되었습니다.`, newStatus === '합격' ? 'success' : 'error');
    filterApplications();
  }
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
        labels: ['정사범', '보조사범', '수석사범', '파트타임', '유치부'],
        datasets: [{ data: [55, 28, 10, 15, 20], backgroundColor: ['#2563eb','#10b981','#8b5cf6','#f59e0b','#ef4444'], borderWidth: 3, borderColor: '#fff' }],
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
