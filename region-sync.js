/* ==========================================================================
   Region Sync / Region Picker helpers
   ========================================================================== */
(function () {
  const SERVICE_KEY = '99546afda95844c23df25ca3cc6c60c4b3b9cc594ba5822a5fa49ecc62391d4e';
  const API_URL = 'https://apis.data.go.kr/1741000/StanReginCd/getStanReginCdList';
  const META_DOC = ['region_meta', 'sync'];
  const SIDO_SHORT = {
    '서울특별시': '서울',
    '부산광역시': '부산',
    '대구광역시': '대구',
    '인천광역시': '인천',
    '광주광역시': '광주',
    '대전광역시': '대전',
    '울산광역시': '울산',
    '세종특별자치시': '세종',
    '경기도': '경기',
    '강원특별자치도': '강원',
    '충청북도': '충북',
    '충청남도': '충남',
    '전북특별자치도': '전북',
    '전라남도': '전남',
    '경상북도': '경북',
    '경상남도': '경남',
    '제주특별자치도': '제주'
  };

  const FALLBACK_REGION_GROUPS = {
    서울: ['종로구', '중구', '용산구', '성동구', '광진구', '동대문구', '중랑구', '성북구', '강북구', '도봉구', '노원구', '은평구', '서대문구', '마포구', '양천구', '강서구', '구로구', '금천구', '영등포구', '동작구', '관악구', '서초구', '강남구', '송파구', '강동구'],
    경기: ['수원특례시', '성남시', '의정부시', '안양시', '부천시', '광명시', '평택시', '동두천시', '안산시', '고양특례시', '과천시', '구리시', '남양주시', '오산시', '시흥시', '군포시', '의왕시', '하남시', '용인특례시', '파주시', '이천시', '안성시', '김포시', '화성특례시', '광주시', '양주시', '포천시', '여주시', '연천군', '가평군', '양평군'],
    인천: ['중구', '동구', '미추홀구', '연수구', '남동구', '부평구', '계양구', '서구', '강화군', '옹진군'],
    부산: ['중구', '서구', '동구', '영도구', '부산진구', '동래구', '남구', '북구', '해운대구', '사하구', '금정구', '강서구', '연제구', '수영구', '사상구', '기장군'],
    대구: ['중구', '동구', '서구', '남구', '북구', '수성구', '달서구', '달성군', '군위군'],
    광주: ['동구', '서구', '남구', '북구', '광산구'],
    대전: ['동구', '중구', '서구', '유성구', '대덕구'],
    울산: ['중구', '남구', '동구', '북구', '울주군'],
    세종: ['세종시'],
    강원: ['춘천시', '원주시', '강릉시', '동해시', '태백시', '속초시', '삼척시', '홍천군', '횡성군', '영월군', '평창군', '정선군', '철원군', '화천군', '양구군', '인제군', '고성군', '양양군'],
    충북: ['청주시', '충주시', '제천시', '보은군', '옥천군', '영동군', '증평군', '진천군', '괴산군', '음성군', '단양군'],
    충남: ['천안시', '공주시', '보령시', '아산시', '서산시', '논산시', '계룡시', '당진시', '금산군', '부여군', '서천군', '청양군', '홍성군', '예산군', '태안군'],
    전북: ['전주시', '군산시', '익산시', '정읍시', '남원시', '김제시', '완주군', '진안군', '무주군', '장수군', '임실군', '순창군', '고창군', '부안군'],
    전남: ['목포시', '여수시', '순천시', '나주시', '광양시', '담양군', '곡성군', '구례군', '고흥군', '보성군', '화순군', '장흥군', '강진군', '해남군', '영암군', '무안군', '함평군', '영광군', '장성군', '완도군', '진도군', '신안군'],
    경북: ['포항시', '경주시', '김천시', '안동시', '구미시', '영주시', '영천시', '상주시', '문경시', '경산시', '의성군', '청송군', '영양군', '영덕군', '청도군', '고령군', '성주군', '칠곡군', '예천군', '봉화군', '울진군', '울릉군'],
    경남: ['창원특례시', '진주시', '통영시', '사천시', '김해시', '밀양시', '거제시', '양산시', '의령군', '함안군', '창녕군', '고성군', '남해군', '하동군', '산청군', '함양군', '거창군', '합천군'],
    제주: ['제주시', '서귀포시']
  };

  const SIDO_FULL_BY_SHORT = Object.entries(SIDO_SHORT).reduce((acc, [full, short]) => {
    acc[short] = full;
    return acc;
  }, {});

  const FALLBACK_REGIONS = Object.entries(FALLBACK_REGION_GROUPS).flatMap(([sidoShort, sigungus], sidoIndex) => {
    const sido = SIDO_FULL_BY_SHORT[sidoShort] || sidoShort;
    return sigungus.map((sigungu, sigunguIndex) => ({
      sido,
      sidoShort,
      sigungu,
      fullName: `${sido} ${sigungu}`,
      displayName: `${sidoShort} ${sigungu}`,
      regionCode: `fallback-${String(sidoIndex + 1).padStart(2, '0')}-${String(sigunguIndex + 1).padStart(3, '0')}`,
      useYn: 'Y'
    }));
  });

  function getDb() {
    try {
      return firebase.firestore();
    } catch (_) {
      return null;
    }
  }

  function normalizeSido(sido) {
    return SIDO_SHORT[sido] || sido.replace(/특별자치도|특별자치시|광역시|특별시|도$/g, '');
  }

  function normalizeRegion(row) {
    const parts = String(row.locatadd_nm || '').trim().split(/\s+/);
    const sido = parts[0] || '';
    const sigungu = parts.slice(1).join(' ') || (normalizeSido(sido) === '세종' ? '세종시' : '');
    if (!sido || !sigungu) return null;
    const sidoShort = normalizeSido(sido);
    return {
      sido,
      sidoShort,
      sigungu,
      fullName: `${sido} ${sigungu}`,
      displayName: `${sidoShort} ${sigungu}`,
      regionCode: String(row.region_cd || ''),
      useYn: 'Y'
    };
  }

  function extractRows(payload) {
    return payload?.StanReginCd?.find((item) => Array.isArray(item.row))?.row || [];
  }

  function extractTotalCount(payload) {
    const head = payload?.StanReginCd?.find((item) => Array.isArray(item.head))?.head || [];
    return Number(head.find((item) => item.totalCount)?.totalCount || 0);
  }

  function isSigunguRow(row) {
    return row &&
      String(row.sgg_cd || '') !== '000' &&
      String(row.umd_cd || '') === '000' &&
      String(row.ri_cd || '') === '00';
  }

  async function fetchRegionPage(pageNo, numOfRows) {
    const params = new URLSearchParams({
      ServiceKey: SERVICE_KEY,
      type: 'json',
      pageNo: String(pageNo),
      numOfRows: String(numOfRows),
      flag: 'Y'
    });
    const response = await fetch(`${API_URL}?${params.toString()}`);
    if (!response.ok) {
      throw new Error(`법정동코드 API 호출 실패 (${response.status})`);
    }
    return response.json();
  }

  async function fetchAllRegions(onProgress) {
    const first = await fetchRegionPage(1, 1);
    const totalCount = extractTotalCount(first);
    if (!totalCount) throw new Error('법정동코드 전체 건수를 확인하지 못했습니다.');

    const pageSize = 5000;
    const pageCount = Math.ceil(totalCount / pageSize);
    const byCode = new Map();

    for (let page = 1; page <= pageCount; page += 1) {
      const payload = await fetchRegionPage(page, pageSize);
      extractRows(payload).filter(isSigunguRow).forEach((row) => {
        const region = normalizeRegion(row);
        if (region?.regionCode) byCode.set(region.regionCode, region);
      });
      if (onProgress) onProgress({ page, pageCount, totalCount, count: byCode.size });
    }

    return Array.from(byCode.values()).sort((a, b) => a.regionCode.localeCompare(b.regionCode));
  }

  function chunk(items, size) {
    const chunks = [];
    for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
    return chunks;
  }

  async function saveRegions(regions) {
    const db = getDb();
    if (!db) throw new Error('Firestore가 초기화되지 않았습니다.');
    const oldSnap = await db.collection('regions').get();
    const deletes = oldSnap.docs
      .filter((doc) => !regions.some((region) => region.regionCode === doc.id))
      .map((doc) => ({ type: 'delete', ref: doc.ref }));
    const writes = regions.map((region) => ({
      type: 'set',
      ref: db.collection('regions').doc(region.regionCode),
      data: {
        ...region,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }
    }));

    for (const ops of chunk([...writes, ...deletes], 450)) {
      const batch = db.batch();
      ops.forEach((op) => {
        if (op.type === 'delete') batch.delete(op.ref);
        else batch.set(op.ref, op.data, { merge: true });
      });
      await batch.commit();
    }

    await db.doc(META_DOC.join('/')).set({
      lastSyncedAt: firebase.firestore.FieldValue.serverTimestamp(),
      totalCount: regions.length,
      status: 'success',
      errorMessage: ''
    }, { merge: true });
  }

  async function markSyncFailed(message) {
    const db = getDb();
    if (!db) return;
    await db.doc(META_DOC.join('/')).set({
      lastFailedAt: firebase.firestore.FieldValue.serverTimestamp(),
      status: 'failed',
      errorMessage: message || '지역 데이터 갱신에 실패했습니다.'
    }, { merge: true });
  }

  async function loadRegions() {
    const db = getDb();
    if (!db) return FALLBACK_REGIONS;
    try {
      const snap = await db.collection('regions').where('useYn', '==', 'Y').get();
      const regions = snap.docs.map((doc) => doc.data()).sort((a, b) => String(a.regionCode).localeCompare(String(b.regionCode)));
      if (!regions.length) return FALLBACK_REGIONS;
      const byDisplayName = new Map();
      FALLBACK_REGIONS.forEach((region) => byDisplayName.set(region.displayName, region));
      regions.forEach((region) => byDisplayName.set(region.displayName, region));
      return Array.from(byDisplayName.values()).sort((a, b) => String(a.regionCode).localeCompare(String(b.regionCode)));
    } catch (err) {
      console.warn('지역 데이터를 불러오지 못해 기본 지역 목록을 사용합니다.', err);
      return FALLBACK_REGIONS;
    }
  }

  async function loadMeta() {
    const db = getDb();
    if (!db) return null;
    const snap = await db.doc(META_DOC.join('/')).get();
    return snap.exists ? snap.data() : null;
  }

  function groupBySido(regions) {
    return regions.reduce((acc, region) => {
      if (!acc[region.sidoShort]) acc[region.sidoShort] = [];
      acc[region.sidoShort].push(region);
      return acc;
    }, {});
  }

  function populateSelect(select, regions, placeholder) {
    if (!select) return;
    const current = select.value;
    select.innerHTML = '';
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = placeholder || '지역을 선택하세요';
    select.appendChild(empty);
    regions.forEach((region) => {
      const option = document.createElement('option');
      option.value = region.displayName;
      option.textContent = region.displayName;
      option.dataset.regionCode = region.regionCode;
      option.dataset.sido = region.sidoShort;
      option.dataset.sigungu = region.sigungu;
      select.appendChild(option);
    });
    if ([...select.options].some((option) => option.value === current)) {
      select.value = current;
    }
  }

  window.RegionSync = {
    fetchAllRegions,
    saveRegions,
    markSyncFailed,
    loadRegions,
    loadMeta,
    groupBySido,
    populateSelect,
    fallbackRegions: FALLBACK_REGIONS
  };
})();
