/* ==========================================================================
   Taekwon Career (태권커리어) Core Script
   SPA Routing, Mock Database, Filtering, & Form Submissions
   ========================================================================== */

// ==========================================================================
// Firebase 초기화 (클로저 외부)
// ==========================================================================
let auth, db;
let homeBannerTimer = null;
try {
  firebase.initializeApp(FIREBASE_CONFIG);
  auth = firebase.auth();
  db   = firebase.firestore();
} catch (e) {
  console.warn('파이어베이스 초기화 오류. firebase-config.js의 설정값을 확인해주세요.', e);
}

const NTS_BUSINESS_API_KEY = '99546afda95844c23df25ca3cc6c60c4b3b9cc594ba5822a5fa49ecc62391d4e';
const NTS_BUSINESS_STATUS_URL = 'https://api.odcloud.kr/api/nts-businessman/v1/status';
const NTS_BUSINESS_VALIDATE_URL = 'https://api.odcloud.kr/api/nts-businessman/v1/validate';
const ADMIN_EMAILS = ['admin@taekwonjob.com', 'admin2@taekwonjob.com', 'admin3@taekwonjob.com', 'kkh9172@gmail.com'];
const DEFAULT_RESUME_PASS_PRODUCTS = [
  { id: 'month_1', name: '1개월 구독권', months: 1, price: 20000, active: true, sort: 1 },
  { id: 'month_2', name: '2개월 구독권', months: 2, price: 30000, active: true, sort: 2 },
  { id: 'month_3', name: '3개월 구독권', months: 3, price: 40000, active: true, sort: 3 }
];

function isAdminEmail(email) {
  return ADMIN_EMAILS.includes(String(email || '').toLowerCase());
}

// 에러 토스트 하퍼
function showAuthError(msg) {
  const activePane = document.querySelector('.auth-pane:not(.hidden)');
  const targets = activePane ? activePane.querySelectorAll('.auth-error-msg') : document.querySelectorAll('.auth-error-msg');
  targets.forEach((el) => {
    el.textContent = msg;
    el.style.display = 'block';
  });
}
function clearAuthError() {
  document.querySelectorAll('.auth-error-msg').forEach((el) => {
    el.textContent = '';
    el.style.display = 'none';
  });
}

function getRegisterErrorMessage(err) {
  const code = err?.code || '';
  const message = err?.message || '';
  if (code === 'auth/email-already-in-use' || message.includes('EMAIL_EXISTS')) {
    return '이미 가입된 이메일입니다. 로그인하거나 다른 이메일을 사용해주세요.';
  }
  if (code === 'auth/invalid-email' || message.includes('INVALID_EMAIL')) {
    return '이메일 주소 형식이 올바르지 않습니다.';
  }
  if (code === 'auth/weak-password' || message.includes('WEAK_PASSWORD')) {
    return '비밀번호는 6자 이상으로 입력해주세요.';
  }
  if (code === 'auth/operation-not-allowed' || message.includes('OPERATION_NOT_ALLOWED')) {
    return '이메일/비밀번호 회원가입이 비활성화되어 있습니다. Firebase Authentication 설정을 확인해주세요.';
  }
  if (code === 'auth/network-request-failed') {
    return '네트워크 연결이 불안정합니다. 잠시 후 다시 시도해주세요.';
  }
  return message || `회원가입에 실패했습니다. (${code || '알 수 없는 오류'})`;
}

function savePendingSignupProfile(profile) {
  try {
    localStorage.setItem('taekwonjob_pending_signup_profile', JSON.stringify({
      ...profile,
      email: String(profile.email || '').toLowerCase(),
      savedAt: Date.now()
    }));
  } catch (e) {
    console.warn('가입 복구 정보 저장 실패:', e);
  }
}

function loadPendingSignupProfile(email) {
  try {
    const raw = localStorage.getItem('taekwonjob_pending_signup_profile');
    if (!raw) return null;
    const profile = JSON.parse(raw);
    if (String(profile.email || '').toLowerCase() !== String(email || '').toLowerCase()) return null;
    if (Date.now() - Number(profile.savedAt || 0) > 24 * 60 * 60 * 1000) return null;
    return profile;
  } catch (e) {
    console.warn('가입 복구 정보 읽기 실패:', e);
    return null;
  }
}

function clearPendingSignupProfile() {
  try {
    localStorage.removeItem('taekwonjob_pending_signup_profile');
  } catch (e) {
    console.warn('가입 복구 정보 삭제 실패:', e);
  }
}

function normalizeAccountKey(value) {
  return String(value || '').trim().replace(/\s+/g, '').toLowerCase();
}

function maskEmail(email) {
  const [local, domain] = String(email || '').split('@');
  if (!local || !domain) return '';
  const visible = local.length <= 2 ? local[0] : local.slice(0, 2);
  return `${visible}${'*'.repeat(Math.max(3, local.length - visible.length))}@${domain}`;
}

function waitForPaint() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function getBusinessNumberDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function formatBusinessNumber(value) {
  const digits = getBusinessNumberDigits(value).slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

function getBusinessDateDigits(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 8);
}

function formatBusinessStartDate(value) {
  const digits = getBusinessDateDigits(value);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
}

async function checkBusinessStatus(businessNumber) {
  const response = await fetch(`${NTS_BUSINESS_STATUS_URL}?serviceKey=${NTS_BUSINESS_API_KEY}&returnType=JSON`, {
    method: 'POST',
    headers: {
      accept: '*/*',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ b_no: [businessNumber] })
  });

  if (!response.ok) {
    throw new Error(`사업자 상태확인 요청에 실패했습니다. (${response.status})`);
  }

  const result = await response.json();
  
  if (['REQUEST_DATA_MALFORMED', 'INTERNAL_ERROR', 'HTTP_ERROR'].includes(result.status_code)) {
    return {
      b_stt_cd: '01',
      b_stt: '확인중',
      tax_type: '확인중',
      isBypassed: true,
      originalError: result.status_code
    };
  }

  const business = result?.data?.[0];
  if (!business) {
    throw new Error('사업자 상태확인 결과를 받지 못했습니다.');
  }

  if (business.b_stt_cd !== '01') {
    const status = business.b_stt || business.tax_type || '정상 사업자가 아닙니다.';
    throw new Error(`${status}로 확인되었습니다.`);
  }

  return business;
}

async function verifyBusinessInfo({ businessNumber, startDate, ownerName, businessName }) {
  const response = await fetch(`${NTS_BUSINESS_VALIDATE_URL}?serviceKey=${NTS_BUSINESS_API_KEY}&returnType=JSON`, {
    method: 'POST',
    headers: {
      accept: '*/*',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      businesses: [
        {
          b_no: businessNumber,
          start_dt: startDate,
          p_nm: ownerName,
          p_nm2: '',
          b_nm: businessName || '',
          corp_no: '',
          b_sector: '',
          b_type: '',
          b_adr: ''
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`사업자등록정보 진위확인 요청에 실패했습니다. (${response.status})`);
  }

  const result = await response.json();
  
  if (['REQUEST_DATA_MALFORMED', 'INTERNAL_ERROR', 'HTTP_ERROR'].includes(result.status_code)) {
    return {
      valid: '01',
      valid_msg: '정상 사업자(API 지연 우회승인)',
      isBypassed: true,
      originalError: result.status_code
    };
  }

  const business = result?.data?.[0];
  if (!business) {
    throw new Error('사업자등록정보 진위확인 결과를 받지 못했습니다.');
  }

  if (business.valid !== '01') {
    throw new Error(business.valid_msg || '사업자등록정보가 일치하지 않습니다.');
  }

  return business;
}

  // Meta Pixel Initialization
  function initMetaPixel() {
    let pixelId = null;
    if (typeof META_PIXEL_ID !== 'undefined' && META_PIXEL_ID && META_PIXEL_ID !== 'YOUR_META_PIXEL_ID') {
      pixelId = META_PIXEL_ID;
    }

    if (pixelId) {
      !function(f,b,e,v,n,t,s)
      {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
      n.callMethod.apply(n,arguments):n.queue.push(arguments)};
      if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
      n.queue=[];t=b.createElement(e);t.async=!0;
      t.src=v;s=b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t,s)}(window, document,'script',
      'https://connect.facebook.net/en_US/fbevents.js');
      fbq('init', pixelId);
      fbq('track', 'PageView');
      console.log('Meta Pixel initialized with ID:', pixelId);
    } else {
      console.warn('Meta Pixel ID is not configured in firebase-config.js. Mock fbq is defined to prevent errors.');
      window.fbq = function() {
        console.log('[Mock Meta Pixel Event]', arguments);
      };
    }
  }

  // Track Homepage Daily Traffic
  function trackHomepageTraffic() {
    if (typeof db === 'undefined' || !db) return;
    
    // Generate/retrieve viewerId
    let viewerId = '';
    if (typeof auth !== 'undefined' && auth && auth.currentUser) {
      viewerId = auth.currentUser.uid;
    } else {
      viewerId = localStorage.getItem('taekwondo_client_id');
      if (!viewerId) {
        viewerId = 'client_' + Math.random().toString(36).substring(2, 15);
        localStorage.setItem('taekwondo_client_id', viewerId);
      }
    }

    // Get today's YYYY-MM-DD
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const todayStr = `${year}-${month}-${day}`;

    try {
      db.collection('traffic').doc(todayStr).set({
        pv: firebase.firestore.FieldValue.increment(1),
        visitors: firebase.firestore.FieldValue.arrayUnion(viewerId),
        date: todayStr
      }, { merge: true });
    } catch (err) {
      console.warn('Failed to track page view in Firestore:', err);
    }
  }

document.addEventListener('DOMContentLoaded', () => {
  initMetaPixel();
  trackHomepageTraffic();

  // ==========================================================================
  // 1. Mock Database
  // ==========================================================================
  
  const mockJobs = [
    {
      id: 'job-1',
      gymName: '강남 태권도장',
      title: '메인사범 모집 (우대: 겨루기 선수 출신)',
      region: '서울 강남구',
      address: '서울특별시 강남구 역삼동 742-10',
      salary: '월 320만원',
      type: '정규직',
      exp: '경력 3년↑',
      hotness: 'NEW',
      desc: '안녕하세요. 강남 태권도장입니다. \n\n체계적이고 열정적으로 아이들을 지도해주실 유능한 메인사범님을 모십니다. \n\n[주요업무]\n- 유치부 및 초등부 태권도 지도\n- 수련생 상담 및 관리\n- 도장 차량 동승 지도\n\n[우대사항]\n- 선수 출신 (겨루기/품새)\n- 인근 거주자 및 즉시 출근 가능자'
    },
    {
      id: 'job-2',
      gymName: '한빛 태권도장',
      title: '초보 가능! 보조사범님 모십니다 (시간협의)',
      region: '서울 송파구',
      address: '서울특별시 송파구 잠실동 312-5',
      salary: '월 280만원',
      type: '계약직',
      exp: '경력무관',
      hotness: 'HOT',
      desc: '잠실에 위치한 한빛 태권도장에서 사범님으로서 첫 걸음을 떼실 보조사범님을 모집합니다. \n\n초보자분들도 관장님이 친절히 지도법을 전수해 드립니다. 밝고 아이들을 사랑하는 분들의 많은 지원 바랍니다. \n\n[근무시간]\n- 월~금 13:00 ~ 19:00 (시간 조율 가능)\n\n[자격조건]\n- 품새 지도 가능자\n- 유단자 (태권도 3단 이상 우대)'
    },
    {
      id: 'job-3',
      gymName: '용인 태권도장',
      title: '용인대 동문 도장 메인사범 급구합니다',
      region: '경기 용인시',
      address: '경기도 용인시 처인구 역북동 445-12',
      salary: '월 300만원',
      type: '정규직',
      exp: '경력 2년↑',
      hotness: '',
      desc: '용인대 동문들이 모여 활기차게 운영 중인 용인 태권도장입니다. \n\n도장 확장으로 인해 열정을 다해 함께 커나갈 사범님 한 분을 충원합니다. 가족 같은 분위기에서 즐겁게 일하실 수 있습니다. \n\n[급여 및 혜택]\n- 4대 보험 적용 및 퇴직금 지급\n- 연차 및 보너스 지급\n- 기숙사 제공 협의 가능'
    },
    {
      id: 'job-4',
      gymName: '분당 태권도장',
      title: '유치부/초등부 파트타임 모집',
      region: '경기 성남시',
      address: '경기도 성남시 분당구 정자동 18-2',
      salary: '시급 15,000원',
      type: '파트타임',
      exp: '경력무관',
      position: '파트타임',
      hotness: 'NEW',
      desc: '오후 수업을 함께 도와주실 파트타임 선생님을 모집합니다. 아이들을 좋아하고 밝게 소통하실 수 있는 분이면 좋겠습니다.'
    },
  ];

  const mockTalents = [
    {
      id: 'talent-1',
      name: '김태권',
      gender: '남성',
      role: '메인사범',
      exp: '경력 5년',
      region: '서울 강남구',
      salary: '최저연봉 320만원',
      dan: '태권도 4단',
      license: '생활체육지도사',
      colorIndex: 0,
      intro: '안녕하십니까! 열정과 책임감으로 무장한 사범 김태권입니다. \n\n품새단 선수 출신으로 아이들에게 정확하고 정통성 있는 태권도를 재미있게 가르치는 노하우를 가지고 있습니다. \n\n수련생 관리 및 관장님과의 원활한 소통을 중요하게 생각하며, 도장의 원생 증대에 실질적으로 기여할 자신이 있습니다.'
    },
    {
      id: 'talent-2',
      name: '이수진',
      gender: '여성',
      role: '보조사범',
      exp: '경력 3년',
      region: '경기 성남시',
      salary: '최저연봉 280만원',
      dan: '태권도 3단',
      license: '유아체육지도사',
      colorIndex: 1,
      intro: '안녕하세요. 유아체육지도사 자격증을 보유한 사범 이수진입니다. \n\n눈높이 교육과 세심한 케어로 유치부 및 초등 저학년 학부모님들과 두터운 신뢰 관계를 맺어왔습니다. \n\n줄넘기 놀이체육 및 매트운동 프로그램 기획에 강점이 있습니다. 밝은 에너지로 체육관 분위기를 이끌어가겠습니다.'
    },
    {
      id: 'talent-3',
      name: '박민우',
      gender: '남성',
      role: '메인사범',
      exp: '경력 7년',
      region: '인천 연수구',
      salary: '최저연봉 350만원',
      dan: '태권도 4단',
      license: '생활체육지도사',
      colorIndex: 2,
      intro: '체육관 관리 및 차량 주행 베테랑 메인사범 박민우입니다. \n\n대형 운전면허 소지자로 셔틀 운행이 원활하며, 다양한 레크리에이션 프로그램을 운영해본 경험이 있습니다. \n\n아이들이 예의 바르고 바른 인성을 가진 사회적 인재로 자랄 수 있도록 인성교육에 힘쓰겠습니다.'
    },
    {
      id: 'talent-4',
      name: '최예지',
      gender: '여성',
      role: '보조사범',
      exp: '경력 2년',
      region: '서울 송파구',
      salary: '최저연봉 260만원',
      dan: '태권도 2단',
      license: '유아체육지도사',
      colorIndex: 3,
      intro: '다정함과 친근함으로 다가가는 예비 사범 최예지입니다. \n\n태권도의 기초 발차기 지도 및 스트레칭 지도를 잘 수행할 수 있습니다. \n\n성실함과 배려심으로 아이들을 케어하여 안전하고 행복한 수련 시간이 될 수 있도록 돕겠습니다.'
    },
    {
      id: 'talent-5',
      name: '정도현',
      gender: '남성',
      role: '메인사범',
      exp: '경력 4년',
      region: '경기 수원시',
      salary: '최저연봉 300만원',
      dan: '태권도 4단',
      license: '생활체육지도사',
      colorIndex: 4,
      intro: '겨루기 선수 출신의 패기 넘치는 사범 정도현입니다. \n\n시범단 기술(회전 발차기, 격파 등) 지도가 가능하여 고학년 및 중고등부 관원들을 활성화하는 데 장점이 있습니다. \n\n아이들과 땀 흘려 소통하는 진정성 있는 지도자가 되겠습니다.'
    },
    {
      id: 'talent-6',
      name: '한지민',
      gender: '여성',
      role: '파트타임',
      exp: '경력 1년',
      region: '서울 강동구',
      salary: '시급 협의',
      dan: '태권도 3단',
      license: '태권도사범자격증',
      colorIndex: 5,
      intro: '오후 시간대 파트타임 근무를 희망합니다. 유치부와 초등부 보조 지도 경험이 있으며 성실하게 함께하겠습니다.'
    }
  ];

  const mockPosts = [];

  const avatarGradients = [
    'linear-gradient(135deg, #2563eb, #1e3a8a)',
    'linear-gradient(135deg, #ec4899, #be185d)',
    'linear-gradient(135deg, #10b981, #065f46)',
    'linear-gradient(135deg, #8b5cf6, #5b21b6)',
    'linear-gradient(135deg, #f59e0b, #b45309)'
  ];


  // ==========================================================================
  // 2. DOM Elements & State
  // ==========================================================================
  
  // Load community posts from localStorage or fallback to empty
  let initialPosts = [];
  try {
    const savedPosts = localStorage.getItem('taekwondo_community_posts');
    if (savedPosts) {
      const parsed = JSON.parse(savedPosts);
      if (parsed && parsed.length > 0 && !parsed.some(p => p.id && String(p.id).startsWith('post-'))) {
        initialPosts = parsed;
      }
    }
  } catch (e) {
    console.warn('Failed to load community posts from localStorage', e);
  }


  // App state
  const state = {
    currentUser: null,
    authReady: false,
    dbLoaded: false,
    jobsList: typeof db === 'undefined' || !db ? [...mockJobs] : [],
    talentsList: typeof db === 'undefined' || !db ? [...mockTalents] : [],
    applicationsList: [],
    communityPosts: initialPosts,
    filters: {
      jobs: { region: '', position: '', type: '' },
      talents: { regions: [], position: '' }
    },
    regions: [],
    selectedResumeRegions: [],
    selectedJobRegions: [],
    regionPickers: {},
    editingJobId: null,
    editingResumeId: null,
    communityPageSize: 25,
    communityCurrentPage: 1
  };

  // Migrate older community post categories to 'free' and seed 'contest' data if missing
  state.communityPosts.forEach(post => {
    if (post.category === 'recruit' || post.category === 'archive') {
      post.category = 'free';
    }
  });

  const hasContest = state.communityPosts.some(post => post.category === 'contest');
  if (!hasContest) {
    state.communityPosts.push(
      {
        id: 'post-11',
        category: 'contest',
        title: '2026 하반기 전국 시도대항 태권도대회 접수 개시',
        author: '대회연맹',
        date: '2026.06.15',
        views: 142,
        content: '2026년도 하반기 전국 시도대항 태권도대회 참가 신청이 시작되었습니다. 품새 및 겨루기 부문 접수 요강 파일을 다운로드하여 기일 내에 신청 바랍니다.',
        comments: []
      },
      {
        id: 'post-12',
        category: 'contest',
        title: '제15회 도지사기 태권도 품새대회 개최 알림',
        author: '품새협회',
        date: '2026.06.12',
        views: 98,
        content: '지방 체육의 활성화와 꿈나무 육성을 위한 제15회 도지사기 태권도 품새대회 일정을 공지하오니 각 도장 선수단의 많은 참가를 부탁드립니다.',
        comments: []
      }
    );
    try {
      localStorage.setItem('taekwondo_community_posts', JSON.stringify(state.communityPosts));
    } catch(e) {}
  }

  // Views
  const views = {
    home: document.getElementById('view-home'),
    jobs: document.getElementById('view-jobs'),
    myApplications: document.getElementById('view-my-applications'),
    talents: document.getElementById('view-talents'),
    community: document.getElementById('view-community'),
    customerService: document.getElementById('view-customer-service'),
    privacyPolicy: document.getElementById('view-privacy-policy'),
    termsOfUse: document.getElementById('view-terms-of-use'),
    userGuide: document.getElementById('view-user-guide'),
    about: document.getElementById('view-about')
  };

  // Nav menu links
  const navLinks = {
    jobs: document.getElementById('menu-jobs'),
    talents: document.getElementById('menu-talents'),
    community: document.getElementById('menu-community'),
    customerService: document.getElementById('menu-customer-service')
  };

  // Mobile bottom nav links
  const mobileNavLinks = {
    home: document.getElementById('m-menu-home'),
    jobs: document.getElementById('m-menu-jobs'),
    talents: document.getElementById('m-menu-talents'),
    community: document.getElementById('m-menu-community'),
    customerService: document.getElementById('m-menu-customer-service')
  };

  // Modals
  const dialogs = {
    auth: document.getElementById('dialog-auth'),
    postJob: document.getElementById('dialog-post-job'),
    postResume: document.getElementById('dialog-post-resume'),
    jobDetail: document.getElementById('dialog-job-detail'),
    talentDetail: document.getElementById('dialog-talent-detail'),
    postCommunity: document.getElementById('dialog-post-community'),
    communityDetail: document.getElementById('dialog-community-detail')
  };

  const roleFloatingCTA = document.getElementById('role-floating-container');

  async function initJobsAndTalents() {
    if (!db) return;

    // 1. 회원 정보(이름, 이메일 조인용) 사전 로드
    let dbUsers = [];
    try {
      const userSnap = await db.collection('users').get();
      userSnap.forEach(doc => {
        dbUsers.push({ id: doc.id, ...doc.data() });
      });
    } catch (e) {
      console.warn('Firestore users 컬렉션 로드 에러:', e);
    }
    
    // 2. 채용공고 데이터 로드
    try {
      const jobSnap = await db.collection('jobs').orderBy('created_at', 'desc').get();
      const dbJobs = [];
      jobSnap.forEach((doc) => {
        const j = doc.data();

        // 작성자(관장님) 정보 조인
        const creator = dbUsers.find(u => u.id === j.user_id);
        const userName = creator ? creator.name : (j.gymName || '관장님');
        const userEmail = creator ? creator.email : '이메일 정보 없음';

        // 30일(30일 = 30 * 24 * 60 * 60 * 1000 ms) 이내에 등록된 공고에만 NEW 뱃지 노출
        let isNew = false;
        if (j.created_at) {
          const createdAtMs = (j.created_at.toMillis) ? j.created_at.toMillis() : new Date(j.created_at).getTime();
          const diffMs = Date.now() - createdAtMs;
          if (diffMs <= 30 * 24 * 60 * 60 * 1000) {
            isNew = true;
          }
        }

        dbJobs.push({
          id: doc.id,
          gymName: j.gymName || '도장',
          title: j.title || '채용공고',
          region: j.location || '전국',
          address: j.address || (j.location ? `${j.location} 일대 태권도장` : '전국 일대 태권도장'),
          preferred: j.preferred || '-',
          salary: j.salary || '월 300만원',
          type: j.type || '정규직',
          exp: j.career || '경력무관',
          position: j.position || '',
          hotness: (j.status === 'active' && isNew) ? 'NEW' : '',
          desc: j.content || '',
          pinned: j.pinned || false,
          views: j.views || 0,
          viewedUsers: j.viewed_users || [],
          userId: j.user_id || '',
          userName: userName,
          userEmail: userEmail,
          regDate: j.created_at ? (j.created_at.toDate ? j.created_at.toDate().toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' }) : new Date(j.created_at).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })) : ''
        });
      });
      if (dbJobs.length > 0) {
        dbJobs.sort((a, b) => {
          const aPinned = a.pinned ? 1 : 0;
          const bPinned = b.pinned ? 1 : 0;
          return bPinned - aPinned;
        });
        state.jobsList = [...dbJobs];
      }
    } catch (e) {
      console.error('Firestore 채용공고 데이터 로드 에러:', e);
    }

    // 2. 이력서 데이터 로드
    try {
      const resumeSnap = await db.collection('resumes').orderBy('created_at', 'desc').get();
      const dbTalents = [];
      resumeSnap.forEach((doc) => {
        const r = doc.data();
        dbTalents.push({
          id: doc.id,
          name: r.name || '사범',
          gender: r.gender || '남성',
          role: r.hope_position || r.position || '메인사범',
          exp: r.career || '경력무관',
          region: r.hope_area || '전국',
          salary: r.hope_salary || '월 280만원',
          dan: r.certificate ? r.certificate.split(',')[0].trim() : '태권도 3단',
          license: r.certificate ? r.certificate.split(',').slice(1).join(',').trim() : '태권도 지도자',
          colorIndex: Math.floor(Math.random() * 5),
          intro: r.content || '',
          phone: r.phone || '',
          userId: r.user_id || '',
          date: r.created_at ? (r.created_at.toDate ? r.created_at.toDate().toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' }) : new Date(r.created_at).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })) : ''
        });
      });
      if (dbTalents.length > 0) {
        state.talentsList = [...dbTalents];
      }
    } catch (e) {
      console.warn('Firestore 이력서 데이터 로드 생략 또는 에러:', e);
    }

    // 3. 지원 데이터 로드
    try {
      const applySnap = await db.collection('apply').orderBy('created_at', 'desc').get();
      const dbApplications = [];
      applySnap.forEach((doc) => {
        const a = doc.data();
        const job = state.jobsList.find((item) => item.id === a.job_id);
        const liveResume = state.talentsList.find((item) => item.id === a.resume_id);
        const resumeSnapshot = normalizeResumeSnapshot(a.resume_snapshot);
        const resume = resumeSnapshot || liveResume;
        dbApplications.push({
          id: doc.id,
          jobId: a.job_id || '',
          resumeId: a.resume_id || '',
          jobOwnerId: a.job_owner_id || job?.userId || '',
          applicantId: a.applicant_id || resume?.userId || liveResume?.userId || '',
          status: a.status || 'pending',
          createdAt: a.created_at || null,
          job,
          resumeSnapshot,
          resume
        });
      });
      state.applicationsList = dbApplications;
    } catch (e) {
      console.warn('Firestore 지원 데이터 로드 생략 또는 에러:', e);
      state.applicationsList = [];
    }

    // 4. 자유게시판 데이터 로드
    try {
      const commSnap = await db.collection('community').orderBy('created_at', 'desc').get();
      const dbPosts = [];
      commSnap.forEach((doc) => {
        const p = doc.data();
        dbPosts.push({
          id: doc.id,
          category: p.category || 'knowhow',
          title: p.title || '',
          author: p.author || '익명',
          author_id: p.author_id || '',
          date: p.date || (p.created_at ? (p.created_at.toDate ? p.created_at.toDate().toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\s/g, '').slice(0, -1) : '') : ''),
          views: p.views || 0,
          viewed_users: p.viewed_users || [],
          content: p.content || '',
          imageUrl: p.imageUrl || '',
          comments: p.comments || [],
          isPinned: p.isPinned || false
        });
      });
      if (dbPosts.length > 0) {
        state.communityPosts = dbPosts;
        try {
          localStorage.setItem('taekwondo_community_posts', JSON.stringify(dbPosts));
        } catch (e) {}
      } else {
        // DB에 자유게시판 글이 하나도 없는 경우 초기 Mock 데이터를 DB에 등록합니다.
        const seedData = [
          {
            category: 'free',
            title: '강남 지역 사범님 구인 현황 어떤가요?',
            author: '대호관장',
            date: '2026.06.07',
            views: 124,
            content: '요즘 강남 쪽에서 메인사범님 구하기가 하늘의 별 따기네요. 조건은 월 330에 주 5일, 식사 제공인데도 문의전화 한 통 받기가 어렵습니다. 다른 지역 관장님들은 구인 어떠신가요? 혹시 채용공고 올릴 때 특별히 어필하면 좋은 팁이 있을까요?',
            comments: [
              { author: '의리사범', content: '요즘 젊은 사범들은 급여도 중요하지만 퇴근 시간 준수를 더 중요하게 보는 것 같습니다.', date: '2026.06.07' },
              { author: '강남태권', content: '강남은 주거비가 비싸서 타지에서 오는 사범님들을 위해 숙소를 지원해 주면 연락이 좀 오는 편입니다.', date: '2026.06.08' }
            ]
          },
          {
            category: 'knowhow',
            title: '초보 사범 면접 시 질문 팁 공유드립니다.',
            author: '정통관장',
            date: '2026.06.06',
            views: 245,
            content: '신입 사범님 면접 보실 때 단수나 시범 기술도 중요하지만, 무엇보다 아이들을 대하는 태도와 인성을 보셔야 합니다. 저 같은 경우는 "가장 통제하기 힘든 관원이 있을 때 어떻게 대처할 것인가?" 라는 상황 질문을 던집니다. 꼬리 질문을 던지면 평소 생각이나 태도가 잘 드러납니다.',
            comments: [
              { author: '열혈관장', content: '공감합니다. 기술은 도장 와서 배울 수 있지만 아이들을 사랑하는 마음은 가르칠 수 없으니까요.', date: '2026.06.06' }
            ]
          },
          {
            category: 'knowhow',
            title: '원생 150명 돌파한 방학 특강 프로그램 기획서',
            author: '스마트태권',
            date: '2026.06.05',
            views: 412,
            content: '올해 겨울방학 특강으로 성공했던 음악 줄넘기와 쌍절곤 연계 특강 기획안을 공유합니다. 학부모님들은 방학 동안 아이들의 기초 체력 증진과 흥미 유발을 원합니다. 특강 마지막 주에 부모님들을 초청하여 작은 발표회를 가진 것이 원생 재등록률을 95% 이상 끌어올린 핵심 비결이었습니다.',
            comments: [
              { author: '새싹관장', content: '특강 발표회 기획서 정보 감사합니다! 이번 여름방학 때 꼭 벤치마킹해서 시도해보고 싶네요.', date: '2026.06.05' }
            ]
          },
          {
            category: 'knowhow',
            title: '학부모 소통 앱(클래스업) 연동 팁 공유',
            author: '혁신관장',
            date: '2026.06.03',
            views: 301,
            content: '수련 모습을 매일 사진과 짧은 영상으로 학부모 앱에 공유하고 있습니다. 처음에는 일이 많아서 힘들었지만 사범님들과 요일을 나누어 분담하니 정착되었습니다. 부모님들의 신뢰도가 크게 올라가고 추천 입관률이 눈에 띄게 증가했습니다. 소통 앱을 적극 활용해 보세요.',
            comments: [
              { author: '소통사범', content: '사범 입장에서도 학부모 피드백이 실시간으로 오니 보람을 더 느끼는 것 같습니다.', date: '2026.06.04' }
            ]
          },
          {
            category: 'news',
            title: '세계태권도연맹, 새로운 룰 도입 발표',
            author: '태권뉴스',
            date: '2026.06.02',
            views: 520,
            content: '세계태권도연맹(WT)이 경기력 향상과 관중 친화적인 시합을 위해 회전 발차기 점수 배점과 감점 요소를 보완한 새로운 경기 규정을 발표했습니다. 이번 규정은 하반기 국제 대회부터 공식 적용될 예정이며, 일선 도장의 겨루기 선수반 지도 방식에도 변화가 필요해 보입니다.',
            comments: []
          },
          {
            category: 'news',
            title: '제50회 전국태권도대회 일정 확정 안내',
            author: '협회소식',
            date: '2026.06.01',
            views: 388,
            content: '대한태권도협회가 주최하는 제50회 전국태권도대회의 개최 일정이 오는 9월 15일부터 5일간으로 확정되었습니다. 신청 접수는 8월 1일부터 개시되며 전국 선수 및 동호인들의 많은 참여 바랍니다.',
            comments: []
          },
          {
            category: 'free',
            title: '오늘 수련시간에 너무 감동적인 일이 있었습니다.',
            author: '해피사범',
            date: '2026.06.08',
            views: 89,
            content: '평소에 장난기가 심해서 지도가 어려웠던 8살 수련생이 오늘 수련이 끝나고 수줍게 사탕 하나를 주면서 "사범님 늘 재밌게 가르쳐 주셔서 감사해요" 하고 뛰어가네요. 이 맛에 힘들어도 사범 생활을 계속하게 되는 것 같습니다. 마음이 참 따뜻해집니다.',
            comments: [
              { author: '동감관장', content: '그 사탕 하나가 사범님껜 보약이네요. 힘내세요!', date: '2026.06.08' }
            ]
          },
          {
            category: 'free',
            title: '주말 당직 서시는 사범님들 힘내세요!',
            author: '의리사범',
            date: '2026.06.07',
            views: 110,
            content: '주말에도 특강차량 운행이나 야외 체험 학습 때문에 당직 서시는 사범님들 많으실 텐데 힘냅시다! 날씨가 더우니 건강 챙기시면서 수고하십시오. 화이팅입니다!',
            comments: [
              { author: '겨루기왕', content: '사범님도 힘내세요! 주말 보강 수업 가는 길인데 힘이 나네요.', date: '2026.06.07' }
            ]
          },
          {
            category: 'free',
            title: '[자료] 신입 관원 입학원서 양식 (한글파일)',
            author: '태권도잡',
            date: '2026.06.05',
            views: 615,
            content: '일선 도장에서 편리하게 수정하여 사용할 수 있는 신입 관원 입학원서 한글(HWP) 서식입니다. 기본적인 동의서(개인정보 제공 및 초상권 등) 문항도 깔끔하게 정돈되어 있습니다. 도장 상황에 맞추어 상호와 로고를 넣어 유용하게 사용하시기 바랍니다.',
            comments: [
              { author: '초보관장', content: '마침 새로 만들려고 했는데 소중한 자료 공유 너무 감사합니다!', date: '2026.06.06' }
            ]
          },
          {
            category: 'free',
            title: '[자료] 줄넘기 급수표 및 심사 서식 공유',
            author: '체육자료',
            date: '2026.05.28',
            views: 803,
            content: '급수별 줄넘기 미션과 평가 기준이 담긴 심사 서식 파일입니다. 기초 줄넘기부터 이중 뛰기까지 단계별로 체계적으로 구성되어 있어 학부모님께 심사 결과 전달용으로 쓰시기 좋습니다.',
            comments: []
          },
          {
            category: 'contest',
            title: '2026 하반기 전국 시도대항 태권도대회 접수 개시',
            author: '대회연맹',
            date: '2026.06.15',
            views: 142,
            content: '2026년도 하반기 전국 시도대항 태권도대회 참가 신청이 시작되었습니다. 품새 및 겨루기 부문 접수 요강 파일을 다운로드하여 기일 내에 신청 바랍니다.',
            comments: []
          },
          {
            category: 'contest',
            title: '제15회 도지사기 태권도 품새대회 개최 알림',
            author: '품새협회',
            date: '2026.06.12',
            views: 98,
            content: '지방 체육의 활성화와 꿈나무 육성을 위한 제15회 도지사기 태권도 품새대회 일정을 공지하오니 각 도장 선수단의 많은 참가를 부탁드립니다.',
            comments: []
          }
        ];

        try {
          const promises = seedData.map((post, idx) => {
            const customTime = new Date(Date.now() - (idx * 60000));
            return db.collection('community').add({
              ...post,
              created_at: firebase.firestore.Timestamp.fromDate(customTime)
            }).then(docRef => ({
              id: docRef.id,
              ...post
            }));
          });
          const seededPosts = await Promise.all(promises);
          state.communityPosts = seededPosts;
          try {
            localStorage.setItem('taekwondo_community_posts', JSON.stringify(seededPosts));
          } catch (e) {}
        } catch (seedErr) {
          console.warn('자유게시판 초기 시딩 에러:', seedErr);
        }
      }
    } catch (e) {
      console.warn('Firestore 커뮤니티 데이터 로드 생략 또는 에러:', e);
    }

    state.dbLoaded = true;
  }

  function populateRegionSelects(regions) {
    if (!window.RegionSync) return;
    const select = document.getElementById('job-region');
    if (select && select.tagName === 'SELECT') {
      RegionSync.populateSelect(select, regions, '지역을 선택하세요');
    }
  }

  function regionMatchesValue(item, value) {
    return item.displayName === value || item.fullName === value || value.includes(item.displayName) || value.includes(item.fullName);
  }

  function createSidoRegion(sido) {
    return {
      sidoShort: sido,
      sigungu: '전체',
      displayName: sido,
      fullName: sido,
      regionCode: `sido-${sido}`
    };
  }

  function splitRegionValues(value) {
    return String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
  }

  function matchesSelectedRegion(targetRegion, selectedRegion) {
    if (!selectedRegion || selectedRegion === '전국') return true;
    return targetRegion === selectedRegion || targetRegion.includes(selectedRegion) || selectedRegion.includes(targetRegion);
  }

  function createDistrictPicker({ rootId, inputId, mode = 'single', onChange, tagsContainerId }) {
    const root = document.getElementById(rootId);
    const input = document.getElementById(inputId);
    if (!root || !input || !window.RegionSync) return null;

    const grouped = RegionSync.groupBySido(state.regions);
    const sidoOrder = ['서울', '경기', '인천', '부산', '대구', '광주', '대전', '울산', '세종', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'];
    const sidos = sidoOrder.filter((sido) => grouped[sido]?.length);
    let activeSido = sidos[0] || '';
    let selected = [];

    root.innerHTML = `
      <div class="district-trigger">
        <div class="district-trigger-selected-display">
          <span class="district-placeholder">지역 전체</span>
        </div>
        <button type="button" class="district-trigger-btn">선택하기</button>
      </div>
      <div class="district-panel">
        <div class="district-panel-body">
          <div class="district-sido-list"></div>
          <div class="district-list"></div>
        </div>
        <div class="district-selected-list"></div>
        <div class="district-panel-footer">
          <button type="button" class="district-reset-btn">초기화</button>
          <button type="button" class="district-apply-btn">적용하기</button>
        </div>
      </div>
    `;
    const trigger = root.querySelector('.district-trigger');
    const triggerDisplay = root.querySelector('.district-trigger-selected-display');
    const triggerBtn = root.querySelector('.district-trigger-btn');
    const sidoList = root.querySelector('.district-sido-list');
    const districtList = root.querySelector('.district-list');
    const selectedList = root.querySelector('.district-selected-list');
    const resetBtn = root.querySelector('.district-reset-btn');
    const applyBtn = root.querySelector('.district-apply-btn');
    const isFilterPicker = root.classList.contains('filter');

    function renderTriggerSelected() {
      if (!triggerDisplay) return;
      triggerDisplay.innerHTML = '';
      if (!selected.length) {
        triggerDisplay.innerHTML = `<span class="district-placeholder">${isFilterPicker ? '지역' : '지역 전체'}</span>`;
        return;
      }

      if (tagsContainerId) {
        // If external tags container is specified, render a clean summary label inside the trigger slot
        const summary = selected.length === 1 
          ? selected[0].displayName 
          : `${selected[0].displayName} 외 ${selected.length - 1}곳`;
        triggerDisplay.innerHTML = `<span class="district-trigger-summary-label" style="font-weight:700;color:var(--text-main);">${summary}</span>`;
        return;
      }

      // Group selected regions by Sido (inline tags)
      const groups = {};
      selected.forEach((region) => {
        if (!groups[region.sidoShort]) {
          groups[region.sidoShort] = [];
        }
        groups[region.sidoShort].push(region);
      });

      Object.entries(groups).forEach(([sido, regions]) => {
        const groupDiv = document.createElement('div');
        groupDiv.className = 'district-selected-group';

        // Sido Tag
        const sidoTag = document.createElement('span');
        sidoTag.className = 'district-sido-tag';
        sidoTag.innerHTML = `${sido} <button type="button" class="district-delete-sido-btn" aria-label="${sido} 전체 삭제">×</button>`;
        sidoTag.querySelector('button').addEventListener('click', (e) => {
          e.stopPropagation();
          selected = selected.filter((item) => item.sidoShort !== sido);
          renderDistricts();
          renderSelected();
          renderTriggerSelected();
          syncValue();
        });
        groupDiv.appendChild(sidoTag);

        // Chevron divider
        const divider = document.createElement('span');
        divider.className = 'district-divider-chevron';
        divider.textContent = '>';
        groupDiv.appendChild(divider);

        // Sigungu Tags
        regions.forEach((region) => {
          const sigunguTag = document.createElement('span');
          sigunguTag.className = 'district-sigungu-tag';
          sigunguTag.innerHTML = `${region.sigungu} <button type="button" class="district-delete-sigungu-btn" aria-label="${region.displayName} 삭제">×</button>`;
          sigunguTag.querySelector('button').addEventListener('click', (e) => {
            e.stopPropagation();
            selected = selected.filter((item) => item.regionCode !== region.regionCode);
            renderDistricts();
            renderSelected();
            renderTriggerSelected();
            syncValue();
          });
          groupDiv.appendChild(sigunguTag);
        });

        triggerDisplay.appendChild(groupDiv);
      });
    }

    function renderExternalTags() {
      if (!tagsContainerId) return;
      const extContainer = document.getElementById(tagsContainerId);
      if (!extContainer) return;
      extContainer.innerHTML = '';
      if (!selected.length) {
        extContainer.style.display = 'none';
        return;
      }
      extContainer.style.display = 'flex';

      // Group selected regions by Sido
      const groups = {};
      selected.forEach((region) => {
        if (!groups[region.sidoShort]) {
          groups[region.sidoShort] = [];
        }
        groups[region.sidoShort].push(region);
      });

      Object.entries(groups).forEach(([sido, regions]) => {
        const groupDiv = document.createElement('div');
        groupDiv.className = 'district-selected-group';

        // Sido Tag
        const sidoTag = document.createElement('span');
        sidoTag.className = 'district-sido-tag';
        sidoTag.innerHTML = `${sido} <button type="button" class="district-delete-sido-btn" aria-label="${sido} 전체 삭제">×</button>`;
        sidoTag.querySelector('button').addEventListener('click', (e) => {
          e.stopPropagation();
          selected = selected.filter((item) => item.sidoShort !== sido);
          renderDistricts();
          renderSelected();
          renderTriggerSelected();
          renderExternalTags();
          syncValue();
        });
        groupDiv.appendChild(sidoTag);

        // Chevron divider
        const divider = document.createElement('span');
        divider.className = 'district-divider-chevron';
        divider.textContent = '>';
        groupDiv.appendChild(divider);

        // Sigungu Tags
        regions.forEach((region) => {
          const sigunguTag = document.createElement('span');
          sigunguTag.className = 'district-sigungu-tag';
          sigunguTag.innerHTML = `${region.sigungu} <button type="button" class="district-delete-sigungu-btn" aria-label="${region.displayName} 삭제">×</button>`;
          sigunguTag.querySelector('button').addEventListener('click', (e) => {
            e.stopPropagation();
            selected = selected.filter((item) => item.regionCode !== region.regionCode);
            renderDistricts();
            renderSelected();
            renderTriggerSelected();
            renderExternalTags();
            syncValue();
          });
          groupDiv.appendChild(sigunguTag);
        });

        extContainer.appendChild(groupDiv);
      });
    }

    function syncValue() {
      input.value = selected.map((region) => region.displayName).join(', ');
      renderTriggerSelected();
      if (tagsContainerId) {
        renderExternalTags();
      }
      if (onChange) onChange(selected);
    }

    function togglePanel(force) {
      const isOpen = typeof force === 'boolean' ? force : !root.classList.contains('open');
      root.classList.toggle('open', isOpen);
      triggerBtn.setAttribute('aria-expanded', String(isOpen));
    }

    function renderSelected() {
      selectedList.innerHTML = '';
      if (!selected.length) return;
      selected.forEach((region) => {
        const chip = document.createElement('span');
        chip.className = 'district-selected-chip';
        chip.innerHTML = `<span>${region.displayName}</span><button type="button" aria-label="${region.displayName} 삭제">×</button>`;
        chip.querySelector('button').addEventListener('click', () => {
          selected = selected.filter((item) => item.regionCode !== region.regionCode);
          renderDistricts();
          renderSelected();
          syncValue();
        });
        selectedList.appendChild(chip);
      });
    }

    function renderDistricts() {
      const districts = [...(grouped[activeSido] || [])].sort((a, b) => String(a.regionCode).localeCompare(String(b.regionCode)));
      districtList.innerHTML = '';
      if (!districts.length) {
        districtList.innerHTML = '<p class="district-empty">지역 데이터 갱신 후 시/군/구가 표시됩니다.</p>';
        return;
      }
      const allBtn = document.createElement('button');
      allBtn.type = 'button';
      allBtn.className = 'district-item-btn all';
      allBtn.textContent = '전체';
      if (selected.some((item) => item.regionCode === `sido-${activeSido}`)) allBtn.classList.add('active');
      allBtn.addEventListener('click', () => {
        const sidoRegion = createSidoRegion(activeSido);
        if (mode === 'single') {
          selected = [sidoRegion];
        } else if (selected.some((item) => item.regionCode === sidoRegion.regionCode)) {
          selected = selected.filter((item) => item.regionCode !== sidoRegion.regionCode);
        } else {
          const candidateSelected = selected.filter((item) => item.sidoShort !== activeSido);
          if (candidateSelected.length >= 5) {
            alert('지역은 최대 5개까지만 선택할 수 있습니다.');
            return;
          }
          selected = candidateSelected;
          selected.push(sidoRegion);
        }
        renderDistricts();
        renderSelected();
        syncValue();
      });
      districtList.appendChild(allBtn);
      districts.forEach((region) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'district-item-btn';
        btn.textContent = region.sigungu;
        if (selected.some((item) => item.regionCode === region.regionCode)) btn.classList.add('active');
        btn.addEventListener('click', () => {
          if (mode === 'single') {
            selected = [region];
          } else if (selected.some((item) => item.regionCode === region.regionCode)) {
            selected = selected.filter((item) => item.regionCode !== region.regionCode);
          } else {
            const candidateSelected = selected.filter((item) => item.regionCode !== `sido-${region.sidoShort}`);
            if (candidateSelected.length >= 5) {
              alert('지역은 최대 5개까지만 선택할 수 있습니다.');
              return;
            }
            selected = candidateSelected;
            selected.push(region);
          }
          renderDistricts();
          renderSelected();
          syncValue();
        });
        districtList.appendChild(btn);
      });
    }

    function renderSidos() {
      sidoList.innerHTML = '';
      const allBtn = document.createElement('button');
      allBtn.type = 'button';
      allBtn.className = 'district-sido-btn';
      allBtn.textContent = '시/도 전체';
      if (!selected.length) allBtn.classList.add('active');
      allBtn.addEventListener('click', () => {
        clear();
      });
      sidoList.appendChild(allBtn);

      sidos.forEach((sido) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'district-sido-btn';
        btn.textContent = sido;
        if (sido === activeSido) btn.classList.add('active');
        btn.addEventListener('click', () => {
          activeSido = sido;
          renderSidos();
          renderDistricts();
        });
        sidoList.appendChild(btn);
      });
    }

    function clear() {
      selected = [];
      syncValue();
      renderDistricts();
      renderSelected();
    }

    function setByValue(value) {
      const values = String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
      selected = values.flatMap((item) => {
        if (sidos.includes(item)) return [createSidoRegion(item)];
        return state.regions.filter((region) => regionMatchesValue(region, item));
      });
      if (selected.length > 5) {
        selected = selected.slice(0, 5);
      }
      if (selected[0]) activeSido = selected[0].sidoShort;
      renderSidos();
      renderDistricts();
      renderSelected();
      syncValue();
    }

    triggerDisplay.addEventListener('click', () => togglePanel());
    triggerBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      togglePanel();
    });
    root.addEventListener('click', (event) => event.stopPropagation());
    applyBtn.addEventListener('click', () => togglePanel(false));
    resetBtn.addEventListener('click', () => clear());
    document.addEventListener('click', (event) => {
      if (!root.contains(event.target)) togglePanel(false);
    });

    renderSidos();
    renderDistricts();
    renderSelected();
    syncValue();

    return {
      clear,
      setByValue,
      getValues: () => selected.map((region) => region.displayName),
      getRegions: () => [...selected]
    };
  }

  function initRegionPickers() {
    state.regionPickers.home = createDistrictPicker({
      rootId: 'home-region-picker',
      inputId: 'search-region',
      mode: 'multi',
      tagsContainerId: 'home-selected-regions-tags'
    });
    state.regionPickers.jobFilter = createDistrictPicker({
      rootId: 'job-filter-region-picker',
      inputId: 'filter-job-region',
      mode: 'multi',
      tagsContainerId: 'job-filter-selected-regions-tags'
    });
    state.regionPickers.talentFilter = createDistrictPicker({
      rootId: 'talent-filter-region-picker',
      inputId: 'filter-talent-region',
      mode: 'multi',
      tagsContainerId: 'talent-filter-selected-regions-tags'
    });
    state.regionPickers.resume = createDistrictPicker({
      rootId: 'resume-region-picker',
      inputId: 'res-region',
      mode: 'multi',
      tagsContainerId: 'resume-selected-regions-tags',
      onChange: (selected) => {
        state.selectedResumeRegions = selected.map((region) => region.displayName);
      }
    });
    state.regionPickers.job = createDistrictPicker({
      rootId: 'job-region-picker',
      inputId: 'job-region',
      mode: 'multi',
      tagsContainerId: 'job-selected-regions-tags',
      onChange: (selected) => {
        state.selectedJobRegions = selected.map((region) => region.displayName);
      }
    });
  }

  async function initRegions() {
    if (!window.RegionSync) return;
    state.regions = await RegionSync.loadRegions();
    populateRegionSelects(state.regions);
    initRegionPickers();
  }


  // ==========================================================================
  // 3. Routing (SPA Navigation)
  // ==========================================================================
  
  function navigateToView(viewId) {
    // Hide all views
    Object.values(views).forEach(view => {
      if (view) view.classList.add('hidden');
    });

    // Remove active state from desktop nav links
    Object.values(navLinks).forEach(link => {
      if (link) link.classList.remove('active');
    });

    // Remove active state from mobile bottom nav links dynamically
    document.querySelectorAll('#mobile-bottom-nav-list a').forEach(link => {
      link.classList.remove('active');
    });

    // Show selected view
    const activeView = views[viewId];
    if (activeView) {
      activeView.classList.remove('hidden');
    }

    // Set active class on desktop nav link
    const activeLink = navLinks[viewId];
    if (activeLink) {
      activeLink.classList.add('active');
    }

    // Set active class on mobile bottom nav link dynamically
    let targetHref = '';
    if (viewId === 'home') targetHref = '#home';
    else if (viewId === 'jobs') targetHref = '#jobs';
    else if (viewId === 'talents') targetHref = '#talents';
    else if (viewId === 'community') targetHref = '#community';
    else if (viewId === 'myApplications') targetHref = '#my-applications';
    else if (viewId === 'customerService') targetHref = '/Customer_Service';

    if (targetHref) {
      const activeMobileLink = document.querySelector(`#mobile-bottom-nav-list a[href="${targetHref}"]`);
      if (activeMobileLink) {
        activeMobileLink.classList.add('active');
      }
    }

    if (viewId === 'termsOfUse') {
      const activeTab = document.querySelector('.terms-tab-btn.active');
      const termsType = activeTab ? activeTab.dataset.termsType : 'gym';
      loadTermsForPage(termsType);
    }
    if (viewId === 'privacyPolicy') {
      loadPrivacyPolicyForPage();
    }
    updateRoleFloatingCTA(viewId);

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  // ─── 약관 상세 페이지 (/Terms_of_Use) 내의 탭 전환 및 파일 동적 로드 로직 ──────────────────────
  const termsPageViewerContent = document.getElementById('terms-page-viewer-content');
  const termsLoadingBox = document.getElementById('terms-loading');
  const termsTabButtons = document.querySelectorAll('.terms-tab-btn');

  function parseTermsText(rawText, termsTitle, termsDate) {
    const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length === 0) return { title: termsTitle, date: termsDate, articles: [] };

    let title = termsTitle || lines[0] || '';
    let date = termsDate || '2026년 07월 04일';
    
    if (lines[0] && (lines[0].includes('약관') || lines[0].includes('방침'))) {
      title = lines[0];
    }
    if (lines[1] && (lines[1].includes('시행일') || lines[1].includes('시행'))) {
      date = lines[1].replace('시행일: ', '').replace('시행일:', '').trim();
    }

    const articles = [];
    let currentArticle = null;
    let introLines = [];
    let isBodyStarted = false;

    const startIdx = (lines[0] && (lines[0].includes('약관') || lines[0].includes('방침')) && lines[1] && (lines[1].includes('시행일') || lines[1].includes('시행'))) ? 2 : 0;

    for (let i = startIdx; i < lines.length; i++) {
      const line = lines[i];
      const articleMatch = line.match(/^(제\d+조)\s*(.+)$/);

      if (articleMatch) {
        isBodyStarted = true;
        if (currentArticle) articles.push(currentArticle);
        currentArticle = {
          num: articleMatch[1],
          title: articleMatch[2],
          intro: '',
          items: [],
        };
      } else if (!isBodyStarted) {
        introLines.push(line);
      } else if (currentArticle) {
        const itemMatch = line.match(/^([①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮]|\d+\.|[가-힣]\.)(.+)?$/);
        if (itemMatch) {
          currentArticle.items.push({ num: itemMatch[1], text: (itemMatch[2] || '').trim() });
        } else if (currentArticle.items.length === 0 && !currentArticle.intro) {
          currentArticle.intro = line;
        } else {
          if (currentArticle.items.length > 0) {
            const last = currentArticle.items[currentArticle.items.length - 1];
            last.text = last.text ? last.text + ' ' + line : line;
          } else {
            currentArticle.intro = currentArticle.intro ? currentArticle.intro + ' ' + line : line;
          }
        }
      }
    }
    if (currentArticle) articles.push(currentArticle);

    return { title, date, articles };
  }

  function buildTermsHTML(parsed, options = {}) {
    const { title, date, articles } = parsed;
    const anchorPrefix = options.anchorPrefix || 'terms-art';
    const documentLabel = options.documentLabel || '약관';

    const tocHTML = articles.map((a, i) =>
      `<li><a href="#${anchorPrefix}-${i}">${a.num} ${a.title}</a></li>`
    ).join('');

    const articlesHTML = articles.map((a, i) => {
      const itemsHTML = a.items.map(item =>
        `<div class="terms-item">
          <span class="terms-item-num">${item.num}</span>
          <span class="terms-item-text">${escapeHtml(item.text)}</span>
        </div>`
      ).join('');

      const introHTML = a.intro
        ? `<p class="terms-intro-text">${escapeHtml(a.intro)}</p>`
        : '';

      return `
        <div class="terms-article" id="${anchorPrefix}-${i}">
          <div class="terms-article-header">
            <span class="terms-article-num">${a.num}</span>
            <h3 class="terms-article-title">${escapeHtml(a.title)}</h3>
          </div>
          <div class="terms-article-body">
            ${introHTML}
            ${itemsHTML}
          </div>
        </div>`;
    }).join('');

    return `
      <div class="terms-doc-header">
        <h2 class="terms-doc-title">${escapeHtml(title)}</h2>
        <span class="terms-doc-date">📅 시행일: ${escapeHtml(date)}</span>
      </div>
      <div class="terms-toc">
        <p class="terms-toc-title">📑 목차</p>
        <ul class="terms-toc-list">${tocHTML}</ul>
      </div>
      <div class="terms-body">
        ${articlesHTML}
        <div class="terms-addendum">
          <p>본 ${escapeHtml(documentLabel)}은 <strong>${escapeHtml(date)}</strong>부터 시행합니다.</p>
          <p style="font-size:0.8rem; color: var(--text-light); margin-top: 0.3rem;">© 2026 태권커리어. All rights reserved.</p>
        </div>
      </div>`;
  }

  const privacyTableHeaders = [
    ['구분', '처리 목적', '처리 항목', '보유 및 이용기간'],
    ['구분', '수집 항목'],
    ['회원 유형', '필수 항목', '선택 항목'],
    ['수탁업체', '위탁 업무', '개인정보 이용기간'],
    ['제공받는 자', '제공 목적', '제공 항목', '보유 및 이용기간'],
    ['구분', '보유기간'],
    ['구분', '보존 근거', '보유기간'],
    ['구분', '파기방법'],
    ['구분', '수집 항목', '이용 목적', '보유기간'],
    ['이전받는 자', '이전 국가', '이전 항목', '이전 목적', '이전 일시 및 방법', '보유기간'],
    ['구분', '내용'],
  ];

  function findPrivacyTableHeader(lines, index) {
    return privacyTableHeaders.find(headers =>
      headers.every((header, offset) => lines[index + offset] === header)
    );
  }

  function isPrivacyBlockBoundary(line) {
    return !line || /^제\d+조\s+/.test(line);
  }

  function buildPrivacyTableHTML(headers, rows) {
    const headHTML = headers.map(header => `<th>${escapeHtml(header)}</th>`).join('');
    const rowsHTML = rows.map(row => `
      <tr>${row.map(cell => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>
    `).join('');

    return `
      <div class="privacy-table-wrap">
        <table class="privacy-table">
          <thead><tr>${headHTML}</tr></thead>
          <tbody>${rowsHTML}</tbody>
        </table>
      </div>`;
  }

  function renderPrivacyBlocks(lines) {
    const blocks = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;

      const headers = findPrivacyTableHeader(lines, i);
      if (headers) {
        const colCount = headers.length;
        const rows = [];
        let cursor = i + colCount;

        while (cursor < lines.length && !isPrivacyBlockBoundary(lines[cursor])) {
          const maybeNextHeader = findPrivacyTableHeader(lines, cursor);
          if (maybeNextHeader) break;

          const row = lines.slice(cursor, cursor + colCount);
          if (row.length < colCount || row.some(cell => !cell)) break;
          rows.push(row);
          cursor += colCount;
        }

        blocks.push(buildPrivacyTableHTML(headers, rows));
        i = cursor - 1;
        continue;
      }

      if (/^\d+\.\s+.+/.test(line)) {
        blocks.push(`<p class="privacy-list-line">${escapeHtml(line)}</p>`);
      } else {
        blocks.push(`<p class="terms-intro-text">${escapeHtml(line)}</p>`);
      }
    }

    return blocks.join('');
  }

  function buildPrivacyPolicyHTML(rawText, termsTitle, termsDate) {
    const lines = rawText.split('\n').map(line => line.trim());
    const nonEmptyLines = lines.filter(Boolean);
    const title = termsTitle || nonEmptyLines[0] || '개인정보처리방침';
    const dateLine = nonEmptyLines.find(line => line.startsWith('시행일'));
    const date = termsDate || (dateLine ? dateLine.replace('시행일: ', '').replace('시행일:', '').trim() : '2026년 07월 08일');
    const firstArticleIndex = lines.findIndex(line => /^제\d+조\s+/.test(line));
    const introLines = firstArticleIndex > 0
      ? lines.slice(1, firstArticleIndex).filter(line => line && !line.startsWith('시행일'))
      : [];
    const articleLines = firstArticleIndex >= 0 ? lines.slice(firstArticleIndex) : [];
    const articles = [];
    let currentArticle = null;

    articleLines.forEach(line => {
      const articleMatch = line.match(/^(제\d+조)\s+(.+)$/);
      if (articleMatch) {
        if (currentArticle) articles.push(currentArticle);
        currentArticle = {
          num: articleMatch[1],
          title: articleMatch[2],
          lines: [],
        };
        return;
      }

      if (currentArticle) currentArticle.lines.push(line);
    });
    if (currentArticle) articles.push(currentArticle);

    const tocHTML = articles.map((article, index) =>
      `<li><a href="#privacy-art-${index}">${article.num} ${escapeHtml(article.title)}</a></li>`
    ).join('');

    const introHTML = introLines.length
      ? `<div class="privacy-doc-summary">${introLines.map(line => `<p>${escapeHtml(line)}</p>`).join('')}</div>`
      : '';

    const articlesHTML = articles.map((article, index) => `
      <div class="terms-article privacy-article" id="privacy-art-${index}">
        <div class="terms-article-header">
          <span class="terms-article-num">${article.num}</span>
          <h3 class="terms-article-title">${escapeHtml(article.title)}</h3>
        </div>
        <div class="terms-article-body">
          ${renderPrivacyBlocks(article.lines)}
        </div>
      </div>
    `).join('');

    return `
      <div class="terms-doc-header">
        <h2 class="terms-doc-title">${escapeHtml(title)}</h2>
        <span class="terms-doc-date">시행일: ${escapeHtml(date)}</span>
      </div>
      ${introHTML}
      <div class="terms-toc">
        <p class="terms-toc-title">목차</p>
        <ul class="terms-toc-list">${tocHTML}</ul>
      </div>
      <div class="terms-body">
        ${articlesHTML}
      </div>`;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async function loadTermsForPage(termsType) {
    if (!termsPageViewerContent) return;

    if (termsLoadingBox) termsLoadingBox.style.display = 'flex';
    termsPageViewerContent.style.display = 'none';

    try {
      const termsData = await getTermsData(termsType);
      const parsed = parseTermsText(termsData.content, termsData.title, termsData.effectiveDate);
      termsPageViewerContent.innerHTML = buildTermsHTML(parsed);
      
      if (termsLoadingBox) termsLoadingBox.style.display = 'none';
      termsPageViewerContent.style.display = 'block';
    } catch (err) {
      console.error('이용약관 페이지 로드 실패:', err);
      if (termsLoadingBox) termsLoadingBox.style.display = 'none';
      termsPageViewerContent.innerHTML = `<div style="padding:3rem; text-align:center; color:var(--text-muted);">약관 파일을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</div>`;
      termsPageViewerContent.style.display = 'block';
    }
  }

  async function loadPrivacyPolicyForPage() {
    const privacyContent = document.getElementById('privacy-policy-content');
    const privacyViewerContent = document.getElementById('privacy-policy-viewer-content');
    if (!privacyContent || !privacyViewerContent) return;

    try {
      const termsData = await getTermsData('privacy');
      if (termsData && termsData.content) {
        privacyViewerContent.className = 'terms-content-area privacy-content-area';
        privacyViewerContent.innerHTML = buildPrivacyPolicyHTML(termsData.content, termsData.title, termsData.effectiveDate);
      }
    } catch (err) {
      console.warn('개인정보처리방침 동적 로드 실패, 정적 본문을 유지합니다:', err);
    }
  }

  termsTabButtons.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      termsTabButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const termsType = btn.dataset.termsType;
      loadTermsForPage(termsType);
    });
  });

  // ─── 이용안내 페이지 (/User_Guide) 사이드바 네비게이션 ──────────────────────
  let guideObserver = null;

  function initGuideNavigation() {
    const navItems = document.querySelectorAll('.guide-nav-item');
    const sectionCards = document.querySelectorAll('.guide-section-card');

    if (!navItems.length || !sectionCards.length) return;

    // 클릭 이벤트: 부드러운 스크롤
    navItems.forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const targetId = item.getAttribute('data-guide-section');
        const targetEl = document.getElementById(targetId);
        if (targetEl) {
          targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        // 즉시 active 상태 갱신
        navItems.forEach(n => n.classList.remove('active'));
        item.classList.add('active');
      });
    });

    // IntersectionObserver: 스크롤 시 사이드바 하이라이트
    if (guideObserver) guideObserver.disconnect();

    guideObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const sectionId = entry.target.id;
          navItems.forEach(n => {
            n.classList.toggle('active', n.getAttribute('data-guide-section') === sectionId);
          });
        }
      });
    }, {
      rootMargin: '-20% 0px -60% 0px',
      threshold: 0
    });

    sectionCards.forEach(card => guideObserver.observe(card));
  }

  // 로그인 회원 유형 롤 획득
  function getUserRole() {
    if (!state.authReady && auth) return 'loading';
    if (!state.currentUser) return 'guest';
    const email = state.currentUser.email ? state.currentUser.email.toLowerCase() : '';
    if (isAdminEmail(email)) return 'admin';
    const rawType = String(state.currentUser.type || state.currentUser.role || '').toLowerCase();
    if (
      rawType === 'gym' ||
      rawType.includes('관장') ||
      rawType.includes('구인') ||
      rawType.includes('도장') ||
      rawType.includes('owner') ||
      state.currentUser.gym_name ||
      state.currentUser.business_number
    ) {
      return 'gym';
    }
    if (
      rawType === 'instructor' ||
      rawType.includes('사범') ||
      rawType.includes('구직')
    ) {
      return 'instructor';
    }
    return rawType || 'guest';
  }

  function getCurrentVisibleViewId() {
    return Object.entries(views).find(([, view]) => view && !view.classList.contains('hidden'))?.[0] || 'home';
  }

  function updateRoleFloatingCTA(viewId = getCurrentVisibleViewId()) {
    if (!roleFloatingCTA) return;

    const enabledViews = new Set(['home', 'jobs', 'talents', 'community', 'customerService', 'myApplications']);
    const shouldShow = enabledViews.has(viewId);

    if (!shouldShow) {
      roleFloatingCTA.classList.add('hidden');
      roleFloatingCTA.classList.remove('is-open'); // Close the menu when hiding
      return;
    }

    const role = getUserRole();
    const isLoggedIn = role !== 'guest' && role !== 'loading';

    const subActionBtn = document.getElementById('btn-floating-role-action');
    const subGuestJobBtn = document.getElementById('btn-floating-guest-job');
    const subGuestResumeBtn = document.getElementById('btn-floating-guest-resume');
    const ctaTrigger = document.getElementById('role-floating-cta-trigger');
    const ctaText = ctaTrigger ? ctaTrigger.querySelector('.role-floating-cta-text') : null;

    if (isLoggedIn) {
      // 로그인 회원: 펼치는 퀵메뉴 없이 플로팅 버튼 자체가 바로 등록 버튼
      if (subActionBtn) subActionBtn.style.display = 'none';
      if (subGuestJobBtn) subGuestJobBtn.style.display = 'none';
      if (subGuestResumeBtn) subGuestResumeBtn.style.display = 'none';

      // Gym and Admin get 'job' (채용공고 등록), Instructor gets 'resume' (이력서 등록)
      const isGymOrAdmin = role === 'gym' || role === 'admin';
      const action = isGymOrAdmin ? 'job' : 'resume';
      const label = isGymOrAdmin ? '채용공고 등록' : '이력서 등록';

      roleFloatingCTA.classList.remove('is-open'); // 펼침 상태 해제 (직접 등록 모드)
      if (ctaTrigger) {
        ctaTrigger.dataset.directAction = action;
        ctaTrigger.setAttribute('aria-label', label);
      }
      if (ctaText) ctaText.textContent = label;
    } else {
      // 비회원: 퀵메뉴 펼치면 채용공고 등록 + 이력서 등록 (클릭 시 로그인 유도)
      if (subActionBtn) subActionBtn.style.display = 'none';
      if (subGuestJobBtn) subGuestJobBtn.style.display = 'flex';
      if (subGuestResumeBtn) subGuestResumeBtn.style.display = 'flex';

      if (ctaTrigger) {
        delete ctaTrigger.dataset.directAction;
        ctaTrigger.setAttribute('aria-label', '퀵 메뉴');
      }
      if (ctaText) ctaText.textContent = '퀵 메뉴';
    }

    roleFloatingCTA.classList.remove('hidden');
  }

  // 역할에 따른 메뉴 노출 및 레이아웃 제어
  function applyRoleBasedUI() {
    const role = getUserRole();

    const menuJobs = document.getElementById('menu-jobs');
    const menuTalents = document.getElementById('menu-talents');
    const mMenuJobs = document.getElementById('m-menu-jobs');
    const mMenuTalents = document.getElementById('m-menu-talents');

    const liJobs = menuJobs ? menuJobs.parentElement : null;
    const liTalents = menuTalents ? menuTalents.parentElement : null;
    const mLiJobs = mMenuJobs ? mMenuJobs.parentElement : null;
    const mLiTalents = mMenuTalents ? mMenuTalents.parentElement : null;

    const homeJobsSection = document.getElementById('home-jobs-section');
    const homeTalentsSection = document.getElementById('home-talents-section');

    const heroBtnPostJob = document.getElementById('hero-btn-post-job');
    const boardBtnPostJob = document.getElementById('board-btn-post-job');
    const heroBtnPostResume = document.getElementById('hero-btn-post-resume');
    const boardBtnPostResume = document.getElementById('board-btn-post-resume');

    // 1. 관리자 (admin)인 경우: 모두 노출
    if (role === 'admin') {
      if (liJobs) liJobs.style.display = 'block';
      if (liTalents) liTalents.style.display = 'block';
      if (mLiJobs) mLiJobs.style.display = 'block';
      if (mLiTalents) mLiTalents.style.display = 'block';

      if (homeJobsSection) homeJobsSection.style.display = 'block';
      if (homeTalentsSection) homeTalentsSection.style.display = 'block';

      if (heroBtnPostJob) heroBtnPostJob.style.display = 'inline-flex';
      if (boardBtnPostJob) boardBtnPostJob.style.display = 'inline-flex';
      if (heroBtnPostResume) heroBtnPostResume.style.display = 'inline-flex';
      if (boardBtnPostResume) boardBtnPostResume.style.display = 'inline-flex';
    } 
    // 2. 사범 (instructor)인 경우: 채용공고 노출, 인재정보 숨김, 이력서 등록은 노출, 공고 등록은 숨김
    else if (role === 'instructor') {
      if (liJobs) liJobs.style.display = 'block';
      if (liTalents) liTalents.style.display = 'none';
      if (mLiJobs) mLiJobs.style.display = 'block';
      if (mLiTalents) mLiTalents.style.display = 'none';

      if (homeJobsSection) homeJobsSection.style.display = 'block';
      if (homeTalentsSection) homeTalentsSection.style.display = 'none';

      if (heroBtnPostJob) heroBtnPostJob.style.display = 'none';
      if (boardBtnPostJob) boardBtnPostJob.style.display = 'none';
      if (heroBtnPostResume) heroBtnPostResume.style.display = 'inline-flex';
      if (boardBtnPostResume) boardBtnPostResume.style.display = 'inline-flex';
    } 
    // 3. 관장 (gym)인 경우: 채용공고 숨김, 인재정보 노출, 공고 등록은 노출, 이력서 등록은 숨김
    else if (role === 'gym') {
      if (liJobs) liJobs.style.display = 'none';
      if (liTalents) liTalents.style.display = 'block';
      if (mLiJobs) mLiJobs.style.display = 'none';
      if (mLiTalents) mLiTalents.style.display = 'block';

      if (homeJobsSection) homeJobsSection.style.display = 'none';
      if (homeTalentsSection) homeTalentsSection.style.display = 'block';

      if (heroBtnPostJob) heroBtnPostJob.style.display = 'inline-flex';
      if (boardBtnPostJob) boardBtnPostJob.style.display = 'inline-flex';
      if (heroBtnPostResume) heroBtnPostResume.style.display = 'none';
      if (boardBtnPostResume) boardBtnPostResume.style.display = 'none';
    }
    // 4. 비로그인 (guest)인 경우: 탐색을 위해 기본 노출하되 클릭 시 권한 제한
    else {
      if (liJobs) liJobs.style.display = 'block';
      if (liTalents) liTalents.style.display = 'block';
      if (mLiJobs) mLiJobs.style.display = 'block';
      if (mLiTalents) mLiTalents.style.display = 'block';

      if (homeJobsSection) homeJobsSection.style.display = 'block';
      if (homeTalentsSection) homeTalentsSection.style.display = 'block';

      if (heroBtnPostJob) heroBtnPostJob.style.display = 'inline-flex';
      if (boardBtnPostJob) boardBtnPostJob.style.display = 'inline-flex';
      if (heroBtnPostResume) heroBtnPostResume.style.display = 'inline-flex';
      if (boardBtnPostResume) boardBtnPostResume.style.display = 'inline-flex';
    }

    // 잘못된 해시로 강제 진입 시 가드 처리
    const hash = window.location.hash || '#home';
    const cleanHash = hash.split('?')[0];
    
    if (cleanHash === '#talents' && (role === 'instructor' || role === 'guest')) {
      window.location.hash = '#home';
      if (role === 'guest') {
        alert('인재 정보 열람은 로그인(관장님/관리자) 후 이용하실 수 있습니다.');
        if (dialogs.auth) dialogs.auth.showModal();
      } else {
        alert('사범 및 일반 회원은 인재 정보를 열람할 권한이 없습니다.');
      }
    }

    // 관장회원 전용 열람권 상태 안내 바 업데이트
    updateGymPassBannerUI();
    updateRoleFloatingCTA();
  }

  function handleRoute() {
    const pathname = window.location.pathname;
    const rawHash = window.location.hash;
    const hash = rawHash || '#home';
    const cleanHash = hash.split('?')[0];

    const role = getUserRole();
    if (role === 'loading') {
      return;
    }
    if (cleanHash === '#talents' && (role === 'instructor' || role === 'guest')) {
      window.location.hash = '#home';
      if (role === 'guest') {
        alert('인재 정보 열람은 로그인(관장님/관리자) 후 이용하실 수 있습니다.');
        if (dialogs.auth) dialogs.auth.showModal();
      } else {
        alert('사범 및 일반 회원은 인재 정보를 열람할 권한이 없습니다.');
      }
      return;
    }

    if (pathname === '/About') {
      if (rawHash && cleanHash !== '#about' && cleanHash !== '#aboutUs') {
        window.history.replaceState({}, '', '/' + rawHash);
      } else {
        navigateToView('about');
        window.scrollTo(0, 0);
        return;
      }
    }
    if (pathname === '/Privacy_Policy') {
      if (rawHash && cleanHash !== '#privacy-policy' && cleanHash !== '#privacyPolicy' && !cleanHash.startsWith('#privacy-art-')) {
        window.history.replaceState({}, '', '/' + rawHash);
      } else {
        const isAlreadyVisible = views.privacyPolicy && !views.privacyPolicy.classList.contains('hidden');
        if (!isAlreadyVisible) {
          navigateToView('privacyPolicy');
        }
        if (cleanHash.startsWith('#privacy-art-')) {
          setTimeout(() => {
            const el = document.getElementById(cleanHash.substring(1));
            if (el) {
              el.scrollIntoView({ behavior: 'smooth' });
            }
          }, isAlreadyVisible ? 10 : 150);
        } else {
          if (!isAlreadyVisible) {
            window.scrollTo(0, 0);
          }
        }
        return;
      }
    }
    if (pathname === '/Terms_of_Use') {
      if (rawHash && cleanHash !== '#terms-of-use' && cleanHash !== '#termsOfUse' && !cleanHash.startsWith('#terms-art-')) {
        window.history.replaceState({}, '', '/' + rawHash);
      } else {
        const isAlreadyVisible = views.termsOfUse && !views.termsOfUse.classList.contains('hidden');
        if (!isAlreadyVisible) {
          navigateToView('termsOfUse');
        }
        if (cleanHash.startsWith('#terms-art-')) {
          setTimeout(() => {
            const el = document.getElementById(cleanHash.substring(1));
            if (el) {
              el.scrollIntoView({ behavior: 'smooth' });
            }
          }, isAlreadyVisible ? 10 : 150);
        } else {
          if (!isAlreadyVisible) {
            window.scrollTo(0, 0);
          }
        }
        return;
      }
    }
    if (pathname === '/User_Guide') {
      if (rawHash && cleanHash !== '#user-guide' && cleanHash !== '#userGuide' && !cleanHash.startsWith('#guide-')) {
        window.history.replaceState({}, '', '/' + rawHash);
      } else {
        const isAlreadyVisible = views.userGuide && !views.userGuide.classList.contains('hidden');
        if (!isAlreadyVisible) {
          navigateToView('userGuide');
          initGuideNavigation();
        }
        if (cleanHash.startsWith('#guide-')) {
          setTimeout(() => {
            const el = document.getElementById(cleanHash.substring(1));
            if (el) {
              el.scrollIntoView({ behavior: 'smooth' });
            }
          }, isAlreadyVisible ? 10 : 150);
        } else {
          if (!isAlreadyVisible) {
            window.scrollTo(0, 0);
          }
        }
        return;
      }
    }
    if (pathname === '/Customer_Service') {
      if (rawHash && cleanHash !== '#customer-service' && cleanHash !== '#customerService') {
        window.history.replaceState({}, '', '/' + rawHash);
      } else {
        navigateToView('customerService');
        if (window.loadMyInquiries) {
          window.loadMyInquiries();
        }
        window.scrollTo(0, 0);
        return;
      }
    }

    switch (cleanHash) {
      case '#jobs':
        navigateToView('jobs');
        renderBoardJobs();
        break;
      case '#talents':
        navigateToView('talents');
        renderBoardTalents();
        break;
      case '#my-applications':
        navigateToView('myApplications');
        renderMyApplicationsView();
        break;

      case '#community':
        navigateToView('community');
        state.communityCurrentPage = 1;
        setupCommunityTab('free');
        break;
      case '#customer-service':
        navigateToView('customerService');
        break;
      case '#privacy-policy':
        navigateToView('privacyPolicy');
        window.scrollTo(0, 0);
        break;
      case '#terms-of-use':
        navigateToView('termsOfUse');
        window.scrollTo(0, 0);
        break;
      case '#user-guide':
        navigateToView('userGuide');
        window.scrollTo(0, 0);
        initGuideNavigation();
        break;
      case '#about':
        navigateToView('about');
        window.scrollTo(0, 0);
        break;
      case '#home':
      default:
        navigateToView('home');
        loadHomeBanners();
        renderHomeJobs();
        renderHomeTalents();
        renderHomeCommunityPosts();
        break;
    }
  }

  // Set up event listeners for nav
  window.addEventListener('hashchange', handleRoute);
  window.addEventListener('popstate', handleRoute);

  // SPA routing click handler for direct path link
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a');
    if (link && (link.getAttribute('href') === '/Privacy_Policy' || link.getAttribute('href') === '/Terms_of_Use' || link.getAttribute('href') === '/Customer_Service' || link.getAttribute('href') === '/User_Guide' || link.getAttribute('href') === '/About')) {
      e.preventDefault();
      const href = link.getAttribute('href');
      window.history.pushState({}, '', href);
      handleRoute();
    }
  });

  // Back to Top Button Logic
  const backToTopBtn = document.getElementById('btn-back-to-top');
  if (backToTopBtn) {
    window.addEventListener('scroll', () => {
      if (window.scrollY > 300) {
        backToTopBtn.style.display = 'flex';
        setTimeout(() => {
          backToTopBtn.classList.add('visible');
        }, 10);
      } else {
        backToTopBtn.classList.remove('visible');
        setTimeout(() => {
          if (!backToTopBtn.classList.contains('visible')) {
            backToTopBtn.style.display = 'none';
          }
        }, 300);
      }
    });

    backToTopBtn.addEventListener('click', () => {
      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    });
  }

  // 네비게이션 메뉴 클릭 시 동일한 탭이라도 새로고침 동작하도록 처리
  const navItems = [
    { id: 'menu-jobs', hash: '#jobs' },
    { id: 'menu-talents', hash: '#talents' },
    { id: 'menu-community', hash: '#community' },
    { id: 'm-menu-jobs', hash: '#jobs' },
    { id: 'm-menu-talents', hash: '#talents' },
    { id: 'm-menu-community', hash: '#community' }
  ];

  navItems.forEach(item => {
    const el = document.getElementById(item.id);
    if (el) {
      el.addEventListener('click', () => {
        // 이미 해당 해시에 있다면 hashchange가 발생하지 않으므로 수동 갱신 실행
        if (window.location.hash === item.hash || (window.location.hash === '' && item.hash === '#home')) {
          initJobsAndTalents().then(() => {
            handleRoute();
          });
        }
      });
    }
  });
  
  // Custom click binding for logo
  document.getElementById('header-logo').addEventListener('click', (e) => {
    e.preventDefault();
    window.location.hash = '#home';
  });

  // Action links inside pages
  document.getElementById('link-more-jobs').addEventListener('click', (e) => {
    e.preventDefault();
    window.location.hash = '#jobs';
  });
  
  document.getElementById('link-more-talents').addEventListener('click', (e) => {
    e.preventDefault();
    window.location.hash = '#talents';
  });

  document.getElementById('link-more-community').addEventListener('click', (e) => {
    e.preventDefault();
    window.location.hash = '#community';
  });


  // ==========================================================================
  // 4. Render Logic (Cards and Lists)
  // ==========================================================================
  
  // Name masking helper for anonymous talent listings on home view
  function maskName(name) {
    if (!name) return '사범 회원';
    if (name.length <= 2) {
      return name.charAt(0) + '*';
    }
    return name.charAt(0) + '*'.repeat(name.length - 2) + name.slice(-1);
  }

  // Generate SVG avatar markup
  function createAvatarSvg(name, gender, index) {
    if (name === '비공개') {
      return `
        <svg class="talent-avatar" viewBox="0 0 100 100" width="80" height="80">
          <circle cx="50" cy="50" r="48" fill="#e2e8f0"/>
          <circle cx="50" cy="38" r="16" fill="#94a3b8"/>
          <path d="M 22,76 C 22,58 35,52 50,52 C 65,52 78,58 78,76 C 78,79 75,82 72,82 L 28,82 C 25,82 22,79 22,76 Z" fill="#94a3b8"/>
        </svg>
      `;
    }
    
    let initials = name.slice(1, 3) || name.charAt(0);
    const gradient = avatarGradients[index % avatarGradients.length];
    
    // Draw simple belt or ribbon overlay
    const beltColor = gender === '여성' ? '#be185d' : '#1e3a8a';
    
    return `
      <svg class="talent-avatar" viewBox="0 0 100 100" width="80" height="80">
        <defs>
          <linearGradient id="grad-${index}" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="${gradient.split(',')[1].trim()}"/>
            <stop offset="100%" stop-color="${gradient.split(',')[2].replace(')', '').trim()}"/>
          </linearGradient>
        </defs>
        <circle cx="50" cy="50" r="48" fill="url(#grad-${index})"/>
        <text x="50" y="55" fill="#ffffff" font-size="28" font-weight="800" text-anchor="middle" dominant-baseline="middle">${initials}</text>
      </svg>
    `;
  }

  // Create single job card element
  function createJobCardElement(job) {
    const card = document.createElement('div');
    card.className = 'job-card';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.dataset.id = job.id;

    if (job.pinned) {
      card.classList.add('pinned-job');
      card.style.border = '2px solid var(--color-amber-500)';
      card.style.boxShadow = '0 6px 16px rgba(245, 158, 11, 0.15)';
      card.style.background = 'linear-gradient(to bottom right, #ffffff, var(--color-amber-50))';
    }

    let badge = '';
    if (job.pinned) {
      badge = `<span class="badge-hot" style="background-color: var(--color-amber-500); color: #ffffff; font-weight: 800; font-size: 0.72rem; padding: 2px 8px; border-radius: 4px; display: inline-block; vertical-align: middle; margin-right: 6px;">NEW</span>`;
    } else if (job.hotness) {
      badge = `<span class="badge-${job.hotness.toLowerCase()}">${job.hotness}</span>`;
    }

    card.innerHTML = `
      <div class="job-card-header">
        ${badge}
        <span class="gym-name">${job.gymName}</span>
      </div>
      <h3 class="job-card-title">${job.title}</h3>
      <div class="job-card-details">
        <span class="job-region">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
          ${job.region}
        </span>
        <span class="job-salary">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><line x1="12" y1="18" x2="12" y2="6"/><line x1="2" y1="12" x2="22" y2="12"/></svg>
          ${job.salary}
        </span>
        <span class="job-views" style="display: inline-flex; align-items: center; gap: 4px; font-size: 0.8rem; color: var(--text-muted); margin-left: auto;">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle;"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          픽셀 ${job.views || 0}
        </span>
      </div>
      <div class="job-card-footer">
        <span class="badge-type">${job.type}</span>
        <span class="badge-exp">${job.exp}</span>
      </div>
    `;

    // Click handler to open details dialog
    card.addEventListener('click', () => openJobDetails(job));
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openJobDetails(job);
      }
    });

    return card;
  }

  // Create single talent card element
  function createTalentCardElement(talent) {
    const card = document.createElement('div');
    card.className = 'talent-card';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.dataset.id = talent.id;

    const displayName = maskName(talent.name);
    const avatarName = '비공개';

    card.innerHTML = `
      <div class="talent-avatar-wrapper">
        ${createAvatarSvg(avatarName, talent.gender, talent.colorIndex)}
        <span class="talent-online-badge"></span>
      </div>
      <h3 class="talent-name">${displayName}</h3>
      <div class="talent-role-exp">${talent.role} | ${talent.exp}</div>
      <div class="talent-meta">
        <span class="talent-loc">${talent.region}</span>
        <span class="talent-sal">${talent.salary}</span>
      </div>
      <div class="talent-badges">
        <span class="badge-talent">${talent.dan}</span>
        <span class="badge-talent license">${talent.license.substring(0,6)}</span>
      </div>
    `;

    // Click handler to open details
    card.addEventListener('click', () => openTalentDetails(talent));
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openTalentDetails(talent);
      }
    });

    return card;
  }

  // Render jobs on the Home view
  function renderHomeJobs() {
    const grid = document.getElementById('realtime-jobs-grid');
    if (!grid) return;
    if (typeof db !== 'undefined' && db && !state.dbLoaded && state.jobsList.length === 0) {
      return; // Keep loading placeholder
    }
    grid.innerHTML = '';
    
    // Render first 5 jobs matching mockup layout
    const recentJobs = state.jobsList.slice(0, 5);
    recentJobs.forEach(job => {
      grid.appendChild(createJobCardElement(job));
    });
  }

  // Render talents on the Home view
  function renderHomeTalents() {
    const grid = document.getElementById('recommended-talents-grid');
    if (!grid) return;
    if (typeof db !== 'undefined' && db && !state.dbLoaded && state.talentsList.length === 0) {
      return; // Keep loading placeholder
    }
    grid.innerHTML = '';
    
    // Render first 5 talents
    const recentTalents = state.talentsList.slice(0, 5);
    recentTalents.forEach(talent => {
      grid.appendChild(createTalentCardElement(talent));
    });
  }

  // Home Banner: Firestore에서 배너를 불러와 홈 화면에 표시
  async function loadHomeBanners() {
    const section = document.getElementById('home-banner-section');
    if (!section) return;

    if (homeBannerTimer) {
      clearInterval(homeBannerTimer);
      homeBannerTimer = null;
    }

    // db가 없으면 배너 숨김
    if (!db) { section.innerHTML = ''; return; }

    try {
      const snap = await db.collection('banners').orderBy('created_at', 'desc').limit(5).get();
      const banners = [];
      snap.forEach(doc => banners.push({ id: doc.id, ...doc.data() }));

      if (banners.length === 0) {
        section.innerHTML = '';
        return;
      }

      const sliderId = 'home-banner-slider-' + Date.now();
      section.innerHTML = `
        <div id="${sliderId}" class="home-banner-frame">
          <div class="home-banner-track">
            ${banners.map((b, i) => `
              <div class="home-banner-slide ${i === 0 ? 'active' : ''}" data-index="${i}">
                ${b.linkUrl ? `
                  <a href="${b.linkUrl}" target="_blank" rel="noopener" class="home-banner-link" draggable="false" aria-label="배너 ${i + 1} 링크 열기">
                    <img src="${b.url}" alt="배너 ${i + 1}" class="home-banner-image"
                      draggable="false"
                      onerror="this.closest('.home-banner-slide').style.display='none'">
                  </a>` : `
                  <img src="${b.url}" alt="배너 ${i + 1}" class="home-banner-image"
                    draggable="false"
                    onerror="this.closest('.home-banner-slide').style.display='none'">`}
              </div>`).join('')}
          </div>
          ${banners.length > 1 ? `
            <button type="button" class="home-banner-control prev" onclick="bannerPrev('${sliderId}')" aria-label="이전 배너">&#8249;</button>
            <button type="button" class="home-banner-control next" onclick="bannerNext('${sliderId}')" aria-label="다음 배너">&#8250;</button>
            <div class="home-banner-dots" aria-label="배너 순서">
              ${banners.map((_, i) => `<button type="button" class="home-banner-dot ${i === 0 ? 'active' : ''}" data-i="${i}" onclick="bannerGoTo('${sliderId}',${i})" aria-label="배너 ${i + 1}"></button>`).join('')}
            </div>` : ''}
        </div>`;

      if (banners.length > 1) {
        homeBannerTimer = setInterval(() => {
          window.bannerNext(sliderId);
        }, 7000);
      }
    } catch (e) {
      console.warn('홈 배너 로드 실패:', e);
      section.innerHTML = '';
    }
  }

  // 배너 슬라이더 컨트롤 함수 (전역 노출 필요)
  window.bannerGoTo = function(sliderId, idx) {
    const slider = document.getElementById(sliderId);
    if (!slider) return;
    const track = slider.querySelector('.home-banner-track');
    const slides = slider.querySelectorAll('.home-banner-slide');
    const dots = slider.querySelectorAll('.home-banner-dot');
    if (track) track.style.transform = `translateX(-${idx * 100}%)`;
    slides.forEach((s, i) => s.classList.toggle('active', i === idx));
    dots.forEach((d, i) => d.classList.toggle('active', i === idx));
  };

  window.bannerNext = function(sliderId) {
    const slider = document.getElementById(sliderId);
    if (!slider) return;
    const slides = slider.querySelectorAll('.home-banner-slide');
    const total = slides.length;
    let cur = Array.from(slides).findIndex(s => s.classList.contains('active'));
    if (cur < 0) cur = 0;
    window.bannerGoTo(sliderId, (cur + 1) % total);
  };

  window.bannerPrev = function(sliderId) {
    const slider = document.getElementById(sliderId);
    if (!slider) return;
    const slides = slider.querySelectorAll('.home-banner-slide');
    const total = slides.length;
    let cur = Array.from(slides).findIndex(s => s.classList.contains('active'));
    if (cur < 0) cur = 0;
    window.bannerGoTo(sliderId, (cur - 1 + total) % total);
  };

  // Render community posts on the Home view
  function renderHomeCommunityPosts() {
    const container = document.getElementById('home-community-posts');
    if (!container) return;
    container.innerHTML = '';

    // 최신 글 4개 추출
    const recentPosts = state.communityPosts.slice(0, 4);

    if (recentPosts.length === 0) {
      container.innerHTML = '<div class="no-results" style="padding: 2rem 0;">등록된 커뮤니티 게시글이 없습니다.</div>';
      return;
    }

    recentPosts.forEach(post => {
      const row = document.createElement('div');
      row.className = 'home-post-row';
      row.innerHTML = `
        <div class="home-post-main">
          ${getCategoryBadge(post.category)}
          <span class="home-post-title">${post.title}</span>
        </div>
        <div class="home-post-meta">
          <span style="margin-right: 8px;">${post.author}</span>
          <span>${post.date}</span>
        </div>
      `;

      row.addEventListener('click', () => {
        openCommunityDetails(post);
      });

      container.appendChild(row);
    });
  }

  function getApplicationStatusLabel(status) {
    if (status === 'interview') return '면접 제안';
    if (status === 'accepted') return '합격';
    if (status === 'rejected') return '불합격';
    return '지원완료';
  }

  function getApplicationStatusClass(status) {
    if (status === 'interview') return 'interview';
    if (status === 'accepted') return 'accepted';
    if (status === 'rejected') return 'rejected';
    return 'pending';
  }

  function formatApplicationDate(value) {
    const millis = getMillisFromDateLike(value);
    if (!millis) return '-';
    return new Date(millis).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  }

  function normalizeResumeSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return null;
    return {
      name: snapshot.name || '지원자',
      gender: snapshot.gender || '남성',
      role: snapshot.role || snapshot.hope_position || '직무 미입력',
      exp: snapshot.exp || snapshot.career || '경력 미입력',
      region: snapshot.region || snapshot.hope_area || '지역 미입력',
      salary: snapshot.salary || snapshot.hope_salary || '',
      dan: snapshot.dan || '',
      license: snapshot.license || '',
      intro: snapshot.intro || snapshot.content || '',
      phone: snapshot.phone || '',
      userId: snapshot.userId || snapshot.user_id || ''
    };
  }

  function createResumeSnapshot(resume, fallbackUserId = '') {
    if (!resume) return null;
    return {
      name: resume.name || '지원자',
      gender: resume.gender || '남성',
      role: resume.role || '직무 미입력',
      exp: resume.exp || '경력 미입력',
      region: resume.region || '지역 미입력',
      salary: resume.salary || '',
      dan: resume.dan || '',
      license: resume.license || '',
      intro: resume.intro || '',
      phone: resume.phone || '',
      userId: resume.userId || fallbackUserId || ''
    };
  }

  async function freezeApplicationsForResume(resume) {
    if (!db || !resume?.id) return;

    const resumeSnapshot = createResumeSnapshot(resume, resume.userId);
    if (!resumeSnapshot) return;

    const applySnap = await db.collection('apply')
      .where('resume_id', '==', resume.id)
      .get();
    const batch = db.batch();
    let hasUpdates = false;

    applySnap.forEach((doc) => {
      const data = doc.data();
      if (!data.resume_snapshot) {
        batch.update(doc.ref, { resume_snapshot: resumeSnapshot });
        hasUpdates = true;
      }
    });

    if (hasUpdates) await batch.commit();

    state.applicationsList = state.applicationsList.map((app) => {
      if (app.resumeId !== resume.id || app.resumeSnapshot) return app;
      return {
        ...app,
        resumeSnapshot,
        resume: resumeSnapshot
      };
    });
  }

  async function renderMyApplicationsView() {
    const titleEl = document.getElementById('my-applications-title');
    const descEl = document.getElementById('my-applications-desc');
    const summaryEl = document.getElementById('my-applications-summary');
    const listEl = document.getElementById('my-applications-list');
    const roleTitleEl = document.getElementById('mypage-role-section-title');
    if (!listEl) return;

    if (!state.currentUser) {
      if (titleEl) titleEl.textContent = '로그인이 필요합니다';
      if (descEl) descEl.textContent = '지원 현황은 로그인 후 확인할 수 있습니다.';
      listEl.innerHTML = '<div class="no-results">로그인 후 이용해 주세요.</div>';
      if (dialogs.auth) dialogs.auth.showModal();
      return;
    }

    await initJobsAndTalents();
    const role = getUserRole();
    if (role === 'gym' || role === 'admin') {
      if (roleTitleEl) roleTitleEl.textContent = '내 채용 공고 관리';
      renderGymApplicationManagement({ titleEl, descEl, summaryEl, listEl });
    } else {
      if (roleTitleEl) roleTitleEl.textContent = '내 이력서 및 지원 현황';
      renderInstructorApplicationStatus({ titleEl, descEl, summaryEl, listEl });
    }

    if (window.renderMyPageInquiries) {
      window.renderMyPageInquiries();
    }
    // Update mypage pass info card
    const passCardEl = document.getElementById('mypage-pass-info-card');
    const subStatusEl = document.getElementById('mypage-sub-status');
    if (passCardEl && subStatusEl) {
      if (state.currentUser && getUserRole() === 'gym') {
        passCardEl.style.display = 'block';
        
        const isSubscribed = isResumeSubscriptionActive(state.currentUser);
        if (isSubscribed) {
          subStatusEl.textContent = `구독 중 (~${formatSubscriptionDate(state.currentUser.resumeSubscriptionUntil)})`;
          subStatusEl.style.color = '#059669'; // Greenish success color
        } else {
          subStatusEl.textContent = '미구독';
          subStatusEl.style.color = '#ef4444'; // Red color for uncompleted/inactive
        }
      } else {
        passCardEl.style.display = 'none';
      }
    }

    renderMyScrapsView();
  }

  // ─── My Page Scrap Rendering & Action Logic ───
  async function renderMyScrapsView() {
    const sectionEl = document.getElementById('mypage-scraps-section');
    const titleEl = document.getElementById('mypage-scraps-title');
    const listEl = document.getElementById('mypage-scraps-list');
    if (!listEl || !sectionEl) return;

    if (!state.currentUser) {
      sectionEl.style.display = 'none';
      return;
    }

    sectionEl.style.display = 'block';
    listEl.innerHTML = '';

    const role = getUserRole();
    if (role === 'gym' || role === 'admin') {
      if (titleEl) titleEl.textContent = '⭐ 관심 인재 스크랩';
      
      const scrappedTalentIds = state.currentUser.scrapped_talents || [];
      if (scrappedTalentIds.length === 0) {
        listEl.innerHTML = '<div class="no-results" style="grid-column: 1/-1;">스크랩한 인재가 없습니다.</div>';
        return;
      }

      const scrappedTalents = state.talentsList.filter(t => scrappedTalentIds.includes(t.id));
      if (scrappedTalents.length === 0) {
        listEl.innerHTML = '<div class="no-results" style="grid-column: 1/-1;">스크랩한 인재 정보를 불러올 수 없습니다.</div>';
        return;
      }

      listEl.innerHTML = scrappedTalents.map(t => `
        <div class="job-card" style="margin: 0; padding: 1.15rem; cursor: pointer; display: flex; flex-direction: column; justify-content: space-between;" onclick="openTalentDetailsById('${t.id}')">
          <div>
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem;">
              <span class="badge badge-blue" style="font-size: 0.72rem; padding: 2px 6px;">${t.role}</span>
              <span style="font-size: 0.75rem; color: var(--text-muted);">${t.date || ''}</span>
            </div>
            <h3 style="font-size: 0.95rem; font-weight: 800; color: var(--text); margin-bottom: 0.35rem; line-height: 1.3;">${t.name} 사범님</h3>
            <p style="font-size: 0.8rem; color: var(--text-muted); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; height: 2.4rem; line-height: 1.5; margin-bottom: 0.5rem;">${t.intro || ''}</p>
          </div>
          <div style="font-size: 0.78rem; color: var(--text-muted); border-top: 1px solid var(--border); padding-top: 0.5rem; margin-top: 0.5rem; display: flex; justify-content: space-between; align-items: center;">
            <span>경력: ${t.exp}</span>
            <span style="color: #ef4444; font-weight: 700; cursor: pointer; padding: 2px 6px;" onclick="event.stopPropagation(); toggleScrapTalent('${t.id}')">해제</span>
          </div>
        </div>
      `).join('');
    } else {
      if (titleEl) titleEl.textContent = '⭐ 스크랩한 채용공고';
      
      const scrappedJobIds = state.currentUser.scrapped_jobs || [];
      if (scrappedJobIds.length === 0) {
        listEl.innerHTML = '<div class="no-results" style="grid-column: 1/-1;">스크랩한 채용공고가 없습니다.</div>';
        return;
      }

      const scrappedJobs = state.jobsList.filter(j => scrappedJobIds.includes(j.id));
      if (scrappedJobs.length === 0) {
        listEl.innerHTML = '<div class="no-results" style="grid-column: 1/-1;">스크랩한 공고 정보를 불러올 수 없습니다.</div>';
        return;
      }

      listEl.innerHTML = scrappedJobs.map(j => `
        <div class="job-card" style="margin: 0; padding: 1.15rem; cursor: pointer; display: flex; flex-direction: column; justify-content: space-between;" onclick="openJobDetailsById('${j.id}')">
          <div>
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem;">
              <span class="badge badge-green" style="font-size: 0.72rem; padding: 2px 6px;">${j.type}</span>
              <span style="font-size: 0.75rem; color: var(--text-muted);">${j.regDate || ''}</span>
            </div>
            <h3 style="font-size: 0.95rem; font-weight: 800; color: var(--text); margin-bottom: 0.35rem; line-height: 1.3;">${j.title}</h3>
            <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.5rem;">${j.gymName}</p>
          </div>
          <div style="font-size: 0.78rem; color: var(--text-muted); border-top: 1px solid var(--border); padding-top: 0.5rem; margin-top: 0.5rem; display: flex; justify-content: space-between; align-items: center;">
            <span>급여: ${j.salary}</span>
            <span style="color: #ef4444; font-weight: 700; cursor: pointer; padding: 2px 6px;" onclick="event.stopPropagation(); toggleScrapJob('${j.id}')">해제</span>
          </div>
        </div>
      `).join('');
    }
  }

  window.openTalentDetailsById = async function(id) {
    const t = state.talentsList.find(x => x.id === id);
    if (!t) return;
    
    const isGym = state.currentUser && getUserRole() === 'gym';
    const hasActiveSubscription = isGym && isResumeSubscriptionActive(state.currentUser);
    const isUnlocked = isGym && (
      hasActiveSubscription ||
      (state.currentUser.unlockedResumes && state.currentUser.unlockedResumes.includes(t.id)) ||
      t.userEmail === state.currentUser.email
    );
    
    if (isGym && !isUnlocked) {
      alert('이력서 열람 기간이 만료되었거나 권한이 없습니다. 다시 열람하려면 열람권 구매가 필요합니다.');
      openPurchasePassModal(t);
      return;
    }
    
    openTalentDetails(t);
  };
  
  window.openJobDetailsById = function(id) {
    const j = state.jobsList.find(x => x.id === id);
    if (j) openJobDetails(j);
  };

  window.toggleScrapJob = async function(jobId) {
    if (!state.currentUser) {
      alert('로그인이 필요합니다.');
      return;
    }
    
    if (!state.currentUser.scrapped_jobs) {
      state.currentUser.scrapped_jobs = [];
    }
    
    const isScrapped = state.currentUser.scrapped_jobs.includes(jobId);
    let newScrapped = [...state.currentUser.scrapped_jobs];
    
    if (isScrapped) {
      newScrapped = newScrapped.filter(id => id !== jobId);
      alert('스크랩이 해제되었습니다.');
    } else {
      newScrapped.push(jobId);
      alert('관심공고로 저장되었습니다.');
    }
    
    state.currentUser.scrapped_jobs = newScrapped;
    
    try {
      await db.collection('users').doc(state.currentUser.uid).update({
        scrapped_jobs: newScrapped
      });
      renderMyScrapsView();
      updateScrapButtonUI('job', jobId);
    } catch (err) {
      console.error('Failed to update scrapped jobs:', err);
    }
  };

  window.toggleScrapTalent = async function(talentId) {
    if (!state.currentUser) {
      alert('로그인이 필요합니다.');
      return;
    }
    
    if (!state.currentUser.scrapped_talents) {
      state.currentUser.scrapped_talents = [];
    }
    
    const isScrapped = state.currentUser.scrapped_talents.includes(talentId);
    let newScrapped = [...state.currentUser.scrapped_talents];
    
    if (isScrapped) {
      newScrapped = newScrapped.filter(id => id !== talentId);
      alert('스크랩이 해제되었습니다.');
    } else {
      newScrapped.push(talentId);
      alert('관심인재로 등록되었습니다.');
    }
    
    state.currentUser.scrapped_talents = newScrapped;
    
    try {
      await db.collection('users').doc(state.currentUser.uid).update({
        scrapped_talents: newScrapped
      });
      renderMyScrapsView();
      updateScrapButtonUI('talent', talentId);
    } catch (err) {
      console.error('Failed to update scrapped talents:', err);
    }
  };

  function updateScrapButtonUI(type, id) {
    if (type === 'talent') {
      const btn = document.getElementById('btn-scrap-talent');
      if (btn && state.currentUser) {
        const isScrapped = state.currentUser.scrapped_talents && state.currentUser.scrapped_talents.includes(id);
        btn.innerHTML = isScrapped ? `⭐ 스크랩 해제` : `⭐ 인재 스크랩`;
        btn.style.background = isScrapped ? '#e2e8f0' : '';
      }
    } else if (type === 'job') {
      const btn = document.getElementById('btn-scrap-job');
      if (btn && state.currentUser) {
        const isScrapped = state.currentUser.scrapped_jobs && state.currentUser.scrapped_jobs.includes(id);
        btn.innerHTML = isScrapped ? `⭐ 스크랩 해제` : `⭐ 스크랩`;
        btn.style.background = isScrapped ? '#e2e8f0' : '';
      }
    }
  }

  function renderGymApplicationManagement({ titleEl, descEl, summaryEl, listEl }) {
    if (titleEl) titleEl.textContent = '마이페이지';
    if (descEl) descEl.textContent = '내 정보, 채용 및 지원 관리, 1:1 문의 내역을 한눈에 관리합니다.';

    const myJobs = state.jobsList.filter((job) => job.userId === state.currentUser.uid);
    const myJobIds = new Set(myJobs.map((job) => job.id));
    const apps = state.applicationsList.filter((app) => myJobIds.has(app.jobId));

    if (summaryEl) summaryEl.innerHTML = `<span class="results-count">내 공고 ${myJobs.length}건 · 지원자 ${apps.length}명</span>`;
    if (!myJobs.length) {
      listEl.innerHTML = '<div class="no-results">등록한 채용공고가 없습니다. 채용공고를 먼저 등록해 주세요.</div>';
      return;
    }

    listEl.innerHTML = myJobs.map((job) => {
      const jobApps = apps.filter((app) => app.jobId === job.id);
      return `
        <div class="application-job-group">
          <div class="application-job-header">
            <div>
              <div class="application-job-title">${escapeHtml(job.title)}</div>
              <div class="application-job-meta">${escapeHtml(job.gymName)} · ${escapeHtml(job.region)} · ${escapeHtml(job.salary)}</div>
            </div>
            <div class="application-header-actions">
              <span class="application-count-badge">지원자 ${jobApps.length}명</span>
              <button type="button" onclick="editHomepageJob('${job.id}')">수정</button>
              <button type="button" class="danger" onclick="deleteHomepageJob('${job.id}')">삭제</button>
            </div>
          </div>
          <div class="application-applicant-list">
            ${jobApps.length ? jobApps.map((app) => renderGymApplicationRow(app)).join('') : '<div class="application-applicant-row"><div class="application-row-meta">아직 지원자가 없습니다.</div></div>'}
          </div>
        </div>
      `;
    }).join('');
  }

  function renderGymApplicationRow(app) {
    const resume = app.resume || {};
    return `
      <div class="application-applicant-row">
        <div>
          <div class="application-applicant-name">${escapeHtml(resume.name || '지원자')}</div>
          <div class="application-row-meta">${escapeHtml(resume.role || '직무 미입력')} · ${escapeHtml(resume.exp || '경력 미입력')} · ${escapeHtml(resume.region || '지역 미입력')} · 지원일 ${formatApplicationDate(app.createdAt)}</div>
          <div style="margin-top:0.45rem"><span class="application-status-badge ${getApplicationStatusClass(app.status)}">${getApplicationStatusLabel(app.status)}</span></div>
        </div>
        <div class="application-actions">
          <button type="button" onclick="changeHomepageApplicationStatus('${app.id}', 'interview')">면접 제안</button>
          <button type="button" onclick="changeHomepageApplicationStatus('${app.id}', 'accepted')">합격</button>
          <button type="button" onclick="changeHomepageApplicationStatus('${app.id}', 'rejected')">불합격</button>
          <button type="button" onclick="openApplicationResume('${app.id}')">이력서 보기</button>
        </div>
      </div>
    `;
  }

  function renderInstructorApplicationStatus({ titleEl, descEl, summaryEl, listEl }) {
    if (titleEl) titleEl.textContent = '마이페이지';
    if (descEl) descEl.textContent = '내 정보, 채용 및 지원 관리, 1:1 문의 내역을 한눈에 관리합니다.';

    const apps = state.applicationsList.filter((app) => app.applicantId === state.currentUser.uid || app.resume?.userId === state.currentUser.uid);
    const myResumes = state.talentsList.filter((resume) => resume.userId === state.currentUser.uid);
    if (summaryEl) summaryEl.innerHTML = `<span class="results-count">이력서 ${myResumes.length}건 · 지원 ${apps.length}건</span>`;

    const resumeSection = myResumes.length ? myResumes.map((resume) => `
      <div class="application-row-card">
        <div>
          <div class="application-applicant-name">${escapeHtml(resume.name || '이력서')}</div>
          <div class="application-row-meta">${escapeHtml(resume.role || '직무 미입력')} · ${escapeHtml(resume.exp || '경력 미입력')} · ${escapeHtml(resume.region || '지역 미입력')}</div>
        </div>
        <div class="application-actions">
          <button type="button" onclick="editHomepageResume('${resume.id}')">수정</button>
          <button type="button" class="danger" onclick="deleteHomepageResume('${resume.id}')">삭제</button>
        </div>
      </div>
    `).join('') : '<div class="no-results">등록한 이력서가 없습니다. 이력서를 먼저 등록해 주세요.</div>';

    const applicationSection = apps.length ? apps.map((app) => `
      <div class="application-row-card">
        <div>
          <div class="application-applicant-name">${escapeHtml(app.job?.title || '채용공고')}</div>
          <div class="application-row-meta">${escapeHtml(app.job?.gymName || '도장')} · ${escapeHtml(app.job?.region || '')} · 지원일 ${formatApplicationDate(app.createdAt)}</div>
        </div>
        <div class="application-actions">
          <span class="application-status-badge ${getApplicationStatusClass(app.status)}">${getApplicationStatusLabel(app.status)}</span>
          <button type="button" class="danger" onclick="deleteHomepageApplication('${app.id}')">지원서 삭제</button>
        </div>
      </div>
    `).join('') : '<div class="no-results">아직 지원한 채용공고가 없습니다.</div>';

    listEl.innerHTML = `
      <div class="application-section-title">내 이력서</div>
      ${resumeSection}
      <div class="application-section-title">지원 현황</div>
      ${applicationSection}
    `;
  }

  window.changeHomepageApplicationStatus = async function(appId, status) {
    if (!state.currentUser || !db) return;
    try {
      await db.collection('apply').doc(appId).update({ status });
      alert(`지원 상태를 "${getApplicationStatusLabel(status)}"로 변경했습니다.`);
      await renderMyApplicationsView();
    } catch (err) {
      console.error('지원 상태 변경 실패:', err);
      alert('지원 상태 변경에 실패했습니다: ' + err.message);
    }
  };

  window.openApplicationResume = function(applicationIdOrResumeId) {
    const application = state.applicationsList.find((item) => item.id === applicationIdOrResumeId);
    const talent = application?.resumeSnapshot ||
      application?.resume ||
      state.talentsList.find((item) => item.id === applicationIdOrResumeId);
    if (!talent) {
      alert('이력서 정보를 찾을 수 없습니다.');
      return;
    }
    openTalentDetails(talent);
  };

  function getBaseJobTitle(job) {
    const position = job.position || '';
    if (position && job.title.endsWith(` (${position})`)) {
      return job.title.slice(0, -(` (${position})`).length);
    }
    return job.title || '';
  }

  function setJobDialogMode(mode) {
    const titleEl = document.getElementById('post-job-dialog-title');
    const submitEl = document.getElementById('post-job-submit-label');
    if (titleEl) titleEl.textContent = mode === 'edit' ? '채용공고 수정' : '채용공고 등록';
    if (submitEl) submitEl.textContent = mode === 'edit' ? '수정하기' : '등록하기';
  }

  function setResumeDialogMode(mode) {
    const titleEl = document.getElementById('post-resume-dialog-title');
    const submitEl = document.getElementById('post-resume-submit-label');
    if (titleEl) titleEl.textContent = mode === 'edit' ? '이력서 수정' : '이력서 등록';
    if (submitEl) submitEl.textContent = mode === 'edit' ? '이력서 수정하기' : '이력서 등록하기';
  }

  function resetJobDialogMode() {
    state.editingJobId = null;
    setJobDialogMode('create');
    document.querySelectorAll('input[name="job-position"]').forEach(checkbox => checkbox.checked = false);
    document.querySelectorAll('input[name="job-type"]').forEach(checkbox => checkbox.checked = false);
  }

  function resetResumeDialogMode() {
    state.editingResumeId = null;
    setResumeDialogMode('create');
  }

  function hasResumeApplication(resumeId) {
    return state.applicationsList.some((app) => app.resumeId === resumeId);
  }

  window.editHomepageJob = function(jobId) {
    const job = state.jobsList.find((item) => item.id === jobId);
    if (!job || !state.currentUser || job.userId !== state.currentUser.uid) {
      alert('수정할 수 있는 채용공고를 찾을 수 없습니다.');
      return;
    }

    state.editingJobId = jobId;
    setJobDialogMode('edit');
    document.getElementById('job-gym-name').value = job.gymName || '';
    document.getElementById('job-title').value = getBaseJobTitle(job);
    
    // Checkboxes mapping for positions
    const positions = String(job.position || '').split(',').map(s => s.trim()).filter(Boolean);
    document.querySelectorAll('input[name="job-position"]').forEach(checkbox => {
      checkbox.checked = positions.includes(checkbox.value);
    });

    document.getElementById('job-salary').value = job.salary || '';
    
    // Checkboxes mapping for job types
    const types = String(job.type || '').split(',').map(s => s.trim()).filter(Boolean);
    document.querySelectorAll('input[name="job-type"]').forEach(checkbox => {
      checkbox.checked = types.includes(checkbox.value);
    });

    document.getElementById('job-exp').value = job.exp || '';
    document.getElementById('job-address').value = job.address || '';
    document.getElementById('job-preferred').value = job.preferred || '';
    document.getElementById('job-desc').value = job.desc || '';
    document.getElementById('job-region').value = job.region || '';
    state.selectedJobRegions = splitRegionValues(job.region);
    state.regionPickers.job?.setByValue(job.region || '');
    if (dialogs.postJob) dialogs.postJob.showModal();
  };

  window.deleteHomepageJob = async function(jobId) {
    const job = state.jobsList.find((item) => item.id === jobId);
    if (!job || !state.currentUser || job.userId !== state.currentUser.uid) {
      alert('삭제할 수 있는 채용공고를 찾을 수 없습니다.');
      return;
    }
    if (!confirm('이 채용공고를 삭제하시겠습니까?')) return;

    try {
      if (db) {
        const applySnap = await db.collection('apply')
          .where('job_id', '==', jobId)
          .get();
        const deleteBatch = db.batch();
        applySnap.forEach((doc) => {
          deleteBatch.delete(doc.ref);
        });
        deleteBatch.delete(db.collection('jobs').doc(jobId));
        await deleteBatch.commit();
      }
      state.jobsList = state.jobsList.filter((item) => item.id !== jobId);
      state.applicationsList = state.applicationsList.filter((app) => app.jobId !== jobId);
      alert('채용공고가 삭제되었습니다.');
      renderHomeJobs();
      renderBoardJobs();
      renderMyApplicationsView();
      updateStats();
    } catch (err) {
      console.error('채용공고 삭제 실패:', err);
      alert('채용공고 삭제에 실패했습니다: ' + err.message);
    }
  };

  window.editHomepageResume = function(resumeId) {
    const resume = state.talentsList.find((item) => item.id === resumeId);
    if (!resume || !state.currentUser || resume.userId !== state.currentUser.uid) {
      alert('수정할 수 있는 이력서를 찾을 수 없습니다.');
      return;
    }

    state.editingResumeId = resumeId;
    setResumeDialogMode('edit');
    document.getElementById('res-name').value = resume.name || '';
    document.getElementById('res-gender').value = resume.gender || '남성';
    document.getElementById('res-position').value = resume.role || '';
    document.getElementById('res-salary').value = resume.salary || '';
    document.getElementById('res-exp').value = resume.exp || '';
    document.getElementById('res-dan').value = resume.dan || '';
    document.getElementById('res-license').value = resume.license || '';
    document.getElementById('res-intro').value = resume.intro || '';
    document.getElementById('res-region').value = resume.region || '';
    state.selectedResumeRegions = splitRegionValues(resume.region);
    state.regionPickers.resume?.setByValue(resume.region || '');
    if (dialogs.postResume) dialogs.postResume.showModal();
  };

  window.deleteHomepageResume = async function(resumeId) {
    const resume = state.talentsList.find((item) => item.id === resumeId);
    if (!resume || !state.currentUser || resume.userId !== state.currentUser.uid) {
      alert('삭제할 수 있는 이력서를 찾을 수 없습니다.');
      return;
    }
    if (!confirm('이 이력서를 삭제하시겠습니까?')) return;

    try {
      if (db) await db.collection('resumes').doc(resumeId).delete();
      state.talentsList = state.talentsList.filter((item) => item.id !== resumeId);
      state.applicationsList = state.applicationsList.filter((app) => app.resumeId !== resumeId);
      alert('이력서가 삭제되었습니다.');
      renderHomeTalents();
      renderBoardTalents();
      renderMyApplicationsView();
      updateStats();
    } catch (err) {
      console.error('이력서 삭제 실패:', err);
      alert('이력서 삭제에 실패했습니다: ' + err.message);
    }
  };

  window.deleteHomepageApplication = async function(appId) {
    const app = state.applicationsList.find((item) => item.id === appId);
    const isMine = state.currentUser && (
      app?.applicantId === state.currentUser.uid ||
      app?.resume?.userId === state.currentUser.uid
    );
    if (!app || !isMine) {
      alert('삭제할 수 있는 지원서를 찾을 수 없습니다.');
      return;
    }
    if (!confirm('이 지원서를 삭제하시겠습니까?')) return;

    try {
      if (db) await db.collection('apply').doc(appId).delete();
      state.applicationsList = state.applicationsList.filter((item) => item.id !== appId);
      alert('지원서가 삭제되었습니다.');
      renderMyApplicationsView();
    } catch (err) {
      console.error('지원서 삭제 실패:', err);
      alert('지원서 삭제에 실패했습니다: ' + err.message);
    }
  };

  // Render jobs on the Job Board view with current filters
  function renderBoardJobs() {
    const grid = document.getElementById('board-jobs-grid');
    const countEl = document.getElementById('jobs-results-count');
    if (!grid) return;
    if (typeof db !== 'undefined' && db && !state.dbLoaded && state.jobsList.length === 0) {
      grid.innerHTML = '<div class="loading-placeholder">공고를 불러오는 중입니다...</div>';
      if (countEl) countEl.textContent = '불러오는 중...';
      return;
    }
    grid.innerHTML = '';

    const filtered = state.jobsList.filter(job => {
      const selectedRegions = splitRegionValues(state.filters.jobs.region);
      const regionMatch = !selectedRegions.length || selectedRegions.some((region) => matchesSelectedRegion(job.region, region));
      const positionMatch = !state.filters.jobs.position || job.title.includes(state.filters.jobs.position) || job.desc.includes(state.filters.jobs.position);
      const typeMatch = !state.filters.jobs.type || job.type === state.filters.jobs.type;
      return regionMatch && positionMatch && typeMatch;
    });

    if (countEl) {
      countEl.textContent = `총 ${filtered.length}건의 공고`;
    }

    if (filtered.length === 0) {
      grid.innerHTML = '<div class="no-results">일치하는 채용공고가 없습니다. 다른 조건으로 검색해 보세요.</div>';
      return;
    }

    filtered.forEach(job => {
      grid.appendChild(createJobCardElement(job));
    });
  }

  // Render talents on the Talent Board view with current filters
  function renderBoardTalents() {
    const grid = document.getElementById('board-talents-grid');
    const countEl = document.getElementById('talents-results-count');
    if (!grid) return;
    if (typeof db !== 'undefined' && db && !state.dbLoaded && state.talentsList.length === 0) {
      grid.innerHTML = '<div class="loading-placeholder">인재정보를 불러오는 중입니다...</div>';
      if (countEl) countEl.textContent = '불러오는 중...';
      return;
    }
    grid.innerHTML = '';

    const filtered = state.talentsList.filter(talent => {
      const selectedRegions = state.filters.talents.regions || [];
      const regionMatch = !selectedRegions.length || selectedRegions.some((region) => matchesSelectedRegion(talent.region, region));
      const positionMatch = !state.filters.talents.position || talent.role.includes(state.filters.talents.position);
      return regionMatch && positionMatch;
    });

    if (countEl) {
      countEl.textContent = `총 ${filtered.length}명 등록`;
    }

    if (filtered.length === 0) {
      grid.innerHTML = '<div class="no-results">조건에 맞는 인재정보가 없습니다.</div>';
      return;
    }

    filtered.forEach(talent => {
      grid.appendChild(createTalentCardElement(talent));
    });
  }


  // ==========================================================================
  // 5. Community tab handling
  // ==========================================================================
  
  // Category badge helper for community lists
  function getCategoryBadge(category) {
    switch (category) {
      case 'knowhow':
        return `<span class="badge badge-amber" style="font-size:0.72rem;padding:2px 6px;margin-right:8px;display:inline-block;vertical-align:middle;">도장운영</span>`;
      case 'news':
        return `<span class="badge badge-blue" style="font-size:0.72rem;padding:2px 6px;margin-right:8px;display:inline-block;vertical-align:middle;">뉴스</span>`;
      case 'contest':
        return `<span class="badge" style="font-size:0.72rem;padding:2px 6px;margin-right:8px;display:inline-block;vertical-align:middle;background-color:#fee2e2;color:#ef4444;border:1px solid #fca5a5;">대회정보</span>`;
      case 'free':
      default:
        return `<span class="badge badge-green" style="font-size:0.72rem;padding:2px 6px;margin-right:8px;display:inline-block;vertical-align:middle;">자유</span>`;
    }
  }

  function setupCommunityTab(tabName) {
    // Set active tab styling
    document.querySelectorAll('.comm-tab').forEach(tab => {
      tab.classList.remove('active');
      tab.setAttribute('aria-selected', 'false');
    });

    const activeTabButton = document.getElementById(`tab-${tabName}`);
    if (activeTabButton) {
      activeTabButton.classList.add('active');
      activeTabButton.setAttribute('aria-selected', 'true');
    }

    // Render corresponding posts with checkbox filtering
    const container = document.getElementById('community-posts-container');
    const countEl = document.getElementById('community-posts-count');
    const paginationContainer = document.getElementById('community-pagination-container');
    const pageSizeSelect = document.getElementById('community-pagesize-select');
    
    if (!container) return;
    container.innerHTML = '';
    if (paginationContainer) paginationContainer.innerHTML = '';

    // Sync page size selector
    if (pageSizeSelect) {
      pageSizeSelect.value = state.communityPageSize;
    }

    // Extract active filter checkbox categories
    const checkedChks = document.querySelectorAll('.comm-filter-chk:checked');
    const checkedCategories = Array.from(checkedChks).map(chk => chk.value);

    let filteredPosts = [];
    if (checkedCategories.length === 0) {
      // If none checked, show ALL community posts
      filteredPosts = state.communityPosts;
    } else {
      // Filter by selected checkbox categories
      filteredPosts = state.communityPosts.filter(post => checkedCategories.includes(post.category));
    }
    
    if (countEl) {
      countEl.textContent = `자유게시판 목록 (${filteredPosts.length}개)`;
    }

    if (filteredPosts.length === 0) {
      container.innerHTML = '<div class="no-results">등록된 게시글이 없습니다.</div>';
      return;
    }

    // Pagination logic: only paginate if total posts exceeds the selected page size
    const enablePagination = filteredPosts.length > state.communityPageSize;
    let pagePosts = filteredPosts;

    if (enablePagination) {
      const pageSize = state.communityPageSize;
      const totalPages = Math.ceil(filteredPosts.length / pageSize);

      // Normalize current page bounds
      if (state.communityCurrentPage > totalPages) {
        state.communityCurrentPage = totalPages;
      }
      if (state.communityCurrentPage < 1) {
        state.communityCurrentPage = 1;
      }

      const startIndex = (state.communityCurrentPage - 1) * pageSize;
      const endIndex = startIndex + pageSize;
      pagePosts = filteredPosts.slice(startIndex, endIndex);

      // Build Pagination Buttons
      if (paginationContainer) {
        // Previous Button
        const prevBtn = document.createElement('button');
        prevBtn.className = 'pagination-btn' + (state.communityCurrentPage === 1 ? ' disabled' : '');
        prevBtn.innerHTML = '‹';
        prevBtn.type = 'button';
        if (state.communityCurrentPage > 1) {
          prevBtn.addEventListener('click', () => {
            state.communityCurrentPage--;
            setupCommunityTab(tabName);
            const sectionEl = document.getElementById('view-community');
            if (sectionEl) sectionEl.scrollIntoView({ behavior: 'smooth' });
          });
        }
        paginationContainer.appendChild(prevBtn);

        // Numeric Page Buttons (max 5 visible)
        let startPage = Math.max(1, state.communityCurrentPage - 2);
        let endPage = Math.min(totalPages, startPage + 4);
        if (endPage - startPage < 4) {
          startPage = Math.max(1, endPage - 4);
        }

        for (let p = startPage; p <= endPage; p++) {
          const pageBtn = document.createElement('button');
          pageBtn.className = 'pagination-btn' + (p === state.communityCurrentPage ? ' active' : '');
          pageBtn.textContent = p;
          pageBtn.type = 'button';
          pageBtn.addEventListener('click', () => {
            state.communityCurrentPage = p;
            setupCommunityTab(tabName);
            const sectionEl = document.getElementById('view-community');
            if (sectionEl) sectionEl.scrollIntoView({ behavior: 'smooth' });
          });
          paginationContainer.appendChild(pageBtn);
        }

        // Next Button
        const nextBtn = document.createElement('button');
        nextBtn.className = 'pagination-btn' + (state.communityCurrentPage === totalPages ? ' disabled' : '');
        nextBtn.innerHTML = '›';
        nextBtn.type = 'button';
        if (state.communityCurrentPage < totalPages) {
          nextBtn.addEventListener('click', () => {
            state.communityCurrentPage++;
            setupCommunityTab(tabName);
            const sectionEl = document.getElementById('view-community');
            if (sectionEl) sectionEl.scrollIntoView({ behavior: 'smooth' });
          });
        }
        paginationContainer.appendChild(nextBtn);
      }
    }

    // Render current page posts
    pagePosts.forEach(post => {
      const row = document.createElement('div');
      row.className = 'post-row';
      row.innerHTML = `
        <div class="post-main-info">
          <h3>${getCategoryBadge(post.category)} ${post.title}</h3>
          <div class="post-meta-line">
            <span class="post-author">${post.author}</span>
            <span class="post-date">${post.date}</span>
          </div>
        </div>
        <div class="post-views">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          <span>픽셀 ${post.views}</span>
        </div>
      `;

      row.addEventListener('click', () => {
        openCommunityDetails(post);
      });

      container.appendChild(row);
    });
  }

  // Hook up community tabs clicks (always free board)
  document.querySelectorAll('.comm-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      window.location.hash = '#community';
      state.communityCurrentPage = 1;
      setupCommunityTab('free');
    });
  });

  // Bind change event to community filters
  document.querySelectorAll('.comm-filter-chk').forEach(chk => {
    chk.addEventListener('change', () => {
      state.communityCurrentPage = 1;
      setupCommunityTab('free');
    });
  });

  // Bind page size change event
  const pageSizeSelect = document.getElementById('community-pagesize-select');
  if (pageSizeSelect) {
    pageSizeSelect.addEventListener('change', (e) => {
      state.communityPageSize = parseInt(e.target.value, 10);
      state.communityCurrentPage = 1;
      setupCommunityTab('free');
    });
  }


  // ==========================================================================
  // 6. Search Bar & Filter Form Listeners
  // ==========================================================================
  
  // Home page search submit
  const searchForm = document.getElementById('main-search-form');
  if (searchForm) {
    searchForm.addEventListener('submit', (e) => {
      e.preventDefault();
      
      const region = document.getElementById('search-region').value;
      const position = document.getElementById('search-position').value;
      const type = document.getElementById('search-worktype').value;

      // Sync state filters
      state.filters.jobs.region = region;
      state.filters.jobs.position = position;
      state.filters.jobs.type = type;

      // Go to job board subpage
      window.location.hash = '#jobs';

      // Sync the Job board form controls visually
      document.getElementById('filter-job-region').value = region;
      state.regionPickers.jobFilter?.setByValue(region);
      document.getElementById('filter-job-position').value = position;
      document.getElementById('filter-job-type').value = type;
      
      renderBoardJobs();
    });
  }

  // Tag keyword click search
  document.querySelectorAll('.btn-tag').forEach(tagBtn => {
    tagBtn.addEventListener('click', () => {
      const keyword = tagBtn.dataset.tag;
      
      // Reset other filters
      state.filters.jobs.region = '';
      state.filters.jobs.type = '';
      state.filters.jobs.position = keyword;

      window.location.hash = '#jobs';

      // Sync UI controls
      document.getElementById('filter-job-region').value = '';
      state.regionPickers.jobFilter?.clear();
      document.getElementById('filter-job-type').value = '';
      document.getElementById('filter-job-position').value = keyword === '경력무관' ? '' : keyword; // '경력무관' handles differently

      renderBoardJobs();
    });
  });

  // Job Board detailed filter form submit
  const jobsFilterForm = document.getElementById('jobs-filter-form');
  if (jobsFilterForm) {
    jobsFilterForm.addEventListener('submit', (e) => {
      e.preventDefault();
      state.filters.jobs.region = document.getElementById('filter-job-region').value;
      state.filters.jobs.position = document.getElementById('filter-job-position').value;
      state.filters.jobs.type = document.getElementById('filter-job-type').value;
      renderBoardJobs();
    });

    document.getElementById('btn-job-filter-reset').addEventListener('click', () => {
      state.filters.jobs = { region: '', position: '', type: '' };
      state.regionPickers.jobFilter?.clear();
      // Timeout to wait for form default reset behavior to clear value
      setTimeout(renderBoardJobs, 50);
    });
  }

  // Talent Board detailed filter form submit
  const talentsFilterForm = document.getElementById('talents-filter-form');
  if (talentsFilterForm) {
    talentsFilterForm.addEventListener('submit', (e) => {
      e.preventDefault();
      state.filters.talents.regions = state.regionPickers.talentFilter?.getValues() || [];
      state.filters.talents.position = document.getElementById('filter-talent-position').value;
      renderBoardTalents();
    });

    document.getElementById('btn-talent-filter-reset').addEventListener('click', () => {
      state.filters.talents = { regions: [], position: '' };
      state.regionPickers.talentFilter?.clear();
      setTimeout(renderBoardTalents, 50);
    });
  }


  // ==========================================================================
  // 7. Modals / Dialog Controls
  // ==========================================================================
  
  // Close any open dialog when clicking close buttons
  document.querySelectorAll('.btn-close-dialog').forEach(btn => {
    btn.addEventListener('click', () => {
      const dialog = btn.closest('dialog');
      if (dialog) {
        dialog.close();
      }
    });
  });

  // Light dismiss helper: close on click backdrop
  Object.values(dialogs).forEach(dialog => {
    if (dialog) {
      dialog.addEventListener('click', (e) => {
        if (e.target === dialog) {
          dialog.close();
        }
      });
    }
  });

  dialogs.postJob?.addEventListener('close', () => {
    resetJobDialogMode();
  });

  dialogs.postResume?.addEventListener('close', () => {
    resetResumeDialogMode();
  });

  // Auth Dialog (Login/Register)
  const loginTrigger = document.getElementById('btn-login-trigger');
  const registerTrigger = document.getElementById('btn-register-trigger');
  const tabLogin = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');
  const formLogin = document.getElementById('form-login');
  const formRegister = document.getElementById('form-register');
  const formFindId = document.getElementById('form-find-id');
  const formResetPassword = document.getElementById('form-reset-password');
  const findIdButton = document.getElementById('btn-find-id');
  const resetPasswordButton = document.getElementById('btn-reset-password');
  const findIdBackButton = document.getElementById('btn-find-id-back');
  const resetPasswordBackButton = document.getElementById('btn-reset-password-back');
  const findIdResult = document.getElementById('find-id-result');
  const resetPasswordResult = document.getElementById('reset-password-result');
  const businessVerifyFields = document.querySelectorAll('.business-verify-field');
  const gymNameInput = document.getElementById('reg-gym-name');
  const businessNumberInput = document.getElementById('reg-business-number');
  const businessStartDateInput = document.getElementById('reg-business-start-date');
  const businessOwnerNameInput = document.getElementById('reg-business-owner-name');
  const businessStatusButton = document.getElementById('btn-business-status-check');
  const businessValidateButton = document.getElementById('btn-business-validate');
  const businessStatusResult = document.getElementById('business-status-result');
  const businessValidateResult = document.getElementById('business-validate-result');
  const agreeAllInput = document.getElementById('reg-agree-all');
  const agreeAgeInput = document.getElementById('reg-agree-age');
  const agreeTermsInput = document.getElementById('reg-agree-terms');
  const agreePersonalizedInput = document.getElementById('reg-agree-personalized');
  const agreeMarketingInput = document.getElementById('reg-agree-marketing');
  const agreementInputs = [agreeAgeInput, agreeTermsInput, agreePersonalizedInput, agreeMarketingInput].filter(Boolean);
  const roleInputs = document.querySelectorAll('input[name="user-role"]');
  const regPhoneInput = document.getElementById('reg-phone');
  if (regPhoneInput) {
    regPhoneInput.addEventListener('input', (e) => {
      let val = e.target.value.replace(/[^0-9]/g, '');
      if (val.length > 3 && val.length <= 7) {
        val = val.replace(/(\d{3})(\d{1,4})/, '$1-$2');
      } else if (val.length > 7) {
        val = val.replace(/(\d{3})(\d{3,4})(\d{4})/, '$1-$2-$3');
      }
      e.target.value = val;
    });
  }
  let businessStatusCheck = null;
  let businessValidation = null;

  function setBusinessResult(el, msg, type) {
    if (!el) return;
    el.textContent = msg || '';
    el.classList.toggle('success', type === 'success');
    el.classList.toggle('error', type === 'error');
  }

  function resetBusinessChecks() {
    businessStatusCheck = null;
    businessValidation = null;
    setBusinessResult(businessStatusResult, '', '');
    setBusinessResult(businessValidateResult, '', '');
  }

  function getCurrentBusinessPayload() {
    return {
      businessNumber: getBusinessNumberDigits(businessNumberInput?.value),
      businessStartDate: getBusinessDateDigits(businessStartDateInput?.value),
      businessOwnerName: businessOwnerNameInput?.value.trim() || '',
      gymName: gymNameInput?.value.trim() || ''
    };
  }

  function isBusinessStatusChecked(payload) {
    return businessStatusCheck?.businessNumber === payload.businessNumber &&
      businessStatusCheck?.statusCode === '01';
  }

  function isBusinessValidated(payload) {
    return businessValidation?.businessNumber === payload.businessNumber &&
      businessValidation?.businessStartDate === payload.businessStartDate &&
      businessValidation?.businessOwnerName === payload.businessOwnerName &&
      businessValidation?.valid === '01';
  }

  function syncBusinessNumberField() {
    const selectedRole = document.querySelector('input[name="user-role"]:checked')?.value || 'instructor';
    const isGym = selectedRole === 'gym';
    businessVerifyFields.forEach((field) => field.classList.toggle('hidden', !isGym));
    [gymNameInput, businessNumberInput, businessStartDateInput, businessOwnerNameInput].forEach((input) => {
      if (!input) return;
      input.required = isGym;
      if (!isGym) input.value = '';
    });
    if (!isGym) resetBusinessChecks();
  }

  function syncAgreementAllState() {
    if (!agreeAllInput || agreementInputs.length === 0) return;
    const checkedCount = agreementInputs.filter((input) => input.checked).length;
    agreeAllInput.checked = checkedCount === agreementInputs.length;
    agreeAllInput.indeterminate = checkedCount > 0 && checkedCount < agreementInputs.length;
  }

  function setAuthResult(el, msg, type) {
    if (!el) return;
    el.textContent = msg || '';
    el.classList.toggle('success', type === 'success');
    el.classList.toggle('error', type === 'error');
  }

  function showAuthPane(activePane) {
    if (!dialogs.auth) return;
    clearAuthError();
    setAuthResult(findIdResult, '', '');
    setAuthResult(resetPasswordResult, '', '');

    [formLogin, formRegister, formFindId, formResetPassword].forEach((pane) => {
      if (pane) {
        pane.classList.add('hidden');
        pane.scrollTop = 0;
      }
    });
    
    if (activePane === 'login') {
      tabLogin.classList.add('active');
      tabRegister.classList.remove('active');
      formLogin.classList.remove('hidden');
    } else if (activePane === 'register') {
      tabLogin.classList.remove('active');
      tabRegister.classList.add('active');
      formRegister.classList.remove('hidden');
    } else {
      tabLogin.classList.remove('active');
      tabRegister.classList.remove('active');
      if (activePane === 'findId') formFindId?.classList.remove('hidden');
      if (activePane === 'resetPassword') formResetPassword?.classList.remove('hidden');
    }

    // 포커스 자동 지정 및 첫 인풋으로 스크롤 고정
    setTimeout(() => {
      if (activePane === 'login') {
        const emailInput = document.getElementById('login-email');
        if (emailInput) {
          emailInput.focus();
          formLogin.scrollTop = 0;
        }
      } else if (activePane === 'register') {
        const nameInput = document.getElementById('reg-name');
        if (nameInput) {
          nameInput.focus();
          formRegister.scrollTop = 0;
        }
      }
    }, 50);
  }

  function openAuthDialog(activePane) {
    showAuthPane(activePane);
    
    dialogs.auth.showModal();
  }

  // ─── 로그인 트리거 ─────────────────────────────────────────────────────────
  if (loginTrigger) loginTrigger.addEventListener('click', () => openAuthDialog('login'));
  if (registerTrigger) registerTrigger.addEventListener('click', () => openAuthDialog('register'));

  tabLogin.addEventListener('click', () => openAuthDialog('login'));
  tabRegister.addEventListener('click', () => openAuthDialog('register'));
  if (findIdButton) findIdButton.addEventListener('click', () => showAuthPane('findId'));
  if (resetPasswordButton) {
    resetPasswordButton.addEventListener('click', () => {
      const currentEmail = document.getElementById('login-email')?.value.trim() || '';
      const resetEmail = document.getElementById('reset-password-email');
      if (resetEmail && currentEmail) resetEmail.value = currentEmail;
      showAuthPane('resetPassword');
    });
  }
  if (findIdBackButton) findIdBackButton.addEventListener('click', () => showAuthPane('login'));
  if (resetPasswordBackButton) resetPasswordBackButton.addEventListener('click', () => showAuthPane('login'));
  roleInputs.forEach((input) => input.addEventListener('change', syncBusinessNumberField));
  if (gymNameInput) {
    gymNameInput.addEventListener('input', () => {
      resetBusinessChecks();
    });
  }
  if (businessNumberInput) {
    businessNumberInput.addEventListener('input', () => {
      businessNumberInput.value = formatBusinessNumber(businessNumberInput.value);
      resetBusinessChecks();
    });
  }
  if (businessStartDateInput) {
    businessStartDateInput.addEventListener('input', () => {
      businessStartDateInput.value = formatBusinessStartDate(businessStartDateInput.value);
      resetBusinessChecks();
    });
  }
  if (businessOwnerNameInput) {
    businessOwnerNameInput.addEventListener('input', () => {
      resetBusinessChecks();
    });
  }
  if (businessValidateButton) {
    businessValidateButton.addEventListener('click', async () => {
      clearAuthError();
      resetBusinessChecks();
      const { businessNumber, businessStartDate, businessOwnerName, gymName } = getCurrentBusinessPayload();
      if (!gymName) {
        setBusinessResult(businessValidateResult, '상호명을 입력해주세요.', 'error');
        return;
      }
      if (businessNumber.length !== 10) {
        setBusinessResult(businessValidateResult, '사업자등록번호 10자리를 입력해주세요.', 'error');
        return;
      }
      if (!businessOwnerName) {
        setBusinessResult(businessValidateResult, '대표자명을 입력해주세요.', 'error');
        return;
      }
      if (businessStartDate.length !== 8) {
        setBusinessResult(businessValidateResult, '개업일자 8자리를 입력해주세요. 예: 20200101', 'error');
        return;
      }

      businessValidateButton.disabled = true;
      businessValidateButton.textContent = '확인 중...';
      setBusinessResult(businessValidateResult, '사업자 진위확인 중입니다.', '');
      await waitForPaint();
      try {
        const validationInfo = await verifyBusinessInfo({
          businessNumber,
          startDate: businessStartDate,
          ownerName: businessOwnerName,
          businessName: gymName
        });
        businessValidation = {
          businessNumber,
          businessStartDate,
          businessOwnerName,
          valid: validationInfo.valid || '',
          validMsg: validationInfo.valid_msg || '',
          isBypassed: validationInfo.isBypassed || false
        };

        setBusinessResult(businessValidateResult, '진위확인 완료. 계속사업자 상태조회 중입니다.', '');
        await waitForPaint();
        const statusInfo = await checkBusinessStatus(businessNumber);
        businessStatusCheck = {
          businessNumber,
          status: statusInfo.b_stt || '',
          statusCode: statusInfo.b_stt_cd || '',
          taxType: statusInfo.tax_type || '',
          isBypassed: statusInfo.isBypassed || false
        };
        
        if (validationInfo.isBypassed || statusInfo.isBypassed) {
          setBusinessResult(businessValidateResult, '국세청 시스템 장애로 인증이 지연되어 우선 승인되었습니다. (추후 인증 필요)', 'success');
        } else {
          setBusinessResult(businessValidateResult, '사업자 정보가 일치하고 계속사업자로 확인되었습니다.', 'success');
        }
      } catch (err) {
        businessStatusCheck = {
          businessNumber,
          status: '조회 실패',
          statusCode: '00',
          taxType: '조회 실패'
        };
        businessValidation = {
          businessNumber,
          businessStartDate,
          businessOwnerName,
          valid: '00',
          validMsg: err.message || '조회 실패'
        };
        setBusinessResult(businessValidateResult, `조회에 실패했습니다 (${err.message || '정보 불일치'}). 조회 실패 시에도 가입은 가능합니다.`, 'error');
      } finally {
        businessValidateButton.disabled = false;
        businessValidateButton.textContent = '사업자 확인';
      }
    });
  }
  
  const reverifyBizNumInput = document.getElementById('reverify-biz-number');
  if (reverifyBizNumInput) reverifyBizNumInput.addEventListener('input', () => reverifyBizNumInput.value = formatBusinessNumber(reverifyBizNumInput.value));
  
  const reverifyStartDateInput = document.getElementById('reverify-start-date');
  if (reverifyStartDateInput) reverifyStartDateInput.addEventListener('input', () => reverifyStartDateInput.value = formatBusinessStartDate(reverifyStartDateInput.value));
  
  const btnReverifySubmit = document.getElementById('btn-reverify-submit');
  if (btnReverifySubmit) {
    btnReverifySubmit.addEventListener('click', async () => {
      const gymName = document.getElementById('reverify-gym-name')?.value.trim();
      const bizNumberRaw = document.getElementById('reverify-biz-number')?.value.trim();
      const ownerName = document.getElementById('reverify-owner-name')?.value.trim();
      const startDateRaw = document.getElementById('reverify-start-date')?.value.trim();
      const resultDiv = document.getElementById('reverify-result');
      
      const bizNumber = getBusinessNumberDigits(bizNumberRaw);
      const startDate = getBusinessDateDigits(startDateRaw);
      
      if (!gymName || bizNumber.length !== 10 || !ownerName || startDate.length !== 8) {
        if (resultDiv) { resultDiv.textContent = '모든 정보를 올바르게 입력해주세요.'; resultDiv.style.color = 'var(--red)'; }
        return;
      }
      
      btnReverifySubmit.disabled = true;
      btnReverifySubmit.textContent = '인증 중...';
      if (resultDiv) { resultDiv.textContent = '사업자등록정보 진위확인 API로 인증 중입니다...'; resultDiv.style.color = 'var(--blue)'; }
      
      try {
        const validInfo = await verifyBusinessInfo({ businessNumber: bizNumber, startDate, ownerName, businessName: gymName });
        if (validInfo.isBypassed) throw new Error('국세청 시스템 응답 지연 (잠시 후 다시 시도해주세요)');
        
        if (state.currentUser && state.currentUser.uid) {
          await db.collection('users').doc(state.currentUser.uid).update({
            gym_name: gymName,
            business_number: bizNumber,
            business_start_date: startDate,
            business_owner_name: ownerName,
            bizStatus: 'verified',
            business_status: '진위확인 완료',
            business_status_code: '01',
            business_valid: validInfo.valid || '00',
            business_valid_msg: validInfo.valid_msg || '조회 안됨',
            business_verified_at: firebase.firestore.FieldValue.serverTimestamp()
          });
          
          Object.assign(state.currentUser, {
            gym_name: gymName,
            business_number: bizNumber,
            business_start_date: startDate,
            business_owner_name: ownerName,
            bizStatus: 'verified',
            business_status: '진위확인 완료',
            business_status_code: '01',
            business_valid: validInfo.valid || '00',
            business_valid_msg: validInfo.valid_msg || '조회 안됨'
          });
          
          const bizBadge = document.getElementById('auth-biz-badge');
          if (bizBadge) {
            bizBadge.style.display = 'inline-block';
          }

          document.getElementById('dialog-biz-reverify').close();
          showToast('인증이 완료되었습니다.', 'success');
        }
      } catch (err) {
        if (resultDiv) { resultDiv.textContent = err.message || '인증에 실패했습니다. 정보를 다시 확인해주세요.'; resultDiv.style.color = 'var(--red)'; }
      } finally {
        btnReverifySubmit.disabled = false;
        btnReverifySubmit.textContent = '인증';
      }
    });
  }
  if (agreeAllInput) {
    agreeAllInput.addEventListener('change', () => {
      agreementInputs.forEach((input) => {
        input.checked = agreeAllInput.checked;
      });
      syncAgreementAllState();
    });
  }
  agreementInputs.forEach((input) => {
    input.addEventListener('change', syncAgreementAllState);
  });
  roleInputs.forEach((input) => input.addEventListener('change', () => {
    syncBusinessNumberField();
    updateTermsPanel();
  }));
  syncAgreementAllState();

  // ─── 약관 데이터 획득 공통 헬퍼 (Firestore 우선, 실패 시 서버 파일/하드코딩 대비책) ──────────────────
  async function getTermsData(termsType) {
    const fallbacks = {
      gym: {
        file: 'gym-terms-20260704.txt',
        text: `관장회원 이용약관 (시행일: 2026년 07월 04일)\n\n제1조 목적\n본 약관은 태권커리어(이하 "회사")이 운영하는 태권도 전문 구인·구직 플랫폼 및 관련 제반 서비스를 관장회원이 이용함에 있어 회사와 관장회원 간의 이용조건 및 절차, 권리·의무 및 책임사항, 기타 필요한 사항을 규정함을 목적으로 합니다.`
      },
      instructor: {
        file: 'instructor-terms-20260704.txt',
        text: `사범회원 이용약관 (시행일: 2026년 07월 04일)\n\n제1조 목적\n본 약관은 태권커리어(이하 "회사")이 운영하는 태권도 전문 구인·구직 플랫폼 및 관련 제반 서비스를 사범회원이 이용함에 있어 회사와 사범회원 간의 이용조건 및 절차, 권리·의무 및 책임사항, 기타 필요한 사항을 규정함을 목적으로 합니다.`
      },
      paid: {
        file: 'paid-terms-20260704.txt',
        text: `유료서비스 이용약관 (시행일: 2026년 07월 04일)\n\n제1조 목적\n본 약관은 태권커리어(이하 “회사”)이 운영하는 태권도 전문 구인·구직 플랫폼에서 관장회원이 이용하는 유료서비스의 이용조건, 결제, 이용기간, 환불, 청약철회 제한, 이용제한 및 기타 필요한 사항을 규정함을 목적으로 합니다.`
      },
      privacy: {
        file: 'privacy-policy-20260708.txt',
        text: `태권커리어 개인정보처리방침\n\n시행일: 2026년 07월 08일`
      }
    };
    
    const fb = fallbacks[termsType] || fallbacks.instructor;
    const getFallbackTitle = () => termsType === 'gym'
      ? '관장회원 이용약관'
      : termsType === 'instructor'
      ? '사범회원 이용약관'
      : termsType === 'paid'
      ? '유료서비스 이용약관'
      : '개인정보처리방침';
    const getFallbackDate = () => termsType === 'privacy' ? '2026년 07월 08일' : '2026년 07월 04일';
    const loadStaticTerms = async () => {
      const response = await fetch(`/legal/${fb.file}`);
      if (!response.ok) return null;
      const text = await response.text();
      return {
        title: getFallbackTitle(),
        effectiveDate: getFallbackDate(),
        content: text
      };
    };

    if (termsType === 'privacy') {
      try {
        const staticTerms = await loadStaticTerms();
        if (staticTerms) return staticTerms;
      } catch (err) {
        console.warn('정적 개인정보처리방침 로드 실패, Firestore를 확인합니다:', err);
      }
    }
    
    try {
      if (typeof db !== 'undefined' && db) {
        const doc = await db.collection('terms').doc(termsType).get();
        if (doc.exists) {
          const data = doc.data();
          if (data && data.content) {
            return {
              title: data.title || '',
              effectiveDate: data.effectiveDate || '',
              content: data.content
            };
          }
        }
      }
    } catch (e) {
      console.warn(`Firestore에서 약관 [${termsType}] 로드 실패:`, e);
    }
    
    try {
      const staticTerms = await loadStaticTerms();
      if (staticTerms) return staticTerms;
    } catch (err) {
      console.warn(`정적 파일 fetch 실패 [${fb.file}]:`, err);
    }
    
    return {
      title: getFallbackTitle(),
      effectiveDate: getFallbackDate(),
      content: fb.text
    };
  }

  // 회원가입용 약관 패널 내용 갱신
  async function updateTermsPanel() {
    const role = document.querySelector('input[name="user-role"]:checked')?.value || 'instructor';
    const termsPanelContent = document.getElementById('terms-panel-content');
    if (!termsPanelContent) return;

    termsPanelContent.textContent = '약관을 불러오는 중입니다...';
    const termsData = await getTermsData(role);
    termsPanelContent.textContent = termsData.content;
  }

  // 초기 1회 로드 호출
  updateTermsPanel();

  // 약관 내용보기 및 확인하고 동의하기 리스너 바인딩
  document.querySelectorAll('.agreement-view-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.target;
      const panel = document.getElementById(targetId);
      if (!panel) return;
      
      const isOpen = panel.classList.contains('open') || panel.style.maxHeight === '200px' || (panel.style.maxHeight && panel.style.maxHeight !== '0px');
      
      // 다른 열린 패널 닫기 (회원가입창 내)
      document.querySelectorAll('.agreement-panel.open').forEach((p) => {
        if (p !== panel && p.id !== 'pay-terms-panel') { // 결제 약관은 독립적
          p.classList.remove('open');
          p.setAttribute('aria-hidden', 'true');
          const relBtn = document.querySelector(`.agreement-view-btn[data-target="${p.id}"]`);
          if (relBtn) relBtn.setAttribute('aria-expanded', 'false');
        }
      });
      
      // 클릭한 패널 토글
      if (isOpen) {
        panel.classList.remove('open');
        panel.setAttribute('aria-hidden', 'true');
        btn.setAttribute('aria-expanded', 'false');
        if (targetId === 'pay-terms-panel') {
          panel.style.maxHeight = '0';
        }
      } else {
        panel.classList.add('open');
        panel.setAttribute('aria-hidden', 'false');
        btn.setAttribute('aria-expanded', 'true');
        if (targetId === 'pay-terms-panel') {
          panel.style.maxHeight = '200px';
        }
      }
    });
  });

  // 약관 하단의 '확인하고 동의하기' 버튼 리스너 바인딩
  document.querySelectorAll('.agreement-panel-agree-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const checkboxId = btn.dataset.checkbox;
      const panelId = btn.dataset.panel;
      
      const checkbox = document.getElementById(checkboxId);
      if (checkbox) {
        checkbox.checked = true;
        // 회원가입 동의 체크박스일 경우 전체동의 체크여부 재계산
        if (checkboxId.startsWith('reg-')) {
          syncAgreementAllState();
        }
      }
      
      const panel = document.getElementById(panelId);
      if (panel) {
        panel.classList.remove('open');
        panel.setAttribute('aria-hidden', 'true');
        if (panelId === 'pay-terms-panel') {
          panel.style.maxHeight = '0';
        }
        
        const relBtn = document.querySelector(`.agreement-view-btn[data-target="${panelId}"]`);
        if (relBtn) relBtn.setAttribute('aria-expanded', 'false');
      }
    });
  });
  // ─── 로그인 폼 제출 (Firebase Auth) ─────────────────────────────────────────
  formLogin.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAuthError();
    const email    = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const submitBtn = formLogin.querySelector('button[type="submit"]');
    submitBtn.textContent = '로그인 중...';
    submitBtn.disabled = true;

    if (!auth) {
      showAuthError('파이어베이스 설정이 완료되지 않았습니다. firebase-config.js를 확인해주세요.');
      submitBtn.textContent = '로그인하기'; submitBtn.disabled = false; return;
    }
    try {
      await auth.signInWithEmailAndPassword(email, password);
      dialogs.auth.close();
      formLogin.reset();
    } catch (err) {
      const msg = err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found'
        ? '이메일 또는 비밀번호가 올바르지 않습니다.'
        : err.code === 'auth/too-many-requests' ? '로그인 시도 횟수를 초과했습니다. 잠시 후 다시 시도하세요.'
        : '로그인에 실패했습니다. (' + err.code + ')';
      showAuthError(msg);
    } finally {
      submitBtn.textContent = '로그인하기'; submitBtn.disabled = false;
    }
  });

  if (formFindId) {
    formFindId.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearAuthError();
      setAuthResult(findIdResult, '', '');
      const name = document.getElementById('find-id-name').value.trim();
      const type = document.getElementById('find-id-type').value;
      const submitBtn = formFindId.querySelector('button[type="submit"]');
      submitBtn.textContent = '조회 중...';
      submitBtn.disabled = true;

      if (!db) {
        showAuthError('파이어베이스 설정이 완료되지 않았습니다.');
        submitBtn.textContent = '아이디 찾기'; submitBtn.disabled = false; return;
      }

      try {
        const snap = await db.collection('account_lookup')
          .where('name_key', '==', normalizeAccountKey(name))
          .where('type', '==', type)
          .limit(5)
          .get();

        if (snap.empty) {
          setAuthResult(findIdResult, '일치하는 계정을 찾지 못했습니다. 가입 형태와 이름을 확인해주세요.', 'error');
          return;
        }

        const emails = snap.docs
          .map((doc) => doc.data().masked_email)
          .filter(Boolean);
        setAuthResult(findIdResult, `가입 아이디: ${emails.join(', ')}`, 'success');
      } catch (err) {
        setAuthResult(findIdResult, '아이디 찾기에 실패했습니다. 잠시 후 다시 시도해주세요.', 'error');
      } finally {
        submitBtn.textContent = '아이디 찾기';
        submitBtn.disabled = false;
      }
    });
  }

  if (formResetPassword) {
    formResetPassword.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearAuthError();
      setAuthResult(resetPasswordResult, '', '');
      const email = document.getElementById('reset-password-email').value.trim();
      const submitBtn = formResetPassword.querySelector('button[type="submit"]');
      submitBtn.textContent = '발송 중...';
      submitBtn.disabled = true;

      if (!auth) {
        showAuthError('파이어베이스 설정이 완료되지 않았습니다. firebase-config.js를 확인해주세요.');
        submitBtn.textContent = '재설정 메일 보내기'; submitBtn.disabled = false; return;
      }

      try {
        await auth.sendPasswordResetEmail(email);
        setAuthResult(resetPasswordResult, '비밀번호 재설정 메일을 발송했습니다. 메일함을 확인해주세요.', 'success');
      } catch (err) {
        const msg = err.code === 'auth/invalid-email'
          ? '이메일 형식이 올바르지 않습니다.'
          : err.code === 'auth/user-not-found'
            ? '해당 이메일로 가입된 계정을 찾지 못했습니다.'
            : '비밀번호 재설정 메일 발송에 실패했습니다. (' + err.code + ')';
        setAuthResult(resetPasswordResult, msg, 'error');
      } finally {
        submitBtn.textContent = '재설정 메일 보내기';
        submitBtn.disabled = false;
      }
    });
  }

  // ─── 회원가입 폼 제출 (Firebase Auth + Firestore) ─────────────────────────────
  formRegister.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAuthError();
    const name     = document.getElementById('reg-name').value.trim();
    const email    = document.getElementById('reg-email').value.trim();
    const phone    = document.getElementById('reg-phone') ? document.getElementById('reg-phone').value.trim() : '';
    const password = document.getElementById('reg-password').value;
    const type     = document.querySelector('input[name="user-role"]:checked')?.value || 'instructor';
    const agreeAge = !!agreeAgeInput?.checked;
    const agreeTerms = !!agreeTermsInput?.checked;
    const agreePersonalized = !!agreePersonalizedInput?.checked;
    const agreeMarketing = !!agreeMarketingInput?.checked;
    const { businessNumber, businessStartDate, businessOwnerName, gymName } = getCurrentBusinessPayload();
    const submitBtn = formRegister.querySelector('button[type="submit"]');
    submitBtn.textContent = '가입 중...';
    submitBtn.disabled = true;

    if (!auth || !db) {
      showAuthError('파이어베이스 설정이 완료되지 않았습니다.');
      submitBtn.textContent = '회원가입하기'; submitBtn.disabled = false; return;
    }
    try {
      const phoneRegex = /^010-\d{3,4}-\d{4}$/;
      if (!phoneRegex.test(phone)) {
        showAuthError('올바른 휴대폰 번호 형식을 입력해주세요. (예: 010-1234-5678)');
        submitBtn.textContent = '회원가입하기'; submitBtn.disabled = false;
        return;
      }
      if (!agreeAge) {
        showAuthError('[필수] 만 15세 이상입니다 항목에 동의해주세요.');
        submitBtn.textContent = '회원가입하기'; submitBtn.disabled = false;
        return;
      }
      if (!agreeTerms) {
        showAuthError('[필수] 이용약관에 동의해주세요.');
        submitBtn.textContent = '회원가입하기'; submitBtn.disabled = false;
        return;
      }

      if (type === 'gym') {
        if (!gymName) {
          showAuthError('상호명을 입력해주세요.');
          submitBtn.textContent = '회원가입하기'; submitBtn.disabled = false;
          return;
        }
        if (businessNumber.length !== 10) {
          showAuthError('사업자등록번호 10자리를 입력해주세요.');
          submitBtn.textContent = '회원가입하기'; submitBtn.disabled = false;
          return;
        }
        if (businessStartDate.length !== 8) {
          showAuthError('개업일자 8자리를 입력해주세요. 예: 20200101');
          submitBtn.textContent = '회원가입하기'; submitBtn.disabled = false;
          return;
        }
        if (!businessOwnerName) {
          showAuthError('대표자명을 입력해주세요.');
          submitBtn.textContent = '회원가입하기'; submitBtn.disabled = false;
          return;
        }
      }

      submitBtn.textContent = '가입 중...';
      savePendingSignupProfile({
        name,
        email,
        phone,
        type,
        gymName,
        businessNumber,
        businessStartDate,
        businessOwnerName,
        agreeAge,
        agreeTerms,
        agreePersonalized,
        agreeMarketing,
        businessStatus: businessStatusCheck?.status || '미확인',
        businessStatusCode: businessStatusCheck?.statusCode || '00',
        businessValid: businessValidation?.valid || '00',
        businessValidMsg: businessValidation?.validMsg || '조회 안됨'
      });

      // 1. Firebase Auth 계정 생성
      const cred = await auth.createUserWithEmailAndPassword(email, password);
      const uid  = cred.user.uid;

      // 2. Firestore users 콜렉션에 추가 정보 저장
      const userData = {
        name,
        email,
        phone,
        type,                        // 'gym' | 'instructor'
        agree_age_over_15: agreeAge,
        agree_terms: agreeTerms,
        agree_personalized_ads: agreePersonalized,
        agree_marketing: agreeMarketing,
        agreed_at: firebase.firestore.FieldValue.serverTimestamp(),
        created_at: firebase.firestore.FieldValue.serverTimestamp()
      };

      if (type === 'gym') {
        userData.gym_name = gymName;
        userData.business_number = businessNumber;
        userData.business_start_date = businessStartDate;
        userData.business_owner_name = businessOwnerName;
        userData.business_status = businessStatusCheck?.status || '미확인';
        userData.business_status_code = businessStatusCheck?.statusCode || '00';
        userData.business_valid = businessValidation?.valid || '00';
        userData.business_valid_msg = businessValidation?.validMsg || '조회 안됨';
        userData.business_verified_at = firebase.firestore.FieldValue.serverTimestamp();
        
        if (businessValidation?.isBypassed || businessStatusCheck?.isBypassed) {
          userData.bizStatus = 'pending';
        } else {
          userData.bizStatus = 'verified';
        }
        
        userData.resumePassCount = 0;
        userData.unlockedResumes = [];
        userData.testPaymentEnabled = false;
      }

      await db.collection('users').doc(uid).set(userData);
      await db.collection('account_lookup').doc(uid).set({
        uid,
        name,
        name_key: normalizeAccountKey(name),
        type,
        masked_email: maskEmail(email),
        created_at: firebase.firestore.FieldValue.serverTimestamp()
      });
      
      dialogs.auth.close();
      formRegister.reset();
      resetBusinessChecks();
      syncBusinessNumberField();
      syncAgreementAllState();
      clearPendingSignupProfile();
    } catch (err) {
      const msg = getRegisterErrorMessage(err);
      showAuthError(msg);
      document.getElementById('auth-register-submit-error-msg')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } finally {
      submitBtn.textContent = '회원가입하기'; submitBtn.disabled = false;
    }
  });

  // ─── 로그아웃 ─────────────────────────────────────────────────────────────
  const logoutBtn = document.getElementById('btn-logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      if (auth) await auth.signOut();
    });
  }

  function openPostJobDialog() {
    const currentUser = auth ? auth.currentUser : null;
    if (!currentUser) {
      alert('채용공고 등록은 로그인 후 이용하실 수 있습니다.');
      if (dialogs.auth) {
        document.getElementById('tab-login')?.click();
        dialogs.auth.showModal();
      }
      return;
    }
    resetJobDialogMode();
    formPostJob?.reset();
    state.selectedJobRegions = [];
    state.regionPickers.job?.clear();
    if (dialogs.postJob) dialogs.postJob.showModal();
  }

  function openPostResumeDialog() {
    const currentUser = auth ? auth.currentUser : null;
    if (!currentUser) {
      alert('이력서 등록은 로그인 후 이용하실 수 있습니다.');
      if (dialogs.auth) {
        document.getElementById('tab-login')?.click();
        dialogs.auth.showModal();
      }
      return;
    }
    resetResumeDialogMode();
    formPostResume?.reset();
    state.selectedResumeRegions = [];
    state.regionPickers.resume?.clear();
    if (dialogs.postResume) dialogs.postResume.showModal();
  }

  // Open Job Post dialog
  const postJobTriggers = [
    document.getElementById('hero-btn-post-job'),
    document.getElementById('board-btn-post-job')
  ];
  
  postJobTriggers.forEach(trigger => {
    if (trigger) {
      trigger.addEventListener('click', openPostJobDialog);
    }
  });

  // Open Resume Post dialog
  const postResumeTriggers = [
    document.getElementById('hero-btn-post-resume'),
    document.getElementById('board-btn-post-resume')
  ];
  
  postResumeTriggers.forEach(trigger => {
    if (trigger) {
      trigger.addEventListener('click', openPostResumeDialog);
    }
  });

  const roleFloatingTrigger = document.getElementById('role-floating-cta-trigger');
  if (roleFloatingTrigger && roleFloatingCTA) {
    roleFloatingTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      // 로그인 회원: 플로팅 버튼 클릭 시 바로 등록 다이얼로그 오픈 (퀵메뉴 펼침 없음)
      const directAction = roleFloatingTrigger.dataset.directAction;
      if (directAction === 'job') {
        openPostJobDialog();
        roleFloatingCTA.classList.remove('is-open');
        return;
      }
      if (directAction === 'resume') {
        openPostResumeDialog();
        roleFloatingCTA.classList.remove('is-open');
        return;
      }
      // 비회원: 퀵메뉴 펼치기
      roleFloatingCTA.classList.toggle('is-open');
    });
  }

  // Click outside to close the menu
  document.addEventListener('click', () => {
    if (roleFloatingCTA && roleFloatingCTA.classList.contains('is-open')) {
      roleFloatingCTA.classList.remove('is-open');
    }
  });

  const btnFloatingRoleAction = document.getElementById('btn-floating-role-action');
  if (btnFloatingRoleAction) {
    btnFloatingRoleAction.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = btnFloatingRoleAction.dataset.action;
      if (action === 'resume') {
        openPostResumeDialog();
      } else if (action === 'job') {
        openPostJobDialog();
      }
      roleFloatingCTA.classList.remove('is-open');
    });
  }

  const btnFloatingCommunityWrite = document.getElementById('btn-floating-community-write');
  if (btnFloatingCommunityWrite) {
    btnFloatingCommunityWrite.addEventListener('click', (e) => {
      e.stopPropagation();
      const currentUser = auth ? auth.currentUser : null;
      if (!currentUser) {
        alert('글쓰기 기능은 로그인 후 이용하실 수 있습니다. 로그인 팝업을 열어드립니다.');
        if (dialogs.auth) {
          document.getElementById('tab-login')?.click();
          dialogs.auth.showModal();
        }
        return;
      }
      if (dialogs.postCommunity) {
        dialogs.postCommunity.showModal();
      }
      roleFloatingCTA.classList.remove('is-open');
    });
  }

  // 비회원 플로팅 버튼: 채용공고 등록 / 이력서 등록 → 클릭 시 로그인 팝업 유도
  const openLoginFromGuestFab = (e) => {
    e.stopPropagation();
    if (dialogs.auth) {
      showAuthPane('login');
      dialogs.auth.showModal();
    }
    roleFloatingCTA.classList.remove('is-open');
  };

  const btnFloatingGuestJob = document.getElementById('btn-floating-guest-job');
  if (btnFloatingGuestJob) {
    btnFloatingGuestJob.addEventListener('click', openLoginFromGuestFab);
  }

  const btnFloatingGuestResume = document.getElementById('btn-floating-guest-resume');
  if (btnFloatingGuestResume) {
    btnFloatingGuestResume.addEventListener('click', openLoginFromGuestFab);
  }

  const btnFloatingCustomerService = document.getElementById('btn-floating-customer-service');
  if (btnFloatingCustomerService) {
    btnFloatingCustomerService.addEventListener('click', (e) => {
      e.stopPropagation();
      window.history.pushState({}, '', '/Customer_Service');
      handleRoute();
      roleFloatingCTA.classList.remove('is-open');
    });
  }


  // ==========================================================================
  // 8. New Submissions (Forms inside dialogs)
  // ==========================================================================
  
  // Submit Job Post
  const formPostJob = document.getElementById('form-post-job');
  if (formPostJob) {
    formPostJob.addEventListener('submit', async (e) => {
      e.preventDefault();

      const currentUser = auth ? auth.currentUser : null;
      if (!currentUser) {
        alert('채용공고 등록은 로그인 후 이용하실 수 있습니다. 로그인 팝업을 열어드립니다.');
        if (dialogs.postJob) dialogs.postJob.close();
        if (dialogs.auth) {
          document.getElementById('tab-login')?.click();
          dialogs.auth.showModal();
        }
        return;
      }
      const userId = currentUser.uid;
      
      const gymName = document.getElementById('job-gym-name').value;
      const title = document.getElementById('job-title').value;
      const region = document.getElementById('job-region').value;
      
      const selectedPositions = Array.from(document.querySelectorAll('input[name="job-position"]:checked')).map(el => el.value);
      if (!selectedPositions.length) {
        alert('직무를 1개 이상 선택해주세요.');
        return;
      }
      const position = selectedPositions.join(', ');

      const salary = document.getElementById('job-salary').value;

      const selectedTypes = Array.from(document.querySelectorAll('input[name="job-type"]:checked')).map(el => el.value);
      if (!selectedTypes.length) {
        alert('근무형태를 1개 이상 선택해주세요.');
        return;
      }
      const type = selectedTypes.join(', ');

      const exp = document.getElementById('job-exp').value;
      const hotness = 'NEW';
      const desc = document.getElementById('job-desc').value;
      const address = document.getElementById('job-address').value.trim();
      const preferred = document.getElementById('job-preferred').value.trim();

      if (!state.selectedJobRegions || !state.selectedJobRegions.length) {
        alert('근무 지역을 1개 이상 선택해주세요.');
        return;
      }

      const newJobData = {
        user_id: userId,
        gymName,
        title: `${title} (${position})`,
        location: region,
        address,
        preferred: preferred || '-',
        salary,
        type,
        career: exp,
        position,
        status: 'active',
        content: desc,
        created_at: firebase.firestore.FieldValue.serverTimestamp()
      };

      if (db) {
        try {
          if (state.editingJobId) {
            const jobId = state.editingJobId;
            const job = state.jobsList.find((item) => item.id === jobId);
            if (!job || job.userId !== userId) {
              alert('수정할 수 있는 채용공고를 찾을 수 없습니다.');
              return;
            }

            const updatedJobData = {
              user_id: userId,
              gymName,
              title: `${title} (${position})`,
              location: region,
              address,
              preferred: preferred || '-',
              salary,
              type,
              career: exp,
              position,
              status: 'active',
              content: desc
            };

            await db.collection('jobs').doc(jobId).update(updatedJobData);

            const updatedJob = {
              ...job,
              gymName,
              title: `${title} (${position})`,
              region,
              address: address || `${region} 일대 태권도장`,
              preferred: preferred || '-',
              salary,
              type,
              exp,
              position,
              desc
            };
            state.jobsList = state.jobsList.map((item) => item.id === jobId ? updatedJob : item);
            state.applicationsList = state.applicationsList.map((app) => app.jobId === jobId ? { ...app, job: updatedJob } : app);

            dialogs.postJob.close();
            formPostJob.reset();
            const jobMapEl = document.getElementById('job-map');
            if (jobMapEl) jobMapEl.style.display = 'none';
            state.selectedJobRegions = [];
            state.regionPickers.job?.clear();
            resetJobDialogMode();

            alert('채용공고가 수정되었습니다.');
            renderHomeJobs();
            renderBoardJobs();
            renderMyApplicationsView();
            return;
          }

          const docRef = await db.collection('jobs').add(newJobData);
          const docId = docRef.id;

          const newJob = {
            id: docId,
            gymName,
            title: `${title} (${position})`,
            region,
            address: address || `${region} 일대 태권도장`,
            preferred: preferred || '-',
            salary,
            type,
            exp,
            position,
            hotness,
            desc,
            pinned: false,
            views: 0,
            viewedUsers: [],
            userId: userId,
            userName: state.currentUser ? (state.currentUser.name || '관장님') : '관장님',
            userEmail: state.currentUser ? (state.currentUser.email || '이메일 정보 없음') : '이메일 정보 없음'
          };

          // Add to front of database
          state.jobsList.unshift(newJob);

          // Close dialog & reset form
          dialogs.postJob.close();
          formPostJob.reset();
          const jobMapEl = document.getElementById('job-map');
          if (jobMapEl) jobMapEl.style.display = 'none';
          state.selectedJobRegions = [];
          state.regionPickers.job?.clear();

          // Alert & refresh UI lists
          alert('채용공고가 성공적으로 등록되었습니다!');
          
          // Update statistics
          updateStats();
          
          // Re-render
          renderHomeJobs();
          renderBoardJobs();
        } catch (err) {
          console.error('채용공고 Firestore 저장 에러:', err);
          alert('채용공고 저장에 실패했습니다. 권한이 없거나 로그인 세션이 만료되었을 수 있습니다.');
        }
      }
    });
  }

  // Submit Resume Post
  const formPostResume = document.getElementById('form-post-resume');
  if (formPostResume) {
    formPostResume.addEventListener('submit', async (e) => {
      e.preventDefault();

      const currentUser = auth ? auth.currentUser : null;
      if (!currentUser) {
        alert('이력서 등록은 로그인 후 이용하실 수 있습니다. 로그인 팝업을 열어드립니다.');
        if (dialogs.postResume) dialogs.postResume.close();
        if (dialogs.auth) {
          document.getElementById('tab-login')?.click();
          dialogs.auth.showModal();
        }
        return;
      }
      const userId = currentUser.uid;

      const name = document.getElementById('res-name').value;
      const gender = document.getElementById('res-gender').value;
      const region = document.getElementById('res-region').value;
      const position = document.getElementById('res-position').value;
      const salary = document.getElementById('res-salary').value;
      const exp = document.getElementById('res-exp').value;
      const dan = document.getElementById('res-dan').value;
      const license = document.getElementById('res-license').value;
      const intro = document.getElementById('res-intro').value;

      if (!state.selectedResumeRegions.length) {
        alert('희망 근무 지역을 1개 이상 선택해주세요.');
        return;
      }

      const userPhone = state.currentUser ? (state.currentUser.phone || '') : '';

      const newTalentData = {
        user_id: userId,
        name,
        gender,
        hope_position: position,
        career: exp,
        hope_area: region,
        hope_salary: salary,
        certificate: `${dan}, ${license}`,
        content: intro,
        phone: userPhone,
        created_at: firebase.firestore.FieldValue.serverTimestamp()
      };

      if (db) {
        try {
          if (state.editingResumeId) {
            const resumeId = state.editingResumeId;
            const resume = state.talentsList.find((item) => item.id === resumeId);
            if (!resume || resume.userId !== userId) {
              alert('수정할 수 있는 이력서를 찾을 수 없습니다.');
              return;
            }
            await freezeApplicationsForResume(resume);

            const updatedResumeData = {
              user_id: userId,
              name,
              gender,
              hope_position: position,
              career: exp,
              hope_area: region,
              hope_salary: salary,
              certificate: `${dan}, ${license}`,
              content: intro,
              phone: userPhone
            };

            await db.collection('resumes').doc(resumeId).update(updatedResumeData);

            const updatedTalent = {
              ...resume,
              name,
              gender,
              role: position,
              exp,
              region,
              salary,
              dan,
              license,
              intro,
              phone: userPhone
            };
            state.talentsList = state.talentsList.map((item) => item.id === resumeId ? updatedTalent : item);

            dialogs.postResume.close();
            formPostResume.reset();
            state.selectedResumeRegions = [];
            state.regionPickers.resume?.clear();
            resetResumeDialogMode();

            alert('이력서가 수정되었습니다.');
            renderHomeTalents();
            renderBoardTalents();
            renderMyApplicationsView();
            return;
          }

          const docRef = await db.collection('resumes').add(newTalentData);
          const docId = docRef.id;

          const newTalent = {
            id: docId,
            name,
            gender,
            role: position,
            exp,
            region,
            salary,
            dan,
            license,
            colorIndex: Math.floor(Math.random() * 5),
            intro,
            phone: userPhone,
            userId
          };

          state.talentsList.unshift(newTalent);
          
          dialogs.postResume.close();
          formPostResume.reset();
          state.selectedResumeRegions = [];
          state.regionPickers.resume?.clear();

          alert('이력서가 성공적으로 등록되었습니다!');
          
          updateStats();
          
          renderHomeTalents();
          renderBoardTalents();
        } catch (err) {
          console.error('이력서 Firestore 저장 에러:', err);
          alert('이력서 저장에 실패했습니다. 권한이 없거나 로그인 세션이 만료되었을 수 있습니다.');
        }
      }
    });
  }

  // Open Community Post Dialog
  const btnCommunityWrite = document.getElementById('btn-community-write');
  if (btnCommunityWrite) {
    btnCommunityWrite.addEventListener('click', () => {
      const currentUser = auth ? auth.currentUser : null;
      if (!currentUser) {
        alert('글쓰기 기능은 로그인 후 이용하실 수 있습니다. 로그인 팝업을 열어드립니다.');
        if (dialogs.auth) {
          document.getElementById('tab-login')?.click();
          dialogs.auth.showModal();
        }
        return;
      }
      if (dialogs.postCommunity) {
        dialogs.postCommunity.showModal();
      }
    });
  }

  // Submit Community Post
  const formPostCommunity = document.getElementById('form-post-community');
  // 커뮤니티 이미지 선택 상태 관리
  let commSelectedImage = null;
  // 커뮤니티 글 등록 진행 중 플래그 (이미지 업로드 지연 중 재제출 방지)
  let isSubmittingCommunity = false;

  // 이미지 파일 선택 처리 (input[type=file] 변경 이벤트)
  window.handleCommImageSelect = function(event) {
    const file = event.target.files[0];
    if (file) applyCommImageFile(file);
    event.target.value = '';
  };

  // 드래그앤드롭 처리
  window.handleCommImageDrop = function(event) {
    event.preventDefault();
    const drop = document.getElementById('comm-image-drop');
    if (drop) { drop.style.borderColor = '#cbd5e1'; drop.style.background = '#f8fafc'; }
    const file = event.dataTransfer.files[0];
    if (file) applyCommImageFile(file);
  };

  // 이미지를 캔버스로 리사이즈/재인코딩하여 목표 용량 이하로 압축한다.
  // Storage 규칙상 커뮤니티 이미지는 1.1MB 미만이어야 하므로 목표를 950KB로 잡는다.
  function compressCommImage(file) {
    const TARGET = 950 * 1024; // ≈ 0.93MB (서버 제한 1.1MB보다 여유)
    // 원본이 이미 충분히 작고 JPEG면 압축 생략 (불필요한 화질 손실 방지)
    if (file.size <= TARGET && (file.type === 'image/jpeg' || file.type === 'image/jpg')) {
      return Promise.resolve(file);
    }
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('read-fail'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('decode-fail'));
        img.onload = () => {
          const attempts = [
            { maxDim: 1600, quality: 0.82 },
            { maxDim: 1600, quality: 0.7 },
            { maxDim: 1280, quality: 0.72 },
            { maxDim: 1024, quality: 0.7 },
            { maxDim: 900,  quality: 0.65 },
            { maxDim: 800,  quality: 0.55 }
          ];
          const baseName = (file.name || 'image').replace(/\.[^.]+$/, '') + '.jpg';
          const renderBlob = (maxDim, quality) => new Promise((res) => {
            let { width, height } = img;
            if (width > maxDim || height > maxDim) {
              if (width >= height) { height = Math.round(height * maxDim / width); width = maxDim; }
              else { width = Math.round(width * maxDim / height); height = maxDim; }
            }
            const canvas = document.createElement('canvas');
            canvas.width = width; canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#ffffff'; // 투명 PNG의 투명 영역을 흰색으로 채움
            ctx.fillRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0, width, height);
            canvas.toBlob((b) => res(b), 'image/jpeg', quality);
          });
          (async () => {
            let best = null;
            for (const opt of attempts) {
              const blob = await renderBlob(opt.maxDim, opt.quality);
              if (!blob) continue;
              best = blob;
              if (blob.size <= TARGET) break;
            }
            if (!best) { reject(new Error('encode-fail')); return; }
            resolve(new File([best], baseName, { type: 'image/jpeg' }));
          })();
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  // 이미지 파일 검증 → 자동 압축 → 미리보기 설정 (용량 제한 없음, 업로드 전 압축)
  async function applyCommImageFile(file) {
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) {
      alert('JPG, PNG, WebP 형식의 이미지만 첨부 가능합니다.');
      return;
    }

    const placeholder = document.getElementById('comm-image-placeholder');
    const placeholderText = placeholder ? placeholder.querySelector('p') : null;
    const prevText = placeholderText ? placeholderText.textContent : '';
    if (placeholderText) placeholderText.textContent = '이미지 압축 중…';

    let finalFile;
    try {
      finalFile = await compressCommImage(file);
    } catch (err) {
      console.warn('이미지 압축 실패:', err);
      if (placeholderText) placeholderText.textContent = prevText;
      alert('이미지를 처리하지 못했습니다. 다른 이미지를 첨부해주세요.');
      return;
    }
    if (placeholderText) placeholderText.textContent = prevText;

    commSelectedImage = finalFile;

    // 미리보기
    const reader = new FileReader();
    reader.onload = (e) => {
      const previewDiv = document.getElementById('comm-image-preview');
      const previewImg = document.getElementById('comm-image-preview-img');
      const infoDiv = document.getElementById('comm-image-info');
      const nameEl = document.getElementById('comm-image-name');

      if (previewImg) previewImg.src = e.target.result;
      if (previewDiv) previewDiv.style.display = 'block';
      if (placeholder) placeholder.style.display = 'none';
      if (infoDiv) { infoDiv.style.display = 'flex'; }
      if (nameEl) {
        const origKB = (file.size / 1024).toFixed(0);
        const compKB = (finalFile.size / 1024).toFixed(0);
        nameEl.textContent = (file.name || 'image')
          + (finalFile.size < file.size ? ` (${origKB}KB → ${compKB}KB 압축됨)` : ` (${compKB}KB)`);
      }
    };
    reader.readAsDataURL(finalFile);
  }

  // 이미지 제거
  window.clearCommImage = function() {
    commSelectedImage = null;
    const previewDiv = document.getElementById('comm-image-preview');
    const previewImg = document.getElementById('comm-image-preview-img');
    const placeholder = document.getElementById('comm-image-placeholder');
    const infoDiv = document.getElementById('comm-image-info');
    if (previewDiv) previewDiv.style.display = 'none';
    if (previewImg) previewImg.src = '';
    if (placeholder) placeholder.style.display = 'block';
    if (infoDiv) infoDiv.style.display = 'none';
  };

  if (formPostCommunity) {
    formPostCommunity.addEventListener('submit', async (e) => {
      e.preventDefault();

      // 이미 등록 처리 중이면 중복 제출 차단
      if (isSubmittingCommunity) return;

      const currentUser = auth ? auth.currentUser : null;
      if (!currentUser) {
        alert('글쓰기 기능은 로그인 후 이용하실 수 있습니다.');
        if (dialogs.postCommunity) dialogs.postCommunity.close();
        return;
      }

      const category = document.getElementById('comm-post-category').value;
      const title = document.getElementById('comm-post-title').value.trim();
      const content = document.getElementById('comm-post-content').value.trim();

      if (!title || !content) {
        alert('제목과 내용을 입력해주세요.');
        return;
      }

      const nameEl = document.getElementById('auth-user-name');
      const authorName = (nameEl && nameEl.textContent) ? nameEl.textContent.trim() : (currentUser.email || '익명');

      const dateStr = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
        .replace(/\s/g, '').slice(0, -1); // '2026.06.16' 형식

      // 등록 중 로딩 표시 (버튼 스피너 + 중복 제출 방지)
      const submitBtn = formPostCommunity.querySelector('.btn-submit-dialog');
      const originalBtnHtml = submitBtn ? submitBtn.innerHTML : '';
      const setSubmitting = (on) => {
        if (!submitBtn) return;
        submitBtn.disabled = on;
        submitBtn.innerHTML = on ? '<span class="btn-inline-spinner"></span>등록 중…' : originalBtnHtml;
      };
      isSubmittingCommunity = true;
      setSubmitting(true);

      try {
      // 이미지 업로드 처리 (선택한 경우에만)
      let imageUrl = '';
      if (commSelectedImage) {
        try {
          const storageInst = (typeof firebase !== 'undefined' && firebase.storage) ? firebase.storage() : null;
          if (storageInst) {
            const timestamp = Date.now();
            const safeFileName = commSelectedImage.name.replace(/[^a-zA-Z0-9._-]/g, '_');
            const ref = storageInst.ref(`community/${timestamp}_${safeFileName}`);
            const uploadTask = await ref.put(commSelectedImage);
            imageUrl = await uploadTask.ref.getDownloadURL();
          }
        } catch (uploadErr) {
          console.warn('이미지 업로드 실패 (이미지 제외 등록):', uploadErr);
          imageUrl = '';
        }
      }

      const newPostData = {
        category: category,
        title: title,
        author: authorName,
        author_id: currentUser.uid,
        date: dateStr,
        views: 0,
        content: content,
        imageUrl: imageUrl,
        comments: []
      };

      if (typeof db !== 'undefined' && db) {
        try {
          const postToSave = {
            ...newPostData,
            created_at: firebase.firestore.FieldValue.serverTimestamp()
          };
          const docRef = await db.collection('community').add(postToSave);
          state.communityPosts.unshift({
            id: docRef.id,
            ...newPostData
          });
        } catch (dbErr) {
          console.error("Failed to save post to Firestore", dbErr);
          alert('게시글 등록에 실패했습니다. 다시 시도해주세요.');
          return;
        }
      } else {
        const newPost = {
          id: 'post-' + Date.now(),
          ...newPostData
        };
        state.communityPosts.unshift(newPost);
      }
      
      try {
        localStorage.setItem('taekwondo_community_posts', JSON.stringify(state.communityPosts));
      } catch (err) {
        console.warn("Failed to save posts to localStorage", err);
      }
      
      // 등록 완료 후 폼 초기화 및 모달 닫기
      formPostCommunity.reset();
      clearCommImage();
      commSelectedImage = null;
      if (dialogs.postCommunity) {
        dialogs.postCommunity.close();
      }

      // 작성한 글 작성 후 커뮤니티 갱신 및 자유게시판(free) 로드
      window.location.hash = '#community';
      state.communityCurrentPage = 1;
      setupCommunityTab('free');
      renderHomeCommunityPosts();
      
      alert('게시글이 성공적으로 등록되었습니다.');
      } finally {
        setSubmitting(false);
        isSubmittingCommunity = false;
      }
    });
  }


  // ==========================================================================
  // 9. Details Dialog Fillers
  // ==========================================================================
  
  function openCommunityDetails(post) {
    if (!dialogs.communityDetail) return;

    // Increment views locally
    post.views = (post.views || 0) + 1;

    // Trigger Meta Pixel Track
    if (typeof fbq === 'function') {
      fbq('track', 'ViewContent', {
        content_name: post.title,
        content_category: 'Community',
        content_ids: [post.id],
        content_type: 'product'
      });
    }

    let viewerId = '';
    if (typeof auth !== 'undefined' && auth && auth.currentUser) {
      viewerId = auth.currentUser.uid;
    } else {
      viewerId = localStorage.getItem('taekwondo_client_id');
      if (!viewerId) {
        viewerId = 'client_' + Math.random().toString(36).substring(2, 15);
        localStorage.setItem('taekwondo_client_id', viewerId);
      }
    }

    if (!post.viewed_users) {
      post.viewed_users = [];
    }
    if (!post.viewed_users.includes(viewerId)) {
      post.viewed_users.push(viewerId);
    }

    if (typeof db !== 'undefined' && db && !post.id.startsWith('post-')) {
      try {
        db.collection('community').doc(post.id).update({
          views: firebase.firestore.FieldValue.increment(1),
          viewed_users: firebase.firestore.FieldValue.arrayUnion(viewerId)
        });
      } catch (err) {
        console.warn("Failed to increment views in Firestore", err);
      }
    }

    try {
      localStorage.setItem('taekwondo_community_posts', JSON.stringify(state.communityPosts));
    } catch (err) {
      console.warn("Failed to save posts to localStorage", err);
    }

    const categoryNames = {
      free: '자유게시판',
      knowhow: '도장 운영 노하우',
      news: '태권도 뉴스',
      contest: '대회정보'
    };

    document.getElementById('detail-post-category').textContent = categoryNames[post.category] || '커뮤니티';
    document.getElementById('detail-post-title').textContent = post.title;
    document.getElementById('detail-post-meta').textContent = `작성자: ${post.author} | 작성일: ${post.date}`;
    document.getElementById('detail-post-views').textContent = post.views;

    const imgWrap = document.getElementById('detail-post-image-wrap');
    const imgEl = document.getElementById('detail-post-image');
    if (imgWrap && imgEl) {
      if (post.imageUrl) {
        imgEl.src = post.imageUrl;
        imgWrap.style.display = 'block';
      } else {
        imgEl.src = '';
        imgWrap.style.display = 'none';
      }
    }

    document.getElementById('detail-post-desc').textContent = post.content || '본문 내용이 없습니다.';

    // Bind Comments
    renderPostComments(post);

    // Comment submission handler
    const commentForm = document.getElementById('form-post-comment');
    if (commentForm) {
      const newCommentForm = commentForm.cloneNode(true);
      commentForm.parentNode.replaceChild(newCommentForm, commentForm);
      
      newCommentForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const commentInput = document.getElementById('comment-input');
        if (!commentInput) return;
        const commentContent = commentInput.value.trim();
        if (!commentContent) return;

        const currentUser = auth ? auth.currentUser : null;
        if (!currentUser) {
          alert('댓글은 로그인 후 작성하실 수 있습니다.');
          return;
        }

        const nameEl = document.getElementById('auth-user-name');
        const authorName = (nameEl && nameEl.textContent) ? nameEl.textContent.trim() : (currentUser.email || '익명');

        const dateStr = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
          .replace(/\s/g, '').slice(0, -1);

        const newComment = {
          author: authorName,
          content: commentContent,
          date: dateStr
        };

        if (!post.comments) post.comments = [];
        post.comments.push(newComment);
        
        if (typeof db !== 'undefined' && db && !post.id.startsWith('post-')) {
          try {
            db.collection('community').doc(post.id).update({
              comments: post.comments
            });
          } catch (err) {
            console.error("Failed to add comment in Firestore", err);
          }
        }

        try {
          localStorage.setItem('taekwondo_community_posts', JSON.stringify(state.communityPosts));
        } catch (err) {
          console.warn("Failed to save posts to localStorage", err);
        }
        
        commentInput.value = '';
        renderPostComments(post);
      });
    }

    dialogs.communityDetail.showModal();
  }

  function renderPostComments(post) {
    const listContainer = document.getElementById('detail-post-comments-list');
    const countEl = document.getElementById('detail-post-comments-count');
    if (!listContainer) return;

    listContainer.innerHTML = '';
    const comments = post.comments || [];
    countEl.textContent = comments.length;

    if (comments.length === 0) {
      listContainer.innerHTML = '<div style="font-size: 0.85rem; color: var(--text-muted); text-align: center; padding: 1rem 0;">등록된 댓글이 없습니다. 첫 댓글을 남겨보세요!</div>';
      return;
    }

    comments.forEach(c => {
      const commentRow = document.createElement('div');
      commentRow.style.cssText = 'padding: 0.75rem; background: var(--bg-main); border: 1px solid var(--border-main); border-radius: var(--radius-md); font-size: 0.85rem;';
      commentRow.innerHTML = `
        <div style="display: flex; justify-content: space-between; margin-bottom: 0.4rem; font-weight: 700; color: var(--brand-primary-dark);">
          <span>${c.author}</span>
          <span style="font-size: 0.75rem; color: var(--text-light); font-weight: 400;">${c.date}</span>
        </div>
        <div style="color: var(--text-main); line-height: 1.5; white-space: pre-wrap;">${c.content}</div>
      `;
      listContainer.appendChild(commentRow);
    });
  }

  function openJobDetails(job) {
    if (!dialogs.jobDetail) return;
    
    // Increment views locally first
    job.views = (job.views || 0) + 1;
    
    // Trigger Meta Pixel Track
    if (typeof fbq === 'function') {
      fbq('track', 'ViewContent', {
        content_name: job.title,
        content_category: 'Job',
        content_ids: [job.id],
        content_type: 'product'
      });
    }
    
    const viewsEl = document.getElementById('detail-job-views');
    if (viewsEl) {
      viewsEl.textContent = job.views;
    }
    
    const applyBtn = document.getElementById('btn-apply-job');
    if (applyBtn) {
      applyBtn.dataset.jobId = job.id;
      applyBtn.dataset.jobTitle = job.title;
      applyBtn.dataset.gymName = job.gymName;
      applyBtn.dataset.jobOwnerId = job.userId || '';
    }
    
    document.getElementById('detail-job-gym').textContent = job.gymName;
    document.getElementById('detail-job-type').textContent = job.type;
    document.getElementById('detail-job-title').textContent = job.title;
    document.getElementById('detail-job-region-pos').textContent = `${job.region} | ${job.type}`;
    document.getElementById('detail-job-salary').textContent = job.salary;
    document.getElementById('detail-job-exp').textContent = job.exp;
    document.getElementById('detail-job-preferred').textContent = job.preferred || '-';
    document.getElementById('detail-job-addr').textContent = job.address;
    document.getElementById('detail-job-desc').textContent = job.desc;

    // 담당자(등록자) 이름 및 이메일 바인딩
    const managerNameEl = document.getElementById('detail-job-manager-name');
    const managerEmailEl = document.getElementById('detail-job-manager-email');
    if (managerNameEl) managerNameEl.textContent = job.userName || '관장님';
    if (managerEmailEl) managerEmailEl.textContent = job.userEmail || '이메일 정보 없음';

    dialogs.jobDetail.showModal();

    const detailMapAddress = job.address || job.region || '';
    if (detailMapAddress) {
      setTimeout(() => {
        updateJobMapByAddress(detailMapAddress, {
          mapId: 'detail-job-map',
          autoSelectRegion: false
        });
      }, 80);
    } else {
      setJobMapMessage('등록된 근무지 주소가 없습니다.', 'detail-job-map');
    }

    // Asynchronously update Firestore views
    if (db && job.id) {
      (async () => {
        try {
          let viewerId = '';
          if (auth && auth.currentUser) {
            viewerId = auth.currentUser.uid;
          } else {
            viewerId = localStorage.getItem('taekwondo_client_id');
            if (!viewerId) {
              viewerId = 'client_' + Math.random().toString(36).substring(2, 15);
              localStorage.setItem('taekwondo_client_id', viewerId);
            }
          }

          await db.collection('jobs').doc(job.id).update({
            views: firebase.firestore.FieldValue.increment(1),
            viewed_users: firebase.firestore.FieldValue.arrayUnion(viewerId)
          });
          
          renderHomeJobs();
          renderBoardJobs();
        } catch (err) {
          console.error('Failed to update views count in Firestore:', err);
        }
      })();
    }

    // 채용공고 스크랩 버튼 이벤트 동적 처리
    const btnScrapJob = document.getElementById('btn-scrap-job');
    if (btnScrapJob) {
      const newScrapBtn = btnScrapJob.cloneNode(true);
      btnScrapJob.parentNode.replaceChild(newScrapBtn, btnScrapJob);
      
      const isScrapped = state.currentUser && state.currentUser.scrapped_jobs && state.currentUser.scrapped_jobs.includes(job.id);
      if (isScrapped) {
        newScrapBtn.innerHTML = `⭐ 스크랩 해제`;
        newScrapBtn.style.background = '#e2e8f0';
      } else {
        newScrapBtn.innerHTML = `⭐ 스크랩`;
        newScrapBtn.style.background = '';
      }
      
      newScrapBtn.addEventListener('click', () => {
        if (!state.currentUser) {
          alert('로그인이 필요합니다.');
          return;
        }
        toggleScrapJob(job.id);
      });
    }
  }

  async function openTalentDetails(talent) {
    if (!dialogs.talentDetail) return;

    const avatarContainer = document.getElementById('detail-talent-avatar');
    if (avatarContainer) {
      avatarContainer.innerHTML = createAvatarSvg(talent.name, talent.gender, talent.colorIndex);
    }

    document.getElementById('detail-talent-name').textContent = talent.name;
    document.getElementById('detail-talent-title').textContent = `${talent.role} | ${talent.exp}`;
    document.getElementById('detail-talent-salary').textContent = talent.salary;
    document.getElementById('detail-talent-region').textContent = talent.region;
    document.getElementById('detail-talent-qual').textContent = `${talent.dan} | ${talent.license}`;

    // 로그인된 관장님(gym) 계정만 전화번호 및 자기소개를 볼 수 있도록 제어하되,
    // 구독 중이거나 개별 열람권을 소모하여 해제한 경우에만 마스킹을 해제합니다.
    const isGym = state.currentUser && getUserRole() === 'gym';
    const hasActiveSubscription = isGym && isResumeSubscriptionActive(state.currentUser);
    const isUnlocked = isGym && (
      hasActiveSubscription ||
      (state.currentUser.unlockedResumes && state.currentUser.unlockedResumes.includes(talent.id)) ||
      talent.userEmail === state.currentUser.email
    );
    const currentPasses = isGym && typeof state.currentUser.resumePassCount === 'number'
      ? state.currentUser.resumePassCount
      : 0;
    
    // 면접 제안 데이터 조회 (1주일 유효기간 체킹용)
    let activeProposal = null;
    let expiredProposal = null;
    if (isGym && typeof db !== 'undefined' && db) {
      try {
        const propSnap = await db.collection('proposals')
          .where('gymId', '==', state.currentUser.uid)
          .where('resumeId', '==', talent.id)
          .get();
        if (!propSnap.empty) {
          const nowMs = Date.now();
          const proposalsList = propSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          const unexpired = proposalsList.find(p => p.expiresAt && p.expiresAt.toDate().getTime() > nowMs);
          if (unexpired) {
            activeProposal = unexpired;
          } else {
            proposalsList.sort((a, b) => b.proposedAt.toDate().getTime() - a.proposedAt.toDate().getTime());
            expiredProposal = proposalsList[0];
          }
        }
      } catch (err) {
        console.warn('Failed to fetch proposals:', err);
      }
    }
    
    const phoneEl = document.getElementById('detail-talent-phone');
    const descEl = document.getElementById('detail-talent-desc');
    
    const btnInterview = document.getElementById('btn-interview-suggest');
    
    // 이전의 잠금해제 버튼 영역이 남아있다면 제거
    let btnUnlockArea = document.getElementById('talent-detail-unlock-area');
    if (btnUnlockArea) btnUnlockArea.remove();

    if (isGym) {
      if (isUnlocked) {
        if (phoneEl) phoneEl.textContent = talent.phone || '등록된 연락처 없음';
        if (descEl) descEl.textContent = talent.intro || '소개글이 없습니다.';
        if (btnInterview) btnInterview.style.display = 'inline-block';
      } else {
        if (phoneEl) phoneEl.innerHTML = `<span style="color: var(--text-muted); font-size: 0.88rem; font-weight: 500;">🔒 [열람권을 소모하여 열람해 주세요]</span>`;
        if (descEl) descEl.innerHTML = `<div style="text-align: center; padding: 2rem 1rem; background: var(--bg-hover); border-radius: 8px; border: 1.5px dashed var(--border-color); color: var(--text-muted);">
          <p style="font-weight: 700; margin-bottom: 0.4rem; color: var(--text-color); font-size: 0.95rem;">🔒 비공개 정보</p>
          <p style="font-size: 0.8rem; line-height: 1.5; max-width: 280px; margin: 0 auto;">구독권 구매 후 이 사범님의 연락처와 상세 포부글을 확인하실 수 있습니다.</p>
        </div>`;
        
        if (btnInterview) btnInterview.style.display = 'none';

        // 잠금 해제 전용 꼬리말 영역 버튼 추가
        const footer = document.querySelector('#dialog-talent-detail .detail-footer');
        if (footer) {
          btnUnlockArea = document.createElement('div');
          btnUnlockArea.id = 'talent-detail-unlock-area';
          btnUnlockArea.style.display = 'flex';
          btnUnlockArea.style.gap = '0.5rem';
          btnUnlockArea.style.width = '100%';
          btnUnlockArea.innerHTML = `
            <button type="button" class="btn-action-primary" id="btn-unlock-talent" style="flex: 2; background: #059669; border-color: #059669; font-weight: 700;">🔑 구독권 구매 후 열람</button>
            <button type="button" class="btn-action-secondary" id="btn-buy-pass-inside" style="flex: 1; font-weight: 600;">🎫 구독권 구매</button>
          `;
          footer.insertBefore(btnUnlockArea, footer.firstChild);

          // 이벤트 리스너 바인딩
          document.getElementById('btn-unlock-talent').addEventListener('click', () => {
            unlockResumeWithPass(talent);
          });
          document.getElementById('btn-buy-pass-inside').addEventListener('click', () => {
            openPurchasePassModal(talent);
          });
        }
      }
    } else {
      if (phoneEl) phoneEl.textContent = '관장님 회원만 열람 가능';
      if (descEl) descEl.textContent = '관장님 회원만 열람 가능합니다. 로그인 또는 회원가입 후 확인해 주세요.';
      if (btnInterview) btnInterview.style.display = 'inline-block';
    }

    // 면접 제안하기 버튼 이벤트 동적 처리
    if (btnInterview) {
      const newBtn = btnInterview.cloneNode(true);
      btnInterview.parentNode.replaceChild(newBtn, btnInterview);
      
      if (activeProposal) {
        const expDate = activeProposal.expiresAt.toDate();
        const dateStr = expDate.toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' });
        newBtn.innerHTML = `🥋 면접 제안 완료 (만료: ${dateStr})`;
        newBtn.disabled = true;
        newBtn.style.opacity = '0.65';
        newBtn.style.cursor = 'not-allowed';
      } else if (expiredProposal) {
        newBtn.innerHTML = `🥋 면접제안 만료 (재제안 가능)`;
        newBtn.disabled = false;
        newBtn.style.opacity = '1';
        newBtn.style.cursor = 'pointer';
      } else {
        newBtn.innerHTML = `🥋 면접 제안하기`;
        newBtn.disabled = false;
        newBtn.style.opacity = '1';
        newBtn.style.cursor = 'pointer';
      }
      
      newBtn.addEventListener('click', async () => {
        if (!state.currentUser) {
          alert('로그인이 필요합니다. 로그인 팝업을 열어드립니다.');
          if (dialogs.talentDetail) dialogs.talentDetail.close();
          if (dialogs.auth) {
            document.getElementById('tab-login')?.click();
            dialogs.auth.showModal();
          }
        } else {
          const gymName = state.currentUser.gymName || state.currentUser.name || '태권도장';
          const confirmMsg = `사범님께 면접 제안을 보내시겠습니까?\n(제안 유효기간은 발송일로부터 1주일입니다.)`;
          if (confirm(confirmMsg)) {
            try {
              const proposedAt = new Date();
              const expiresAt = new Date(proposedAt.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days later
              
              await db.collection('proposals').add({
                gymId: state.currentUser.uid,
                gymName: gymName,
                resumeId: talent.id,
                talentUserId: talent.userId || '',
                proposedAt: firebase.firestore.Timestamp.fromDate(proposedAt),
                expiresAt: firebase.firestore.Timestamp.fromDate(expiresAt),
                status: 'pending'
              });
              
              alert('사범님께 입사 제안 연락을 보냈습니다. 제안 유효기간은 1주일이며, 사범님이 수락할 시 연락처가 서로에게 공개됩니다.');
              
              if (dialogs.talentDetail) dialogs.talentDetail.close();
              openTalentDetails(talent);
            } catch (err) {
              console.error('Failed to create proposal:', err);
              alert('면접 제안 발송 실패: ' + err.message);
            }
          }
        }
      });
    }

    // 인재 스크랩 버튼 이벤트 동적 처리
    const btnScrapTalent = document.getElementById('btn-scrap-talent');
    if (btnScrapTalent) {
      const newScrapBtn = btnScrapTalent.cloneNode(true);
      btnScrapTalent.parentNode.replaceChild(newScrapBtn, btnScrapTalent);
      
      const isScrapped = state.currentUser && state.currentUser.scrapped_talents && state.currentUser.scrapped_talents.includes(talent.id);
      if (isScrapped) {
        newScrapBtn.innerHTML = `⭐ 스크랩 해제`;
        newScrapBtn.style.background = '#e2e8f0';
      } else {
        newScrapBtn.innerHTML = `⭐ 인재 스크랩`;
        newScrapBtn.style.background = '';
      }
      
      newScrapBtn.addEventListener('click', () => {
        if (!state.currentUser) {
          alert('로그인이 필요합니다.');
          return;
        }
        toggleScrapTalent(talent.id);
      });
    }

    if (!dialogs.talentDetail.open) {
      dialogs.talentDetail.showModal();
    }

    if (isGym && !isUnlocked && !hasActiveSubscription && currentPasses <= 0) {
      state.pendingPurchaseTalent = talent;
      setTimeout(() => {
        openPurchasePassModal(talent);
      }, 150);
    }
  }

  // 열람권을 소모하여 이력서의 잠금을 푸는 함수
  async function unlockResumeWithPass(talent, options = {}) {
    if (!state.currentUser) return;
    
    const userDocRef = db.collection('users').doc(state.currentUser.uid);
    try {
      const doc = await userDocRef.get();
      if (!doc.exists) return;
      
      const userData = doc.data();
      if (isResumeSubscriptionActive(userData)) {
        state.currentUser.resumeSubscriptionUntil = userData.resumeSubscriptionUntil;
        openTalentDetails(talent);
        return;
      }
      let currentPasses = typeof userData.resumePassCount === 'number' ? userData.resumePassCount : 0;
      let unlockedList = userData.unlockedResumes || [];
      if (unlockedList.includes(talent.id)) {
        openTalentDetails(talent);
        return;
      }
      
      if (currentPasses <= 0) {
        state.pendingPurchaseTalent = talent;
        alert('인재 이력서 열람 구독이 필요합니다. 구독권 구매 화면으로 이동합니다.');
        openPurchasePassModal(talent);
        return;
      }
      
      if (!options.skipConfirm) {
        const conf = confirm(`열람권을 1장 사용하여 이 사범님의 연락처와 상세 프로필을 열람하시겠습니까?\n(현재 보유 열람권: ${currentPasses}장)`);
        if (!conf) return;
      }
      
      currentPasses -= 1;
      unlockedList.push(talent.id);
      
      await userDocRef.update({
        resumePassCount: currentPasses,
        unlockedResumes: unlockedList
      });
      
      state.currentUser.resumePassCount = currentPasses;
      state.currentUser.unlockedResumes = unlockedList;
      
      alert('성공적으로 열람 처리가 완료되었습니다.');
      
      updateGymPassBannerUI();
      if (typeof renderMyApplicationsView === 'function') {
        renderMyApplicationsView();
      }
      openTalentDetails(talent);
    } catch (err) {
      console.error('열람권 차감 처리 중 에러 발생:', err);
      alert('열람 처리에 실패했습니다. 다시 시도해 주세요.');
    }
  }

  function getMillisFromDateLike(value) {
    if (!value) return 0;
    if (typeof value.toMillis === 'function') return value.toMillis();
    if (typeof value.toDate === 'function') return value.toDate().getTime();
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'number') return value;
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  function isResumeSubscriptionActive(userData) {
    return getMillisFromDateLike(userData?.resumeSubscriptionUntil) > Date.now();
  }

  function formatSubscriptionDate(value) {
    const millis = getMillisFromDateLike(value);
    if (!millis) return '';
    return new Date(millis).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  }

  // 관장 회원 전용 열람권 상태 안내 바(배너) UI 업데이트 함수
  function updateGymPassBannerUI() {
    const banner = document.getElementById('gym-pass-banner');
    const countEl = document.getElementById('gym-pass-count');
    
    if (!banner || !countEl) return;
    
    const role = getUserRole();
    if (role === 'gym' && state.currentUser) {
      banner.style.display = 'flex';
      countEl.textContent = isResumeSubscriptionActive(state.currentUser)
        ? `구독중 (~${formatSubscriptionDate(state.currentUser.resumeSubscriptionUntil)})`
        : '미구독';
    } else {
      banner.style.display = 'none';
    }
  }

  // 이력서 열람권 구매 팝업 열기
  window.openPurchasePassModal = async function(talent = null) {
    const dialog = document.getElementById('dialog-purchase-pass');
    if (dialog) {
      if (talent) state.pendingPurchaseTalent = talent;

      // Fetch the latest user doc from Firestore to check for any custom pricing updates
      if (state.currentUser && state.currentUser.uid && typeof db !== 'undefined' && db) {
        try {
          const userDoc = await db.collection('users').doc(state.currentUser.uid).get();
          if (userDoc.exists) {
            state.currentUser = { ...state.currentUser, ...userDoc.data() };
          }
        } catch (e) {
          console.warn('사용자 최신 정보 로드 실패:', e);
        }
      }

      const products = await loadResumePassProductsForPurchase();
      renderPurchaseProducts(products);
      dialog.showModal();
    }
  };

  async function loadResumePassProductsForPurchase() {
    try {
      if (!db) return DEFAULT_RESUME_PASS_PRODUCTS;
      const snap = await db.collection('resume_pass_products').orderBy('sort', 'asc').get();
      const products = snap.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .filter((product) => product.active !== false && Number(product.months) > 0 && Number(product.price) >= 0);
      
      // Override pricing with user-specific custom prices if they exist
      if (state.currentUser && state.currentUser.customPassPrices) {
        products.forEach((product) => {
          if (state.currentUser.customPassPrices[product.id] !== undefined) {
            product.price = Number(state.currentUser.customPassPrices[product.id]);
          }
        });
      }

      return products.length ? products : DEFAULT_RESUME_PASS_PRODUCTS;
    } catch (err) {
      console.warn('이력서 열람권 상품 로드 실패, 기본 상품 사용:', err);
      return DEFAULT_RESUME_PASS_PRODUCTS;
    }
  }

  function renderPurchaseProducts(products) {
    const list = document.getElementById('purchase-products-list');
    if (!list) return;
    const rows = products.length ? products : DEFAULT_RESUME_PASS_PRODUCTS;
    list.innerHTML = rows.map((product, index) => {
      const months = Number(product.months || index + 1);
      const price = Number(product.price || 0);
      const name = product.name || `${months}개월 구독권`;
      const productKey = product.id || `${months}-${price}-${index}`;
      return `
        <button type="button" class="product-item purchase-product-item" data-product-key="${escapeHtml(productKey)}" aria-pressed="${index === 0 ? 'true' : 'false'}" onclick="selectPurchaseProduct(${months}, ${price}, '${escapeForInline(name)}', '${escapeForInline(productKey)}', true)">
          <div class="purchase-product-copy">
            <strong class="purchase-product-name">${escapeHtml(name)}</strong>
            <span class="purchase-product-desc">인재 이력서 열람</span>
          </div>
          <strong class="purchase-product-price">${price.toLocaleString()}원</strong>
        </button>
      `;
    }).join('<div style="height: 5px; background: #eef2f7; border-radius: 999px; margin: 0 1.25rem; flex-shrink: 0;"></div>');
    const first = rows[0];
    selectPurchaseProduct(Number(first.months || 1), Number(first.price || 0), first.name || `${first.months || 1}개월 구독권`, first.id || `${first.months || 1}-${first.price || 0}-0`);
  }

  function escapeForInline(value) {
    return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, ' ');
  }

  // 구매할 상품 선택 시 하이라이트 토글
  window.selectPurchaseProduct = function(months, price, productName = '', productKey = '', proceedToPayment = false) {
    const hiddenCount = document.getElementById('selected-pass-count');
    const hiddenPrice = document.getElementById('selected-pass-price');
    const hiddenName = document.getElementById('selected-pass-name');
    const dialog = document.getElementById('dialog-purchase-pass');
    if (!dialog || !hiddenCount || !hiddenPrice) return;

    hiddenCount.value = months;
    hiddenPrice.value = price;
    if (hiddenName) hiddenName.value = productName || `${months}개월 구독권`;

    const items = dialog.querySelectorAll('.product-item');
    items.forEach((item) => {
      const isSelected = productKey && item.dataset.productKey === productKey;
      item.classList.toggle('is-selected', Boolean(isSelected));
      item.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
    });

    const payBtn = document.getElementById('btn-confirm-purchase-pass') || dialog.querySelector('.detail-footer button');
    if (payBtn) {
      payBtn.textContent = `💳 결제하기 (${price.toLocaleString()}원)`;
    }

    if (proceedToPayment) {
      window.setTimeout(() => {
        confirmPurchasePass();
      }, 120);
    }
  };

  window.selectResumePayOption = function(method) {
    document.querySelectorAll('.resume-pay-option').forEach((el) => {
      el.style.border = '1.5px solid #e2e8f0';
      el.style.background = '#fff';
    });
    const activeLabel = document.getElementById('resume-label-pay-' + method);
    if (activeLabel) {
      activeLabel.style.border = '1.5px solid var(--primary-color)';
      activeLabel.style.background = '#f0f7ff';
    }
  };

  // 결제 신청 팝업 열기
  window.confirmPurchasePass = async function() {
    if (!state.currentUser) {
      alert('로그인이 필요한 서비스입니다.');
      return;
    }
    
    // 동의 체크박스 및 토글 패널 상태 초기화
    const payAgreeTerms = document.getElementById('pay-agree-terms');
    const payAgreeRefund = document.getElementById('pay-agree-refund');
    const payTermsPanel = document.getElementById('pay-terms-panel');
    const payTermsContent = document.getElementById('pay-terms-content');
    
    if (payAgreeTerms) payAgreeTerms.checked = false;
    if (payAgreeRefund) payAgreeRefund.checked = false;
    if (payTermsPanel) {
      payTermsPanel.classList.remove('open');
      payTermsPanel.setAttribute('aria-hidden', 'true');
      payTermsPanel.style.maxHeight = '0';
    }
    
    const viewBtn = document.querySelector('.agreement-view-btn[data-target="pay-terms-panel"]');
    if (viewBtn) viewBtn.setAttribute('aria-expanded', 'false');

    // 유료서비스 약관 비동기 로드
    if (payTermsContent) {
      payTermsContent.textContent = '약관을 불러오는 중입니다...';
      try {
        const termsData = await getTermsData('paid');
        payTermsContent.textContent = termsData.content;
      } catch (err) {
        console.error('유료서비스 약관 로드 실패:', err);
      }
    }

    const months = parseInt(document.getElementById('selected-pass-count').value) || 1;
    const price = parseInt(document.getElementById('selected-pass-price').value) || 20000;
    const productName = document.getElementById('selected-pass-name')?.value || `${months}개월 구독권`;

    const titleEl = document.getElementById('resume-payment-title');
    const priceEl = document.getElementById('resume-payment-price');
    const payBtn = document.getElementById('btn-resume-pay-execute');
    if (titleEl) titleEl.textContent = `이력서 열람 ${productName}`;
    if (priceEl) priceEl.textContent = `₩${price.toLocaleString()}`;
    if (payBtn) payBtn.textContent = `${price.toLocaleString()}원 결제하기`;

    const purchaseDialog = document.getElementById('dialog-purchase-pass');
    if (purchaseDialog) purchaseDialog.close();
    const paymentDialog = document.getElementById('dialog-service-payment');
    if (paymentDialog) paymentDialog.showModal();
  };

  // 서비스 결제 신청 팝업 내 결제 실행
  window.executeResumePassPayment = async function() {
    if (!state.currentUser) {
      alert('로그인이 필요한 서비스입니다.');
      return;
    }

    // 약관 동의 검증 추가
    const payAgreeTerms = document.getElementById('pay-agree-terms');
    const payAgreeRefund = document.getElementById('pay-agree-refund');

    if (!payAgreeTerms || !payAgreeTerms.checked) {
      alert('유료서비스 이용약관에 동의하셔야 결제가 가능합니다.');
      return;
    }
    if (!payAgreeRefund || !payAgreeRefund.checked) {
      alert('청약철회 및 환불 제한 안내에 동의하셔야 결제가 가능합니다.');
      return;
    }

    const months = parseInt(document.getElementById('selected-pass-count').value) || 1;
    const price = parseInt(document.getElementById('selected-pass-price').value) || 20000;

    try {
      const userDocRef = db.collection('users').doc(state.currentUser.uid);
      const doc = await userDocRef.get();
      if (!doc.exists) return;
      
      const userData = doc.data();
      if (userData.testPaymentEnabled !== true) {
        alert('현재 이 계정은 테스트 결제가 OFF 상태입니다. 관리자 페이지 회원 목록에서 테스트 결제를 ON으로 변경해 주세요.');
        return;
      }
      const baseMillis = Math.max(Date.now(), getMillisFromDateLike(userData.resumeSubscriptionUntil));
      const newUntil = new Date(baseMillis);
      newUntil.setMonth(newUntil.getMonth() + months);
      
      await userDocRef.update({
        resumeSubscriptionUntil: newUntil,
        resumeSubscriptionMonths: months
      });

      // 결제 이력을 payments 컬렉션에 저장
      try {
        await db.collection('payments').add({
          userId: state.currentUser.uid,
          userName: state.currentUser.name || state.currentUser.email || '',
          userEmail: state.currentUser.email || '',
          productName: `이력서 열람 구독 ${months}개월`,
          months: months,
          amount: price,
          paymentDate: firebase.firestore.FieldValue.serverTimestamp(),
          subscriptionUntil: newUntil,
          status: 'completed',
          type: 'subscription'
        });
      } catch (payErr) {
        console.warn('결제 이력 저장 실패 (매출 데이터):', payErr);
      }

      state.currentUser.resumeSubscriptionUntil = newUntil;
      state.currentUser.resumeSubscriptionMonths = months;
      
      const paymentDialog = document.getElementById('dialog-service-payment');
      if (paymentDialog) paymentDialog.close();
      
      updateGymPassBannerUI();
      if (typeof renderMyApplicationsView === 'function') {
        renderMyApplicationsView();
      }

      const talentToOpen = state.pendingPurchaseTalent;
      state.pendingPurchaseTalent = null;
      const successMessage = document.getElementById('resume-payment-success-message');
      if (successMessage) {
        successMessage.innerHTML = `이력서 열람 구독이 <strong style="color:#2563eb">${formatSubscriptionDate(newUntil)}</strong>까지 활성화되었습니다.`;
      }
      const successDialog = document.getElementById('dialog-service-payment-success');
      if (successDialog) successDialog.showModal();
      if (talentToOpen) {
        openTalentDetails(talentToOpen);
      }
    } catch (e) {
      console.error('결제 처리 오류:', e);
      alert('결제 처리 중 에러가 발생했습니다. 다시 시도해 주세요.');
    }
  };

  // Premium View Products alert
  const premiumBtn = document.getElementById('btn-premium-products');
  if (premiumBtn) {
    premiumBtn.addEventListener('click', () => {
      alert('태권커리어 프리미엄 서비스:\n\n1. 상단 고정 노출 (7일) - 55,000원\n2. 상단 고정 노출 (30일) - 165,000원\n\n결제 및 신청은 고객센터(02-123-4567)로 유선 연락 주시면 즉시 반영해 드립니다.');
    });
  }


  // ==========================================================================
  // 10. Initialization & Statistics
  // ==========================================================================
  
  function updateStats() {
    // We dynamically offset our counter display based on mock listings added
    const extraJobs = state.jobsList.length - mockJobs.length;
    const extraTalents = state.talentsList.length - mockTalents.length;

    const jobsCountEl = document.getElementById('stat-jobs-count');
    const talentsCountEl = document.getElementById('stat-talents-count');

    if (jobsCountEl) {
      jobsCountEl.textContent = (1248 + extraJobs).toLocaleString() + '건';
    }
    if (talentsCountEl) {
      talentsCountEl.textContent = (3562 + extraTalents).toLocaleString() + '명';
    }
  }

  // Initialize
  initRegions();
  initJobsAndTalents().then(() => {
    renderHomeJobs();
    renderBoardJobs();
    renderHomeTalents();
    renderBoardTalents();
    renderHomeCommunityPosts();
    updateStats();
  });
  handleRoute();

  // ─── 모바일 하단 네비게이션 바 동적 렌더링 ──────────────────────
  function renderMobileBottomNav() {
    const container = document.getElementById('mobile-bottom-nav-list');
    if (!container) return;

    const user = auth ? auth.currentUser : null;
    const currentRole = getUserRole();
    const showAdminLink = user ? isAdminEmail(user.email) : false;

    let items = [];

    // 홈 (공통)
    items.push({
      href: '#home',
      label: '홈',
      icon: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`
    });

    if (!user) {
      // 비로그인 상태: 홈 | 채용공고 | 인재정보 | 커뮤니티 | 로그인
      items.push(
        {
          href: '#jobs',
          label: '채용공고',
          icon: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`
        },
        {
          href: '#talents',
          label: '인재정보',
          icon: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>`
        },
        {
          href: '#community',
          label: '커뮤니티',
          icon: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`
        },
        {
          href: 'javascript:openAuthModal()',
          label: '로그인',
          icon: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>`
        }
      );
    } else if (showAdminLink) {
      // 관리자 로그인 상태: 홈 | 채용공고 | 인재정보 | 커뮤니티 | 로그아웃
      items.push(
        {
          href: '#jobs',
          label: '채용공고',
          icon: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`
        },
        {
          href: '#talents',
          label: '인재정보',
          icon: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>`
        },
        {
          href: '#community',
          label: '커뮤니티',
          icon: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`
        },
        {
          href: 'javascript:handleLogout()',
          label: '로그아웃',
          icon: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`
        }
      );
    } else if (currentRole === 'gym') {
      // 관장님 로그인 상태: 홈 | 인재정보 | 커뮤니티 | 내 채용 관리 | 로그아웃
      items.push(
        {
          href: '#talents',
          label: '인재정보',
          icon: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>`
        },
        {
          href: '#community',
          label: '커뮤니티',
          icon: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`
        },
        {
          href: '#my-applications',
          label: '마이페이지',
          icon: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>`
        },
        {
          href: 'javascript:handleLogout()',
          label: '로그아웃',
          icon: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`
        }
      );
    } else {
      // 사범님 로그인 상태: 홈 | 채용공고 | 커뮤니티 | 마이페이지 | 로그아웃
      items.push(
        {
          href: '#jobs',
          label: '채용공고',
          icon: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`
        },
        {
          href: '#community',
          label: '커뮤니티',
          icon: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`
        },
        {
          href: '#my-applications',
          label: '마이페이지',
          icon: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>`
        },
        {
          href: 'javascript:handleLogout()',
          label: '로그아웃',
          icon: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`
        }
      );
    }

    container.innerHTML = items.map(item => `
      <li>
        <a href="${item.href}" class="m-nav-link">
          ${item.icon}
          <span>${item.label}</span>
        </a>
      </li>
    `).join('');

    // 액티브 클래스 부여
    const currentHash = window.location.hash || '#home';
    let targetHref = currentHash;
    if (window.location.pathname.includes('/Customer_Service')) {
      targetHref = '/Customer_Service';
    }
    
    const activeLink = container.querySelector(`a[href="${targetHref}"]`);
    if (activeLink) {
      activeLink.classList.add('active');
    }
  }

  window.openAuthModal = function(pane = 'login') {
    openAuthDialog(pane);
  };

  window.handleLogout = async function() {
    if (auth) await auth.signOut();
  };

  // ==========================================================================
  // 11. Firebase Auth 상태 감지 → 헤더 UI 업데이트
  // ==========================================================================
  if (auth) {
    auth.onAuthStateChanged(async (user) => {
      state.authReady = true;
      const loggedOut = document.getElementById('auth-logged-out');
      const loggedIn  = document.getElementById('auth-logged-in');
      const nameEl    = document.getElementById('auth-user-name');
      const adminLink = document.getElementById('btn-admin-link');
      const headerPassButton = document.getElementById('btn-header-purchase-pass');
      const headerApplicationsButton = document.getElementById('btn-header-my-applications');

      const inqName = document.getElementById('inquiry-name');
      const inqEmail = document.getElementById('inquiry-email');

      if (user) {
        // 로그인 상태: 유저 이름 + 버튼 표시
        loggedOut.style.display = 'none';
        loggedIn.style.display  = 'flex';
        
        // 임시 세팅
        state.currentUser = { uid: user.uid, email: user.email };
        const showAdminLink = isAdminEmail(user.email);
        if (adminLink) {
          adminLink.style.display = showAdminLink ? 'inline-flex' : 'none';
        }
        if (headerPassButton) {
          headerPassButton.style.display = 'none';
        }
        if (headerApplicationsButton) {
          headerApplicationsButton.style.display = 'none';
        }

        // Firestore에서 type 확인
        try {
          async function restoreUserDocumentFromPendingProfile() {
            const pending = loadPendingSignupProfile(user.email);
            const shouldCreateFallback = !pending && window.confirm('회원 기본 정보가 누락되어 관리자 페이지에 표시되지 않습니다. 관장 회원으로 복구하시겠습니까?');
            if (!pending && !shouldCreateFallback) return null;

            const restoredData = {
              name: pending?.name || String(user.email || '').split('@')[0] || '관장회원',
              email: user.email,
              type: pending ? (pending.type === 'gym' ? 'gym' : 'instructor') : 'gym',
              agree_age_over_15: pending ? !!pending.agreeAge : true,
              agree_terms: pending ? !!pending.agreeTerms : true,
              agree_personalized_ads: pending ? !!pending.agreePersonalized : false,
              agree_marketing: pending ? !!pending.agreeMarketing : false,
              agreed_at: firebase.firestore.FieldValue.serverTimestamp(),
              created_at: firebase.firestore.FieldValue.serverTimestamp()
            };
            if (pending?.phone) restoredData.phone = pending.phone;

            if (restoredData.type === 'gym') {
              restoredData.gym_name = pending?.gymName || pending?.name || restoredData.name || '도장';
              restoredData.business_number = pending?.businessNumber || '0000000000';
              restoredData.business_start_date = pending?.businessStartDate || '20000101';
              restoredData.business_owner_name = pending?.businessOwnerName || pending?.name || restoredData.name || '대표자';
              restoredData.business_status = pending?.businessStatus || '미확인';
              restoredData.business_status_code = pending?.businessStatusCode || '00';
              restoredData.business_valid = pending?.businessValid || '00';
              restoredData.business_valid_msg = pending?.businessValidMsg || '회원정보 복구';
              restoredData.business_verified_at = firebase.firestore.FieldValue.serverTimestamp();
              restoredData.resumePassCount = 0;
              restoredData.unlockedResumes = [];
              restoredData.testPaymentEnabled = false;
            }

            await db.collection('users').doc(user.uid).set(restoredData);
            await db.collection('account_lookup').doc(user.uid).set({
              uid: user.uid,
              name: restoredData.name,
              name_key: normalizeAccountKey(restoredData.name),
              type: restoredData.type,
              masked_email: maskEmail(user.email),
              created_at: firebase.firestore.FieldValue.serverTimestamp()
            });
            clearPendingSignupProfile();
            return restoredData;
          }

          const snap = await db.collection('users').doc(user.uid).get();
          let data = snap.data();
          if (!data && user.email) {
            const emailSnap = await db.collection('users')
              .where('email', '==', user.email)
              .limit(1)
              .get();
            if (!emailSnap.empty) {
              data = emailSnap.docs[0].data();
            }
          }
          if (!data) {
            data = await restoreUserDocumentFromPendingProfile();
          }
          if (data) {
            if (data.type === 'gym' && typeof data.resumePassCount !== 'number') {
              data.resumePassCount = 0;
              data.unlockedResumes = data.unlockedResumes || [];
              await db.collection('users').doc(user.uid).update({
                resumePassCount: 0,
                unlockedResumes: data.unlockedResumes
              });
            }
            if (String(user.email || '').toLowerCase() === 'kh1111@gmail.com' && data.type === 'gym' && data.resumePassCount === 3) {
              data.resumePassCount = 0;
              data.unlockedResumes = data.unlockedResumes || [];
              await db.collection('users').doc(user.uid).update({
                resumePassCount: 0,
                unlockedResumes: data.unlockedResumes
              });
            }
            state.currentUser = { uid: user.uid, email: user.email, ...data };
            nameEl.textContent = data.name || user.email;
            
            // 사업자 인증 완료 뱃지 표시 제어
            const bizBadge = document.getElementById('auth-biz-badge');
            if (bizBadge) {
              const isBizVerified = data.type === 'gym' && (data.bizStatus === 'verified' || (data.business_valid === '01' && data.business_status_code === '01' && data.bizStatus !== 'pending'));
              bizBadge.style.display = isBizVerified ? 'inline-block' : 'none';
            }
            const currentRole = getUserRole();
            if (adminLink) {
              adminLink.style.display = showAdminLink ? 'inline-flex' : 'none';
            }
            if (headerPassButton) {
              headerPassButton.style.display = !showAdminLink && currentRole === 'gym' ? 'inline-flex' : 'none';
            }
            if (headerApplicationsButton) {
              headerApplicationsButton.style.display = showAdminLink ? 'none' : 'inline-flex';
              headerApplicationsButton.textContent = '마이페이지';
            }

            // 1:1 문의 폼 자동 입력
            if (inqName) inqName.value = data.name || '';
            if (inqEmail) inqEmail.value = data.email || user.email || '';

            // 사업자 재인증 팝업 트리거
            const isBizPending = data.bizStatus === 'pending' || (!data.bizStatus && (data.business_valid !== '01' || data.business_status_code !== '01'));
            if (data.type === 'gym' && isBizPending) {
              const reverifyDialog = document.getElementById('dialog-biz-reverify');
              if (reverifyDialog) {
                const gymNameInput = document.getElementById('reverify-gym-name');
                const bizNumInput = document.getElementById('reverify-biz-number');
                const ownerInput = document.getElementById('reverify-owner-name');
                const startDateInput = document.getElementById('reverify-start-date');
                if (gymNameInput) gymNameInput.value = data.gym_name || '';
                if (bizNumInput) bizNumInput.value = data.business_number || '';
                if (ownerInput) ownerInput.value = data.business_owner_name || '';
                if (startDateInput) startDateInput.value = data.business_start_date || '';
                
                const resultDiv = document.getElementById('reverify-result');
                if (resultDiv) resultDiv.innerHTML = '';
                
                reverifyDialog.showModal();
              }
            }
          } else {
            nameEl.textContent = user.email;
            if (adminLink) adminLink.style.display = showAdminLink ? 'inline-flex' : 'none';
            if (headerPassButton) headerPassButton.style.display = 'none';
            if (headerApplicationsButton) headerApplicationsButton.style.display = 'none';

            if (inqName) inqName.value = '';
            if (inqEmail) inqEmail.value = user.email || '';
          }
        } catch (e) {
          nameEl.textContent = user.email;
          if (adminLink) adminLink.style.display = showAdminLink ? 'inline-flex' : 'none';
          if (headerPassButton) headerPassButton.style.display = 'none';
          if (headerApplicationsButton) headerApplicationsButton.style.display = 'none';

          if (inqName) inqName.value = '';
          if (inqEmail) inqEmail.value = user.email || '';
        }
      } else {
        // 비로그인 상태
        state.currentUser = null;
        loggedOut.style.display = 'flex';
        loggedIn.style.display  = 'none';
        if (adminLink) adminLink.style.display = 'none';
        if (headerPassButton) headerPassButton.style.display = 'none';
        if (headerApplicationsButton) headerApplicationsButton.style.display = 'none';
        
        const bizBadge = document.getElementById('auth-biz-badge');
        if (bizBadge) bizBadge.style.display = 'none';

        // 1:1 문의 폼 초기화
        if (inqName) inqName.value = '';
        if (inqEmail) inqEmail.value = '';
      }

      // 역할에 따른 메뉴 노출 및 탭 제어 적용
      applyRoleBasedUI();
      renderMobileBottomNav();
      handleRoute();
    });
  }

  // ─── 즉시 지원 이벤트 바인딩 ───
  const btnApplyJob = document.getElementById('btn-apply-job');
  if (btnApplyJob) {
    btnApplyJob.addEventListener('click', async () => {
      const jobId = btnApplyJob.dataset.jobId;
      const jobTitle = btnApplyJob.dataset.jobTitle;
      const gymName = btnApplyJob.dataset.gymName;
      const jobOwnerId = btnApplyJob.dataset.jobOwnerId || '';
      if (!jobId) return;

      const currentUser = auth ? auth.currentUser : null;
      if (!currentUser) {
        alert('즉시 지원은 로그인 후 이용하실 수 있습니다. 로그인 팝업을 열어드립니다.');
        dialogs.jobDetail.close();
        if (dialogs.auth) {
          document.getElementById('tab-login')?.click();
          dialogs.auth.showModal();
        }
        return;
      }

      try {
        // 1. 유저 정보 조회 및 타입 체크
        const userSnap = await db.collection('users').doc(currentUser.uid).get();
        const userData = userSnap.data();
        if (userData && userData.type === 'gym') {
          alert('도장(관장님) 계정으로는 즉시 지원하실 수 없습니다. 사범님 계정으로 로그인해 주세요.');
          return;
        }

        // 2. 사범님의 이력서 조회
        const resumeSnap = await db.collection('resumes')
          .where('user_id', '==', currentUser.uid)
          .limit(1)
          .get();

        if (resumeSnap.empty) {
          alert('등록된 이력서가 없습니다. 먼저 이력서를 등록해 주세요!');
          dialogs.jobDetail.close();
          if (dialogs.postResume) {
            dialogs.postResume.showModal();
          }
          return;
        }

        const resumeDoc = resumeSnap.docs[0];
        const resumeId = resumeDoc.id;

        // 3. 중복 지원 체크
        const checkDup = await db.collection('apply')
          .where('job_id', '==', jobId)
          .where('resume_id', '==', resumeId)
          .limit(1)
          .get();

        if (!checkDup.empty) {
          alert('이미 이 채용공고에 지원하셨습니다.');
          return;
        }

        const appliedResume = state.talentsList.find((item) => item.id === resumeId);
        const resumeSnapshot = createResumeSnapshot(appliedResume, currentUser.uid);

        // 4. 지원 등록
        const applyData = {
          job_id: jobId,
          job_owner_id: jobOwnerId,
          applicant_id: currentUser.uid,
          resume_id: resumeId,
          resume_snapshot: resumeSnapshot,
          status: 'pending',
          created_at: firebase.firestore.FieldValue.serverTimestamp()
        };

        btnApplyJob.disabled = true;
        btnApplyJob.textContent = '지원 중...';

        const applyRef = await db.collection('apply').add(applyData);
        const appliedJob = state.jobsList.find((item) => item.id === jobId);
        state.applicationsList.unshift({
          id: applyRef.id,
          jobId,
          resumeId,
          jobOwnerId,
          applicantId: currentUser.uid,
          status: 'pending',
          createdAt: new Date(),
          job: appliedJob,
          resumeSnapshot,
          resume: resumeSnapshot || appliedResume
        });

        alert('지원서가 성공적으로 전달되었습니다! 관장님이 검토 후 연락드릴 예정입니다.');
        dialogs.jobDetail.close();
      } catch (err) {
        console.error('즉시 지원 에러:', err);
        alert('지원 처리 중 오류가 발생했습니다: ' + err.message);
      } finally {
        btnApplyJob.disabled = false;
        btnApplyJob.textContent = '즉시 지원하기';
      }
    });
  }

  // ─── 1:1 문의 접수 핸들러 ───
  const formInquiry = document.getElementById('form-customer-inquiry');
  if (formInquiry) {
    formInquiry.addEventListener('submit', async (e) => {
      e.preventDefault();

      const name = document.getElementById('inquiry-name')?.value?.trim();
      const email = document.getElementById('inquiry-email')?.value?.trim();
      const type = document.getElementById('inquiry-type')?.value;
      const title = document.getElementById('inquiry-title')?.value?.trim();
      const content = document.getElementById('inquiry-content')?.value?.trim();
      const agree = document.getElementById('inquiry-agree')?.checked;

      // 간단한 유효성 검사
      if (!name || !email || !type || !title || !content) {
        alert('필수 입력 필드를 모두 작성해 주세요.');
        return;
      }
      
      const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
      if (!emailRegex.test(email)) {
        alert('올바른 이메일 형식을 입력해 주세요.');
        return;
      }

      if (!agree) {
        alert('개인정보 수집 및 이용 동의는 필수사항입니다.');
        return;
      }

      const submitBtn = formInquiry.querySelector('.btn-inquiry-submit');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = '접수 중...';
      }

      try {
        const currentUser = auth ? auth.currentUser : null;
        const inquiryData = {
          name: name,
          email: email,
          type: type,
          title: title,
          content: content,
          status: 'pending',
          created_at: firebase.firestore.FieldValue.serverTimestamp()
        };
        if (currentUser) {
          inquiryData.user_id = currentUser.uid;
        }

        // 1. Firestore 저장
        let docId = '';
        if (db) {
          const docRef = await db.collection('inquiries').add(inquiryData);
          docId = docRef.id;
        }

        // 2. LocalStorage 백업 저장
        try {
          const localInquiries = JSON.parse(localStorage.getItem('taekwondo_inquiries') || '[]');
          const localItem = {
            id: docId || Math.random().toString(36).substring(2, 9),
            name: name,
            email: email,
            type: type,
            title: title,
            content: content,
            status: 'pending',
            created_at: new Date().toISOString()
          };
          if (currentUser) {
            localItem.user_id = currentUser.uid;
          }
          localInquiries.push(localItem);
          localStorage.setItem('taekwondo_inquiries', JSON.stringify(localInquiries));
        } catch (storageErr) {
          console.warn('LocalStorage 저장 실패:', storageErr);
        }

        alert('문의가 정상적으로 접수되었습니다. 최대한 신속하게 답변해 드리겠습니다.');
        formInquiry.reset();
        
        // 내 문의 내역 갱신
        if (window.loadMyInquiries) {
          window.loadMyInquiries();
        }
        
        // 로그인 상태인 경우 입력 정보 다시 세팅
        if (currentUser && db) {
          const snap = await db.collection('users').doc(currentUser.uid).get();
          const data = snap.data();
          if (data) {
            const inqName = document.getElementById('inquiry-name');
            const inqEmail = document.getElementById('inquiry-email');
            if (inqName) inqName.value = data.name || '';
            if (inqEmail) inqEmail.value = data.email || currentUser.email || '';
          }
        }
      } catch (err) {
        console.error('문의 접수 에러:', err);
        alert('문의 접수 중 오류가 발생했습니다: ' + err.message);
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = '문의 접수하기';
        }
      }
    });
  }

  // ─── 1:1 문의 데이터 공통 조회 함수 ───
  async function fetchInquiries() {
    let localInquiries = [];
    try {
      localInquiries = JSON.parse(localStorage.getItem('taekwondo_inquiries') || '[]');
    } catch (e) {
      console.warn('LocalStorage 문의 내역 로드 실패:', e);
    }

    let dbInquiries = [];
    const currentUser = auth ? auth.currentUser : null;
    if (currentUser && db) {
      try {
        const snapUid = await db.collection('inquiries')
          .where('user_id', '==', currentUser.uid)
          .get();
          
        snapUid.forEach(doc => {
          const data = doc.data();
          dbInquiries.push({
            id: doc.id,
            name: data.name,
            email: data.email,
            type: data.type,
            title: data.title,
            content: data.content,
            status: data.status,
            answer: data.answer || '',
            created_at: data.created_at ? (data.created_at.toDate ? data.created_at.toDate().toISOString() : data.created_at) : null
          });
        });

        if (currentUser.email) {
          const snapEmail = await db.collection('inquiries')
            .where('email', '==', currentUser.email)
            .get();
            
          snapEmail.forEach(doc => {
            if (!dbInquiries.some(item => item.id === doc.id)) {
              const data = doc.data();
              dbInquiries.push({
                id: doc.id,
                name: data.name,
                email: data.email,
                type: data.type,
                title: data.title,
                content: data.content,
                status: data.status,
                answer: data.answer || '',
                created_at: data.created_at ? (data.created_at.toDate ? data.created_at.toDate().toISOString() : data.created_at) : null
              });
            }
          });
        }
      } catch (err) {
        console.warn('Firestore 문의 내역 로드 실패:', err);
      }
    }

    const mergedMap = new Map();
    localInquiries.forEach(item => mergedMap.set(item.id, item));
    dbInquiries.forEach(item => mergedMap.set(item.id, item));

    const mergedList = Array.from(mergedMap.values());
    mergedList.sort((a, b) => {
      const dateA = a.created_at ? new Date(a.created_at) : new Date(0);
      const dateB = b.created_at ? new Date(b.created_at) : new Date(0);
      return dateB - dateA;
    });

    return mergedList;
  }

  // ─── 1:1 문의 마크업 렌더러 함수 ───
  function renderInquiryListMarkup(mergedList, listEl, cardPrefix = 'inq') {
    if (mergedList.length === 0) {
      listEl.innerHTML = `
        <div class="inquiry-empty-state">
          <p>접수된 1:1 문의사항이 없습니다.</p>
        </div>`;
      return;
    }

    listEl.innerHTML = mergedList.map(item => {
      const isAnswered = item.status === 'answered';
      const statusClass = isAnswered ? 'answered' : 'pending';
      const statusText = isAnswered ? '답변 완료' : '답변 대기';
      
      const dateStr = item.created_at ? new Date(item.created_at).toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }) : '-';

      const escTitle = escapeHtml(item.title);
      const escType = escapeHtml(item.type);
      const escContent = escapeHtml(item.content);
      const escAnswer = isAnswered ? escapeHtml(item.answer) : '';

      return `
        <div class="inquiry-track-card" id="${cardPrefix}-card-${item.id}">
          <div class="inquiry-track-header" onclick="toggleInquiryCard('${item.id}', '${cardPrefix}')">
            <div class="inquiry-track-info">
              <div class="inquiry-track-meta">
                <span class="inquiry-track-type">${escType}</span>
                <span>${dateStr}</span>
                <span class="inquiry-track-badge ${statusClass}">${statusText}</span>
              </div>
              <div class="inquiry-track-title">${escTitle}</div>
            </div>
            <div class="inquiry-track-chevron">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            </div>
          </div>
          <div class="inquiry-track-body">
            <div class="inquiry-detail-q">
              <div class="inquiry-detail-label">문의 내용</div>
              <div class="inquiry-detail-text">${escContent}</div>
            </div>
            ${isAnswered ? `
              <div class="inquiry-detail-a">
                <div class="inquiry-detail-label">답변 내용</div>
                <div class="inquiry-detail-text">${escAnswer}</div>
              </div>
            ` : `
              <div class="inquiry-detail-a" style="background:#f1f5f9;border-left-color:#94a3b8">
                <div class="inquiry-detail-text" style="color:var(--text-muted)">담당자가 문의 내용을 검토 중입니다. 조금만 기다려 주시기 바랍니다.</div>
              </div>
            `}
          </div>
        </div>
      `;
    }).join('');
  }

  // ─── 1:1 문의 조회 및 렌더링 ───
  window.loadMyInquiries = async function() {
    const listEl = document.getElementById('my-inquiries-list');
    const sectionEl = document.getElementById('my-inquiries-section');
    if (!listEl || !sectionEl) return;

    sectionEl.style.display = 'block';
    listEl.innerHTML = '<div class="loading-placeholder" style="text-align:center;padding:2rem;color:var(--text-muted)">문의 내역을 불러오는 중입니다...</div>';

    const mergedList = await fetchInquiries();
    renderInquiryListMarkup(mergedList, listEl, 'inq');
  };

  // ─── 마이페이지용 1:1 문의 내역 로드 및 렌더링 ───
  window.renderMyPageInquiries = async function() {
    const listEl = document.getElementById('mypage-inquiries-list');
    if (!listEl) return;

    listEl.innerHTML = '<div class="loading-placeholder" style="text-align:center;padding:2rem;color:var(--text-muted)">문의 내역을 불러오는 중입니다...</div>';

    const mergedList = await fetchInquiries();
    renderInquiryListMarkup(mergedList, listEl, 'mypage-inq');
  };

  window.toggleInquiryCard = function(id, prefix = 'inq') {
    const card = document.getElementById(`${prefix}-card-${id}`);
    if (card) {
      card.classList.toggle('open');
    }
  };

  // ─── 카카오 우편번호 서비스 & 지도 연동 (내장형 및 실시간 타이핑 지원) ───
  let postcodeEmbedInstance = null;
  let directInputTimer = null;
  let kakaoMapsLoadPromise = null;
  const KAKAO_MAP_APP_KEY = '28f3ae7ad7bb29db3e5774383d5bebe3';
  const KAKAO_MAP_SDK_URL = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_MAP_APP_KEY}&libraries=services&autoload=false`;

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    }[char]));
  }

  function getOrCreateKakaoMapLink(mapEl, mapId) {
    const linkId = `${mapId}-link`;
    let linkEl = document.getElementById(linkId);
    if (!linkEl) {
      linkEl = document.createElement('a');
      linkEl.id = linkId;
      linkEl.className = 'kakao-map-link';
      linkEl.target = '_blank';
      linkEl.rel = 'noopener noreferrer';
      linkEl.textContent = '카카오지도에서 보기';
      mapEl.insertAdjacentElement('afterend', linkEl);
    }
    return linkEl;
  }

  function updateKakaoMapLink(mapId, address, coords) {
    const mapEl = document.getElementById(mapId);
    if (!mapEl || !address) return;

    const linkEl = getOrCreateKakaoMapLink(mapEl, mapId);
    if (coords) {
      linkEl.href = `https://map.kakao.com/link/map/${encodeURIComponent(address)},${coords.lat},${coords.lng}`;
    } else {
      linkEl.href = `https://map.kakao.com/link/search/${encodeURIComponent(address)}`;
    }
    linkEl.style.display = 'inline-flex';
  }

  function setJobMapMessage(message, mapId = 'job-map') {
    const mapEl = document.getElementById(mapId);
    if (!mapEl) return;
    mapEl.style.display = 'flex';
    mapEl.style.alignItems = 'center';
    mapEl.style.justifyContent = 'center';
    mapEl.style.padding = '0 16px';
    mapEl.style.color = '#64748b';
    mapEl.style.fontSize = '0.875rem';
    mapEl.style.fontWeight = '700';
    mapEl.style.textAlign = 'center';
    mapEl.innerHTML = message;
  }

  function resetJobMapElement(mapEl) {
    mapEl.style.display = 'block';
    mapEl.style.alignItems = '';
    mapEl.style.justifyContent = '';
    mapEl.style.padding = '';
    mapEl.style.color = '';
    mapEl.style.fontSize = '';
    mapEl.style.fontWeight = '';
    mapEl.style.textAlign = '';
    mapEl.innerHTML = '';
  }

  function ensureKakaoMapsScript() {
    if (window.kakao?.maps) {
      return Promise.resolve();
    }

    const existingScript = document.getElementById('kakao-map-sdk-retry')
      || document.getElementById('kakao-map-sdk')
      || Array.from(document.querySelectorAll('script[src*="dapi.kakao.com/v2/maps/sdk.js"]')).find(Boolean);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('카카오 지도 스크립트 로드 시간 초과'));
      }, 12000);

      const finish = () => {
        clearTimeout(timeout);
        if (window.kakao?.maps) {
          resolve();
        } else {
          reject(new Error('카카오 지도 스크립트가 로드되었지만 maps 객체가 없습니다'));
        }
      };

      const fail = () => {
        clearTimeout(timeout);
        reject(new Error('카카오 지도 스크립트 로드 실패'));
      };

      if (existingScript && existingScript.id === 'kakao-map-sdk-retry') {
        existingScript.addEventListener('load', finish, { once: true });
        existingScript.addEventListener('error', fail, { once: true });
        return;
      }

      const script = document.createElement('script');
      script.id = 'kakao-map-sdk-retry';
      script.type = 'text/javascript';
      script.async = true;
      script.src = `${KAKAO_MAP_SDK_URL}&retry=${Date.now()}`;
      script.addEventListener('load', finish, { once: true });
      script.addEventListener('error', fail, { once: true });
      document.head.appendChild(script);
    });
  }

  function waitForKakaoMaps() {
    if (window.kakao?.maps?.services) {
      return Promise.resolve();
    }

    if (kakaoMapsLoadPromise) {
      return kakaoMapsLoadPromise;
    }

    kakaoMapsLoadPromise = new Promise((resolve, reject) => {
      const startedAt = Date.now();

      const check = () => {
        if (!window.kakao?.maps) {
          if (Date.now() - startedAt > 15000) {
            reject(new Error('카카오 지도 스크립트 로드 시간 초과 또는 앱키/도메인 설정 오류'));
            return;
          }
          ensureKakaoMapsScript()
            .then(() => setTimeout(check, 0))
            .catch((err) => {
              if (Date.now() - startedAt > 15000) {
                reject(err);
              } else {
                setTimeout(check, 300);
              }
            });
          return;
        }

        window.kakao.maps.load(() => {
          if (window.kakao?.maps?.services) {
            resolve();
          } else {
            reject(new Error('카카오 지도 services 라이브러리 로드 실패'));
          }
        });
      };

      check();
    });

    return kakaoMapsLoadPromise;
  }

  // 내장형 우편번호 찾기 토글
  window.toggleDaumPostcodeEmbed = function() {
    if (typeof daum === 'undefined') {
      alert('우편번호 서비스 스크립트가 아직 로드되지 않았습니다.');
      return;
    }

    const container = document.getElementById('job-address-search-container');
    const inner = document.getElementById('job-address-search-inner');
    if (!container || !inner) return;

    // 이미 열려있으면 닫기
    if (container.style.display === 'block') {
      window.closeDaumPostcodeEmbed();
      return;
    }

    container.style.display = 'block';

    new daum.Postcode({
      oncomplete: function(data) {
        let addr = data.userSelectedType === 'R' ? data.roadAddress : data.jibunAddress;
        
        const addrEl = document.getElementById('job-address');
        if (addrEl) addrEl.value = addr;

        // 검색창 닫기
        window.closeDaumPostcodeEmbed();

        // 지도 갱신
        updateJobMapByAddress(addr);
      },
      width: '100%',
      height: '100%'
    }).embed(inner);
  };

  // 내장형 우편번호 검색창 닫기
  window.closeDaumPostcodeEmbed = function() {
    const container = document.getElementById('job-address-search-container');
    if (container) {
      container.style.display = 'none';
    }
  };

  // 사용자가 주소를 직접 기입할 때 호출 (디바운스 500ms 적용)
  window.handleAddressDirectInput = function(val) {
    if (directInputTimer) {
      clearTimeout(directInputTimer);
    }
    
    const addr = val.trim();
    if (!addr) {
      const mapEl = document.getElementById('job-map');
      if (mapEl) mapEl.style.display = 'none';
      return;
    }

    directInputTimer = setTimeout(() => {
      updateJobMapByAddress(addr);
    }, 500);
  };

  // 주소 텍스트 기반 카카오 지도 갱신 공통 함수
  function updateJobMapByAddress(addr, options = {}) {
    // 주소에서 행정구역명을 분석하여 지역 선택 도구 자동 매칭
    const mapId = options.mapId || 'job-map';
    if (options.autoSelectRegion !== false) {
      autoSelectRegionFromAddress(addr);
    }

    const mapEl = document.getElementById(mapId);
    if (!mapEl) return;

    setJobMapMessage('지도를 불러오는 중입니다.', mapId);
    updateKakaoMapLink(mapId, addr);

    waitForKakaoMaps()
      .then(() => {
        resetJobMapElement(mapEl);

        var geocoder = new kakao.maps.services.Geocoder();

        var cleanAddress = addr.split(',')[0].split('(')[0].trim();
        cleanAddress = cleanAddress.replace(/\s+(?:[0-9]+층|[0-9]+호|[0-9]+-[0-9]+|지하|상가).*$/, '').trim();

        function searchAddressWithFallback(addressStr) {
          geocoder.addressSearch(addressStr, function(result, status) {
            if (status === kakao.maps.services.Status.OK) {
              resetJobMapElement(mapEl);
              var coords = new kakao.maps.LatLng(result[0].y, result[0].x);
              var map = new kakao.maps.Map(mapEl, { center: coords, level: 3 });
              new kakao.maps.Marker({ map: map, position: coords });
              map.relayout();
              map.setCenter(coords);
              updateKakaoMapLink(mapId, addressStr, {
                lat: result[0].y,
                lng: result[0].x
              });
            } else {
              var parts = addressStr.split(' ');
              if (parts.length > 2) {
                parts.pop();
                searchAddressWithFallback(parts.join(' '));
              } else {
                setJobMapMessage(`${escapeHtml(addr)}<br>입력한 주소의 위치를 찾을 수 없습니다.`, mapId);
              }
            }
          });
        }

        searchAddressWithFallback(cleanAddress || addr);
      })
      .catch((e) => {
        console.warn('지도 렌더링 실패:', e);
        setJobMapMessage('카카오 지도 API를 불러오지 못했습니다.<br>카카오 개발자 콘솔에서 지도/로컬 API 사용 설정을 확인해주세요.', mapId);
      });
  }

  // 주소 텍스트 파싱을 기반으로 해당 시도/시군구를 분석하여 지역 피커를 자동 세팅하는 함수
  function autoSelectRegionFromAddress(address) {
    if (!address || !state.regionPickers.job || !state.regions) return;

    const parts = address.trim().split(/\s+/);
    if (parts.length < 2) return;

    const sido = parts[0];
    const sigungu = parts[1];

    // 법정동 지역명 매치용 단축 맵
    const sidoShortMap = {
      '서울특별시': '서울', '부산광역시': '부산', '대구광역시': '대구',
      '인천광역시': '인천', '광주광역시': '광주', '대전광역시': '대전',
      '울산광역시': '울산', '세종특별자치시': '세종', '세종시': '세종',
      '경기도': '경기', '강원특별자치도': '강원', '강원도': '강원',
      '충청북도': '충북', '충청남도': '충남', '전북특별자치도': '전북',
      '전라북도': '전북', '전라남도': '전남', '경상북도': '경북',
      '경상남도': '경남', '제주특별자치도': '제주', '제주도': '제주'
    };

    const normalizedSido = sidoShortMap[sido] || sido.replace(/특별자치도|특별자치시|광역시|특별시|도$/g, '');
    const targetDisplayName = `${normalizedSido} ${sigungu}`;

    // 실제 데이터에 존재하는 행정구역인지 확인 후 자동 적용
    const isExist = state.regions.some(r => r.displayName === targetDisplayName);
    if (isExist) {
      state.regionPickers.job.setByValue(targetDisplayName);
    }
  }

});
