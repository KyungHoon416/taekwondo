/**
 * Taekwon Career - Firestore Seeding Script
 * 
 * This script seeds mock data matching the DB 구상도 schema
 * into Cloud Firestore.
 * 
 * Usage:
 * 1. Install firebase dependency: npm install firebase
 * 2. Configure your firebase config object below.
 * 3. Run script: node seed.js
 */

const { initializeApp } = require('firebase/app');
const { getFirestore, doc, setDoc, collection, Timestamp } = require('firebase/firestore');

// TODO: Replace with your actual Firebase Project Configuration
// You can find this in your Firebase Console -> Project Settings -> General -> Web Apps
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "taekwondo-2026-kh.firebaseapp.com",
  projectId: "taekwondo-2026-kh",
  storageBucket: "taekwondo-2026-kh.firebasestorage.app",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Mock Data matching the schema
const mockUsers = [
  {
    id: 'user-gym-1',
    name: '강남 태권도장',
    phone: '02-123-4567',
    email: 'gangnam@taekwonjob.com',
    type: 'gym',
    created_at: Timestamp.now()
  },
  {
    id: 'user-gym-2',
    name: '한빛 태권도장',
    phone: '02-765-4321',
    email: 'hanbit@taekwonjob.com',
    type: 'gym',
    created_at: Timestamp.now()
  },
  {
    id: 'user-instructor-1',
    name: '김태권',
    phone: '010-1234-5678',
    email: 'kim@taekwonjob.com',
    type: 'instructor',
    created_at: Timestamp.now()
  },
  {
    id: 'user-instructor-2',
    name: '이수진',
    phone: '010-8765-4321',
    email: 'lee@taekwonjob.com',
    type: 'instructor',
    created_at: Timestamp.now()
  }
];

const mockJobs = [
  {
    id: 'job-1',
    user_id: 'user-gym-1',
    title: '메인사범 모집 (우대: 겨루기 선수 출신)',
    salary: '월 320만원',
    location: '서울 강남구 역삼동',
    career: '경력 3년 이상',
    content: '체계적이고 열정적으로 아이들을 지도해주실 유능한 메인사범님을 모십니다. 선수 출신 우대합니다.',
    status: 'active',
    created_at: Timestamp.now()
  },
  {
    id: 'job-2',
    user_id: 'user-gym-2',
    title: '초보 가능! 보조사범님 모십니다 (시간협의)',
    salary: '월 280만원',
    location: '서울 송파구 잠실동',
    career: '경력무관',
    content: '밝고 아이들을 사랑하는 보조사범님을 모집합니다. 초보자분들도 관장님이 친절히 지도법을 전수해 드립니다.',
    status: 'active',
    created_at: Timestamp.now()
  }
];

const mockResumes = [
  {
    id: 'resume-1',
    user_id: 'user-instructor-1',
    career: '태권도장 사범 경력 5년',
    certificate: '태권도 4단, 생활체육지도사 2급',
    hope_area: '서울 강남구',
    hope_salary: '연봉 3,200만원',
    content: '열정과 책임감으로 아이들을 지도하겠습니다. 품새단 선수 출신입니다.'
  },
  {
    id: 'resume-2',
    user_id: 'user-instructor-2',
    career: '보조사범 경력 3년',
    certificate: '태권도 3단, 유아체육지도사 1급',
    hope_area: '경기 성남시',
    hope_salary: '연봉 2,800만원',
    content: '유아체육 프로그램 기획에 강점이 있습니다. 아이들 눈높이에 맞춰 지도하겠습니다.'
  }
];

const mockApplies = [
  {
    id: 'apply-1',
    job_id: 'job-1',
    resume_id: 'resume-1',
    status: 'pending',
    created_at: Timestamp.now()
  }
];

async function seedDatabase() {
  console.log('Starting DB seeding...');

  try {
    // 1. Seed Users
    console.log('Seeding users...');
    for (const user of mockUsers) {
      const { id, ...userData } = user;
      await setDoc(doc(db, 'users', id), userData);
    }

    // 2. Seed Jobs
    console.log('Seeding jobs...');
    for (const job of mockJobs) {
      const { id, ...jobData } = job;
      await setDoc(doc(db, 'jobs', id), jobData);
    }

    // 3. Seed Resumes
    console.log('Seeding resumes...');
    for (const resume of mockResumes) {
      const { id, ...resumeData } = resume;
      await setDoc(doc(db, 'resumes', id), resumeData);
    }

    // 4. Seed Applies
    console.log('Seeding applications...');
    for (const apply of mockApplies) {
      const { id, ...applyData } = apply;
      await setDoc(doc(db, 'apply', id), applyData);
    }

    console.log('🎉 DB seeding completed successfully!');
  } catch (error) {
    console.error('❌ Error seeding database:', error);
  }
}

seedDatabase();
