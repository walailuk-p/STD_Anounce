/**
 * ScoreAnnounce - Type Definitions
 */

export interface Course {
  id: string; // e.g., 'CS211_2026_1'
  code: string; // e.g., 'CS211'
  title: string; // e.g., 'โครงสร้างข้อมูลและขั้นตอนวิธี'
  term: string; // e.g., '1/2569'
  instructorUid: string;
  instructorEmail: string;
  createdAt: string;
  updatedAt: string;
}

export interface Section {
  id: string; // e.g., 'CS211_2026_1_sec1'
  courseId: string;
  sec: string; // e.g., '1', '2', 'Sec 1'
  isPublished: boolean;
  studentCount: number;
  instructorUid: string;
  publishedAt?: string;
  updatedAt: string;
}

export interface StudentScore {
  id: string; // composite key: `${courseId}_${studentId}`
  courseId: string;
  courseCode: string;
  courseName: string;
  studentId: string; // e.g., '1650701234'
  no: string; // เลขที่ e.g., '1'
  name: string; // ชื่อ-นามสกุล e.g., 'สมชาย ใจดี'
  sec: string; // กลุ่มเรียน e.g., '1'
  
  // Specific Score Breakdown
  atten: number; // เข้าเรียน (เต็ม 10)
  ca: number;    // งานในชั้นเรียน (เต็ม 10)
  as: number;    // การบ้าน (เต็ม 20)
  mid: number;   // สอบกลางภาค (เต็ม 25)
  total: number; // คะแนนรวม (เต็ม 65)

  isPublished: boolean;
  
  // Security & Student Verification
  pinHash?: string | null; // SHA-256 hash of 6-digit pin + salt
  pinSalt?: string | null; // Random cryptographic salt
  pinAttempts?: number;    // Failed attempts counter
  lockedUntil?: string | null; // ISO timestamp if locked

  instructorUid: string;
  updatedAt: string;
}

export interface TeacherUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  isBuDomain: boolean;
}
