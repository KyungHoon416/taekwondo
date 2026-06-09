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

// 에러 토스트 하퍼
function showAuthError(msg) {
  let el = document.getElementById('auth-error-msg');
  if (el) { el.textContent = msg; el.style.display = 'block'; }
}
function clearAuthError() {
  let el = document.getElementById('auth-error-msg');
  if (el) { el.textContent = ''; el.style.display = 'none'; }
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
      talents: { region: '', position: '' }
    }
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

    const badge = job.hotness 
      ? `<span class="badge-${job.hotness.toLowerCase()}">${job.hotness}</span>` 
      : '';

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
      const regionMatch = !state.filters.jobs.region || job.region === state.filters.jobs.region;
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
      const regionMatch = !state.filters.talents.region || talent.region === state.filters.talents.region;
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
      // Timeout to wait for form default reset behavior to clear value
      setTimeout(renderBoardJobs, 50);
    });
  }

  // Talent Board detailed filter form submit
  const talentsFilterForm = document.getElementById('talents-filter-form');
  if (talentsFilterForm) {
    talentsFilterForm.addEventListener('submit', (e) => {
      e.preventDefault();
      state.filters.talents.region = document.getElementById('filter-talent-region').value;
      state.filters.talents.position = document.getElementById('filter-talent-position').value;
      renderBoardTalents();
    });

    document.getElementById('btn-talent-filter-reset').addEventListener('click', () => {
      state.filters.talents = { region: '', position: '' };
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

  function openAuthDialog(activeTab) {
    if (!dialogs.auth) return;
    
    // Switch active tabs
    if (activeTab === 'login') {
      tabLogin.classList.add('active');
      tabRegister.classList.remove('active');
      formLogin.classList.remove('hidden');
      formRegister.classList.add('hidden');
    } else {
      tabLogin.classList.remove('active');
      tabRegister.classList.add('active');
      formLogin.classList.add('hidden');
      formRegister.classList.remove('hidden');
    }
    
    dialogs.auth.showModal();
  }

  // ─── 로그인 트리거 ─────────────────────────────────────────────────────────
  if (loginTrigger) loginTrigger.addEventListener('click', () => openAuthDialog('login'));
  if (registerTrigger) registerTrigger.addEventListener('click', () => openAuthDialog('register'));

  tabLogin.addEventListener('click', () => openAuthDialog('login'));
  tabRegister.addEventListener('click', () => openAuthDialog('register'));

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

  // ─── 회원가입 폼 제출 (Firebase Auth + Firestore) ─────────────────────────────
  formRegister.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAuthError();
    const name     = document.getElementById('reg-name').value.trim();
    const email    = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const type     = document.querySelector('input[name="user-role"]:checked')?.value || 'instructor';
    const submitBtn = formRegister.querySelector('button[type="submit"]');
    submitBtn.textContent = '가입 중...';
    submitBtn.disabled = true;

    if (!auth || !db) {
      showAuthError('파이어베이스 설정이 완료되지 않았습니다.');
      submitBtn.textContent = '회원가입하기'; submitBtn.disabled = false; return;
    }
    try {
      // 1. Firebase Auth 계정 생성
      const cred = await auth.createUserWithEmailAndPassword(email, password);
      const uid  = cred.user.uid;

      // 2. Firestore users 콜렉션에 추가 정보 저장
      await db.collection('users').doc(uid).set({
        name,
        email,
        type,                        // 'gym' | 'instructor'
        created_at: firebase.firestore.FieldValue.serverTimestamp()
      });

      dialogs.auth.close();
      formRegister.reset();
    } catch (err) {
      const msg = err.code === 'auth/email-already-in-use'
        ? '이미 사용 중인 이메일입니다.'
        : err.code === 'auth/weak-password'
        ? '비밀번호는 6자 이상이어야 합니다.'
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
    formPostJob.addEventListener('submit', (e) => {
      e.preventDefault();
      
      const gymName = document.getElementById('job-gym-name').value;
      const title = document.getElementById('job-title').value;
      const region = document.getElementById('job-region').value;
      const position = document.getElementById('job-position').value;
      const salary = document.getElementById('job-salary').value;
      const type = document.getElementById('job-type').value;
      const exp = document.getElementById('job-exp').value;
      const hotness = document.getElementById('job-hotness').value;
      const desc = document.getElementById('job-desc').value;

      const newJob = {
        id: `job-${Date.now()}`,
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

      // Alert & refresh UI lists
      alert('채용공고가 성공적으로 등록되었습니다!');
      
      // Update statistics
      updateStats();
      
      // Re-render
      renderHomeJobs();
      renderBoardJobs();
    });
  }

  // Submit Resume Post
  const formPostResume = document.getElementById('form-post-resume');
  if (formPostResume) {
    formPostResume.addEventListener('submit', (e) => {
      e.preventDefault();

      const name = document.getElementById('res-name').value;
      const gender = document.getElementById('res-gender').value;
      const region = document.getElementById('res-region').value;
      const position = document.getElementById('res-position').value;
      const salary = document.getElementById('res-salary').value;
      const exp = document.getElementById('res-exp').value;
      const dan = document.getElementById('res-dan').value;
      const license = document.getElementById('res-license').value;
      const intro = document.getElementById('res-intro').value;

      const newTalent = {
        id: `talent-${Date.now()}`,
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

      alert('이력서가 성공적으로 등록되었습니다!');
      
      updateStats();
      
      renderHomeTalents();
      renderBoardTalents();
    });
  }


  // ==========================================================================
  // 9. Details Dialog Fillers
  // ==========================================================================
  
  function openJobDetails(job) {
    if (!dialogs.jobDetail) return;
    
    document.getElementById('detail-job-gym').textContent = job.gymName;
    document.getElementById('detail-job-type').textContent = job.type;
    document.getElementById('detail-job-title').textContent = job.title;
    document.getElementById('detail-job-region-pos').textContent = `${job.region} | ${job.type}`;
    document.getElementById('detail-job-salary').textContent = job.salary;
    document.getElementById('detail-job-exp').textContent = job.exp;
    document.getElementById('detail-job-addr').textContent = job.address;
    document.getElementById('detail-job-desc').textContent = job.desc;

    dialogs.jobDetail.showModal();
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
  handleRoute();
  updateStats();

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

});
