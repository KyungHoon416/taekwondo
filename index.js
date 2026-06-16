/* ==========================================================================
   TaekwonJob (태권잡) Core Script
   SPA Routing, Mock Database, Filtering, & Form Submissions
   ========================================================================== */

// ==========================================================================
// Firebase 초기화 (클로저 외부)
// ==========================================================================
let auth, db;
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

// 에러 토스트 하퍼
function showAuthError(msg) {
  let el = document.querySelector('.auth-pane:not(.hidden) .auth-error-msg') || document.querySelector('.auth-error-msg');
  if (el) { el.textContent = msg; el.style.display = 'block'; }
}
function clearAuthError() {
  document.querySelectorAll('.auth-error-msg').forEach((el) => {
    el.textContent = '';
    el.style.display = 'none';
  });
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
  const business = result?.data?.[0];
  if (!business) {
    throw new Error('사업자등록정보 진위확인 결과를 받지 못했습니다.');
  }

  if (business.valid !== '01') {
    throw new Error(business.valid_msg || '사업자등록정보가 일치하지 않습니다.');
  }

  return business;
}

document.addEventListener('DOMContentLoaded', () => {

  // ==========================================================================
  // 1. Mock Database
  // ==========================================================================
  
  const mockJobs = [
    {
      id: 'job-1',
      gymName: '강남 태권도장',
      title: '정사범 모집 (우대: 겨루기 선수 출신)',
      region: '서울 강남구',
      address: '서울특별시 강남구 역삼동 742-10',
      salary: '월 320만원',
      type: '정규직',
      exp: '경력 3년↑',
      hotness: 'NEW',
      desc: '안녕하세요. 강남 태권도장입니다. \n\n체계적이고 열정적으로 아이들을 지도해주실 유능한 정사범님을 모십니다. \n\n[주요업무]\n- 유치부 및 초등부 태권도 지도\n- 수련생 상담 및 관리\n- 도장 차량 동승 지도\n\n[우대사항]\n- 선수 출신 (겨루기/품새)\n- 인근 거주자 및 즉시 출근 가능자'
    },
    {
      id: 'job-2',
      gymName: '한빛 태권도장',
      title: '초보 가능! 보조사범님 모십니다 (시간협의)',
      region: '서울 송파구',
      address: '서울특별시 송파구 잠실동 312-5',
      salary: '월 280만원',
      type: '파트타임',
      exp: '경력무관',
      hotness: 'HOT',
      desc: '잠실에 위치한 한빛 태권도장에서 사범님으로서 첫 걸음을 떼실 보조사범님을 모집합니다. \n\n초보자분들도 관장님이 친절히 지도법을 전수해 드립니다. 밝고 아이들을 사랑하는 분들의 많은 지원 바랍니다. \n\n[근무시간]\n- 월~금 13:00 ~ 19:00 (시간 조율 가능)\n\n[자격조건]\n- 품새 지도 가능자\n- 유단자 (태권도 3단 이상 우대)'
    },
    {
      id: 'job-3',
      gymName: '용인 태권도장',
      title: '용인대 동문 도장 정사범 급구합니다',
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
      gymName: '대전 미래 태권도',
      title: '유치부/초등부 전임 파트타임 사범님 모집',
      region: '대전 서구',
      address: '대전광역시 서구 둔산동 980-1',
      salary: '월 250만원',
      type: '파트타임',
      exp: '경력무관',
      hotness: '',
      desc: '유치부 수련생 증가로 인해 유치부 케어 및 초등부 기초 지도를 담당해주실 보조/파트타임 사범님을 모십니다. \n\n아이들 눈높이에 맞춰 다정하고 쾌활하게 소통할 수 있는 사범님 환영합니다. \n\n[근무요일]\n- 주 5일 (월~금) 또는 주 3일 선택 가능'
    },
    {
      id: 'job-5',
      gymName: '부산 해운대 태권도',
      title: '수석사범 및 팀장급 사범님 초빙 (기숙사제공)',
      region: '부산 해운대구',
      address: '부산광역시 해운대구 우동 1400-2',
      salary: '월 350만원',
      type: '정규직',
      exp: '경력 3년↑',
      hotness: '',
      desc: '해운대 우동에 위치한 프리미엄 태권도장입니다. \n\n도장 전반을 관리하며 사범팀을 이끌어주실 능력 있는 수석사범님을 모집합니다. \n\n[대우 조건]\n- 월 급여 350만원 이상 (능력별 인센티브 추가 지급)\n- 최고급 1인 오피스텔 기숙사 무상 제공\n- 명절 보너스 및 정기 휴가 보장'
    }
  ];

  const mockTalents = [
    {
      id: 'talent-1',
      name: '김태권',
      gender: '남성',
      role: '정사범',
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
      role: '정사범',
      exp: '경력 7년',
      region: '인천 연수구',
      salary: '최저연봉 350만원',
      dan: '태권도 4단',
      license: '생활체육지도사',
      colorIndex: 2,
      intro: '체육관 관리 및 차량 주행 베테랑 정사범 박민우입니다. \n\n대형 운전면허 소지자로 셔틀 운행이 원활하며, 다양한 레크리에이션 프로그램을 운영해본 경험이 있습니다. \n\n아이들이 예의 바르고 바른 인성을 가진 사회적 인재로 자랄 수 있도록 인성교육에 힘쓰겠습니다.'
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
      role: '정사범',
      exp: '경력 4년',
      region: '경기 수원시',
      salary: '최저연봉 300만원',
      dan: '태권도 4단',
      license: '생활체육지도사',
      colorIndex: 4,
      intro: '겨루기 선수 출신의 패기 넘치는 사범 정도현입니다. \n\n시범단 기술(회전 발차기, 격파 등) 지도가 가능하여 고학년 및 중고등부 관원들을 활성화하는 데 장점이 있습니다. \n\n아이들과 땀 흘려 소통하는 진정성 있는 지도자가 되겠습니다.'
    }
  ];

  const mockPosts = [
    { id: 'post-1', category: 'recruit', title: '강남 지역 사범님 구인 현황 어떤가요?', author: '대호관장', date: '2026.06.07', views: 124 },
    { id: 'post-2', category: 'recruit', title: '초보 사범 면접 시 질문 팁 공유드립니다.', author: '정통관장', date: '2026.06.06', views: 245 },
    { id: 'post-3', category: 'knowhow', title: '원생 150명 돌파한 방학 특강 프로그램 기획서', author: '스마트태권', date: '2026.06.05', views: 412 },
    { id: 'post-4', category: 'knowhow', title: '학부모 소통 앱(클래스업) 연동 팁 공유', author: '혁신관장', date: '2026.06.03', views: 301 },
    { id: 'post-5', category: 'news', title: '세계태권도연맹, 새로운 룰 도입 발표', author: '태권뉴스', date: '2026.06.02', views: 520 },
    { id: 'post-6', category: 'news', title: '제50회 전국태권도대회 일정 확정 안내', author: '협회소식', date: '2026.06.01', views: 388 },
    { id: 'post-7', category: 'free', title: '오늘 수련시간에 너무 감동적인 일이 있었습니다.', author: '해피사범', date: '2026.06.08', views: 89 },
    { id: 'post-8', category: 'free', title: '주말 당직 서시는 사범님들 힘내세요!', author: '의리사범', date: '2026.06.07', views: 110 },
    { id: 'post-9', category: 'archive', title: '[자료] 신입 관원 입학원서 양식 (한글파일)', author: '태권도잡', date: '2026.06.05', views: 615 },
    { id: 'post-10', category: 'archive', title: '[자료] 줄넘기 급수표 및 심사 서식 공유', author: '체육자료', date: '2026.05.28', views: 803 }
  ];

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
  
  // App state
  const state = {
    jobsList: [...mockJobs],
    talentsList: [...mockTalents],
    communityPosts: [...mockPosts],
    filters: {
      jobs: { region: '', position: '', type: '' },
      talents: { regions: [], position: '' }
    },
    regions: [],
    selectedResumeRegions: [],
    selectedJobRegions: [],
    regionPickers: {}
  };

  // Views
  const views = {
    home: document.getElementById('view-home'),
    jobs: document.getElementById('view-jobs'),
    talents: document.getElementById('view-talents'),
    community: document.getElementById('view-community'),
    customerService: document.getElementById('view-customer-service')
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
    talentDetail: document.getElementById('dialog-talent-detail')
  };

  async function initJobsAndTalents() {
    if (!db) return;
    try {
      const jobSnap = await db.collection('jobs').orderBy('created_at', 'desc').get();
      const dbJobs = [];
      jobSnap.forEach((doc) => {
        const j = doc.data();
        dbJobs.push({
          id: doc.id,
          gymName: j.gymName || '도장',
          title: j.title || '채용공고',
          region: j.location || '전국',
          address: j.location ? `${j.location} 일대 태권도장` : '전국 일대 태권도장',
          salary: j.salary || '월 300만원',
          type: j.type || '정규직',
          exp: j.career || '경력무관',
          hotness: j.status === 'active' ? 'NEW' : '',
          desc: j.content || '',
          pinned: j.pinned || false
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

      const resumeSnap = await db.collection('resumes').orderBy('created_at', 'desc').get();
      const dbTalents = [];
      resumeSnap.forEach((doc) => {
        const r = doc.data();
        dbTalents.push({
          id: doc.id,
          name: r.name || '사범',
          gender: r.gender || '남성',
          role: r.hope_position || r.position || '정사범',
          exp: r.career || '경력무관',
          region: r.hope_area || '전국',
          salary: r.hope_salary || '월 280만원',
          dan: r.certificate ? r.certificate.split(',')[0].trim() : '태권도 3단',
          license: r.certificate ? r.certificate.split(',').slice(1).join(',').trim() : '태권도 지도자',
          colorIndex: Math.floor(Math.random() * 5),
          intro: r.content || ''
        });
      });
      if (dbTalents.length > 0) {
        state.talentsList = [...dbTalents];
      }
    } catch (e) {
      console.error('Firestore 채용공고/이력서 데이터 로드 에러:', e);
    }
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

  function createDistrictPicker({ rootId, inputId, mode = 'single', onChange }) {
    const root = document.getElementById(rootId);
    const input = document.getElementById(inputId);
    if (!root || !input || !window.RegionSync) return null;

    const grouped = RegionSync.groupBySido(state.regions);
    const sidoOrder = ['서울', '경기', '인천', '부산', '대구', '광주', '대전', '울산', '세종', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'];
    const sidos = sidoOrder.filter((sido) => grouped[sido]?.length);
    let activeSido = sidos[0] || '';
    let selected = [];

    root.innerHTML = `
      <button type="button" class="district-trigger">
        <span class="district-trigger-label">지역 전체</span>
        <span class="district-trigger-count"></span>
        <span class="district-trigger-icon">⌄</span>
      </button>
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
    const triggerLabel = root.querySelector('.district-trigger-label');
    const triggerCount = root.querySelector('.district-trigger-count');
    const sidoList = root.querySelector('.district-sido-list');
    const districtList = root.querySelector('.district-list');
    const selectedList = root.querySelector('.district-selected-list');
    const resetBtn = root.querySelector('.district-reset-btn');
    const applyBtn = root.querySelector('.district-apply-btn');
    const isFilterPicker = root.classList.contains('filter');

    function syncValue() {
      input.value = selected.map((region) => region.displayName).join(', ');
      if (!selected.length) {
        triggerLabel.textContent = isFilterPicker ? '지역' : '지역 전체';
        triggerCount.textContent = '';
      } else if (isFilterPicker) {
        triggerLabel.textContent = '지역';
        triggerCount.textContent = selected.length;
      } else if (selected.length === 1) {
        triggerLabel.textContent = selected[0].displayName;
        triggerCount.textContent = '';
      } else {
        triggerLabel.textContent = '지역';
        triggerCount.textContent = selected.length;
      }
      if (onChange) onChange(selected);
    }

    function togglePanel(force) {
      const isOpen = typeof force === 'boolean' ? force : !root.classList.contains('open');
      root.classList.toggle('open', isOpen);
      trigger.setAttribute('aria-expanded', String(isOpen));
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
          selected = selected.filter((item) => item.sidoShort !== activeSido);
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
            selected = selected.filter((item) => item.regionCode !== `sido-${region.sidoShort}`);
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
      if (selected[0]) activeSido = selected[0].sidoShort;
      renderSidos();
      renderDistricts();
      renderSelected();
      syncValue();
    }

    trigger.addEventListener('click', () => togglePanel());
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
      mode: 'multi'
    });
    state.regionPickers.jobFilter = createDistrictPicker({
      rootId: 'job-filter-region-picker',
      inputId: 'filter-job-region',
      mode: 'multi'
    });
    state.regionPickers.talentFilter = createDistrictPicker({
      rootId: 'talent-filter-region-picker',
      inputId: 'filter-talent-region',
      mode: 'multi'
    });
    state.regionPickers.resume = createDistrictPicker({
      rootId: 'resume-region-picker',
      inputId: 'res-region',
      mode: 'multi',
      onChange: (selected) => {
        state.selectedResumeRegions = selected.map((region) => region.displayName);
      }
    });
    state.regionPickers.job = createDistrictPicker({
      rootId: 'job-region-picker',
      inputId: 'job-region',
      mode: 'multi',
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

    // Remove active state from mobile bottom nav links
    Object.values(mobileNavLinks).forEach(link => {
      if (link) link.classList.remove('active');
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

    // Set active class on mobile bottom nav link
    const activeMobileLink = mobileNavLinks[viewId];
    if (activeMobileLink) {
      activeMobileLink.classList.add('active');
    }

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  function handleRoute() {
    const hash = window.location.hash || '#home';
    const cleanHash = hash.split('?')[0];

    switch (cleanHash) {
      case '#jobs':
        navigateToView('jobs');
        renderBoardJobs();
        break;
      case '#talents':
        navigateToView('talents');
        renderBoardTalents();
        break;

      case '#community':
        navigateToView('community');
        // Check if query params contain a specific tab
        const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
        const tab = params.get('tab') || 'recruit';
        setupCommunityTab(tab);
        break;
      case '#customer-service':
        navigateToView('customerService');
        break;
      case '#home':
      default:
        navigateToView('home');
        renderHomeJobs();
        renderHomeTalents();
        break;
    }
  }

  // Set up event listeners for nav
  window.addEventListener('hashchange', handleRoute);
  
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
  
  // Generate SVG avatar markup
  function createAvatarSvg(name, gender, index) {
    const initials = name.slice(1, 3) || name.charAt(0);
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
      badge = `<span class="badge-hot" style="background-color: var(--color-amber-500); color: #ffffff; font-weight: 800; font-size: 0.72rem; padding: 2px 8px; border-radius: 4px; display: inline-block; vertical-align: middle; margin-right: 6px;">상위 노출</span>`;
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
          ${job.views || 0}
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

    card.innerHTML = `
      <div class="talent-avatar-wrapper">
        ${createAvatarSvg(talent.name, talent.gender, talent.colorIndex)}
        <span class="talent-online-badge"></span>
      </div>
      <h3 class="talent-name">${talent.name}</h3>
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
    grid.innerHTML = '';
    
    // Render first 5 talents
    const recentTalents = state.talentsList.slice(0, 5);
    recentTalents.forEach(talent => {
      grid.appendChild(createTalentCardElement(talent));
    });
  }

  // Render jobs on the Job Board view with current filters
  function renderBoardJobs() {
    const grid = document.getElementById('board-jobs-grid');
    const countEl = document.getElementById('jobs-results-count');
    if (!grid) return;
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

    // Render corresponding posts
    const container = document.getElementById('community-posts-container');
    const countEl = document.getElementById('community-posts-count');
    if (!container) return;
    container.innerHTML = '';

    const filteredPosts = state.communityPosts.filter(post => post.category === tabName);
    
    if (countEl) {
      const categoryNames = {
        recruit: '사범 구인구직',
        knowhow: '도장 운영 노하우',
        news: '태권도 뉴스',
        free: '자유게시판',
        archive: '자료실'
      };
      countEl.textContent = `${categoryNames[tabName] || '게시글'} 목록 (${filteredPosts.length}개)`;
    }

    if (filteredPosts.length === 0) {
      container.innerHTML = '<div class="no-results">등록된 게시글이 없습니다.</div>';
      return;
    }

    filteredPosts.forEach(post => {
      const row = document.createElement('div');
      row.className = 'post-row';
      row.innerHTML = `
        <div class="post-main-info">
          <h3>${post.title}</h3>
          <div class="post-meta-line">
            <span class="post-author">${post.author}</span>
            <span class="post-date">${post.date}</span>
          </div>
        </div>
        <div class="post-views">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          <span>${post.views}</span>
        </div>
      `;

      row.addEventListener('click', () => {
        alert(`게시물 상세 보기:\n"${post.title}"\n(이 기능은 프로토타입 범위 이외입니다.)`);
      });

      container.appendChild(row);
    });
  }

  // Hook up community tabs clicks
  document.querySelectorAll('.comm-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      const targetTab = e.target.dataset.filter;
      window.location.hash = `#community?tab=${targetTab}`;
    });
  });


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
  const roleInputs = document.querySelectorAll('input[name="user-role"]');
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
      if (pane) pane.classList.add('hidden');
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
          validMsg: validationInfo.valid_msg || ''
        };

        setBusinessResult(businessValidateResult, '진위확인 완료. 계속사업자 상태조회 중입니다.', '');
        await waitForPaint();
        const statusInfo = await checkBusinessStatus(businessNumber);
        businessStatusCheck = {
          businessNumber,
          status: statusInfo.b_stt || '',
          statusCode: statusInfo.b_stt_cd || '',
          taxType: statusInfo.tax_type || ''
        };
        setBusinessResult(businessValidateResult, '사업자 정보가 일치하고 계속사업자로 확인되었습니다.', 'success');
      } catch (err) {
        businessStatusCheck = null;
        businessValidation = null;
        setBusinessResult(businessValidateResult, err.message || '사업자 확인에 실패했습니다.', 'error');
      } finally {
        businessValidateButton.disabled = false;
        businessValidateButton.textContent = '사업자 확인';
      }
    });
  }
  syncBusinessNumberField();

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
    const password = document.getElementById('reg-password').value;
    const type     = document.querySelector('input[name="user-role"]:checked')?.value || 'instructor';
    const { businessNumber, businessStartDate, businessOwnerName, gymName } = getCurrentBusinessPayload();
    const submitBtn = formRegister.querySelector('button[type="submit"]');
    submitBtn.textContent = '가입 중...';
    submitBtn.disabled = true;

    if (!auth || !db) {
      showAuthError('파이어베이스 설정이 완료되지 않았습니다.');
      submitBtn.textContent = '회원가입하기'; submitBtn.disabled = false; return;
    }
    try {
      if (type === 'gym') {
        if (!gymName) {
          showAuthError('상호명을 입력해주세요.');
          return;
        }
        if (businessNumber.length !== 10) {
          showAuthError('사업자등록번호 10자리를 입력해주세요.');
          return;
        }
        if (businessStartDate.length !== 8) {
          showAuthError('개업일자 8자리를 입력해주세요. 예: 20200101');
          return;
        }
        if (!businessOwnerName) {
          showAuthError('대표자명을 입력해주세요.');
          return;
        }
        if (!isBusinessValidated({ businessNumber, businessStartDate, businessOwnerName }) || !isBusinessStatusChecked({ businessNumber })) {
          showAuthError('사업자 확인을 먼저 완료해주세요. 진위확인과 계속사업자 상태조회가 모두 통과되어야 합니다.');
          return;
        }
      }

      submitBtn.textContent = '가입 중...';

      // 1. Firebase Auth 계정 생성
      const cred = await auth.createUserWithEmailAndPassword(email, password);
      const uid  = cred.user.uid;

      // 2. Firestore users 콜렉션에 추가 정보 저장
      const userData = {
        name,
        email,
        type,                        // 'gym' | 'instructor'
        created_at: firebase.firestore.FieldValue.serverTimestamp()
      };

      if (type === 'gym') {
        userData.gym_name = gymName;
        userData.business_number = businessNumber;
        userData.business_start_date = businessStartDate;
        userData.business_owner_name = businessOwnerName;
        userData.business_status = businessStatusCheck?.status || '';
        userData.business_status_code = businessStatusCheck?.statusCode || '';
        userData.business_valid = businessValidation?.valid || '';
        userData.business_valid_msg = businessValidation?.validMsg || '';
        userData.business_verified_at = firebase.firestore.FieldValue.serverTimestamp();
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
    } catch (err) {
      const msg = err.code === 'auth/email-already-in-use'
        ? '이미 사용 중인 이메일입니다.'
        : err.code === 'auth/weak-password'
        ? '비밀번호는 6자 이상이어야 합니다.'
        : err.message
        ? err.message
        : '회원가입에 실패했습니다. (' + err.code + ')';
      showAuthError(msg);
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

  // Open Job Post dialog
  const postJobTriggers = [
    document.getElementById('hero-btn-post-job'),
    document.getElementById('board-btn-post-job')
  ];
  
  postJobTriggers.forEach(trigger => {
    if (trigger) {
      trigger.addEventListener('click', () => {
        if (dialogs.postJob) dialogs.postJob.showModal();
      });
    }
  });

  // Open Resume Post dialog
  const postResumeTriggers = [
    document.getElementById('hero-btn-post-resume'),
    document.getElementById('board-btn-post-resume')
  ];
  
  postResumeTriggers.forEach(trigger => {
    if (trigger) {
      trigger.addEventListener('click', () => {
        if (dialogs.postResume) dialogs.postResume.showModal();
      });
    }
  });


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
      const position = document.getElementById('job-position').value;
      const salary = document.getElementById('job-salary').value;
      const type = document.getElementById('job-type').value;
      const exp = document.getElementById('job-exp').value;
      const hotness = document.getElementById('job-hotness').value;
      const desc = document.getElementById('job-desc').value;

      if (!state.selectedJobRegions || !state.selectedJobRegions.length) {
        alert('근무 지역을 1개 이상 선택해주세요.');
        return;
      }

      const newJobData = {
        user_id: userId,
        gymName,
        title: `${title} (${position})`,
        location: region,
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
          const docRef = await db.collection('jobs').add(newJobData);
          const docId = docRef.id;

          const newJob = {
            id: docId,
            gymName,
            title: `${title} (${position})`,
            region,
            address: `${region} 일대 태권도장`,
            salary,
            type,
            exp,
            hotness,
            desc
          };

          // Add to front of database
          state.jobsList.unshift(newJob);

          // Close dialog & reset form
          dialogs.postJob.close();
          formPostJob.reset();
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
        created_at: firebase.firestore.FieldValue.serverTimestamp()
      };

      if (db) {
        try {
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
            intro
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


  // ==========================================================================
  // 9. Details Dialog Fillers
  // ==========================================================================
  
  function openJobDetails(job) {
    if (!dialogs.jobDetail) return;
    
    // Increment views locally first
    job.views = (job.views || 0) + 1;
    
    const viewsEl = document.getElementById('detail-job-views');
    if (viewsEl) {
      viewsEl.textContent = job.views;
    }
    
    const applyBtn = document.getElementById('btn-apply-job');
    if (applyBtn) {
      applyBtn.dataset.jobId = job.id;
      applyBtn.dataset.jobTitle = job.title;
      applyBtn.dataset.gymName = job.gymName;
    }
    
    document.getElementById('detail-job-gym').textContent = job.gymName;
    document.getElementById('detail-job-type').textContent = job.type;
    document.getElementById('detail-job-title').textContent = job.title;
    document.getElementById('detail-job-region-pos').textContent = `${job.region} | ${job.type}`;
    document.getElementById('detail-job-salary').textContent = job.salary;
    document.getElementById('detail-job-exp').textContent = job.exp;
    document.getElementById('detail-job-addr').textContent = job.address;
    document.getElementById('detail-job-desc').textContent = job.desc;

    dialogs.jobDetail.showModal();

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
  }

  function openTalentDetails(talent) {
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
    document.getElementById('detail-talent-desc').textContent = talent.intro;

    dialogs.talentDetail.showModal();
  }

  // Premium View Products alert
  const premiumBtn = document.getElementById('btn-premium-products');
  if (premiumBtn) {
    premiumBtn.addEventListener('click', () => {
      alert('태권잡 프리미엄 서비스:\n\n1. 상단 고정 노출 (7일) - 55,000원\n2. 상단 고정 노출 (30일) - 165,000원\n\n결제 및 신청은 고객센터(02-123-4567)로 유선 연락 주시면 즉시 반영해 드립니다.');
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
    updateStats();
  });
  handleRoute();

  // ==========================================================================
  // 11. Firebase Auth 상태 감지 → 헤더 UI 업데이트
  // ==========================================================================
  if (auth) {
    auth.onAuthStateChanged(async (user) => {
      const loggedOut = document.getElementById('auth-logged-out');
      const loggedIn  = document.getElementById('auth-logged-in');
      const nameEl    = document.getElementById('auth-user-name');
      const adminLink = document.getElementById('btn-admin-link');

      if (user) {
        // 로그인 상태: 유저 이름 + 버튼 표시
        loggedOut.style.display = 'none';
        loggedIn.style.display  = 'flex';

        // Firestore에서 type 확인
        try {
          const snap = await db.collection('users').doc(user.uid).get();
          const data = snap.data();
          if (data) {
            nameEl.textContent = data.name || user.email;
            // 도장(관장) 타입이면 관리자 링크 노출
            if (data.type === 'gym') {
              adminLink.style.display = 'inline-flex';
            } else {
              adminLink.style.display = 'none';
            }
          } else {
            nameEl.textContent = user.email;
            adminLink.style.display = 'none';
          }
        } catch (e) {
          nameEl.textContent = user.email;
          adminLink.style.display = 'none';
        }
      } else {
        // 비로그인 상태
        loggedOut.style.display = 'flex';
        loggedIn.style.display  = 'none';
        if (adminLink) adminLink.style.display = 'none';
      }
    });
  }

  // ─── 즉시 지원 이벤트 바인딩 ───
  const btnApplyJob = document.getElementById('btn-apply-job');
  if (btnApplyJob) {
    btnApplyJob.addEventListener('click', async () => {
      const jobId = btnApplyJob.dataset.jobId;
      const jobTitle = btnApplyJob.dataset.jobTitle;
      const gymName = btnApplyJob.dataset.gymName;
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

        // 4. 지원 등록 (rules에 맞게 4개 필드만 전송)
        const applyData = {
          job_id: jobId,
          resume_id: resumeId,
          status: 'pending',
          created_at: firebase.firestore.FieldValue.serverTimestamp()
        };

        btnApplyJob.disabled = true;
        btnApplyJob.textContent = '지원 중...';

        await db.collection('apply').add(applyData);

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

});
