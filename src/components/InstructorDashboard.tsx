import React, { useState, useEffect, useRef } from 'react';
import {
  LogIn,
  LogOut,
  Upload,
  Download,
  Plus,
  Trash2,
  Edit2,
  Check,
  AlertCircle,
  AlertTriangle,
  Eye,
  EyeOff,
  RefreshCw,
  Search,
  Filter,
  Users,
  BookOpen,
  Sparkles,
  KeyRound,
  FileSpreadsheet,
  CheckCircle2,
  HelpCircle,
  X
} from 'lucide-react';
import { Course, Section, StudentScore, TeacherUser } from '../types';
import {
  auth,
  googleProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from '../firebase';
import {
  getCourses,
  saveCourse,
  deleteCourse,
  deleteCourseWithData,
  deleteSectionWithScores,
  getSections,
  getTeacherScores,
  saveSingleScore,
  resetStudentPinByTeacher,
  deleteSingleScore,
  batchImportScores,
  toggleSectionPublish
} from '../services/courseService';
import { parseCSV, generateSampleCSV, exportScoresToCSV } from '../utils/csv';
import { NetlifyAndGasGuide } from './NetlifyAndGasGuide';

export const InstructorDashboard: React.FC = () => {
  // Auth state
  const [user, setUser] = useState<TeacherUser | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // Active Tab
  const [activeTab, setActiveTab] = useState<'scores' | 'guide'>('scores');

  // Courses & Sections
  const [courses, setCourses] = useState<Course[]>([]);
  const [activeCourseId, setActiveCourseId] = useState<string>('');
  const [sections, setSections] = useState<Section[]>([]);
  const [selectedSecFilter, setSelectedSecFilter] = useState<string>('ALL');

  // Scores
  const [scores, setScores] = useState<StudentScore[]>([]);
  const [loadingScores, setLoadingScores] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modals & Forms
  const [showNewCourseModal, setShowNewCourseModal] = useState<boolean>(false);
  const [newCourseCode, setNewCourseCode] = useState<string>('');
  const [newCourseTitle, setNewCourseTitle] = useState<string>('');
  const [newCourseTerm, setNewCourseTerm] = useState<string>('1/2569');

  const [editingScore, setEditingScore] = useState<StudentScore | null>(null);
  const [importNotice, setImportNotice] = useState<string | null>(null);

  // Deletion Modals state
  const [courseToDelete, setCourseToDelete] = useState<Course | null>(null);
  const [isDeletingCourse, setIsDeletingCourse] = useState<boolean>(false);

  const [sectionToDelete, setSectionToDelete] = useState<{ courseId: string; sec: string; studentCount: number } | null>(null);
  const [isDeletingSection, setIsDeletingSection] = useState<boolean>(false);

  // Reset PIN Modal state
  const [studentToResetPin, setStudentToResetPin] = useState<StudentScore | null>(null);
  const [isResettingPin, setIsResettingPin] = useState<boolean>(false);

  // CSV file input ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Monitor Auth state
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        const email = firebaseUser.email || '';
        const isBu = email.endsWith('@bu.ac.th');
        const isSuperAdmin = email === 'w.peanchi@gmail.com'; // Project owner fallback

        setUser({
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName,
          photoURL: firebaseUser.photoURL,
          isBuDomain: isBu || isSuperAdmin
        });
      } else {
        setUser(null);
      }
      setAuthLoading(false);
    });
    return () => unsub();
  }, []);

  // Load courses when authenticated
  useEffect(() => {
    if (!user) return;
    loadCoursesList();
  }, [user]);

  // Load scores when active course changes
  useEffect(() => {
    if (!activeCourseId) {
      setScores([]);
      setSections([]);
      return;
    }
    loadCourseDetails(activeCourseId);
  }, [activeCourseId]);

  const loadCoursesList = async () => {
    try {
      const list = await getCourses();
      setCourses(list);
      if (list.length > 0 && !activeCourseId) {
        setActiveCourseId(list[0].id);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const loadCourseDetails = async (courseId: string) => {
    setLoadingScores(true);
    try {
      const [secList, scoreList] = await Promise.all([
        getSections(courseId),
        getTeacherScores(courseId)
      ]);
      setSections(secList);
      setScores(scoreList);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingScores(false);
    }
  };

  // Google Login
  const handleGoogleLogin = async () => {
    setAuthError(null);
    try {
      const res = await signInWithPopup(auth, googleProvider);
      const email = res.user.email || '';
      const isBu = email.endsWith('@bu.ac.th');
      const isSuperAdmin = email === 'w.peanchi@gmail.com';

      if (!isBu && !isSuperAdmin) {
        setAuthError('ระบบจำกัดสิทธิ์เฉพาะบัญชีอีเมลโดเมนมหาวิทยาลัยกรุงเทพ (@bu.ac.th) เท่านั้น');
        await signOut(auth);
      }
    } catch (err: any) {
      console.error(err);
      if (err.code !== 'auth/popup-closed-by-user') {
        setAuthError('ไม่สามารถเข้าสู่ระบบด้วย Google ได้: ' + (err.message || ''));
      }
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setUser(null);
  };

  // Create New Course
  const handleCreateCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCourseCode || !newCourseTitle || !user) return;

    const id = `${newCourseCode.trim().toUpperCase()}_${Date.now().toString().slice(-4)}`;
    const newCourse: Course = {
      id,
      code: newCourseCode.trim().toUpperCase(),
      title: newCourseTitle.trim(),
      term: newCourseTerm.trim(),
      instructorUid: user.uid,
      instructorEmail: user.email || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    try {
      await saveCourse(newCourse);
      setCourses(prev => [...prev, newCourse]);
      setActiveCourseId(id);
      setShowNewCourseModal(false);
      setNewCourseCode('');
      setNewCourseTitle('');
    } catch (err) {
      console.error(err);
      alert('เกิดข้อผิดพลาดในการสร้างรายวิชา');
    }
  };

  // Confirm Delete Entire Course
  const handleConfirmDeleteCourse = async () => {
    if (!courseToDelete) return;
    setIsDeletingCourse(true);
    try {
      const res = await deleteCourseWithData(courseToDelete.id);
      const updated = courses.filter(c => c.id !== courseToDelete.id);
      setCourses(updated);
      setActiveCourseId(updated.length > 0 ? updated[0].id : '');
      setCourseToDelete(null);
      setImportNotice(`ลบรายวิชา ${courseToDelete.code} และข้อมูลคะแนนทั้งหมด ${res?.deletedScoresCount || 0} รายการเรียบร้อยแล้ว`);
      setTimeout(() => setImportNotice(null), 5000);
    } catch (err) {
      console.error(err);
      alert('เกิดข้อผิดพลาดในการลบรายวิชา กรุณาลองใหม่อีกครั้ง');
    } finally {
      setIsDeletingCourse(false);
    }
  };

  // Confirm Delete Specific Section
  const handleConfirmDeleteSection = async () => {
    if (!sectionToDelete || !activeCourse) return;
    setIsDeletingSection(true);
    try {
      const res = await deleteSectionWithScores(sectionToDelete.courseId, sectionToDelete.sec);
      setSectionToDelete(null);
      setImportNotice(`ลบกลุ่มเรียน Sec ${sectionToDelete.sec} และคะแนนนักศึกษา ${res?.deletedScoresCount || 0} รายการเรียบร้อยแล้ว`);
      setTimeout(() => setImportNotice(null), 5000);
      // Reload current course details
      await loadCourseDetails(activeCourse.id);
    } catch (err) {
      console.error(err);
      alert('เกิดข้อผิดพลาดในการลบกลุ่มเรียน กรุณาลองใหม่อีกครั้ง');
    } finally {
      setIsDeletingSection(false);
    }
  };

  // Toggle Section Publish
  const handleTogglePublish = async (sec: string, currentStatus: boolean) => {
    if (!user || !activeCourseId) return;
    const newStatus = !currentStatus;

    try {
      await toggleSectionPublish(activeCourseId, sec, newStatus, user.uid);
      
      // Update local state
      setSections(prev => {
        const found = prev.find(s => s.sec === sec);
        if (found) {
          return prev.map(s => s.sec === sec ? { ...s, isPublished: newStatus, publishedAt: newStatus ? new Date().toISOString() : undefined } : s);
        }
        return [...prev, {
          id: `${activeCourseId}_sec_${sec}`,
          courseId: activeCourseId,
          sec,
          isPublished: newStatus,
          studentCount: scores.filter(s => s.sec === sec).length,
          instructorUid: user.uid,
          updatedAt: new Date().toISOString()
        }];
      });

      // Update scores published flag
      setScores(prev => prev.map(s => s.sec === sec ? { ...s, isPublished: newStatus } : s));
    } catch (err) {
      console.error(err);
      alert('เกิดข้อผิดพลาดในการเปลี่ยนสถานะการประกาศคะแนน');
    }
  };

  // Handle CSV file upload
  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !activeCourse) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      if (!text) return;

      const parsed = parseCSV(
        text,
        activeCourse.id,
        activeCourse.code,
        activeCourse.title,
        user.uid
      );

      if (!parsed.success || parsed.data.length === 0) {
        alert('เกิดข้อผิดพลาดในการอ่านไฟล์ CSV:\n' + parsed.errors.join('\n'));
        return;
      }

      try {
        const imported = await batchImportScores(
          parsed.data as StudentScore[],
          activeCourse.id,
          parsed.data[0]?.sec || '1'
        );
        setImportNotice(`นำเข้าข้อมูลคะแนนเรียบร้อยแล้ว จำนวน ${imported} รายการ`);
        setTimeout(() => setImportNotice(null), 5000);
        await loadCourseDetails(activeCourse.id);
      } catch (err) {
        console.error(err);
        alert('เกิดข้อผิดพลาดในการบันทึกคะแนนลงฐานข้อมูล');
      }
    };
    reader.readAsText(file, 'UTF-8');

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Seed sample data for testing
  const handleSeedSampleData = async () => {
    if (!user || !activeCourse) return;
    if (!window.confirm('คุณต้องการนำเข้าข้อมูลตัวอย่างนักศึกษา 8 คน เพื่อทดสอบระบบหรือไม่?')) return;

    const sampleCsv = generateSampleCSV();
    const parsed = parseCSV(
      sampleCsv,
      activeCourse.id,
      activeCourse.code,
      activeCourse.title,
      user.uid
    );

    if (parsed.success && parsed.data.length > 0) {
      try {
        await batchImportScores(parsed.data as StudentScore[], activeCourse.id, '1');
        // Auto publish sec 1 for testing
        await toggleSectionPublish(activeCourse.id, '1', true, user.uid);
        await toggleSectionPublish(activeCourse.id, '2', true, user.uid);
        setImportNotice('นำเข้าข้อมูลตัวอย่าง 8 รายการและเปิดประกาศคะแนนแล้ว');
        setTimeout(() => setImportNotice(null), 5000);
        await loadCourseDetails(activeCourse.id);
      } catch (err) {
        console.error(err);
        alert('เกิดข้อผิดพลาดในการบันทึกข้อมูลตัวอย่าง');
      }
    }
  };

  // Manual Override: Save edited score
  const handleSaveScoreEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingScore) return;

    try {
      await saveSingleScore(editingScore);
      setScores(prev => prev.map(s => s.id === editingScore.id ? editingScore : s));
      setEditingScore(null);
    } catch (err) {
      console.error(err);
      alert('ไม่สามารถบันทึกการแก้ไขคะแนนได้');
    }
  };

  // Reset Student PIN with Modal Confirmation
  const handleConfirmResetPin = async () => {
    if (!studentToResetPin) return;
    setIsResettingPin(true);
    try {
      await resetStudentPinByTeacher(studentToResetPin.id);
      // Immediately update local state in real-time
      setScores(prev => prev.map(s => s.id === studentToResetPin.id ? {
        ...s,
        pinHash: null,
        pinSalt: null,
        pinAttempts: 0,
        lockedUntil: null
      } : s));
      setImportNotice(`รีเซ็ตรหัสผ่าน 6 หลักของ ${studentToResetPin.name} (รหัส ${studentToResetPin.studentId}) สำเร็จแล้ว สถานะเปลี่ยนเป็น 'ยังไม่ตั้ง' ให้นักศึกษาลงทะเบียนรหัสผ่านใหม่ได้ทันที`);
      setTimeout(() => setImportNotice(null), 6000);
      setStudentToResetPin(null);
    } catch (err) {
      console.error(err);
      alert('เกิดข้อผิดพลาดในการรีเซ็ตรหัสผ่าน กรุณาลองใหม่อีกครั้ง');
    } finally {
      setIsResettingPin(false);
    }
  };

  // Delete student score
  const handleDeleteScore = async (scoreId: string) => {
    if (!window.confirm('คุณแน่ใจหรือไม่ว่าต้องการลบคะแนนของนักศึกษาคนนี้?')) return;
    try {
      await deleteSingleScore(scoreId);
      setScores(prev => prev.filter(s => s.id !== scoreId));
    } catch (err) {
      console.error(err);
      alert('ไม่สามารถลบข้อมูลได้');
    }
  };

  const activeCourse = courses.find(c => c.id === activeCourseId);

  // Filtered scores by search and section
  const filteredScores = scores.filter(s => {
    const matchesSec = selectedSecFilter === 'ALL' || s.sec === selectedSecFilter;
    const matchesSearch = !searchQuery ||
      s.studentId.includes(searchQuery) ||
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.no && s.no.includes(searchQuery));
    return matchesSec && matchesSearch;
  });

  // Extract unique sections
  const distinctSections = Array.from(new Set(scores.map(s => s.sec))).sort();

  if (authLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] p-6 text-slate-500">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-3"></div>
        <p className="text-sm">กำลังตรวจสอบสิทธิ์การเข้าใช้งาน...</p>
      </div>
    );
  }

  // Not signed in state
  if (!user || !user.isBuDomain) {
    return (
      <div className="w-full max-w-md mx-auto px-4 py-12">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center">
          <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto mb-4">
            <LogIn className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-slate-900">เข้าสู่ระบบสำหรับอาจารย์ผู้สอน</h2>
          <p className="text-xs text-slate-500 mt-2 mb-6 leading-relaxed">
            ระบบบริหารจัดการคะแนน ประกาศผลคะแนน และนำเข้าไฟล์ CSV จำกัดสิทธิ์เฉพาะอาจารย์ผู้สอนด้วยอีเมล <strong>@bu.ac.th</strong> เพื่อความปลอดภัย
          </p>

          {authError && (
            <div className="p-3.5 mb-5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 text-left flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{authError}</span>
            </div>
          )}

          <button
            onClick={handleGoogleLogin}
            className="w-full py-3.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold text-sm shadow-sm transition-all flex items-center justify-center gap-2.5 cursor-pointer"
          >
            <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
              <path d="M12.24 10.285V14.4h6.806c-.275 1.765-2.056 5.174-6.806 5.174-4.095 0-7.439-3.389-7.439-7.574s3.345-7.574 7.439-7.574c2.33 0 3.891.989 4.785 1.849l3.254-3.138C18.189 1.186 15.479 0 12.24 0c-6.635 0-12 5.365-12 12s5.365 12 12 12c6.926 0 11.52-4.869 11.52-11.726 0-.788-.085-1.39-.189-1.989H12.24z"/>
            </svg>
            เข้าสู่ระบบด้วย Google (@bu.ac.th)
          </button>

          <div className="mt-6 pt-5 border-t border-slate-100 text-[11px] text-slate-400">
            ระบบทำงานภายใต้ Firebase Spark Plan ร่วมกับ Google Apps Script
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-6xl mx-auto px-4 py-6 sm:py-8 space-y-6">
      {/* Top Banner & User Profile */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-700">
              พอร์ทัลอาจารย์ผู้สอน
            </span>
            <span className="text-xs text-slate-400">|</span>
            <span className="text-xs font-mono text-slate-600">{user.email}</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 mt-1">
            ระบบบริหารจัดการและประกาศผลคะแนน
          </h1>
        </div>

        <div className="flex items-center gap-3 self-end sm:self-center">
          <button
            onClick={() => setActiveTab(activeTab === 'scores' ? 'guide' : 'scores')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold border flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'guide'
                ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <HelpCircle className="w-4 h-4" />
            {activeTab === 'guide' ? 'กลับหน้าจัดการคะแนน' : 'คู่มือ Netlify & GAS'}
          </button>

          <button
            onClick={handleLogout}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold border border-slate-200 text-slate-600 hover:text-rose-600 hover:bg-rose-50 transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            ออกจากระบบ
          </button>
        </div>
      </div>

      {/* Guide Tab */}
      {activeTab === 'guide' ? (
        <NetlifyAndGasGuide />
      ) : (
        <>
          {/* Course Selector & Actions Bar */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex-1 flex flex-wrap items-center gap-3">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  รายวิชาที่เลือก:
                </label>
                {courses.length === 0 ? (
                  <span className="text-xs text-slate-400">ยังไม่มีรายวิชา กรุณากดปุ่มเพิ่มรายวิชา</span>
                ) : (
                  <select
                    value={activeCourseId}
                    onChange={(e) => setActiveCourseId(e.target.value)}
                    className="px-3.5 py-2 rounded-xl border border-slate-300 bg-slate-50 text-slate-800 font-bold text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {courses.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.code} : {c.title} ({c.term})
                      </option>
                    ))}
                  </select>
                )}

                <button
                  onClick={() => setShowNewCourseModal(true)}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  เพิ่มรายวิชา
                </button>

                {activeCourse && (
                  <button
                    onClick={() => setCourseToDelete(activeCourse)}
                    className="p-1.5 text-xs rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                    title="ลบรายวิชานี้พร้อมข้อมูลทั้งหมด"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* CSV & Action Buttons */}
              {activeCourse && (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    onChange={handleCSVUpload}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3 py-2 text-xs font-semibold rounded-xl bg-teal-600 hover:bg-teal-700 text-white flex items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    นำเข้าไฟล์ CSV
                  </button>

                  <button
                    onClick={() => {
                      const csvText = generateSampleCSV();
                      const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = 'sample_score_template.csv';
                      a.click();
                    }}
                    className="px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 cursor-pointer"
                    title="ดาวน์โหลดเทมเพลต CSV"
                  >
                    <Download className="w-3.5 h-3.5" />
                    ตัวอย่าง CSV
                  </button>

                  <button
                    onClick={() => exportScoresToCSV(filteredScores, activeCourse.code, selectedSecFilter)}
                    disabled={scores.length === 0}
                    className="px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 disabled:opacity-40 cursor-pointer"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    ส่งออก CSV (Excel)
                  </button>

                  <button
                    onClick={handleSeedSampleData}
                    className="px-3 py-2 text-xs font-semibold rounded-xl bg-amber-500 hover:bg-amber-600 text-white flex items-center gap-1.5 shadow-xs cursor-pointer"
                    title="สร้างข้อมูลจำลองเพื่อทดสอบทันที"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    ข้อมูลทดสอบ (8 คน)
                  </button>
                </div>
              )}
            </div>

            {/* Import feedback notice */}
            {importNotice && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{importNotice}</span>
              </div>
            )}

            {/* Sections & Publish Status Badges */}
            {activeCourse && distinctSections.length > 0 && (
              <div className="pt-3 border-t border-slate-100">
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  สถานะการเปิด/ปิดประกาศคะแนนแต่ละกลุ่มเรียน (Section Control):
                </div>
                <div className="flex flex-wrap gap-2.5">
                  {distinctSections.map(secName => {
                    const secObj = sections.find(s => s.sec === secName);
                    const isPub = secObj ? secObj.isPublished : scores.some(s => s.sec === secName && s.isPublished);
                    const count = scores.filter(s => s.sec === secName).length;

                    return (
                      <div
                        key={secName}
                        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs border transition-all ${
                          isPub
                            ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                            : 'bg-slate-50 border-slate-200 text-slate-700'
                        }`}
                      >
                        <div>
                          <span className="font-bold">Sec {secName}</span>
                          <span className="text-[11px] text-slate-500 ml-1.5">({count} คน)</span>
                        </div>
                        <button
                          onClick={() => handleTogglePublish(secName, isPub)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                            isPub
                              ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                              : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                          }`}
                        >
                          {isPub ? '🟢 เปิดประกาศอยู่ (คลิกเพื่อปิด)' : '🔴 ปิดประกาศ (คลิกเพื่อเปิด)'}
                        </button>
                        <button
                          onClick={() => setSectionToDelete({ courseId: activeCourseId, sec: secName, studentCount: count })}
                          className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-100/70 transition-colors cursor-pointer"
                          title={`ลบกลุ่มเรียน Sec ${secName} (ลบคะแนนเฉพาะกลุ่มนี้)`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Student Scores Table View */}
          {activeCourse && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
              {/* Filter and Search header */}
              <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="ค้นหารหัส หรือ ชื่อนักศึกษา..."
                      className="pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 w-52 sm:w-64"
                    />
                  </div>

                  {distinctSections.length > 0 && (
                    <select
                      value={selectedSecFilter}
                      onChange={(e) => setSelectedSecFilter(e.target.value)}
                      className="px-3 py-1.5 text-xs rounded-xl border border-slate-300 bg-white font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="ALL">กลุ่มเรียนทั้งหมด (All Sec)</option>
                      {distinctSections.map(s => (
                        <option key={s} value={s}>Sec {s}</option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <Users className="w-4 h-4 text-slate-400" />
                  <span>แสดง <strong>{filteredScores.length}</strong> จาก {scores.length} รายการ</span>
                  <button
                    onClick={() => loadCourseDetails(activeCourse.id)}
                    className="p-1 hover:text-indigo-600 transition-colors"
                    title="โหลดข้อมูลใหม่"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-slate-100/80 text-slate-700 font-bold border-b border-slate-200 uppercase tracking-wider text-[11px]">
                    <tr>
                      <th className="py-3 px-3 w-12 text-center">เลขที่</th>
                      <th className="py-3 px-3 w-28">รหัสนักศึกษา</th>
                      <th className="py-3 px-4 min-w-[160px]">ชื่อ-นามสกุล</th>
                      <th className="py-3 px-2 w-16 text-center">Sec</th>
                      <th className="py-3 px-2 text-center text-teal-800 bg-teal-50/50">ATTEN (10)</th>
                      <th className="py-3 px-2 text-center text-teal-800 bg-teal-50/50">CA (10)</th>
                      <th className="py-3 px-2 text-center text-teal-800 bg-teal-50/50">AS (20)</th>
                      <th className="py-3 px-2 text-center text-teal-800 bg-teal-50/50">MID (25)</th>
                      <th className="py-3 px-2 text-center font-extrabold text-indigo-900 bg-indigo-50/50">TOTAL (65)</th>
                      <th className="py-3 px-3 text-center">สถานะประกาศ</th>
                      <th className="py-3 px-3 text-center">รหัสผ่าน 6 หลัก</th>
                      <th className="py-3 px-3 text-center w-28">จัดการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loadingScores ? (
                      <tr>
                        <td colSpan={12} className="py-12 text-center text-slate-400">
                          <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                          กำลังโหลดข้อมูลคะแนน...
                        </td>
                      </tr>
                    ) : filteredScores.length === 0 ? (
                      <tr>
                        <td colSpan={12} className="py-12 text-center text-slate-400">
                          {scores.length === 0 ? (
                            <div>
                              <p className="text-sm font-medium text-slate-600">ยังไม่มีข้อมูลนักศึกษาในรายวิชานี้</p>
                              <p className="text-xs text-slate-400 mt-1">คลิกปุ่ม "นำเข้าไฟล์ CSV" หรือคลิก "ข้อมูลทดสอบ (8 คน)" ด้านบนเพื่อเริ่มต้น</p>
                            </div>
                          ) : (
                            <p>ไม่พบนักศึกษาที่ตรงกับคำค้นหา "{searchQuery}"</p>
                          )}
                        </td>
                      </tr>
                    ) : (
                      filteredScores.map(score => (
                        <tr key={score.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-3 px-3 text-center font-mono font-medium text-slate-500">{score.no || '-'}</td>
                          <td className="py-3 px-3 font-mono font-bold text-slate-900">{score.studentId}</td>
                          <td className="py-3 px-4 font-medium text-slate-900">{score.name}</td>
                          <td className="py-3 px-2 text-center font-mono font-semibold">{score.sec}</td>
                          <td className="py-3 px-2 text-center font-mono">{score.atten}</td>
                          <td className="py-3 px-2 text-center font-mono">{score.ca}</td>
                          <td className="py-3 px-2 text-center font-mono">{score.as}</td>
                          <td className="py-3 px-2 text-center font-mono">{score.mid}</td>
                          <td className="py-3 px-2 text-center font-mono font-extrabold text-indigo-700 bg-indigo-50/30">
                            {score.total}
                          </td>
                          <td className="py-3 px-3 text-center">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                              score.isPublished
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-slate-100 text-slate-500'
                            }`}>
                              {score.isPublished ? 'ประกาศแล้ว' : 'ปิดประกาศ'}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-center">
                            {score.pinHash ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-teal-100 text-teal-800">
                                <KeyRound className="w-3 h-3" /> ตั้งรหัสแล้ว
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800">
                                ยังไม่ตั้ง
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              {/* Manual Override Edit */}
                              <button
                                onClick={() => setEditingScore({ ...score })}
                                className="p-1 rounded-md text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors cursor-pointer"
                                title="แก้ไขคะแนน (Manual Override)"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>

                              {/* Reset PIN */}
                              {score.pinHash && (
                                <button
                                  onClick={() => setStudentToResetPin(score)}
                                  className="p-1 rounded-md text-amber-600 hover:text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 transition-colors cursor-pointer"
                                  title="รีเซ็ตรหัสผ่าน 6 หลัก (Reset PIN)"
                                >
                                  <KeyRound className="w-3.5 h-3.5" />
                                </button>
                              )}

                              {/* Delete */}
                              <button
                                onClick={() => handleDeleteScore(score.id)}
                                className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                title="ลบข้อมูลนักศึกษา"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* MODAL: New Course */}
      {showNewCourseModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-6 max-w-md w-full">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900">เพิ่มรายวิชาใหม่</h3>
              <button
                onClick={() => setShowNewCourseModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateCourse} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">รหัสวิชา (Course Code)</label>
                <input
                  type="text"
                  required
                  value={newCourseCode}
                  onChange={(e) => setNewCourseCode(e.target.value)}
                  placeholder="เช่น CS101, IT212"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">ชื่อรายวิชา (Course Title)</label>
                <input
                  type="text"
                  required
                  value={newCourseTitle}
                  onChange={(e) => setNewCourseTitle(e.target.value)}
                  placeholder="เช่น การเขียนโปรแกรมคอมพิวเตอร์"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">ภาคการศึกษา (Term)</label>
                <input
                  type="text"
                  value={newCourseTerm}
                  onChange={(e) => setNewCourseTerm(e.target.value)}
                  placeholder="เช่น 1/2569"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewCourseModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs cursor-pointer"
                >
                  สร้างรายวิชา
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Edit Student Score (Manual Override) */}
      {editingScore && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-6 max-w-lg w-full">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">แก้ไขคะแนน (Manual Override)</h3>
                <p className="text-xs text-slate-500">
                  รหัส {editingScore.studentId} - {editingScore.name}
                </p>
              </div>
              <button
                onClick={() => setEditingScore(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveScoreEdit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">เลขที่ (No.)</label>
                  <input
                    type="text"
                    value={editingScore.no}
                    onChange={(e) => setEditingScore({ ...editingScore, no: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Sec (กลุ่มเรียน)</label>
                  <input
                    type="text"
                    value={editingScore.sec}
                    onChange={(e) => setEditingScore({ ...editingScore, sec: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">ชื่อ-นามสกุล</label>
                <input
                  type="text"
                  value={editingScore.name}
                  onChange={(e) => setEditingScore({ ...editingScore, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
                />
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                <div className="text-xs font-bold text-slate-800">หัวข้อคะแนน (ระบบไม่คำนวณอัตโนมัติ ตามเงื่อนไข)</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">ATTEN : เข้าเรียน (เต็ม 10)</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="10"
                      value={editingScore.atten}
                      onChange={(e) => setEditingScore({ ...editingScore, atten: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">CA : ในชั้นเรียน (เต็ม 10)</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="10"
                      value={editingScore.ca}
                      onChange={(e) => setEditingScore({ ...editingScore, ca: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">AS : การบ้าน (เต็ม 20)</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="20"
                      value={editingScore.as}
                      onChange={(e) => setEditingScore({ ...editingScore, as: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">MID : กลางภาค (เต็ม 25)</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="25"
                      value={editingScore.mid}
                      onChange={(e) => setEditingScore({ ...editingScore, mid: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-indigo-900 mb-1">
                    TOTAL : คะแนนรวม (เต็ม 65)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="65"
                    value={editingScore.total}
                    onChange={(e) => setEditingScore({ ...editingScore, total: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 rounded-lg border border-indigo-300 bg-indigo-50/50 text-sm font-bold font-mono text-indigo-900"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingScore(null)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold shadow-xs cursor-pointer"
                >
                  บันทึกการแก้ไข
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Delete Entire Course Confirmation */}
      {courseToDelete && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-6 max-w-md w-full animate-fadeIn">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">ยืนยันการลบทั้งรายวิชา?</h3>
                <p className="text-xs text-slate-500">
                  {courseToDelete.code} : {courseToDelete.title} ({courseToDelete.term})
                </p>
              </div>
            </div>

            <div className="space-y-3 mb-6 text-xs text-slate-600 bg-rose-50 border border-rose-200 rounded-xl p-4">
              <div className="font-semibold text-rose-900 flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                คำเตือน: การลบนี้ไม่สามารถย้อนกลับได้
              </div>
              <ul className="list-disc list-inside space-y-1 text-rose-800">
                <li>ข้อมูลตัวรายวิชา <strong>{courseToDelete.code}</strong> จะถูกลบถาวร</li>
                <li>ข้อมูลทุกกลุ่มเรียน (Sections) ของวิชานี้จะถูกลบทั้งหมด</li>
                <li>ข้อมูลคะแนนของนักศึกษาทุกคนในวิชานี้ (รวม <strong>{scores.length}</strong> คน) จะถูกลบถาวร</li>
              </ul>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                disabled={isDeletingCourse}
                onClick={() => setCourseToDelete(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={isDeletingCourse}
                onClick={handleConfirmDeleteCourse}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white text-xs font-semibold shadow-xs flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                {isDeletingCourse ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    กำลังลบข้อมูล...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    ยืนยันลบทั้งรายวิชา
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Delete Specific Section Confirmation */}
      {sectionToDelete && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-6 max-w-md w-full animate-fadeIn">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">ยืนยันการลบกลุ่มเรียน Sec {sectionToDelete.sec}?</h3>
                <p className="text-xs text-slate-500">
                  {activeCourse?.code} - {activeCourse?.title}
                </p>
              </div>
            </div>

            <div className="space-y-3 mb-6 text-xs text-slate-600 bg-amber-50 border border-amber-200 rounded-xl p-4">
              <div className="font-semibold text-amber-950 flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                ผลกระทบของการลบกลุ่มเรียน
              </div>
              <ul className="list-disc list-inside space-y-1 text-amber-900">
                <li>ข้อมูลกลุ่มเรียน <strong>Sec {sectionToDelete.sec}</strong> จะถูกลบออก</li>
                <li>คะแนนนักศึกษาใน Sec {sectionToDelete.sec} จำนวน <strong>{sectionToDelete.studentCount}</strong> คน จะถูกลบถาวร</li>
                <li><strong>กลุ่มเรียนอื่นและตัวรายวิชายังคงอยู่ตามปกติ</strong> ไม่ได้รับผลกระทบ</li>
              </ul>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                disabled={isDeletingSection}
                onClick={() => setSectionToDelete(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={isDeletingSection}
                onClick={handleConfirmDeleteSection}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white text-xs font-semibold shadow-xs flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                {isDeletingSection ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    กำลังลบกลุ่มเรียน...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    ยืนยันลบ Sec {sectionToDelete.sec}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Reset Student PIN Confirmation */}
      {studentToResetPin && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-6 max-w-md w-full animate-fadeIn">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                <KeyRound className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">รีเซ็ตรหัสผ่าน PIN 6 หลัก</h3>
                <p className="text-xs text-slate-500">
                  สำหรับกรณีนักศึกษาลืมรหัสผ่าน
                </p>
              </div>
            </div>

            {/* Student Info Card */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-4 text-xs space-y-1.5">
              <div className="flex justify-between items-center">
                <span className="text-slate-500">ชื่อ-นามสกุล:</span>
                <span className="font-bold text-slate-900 text-sm">{studentToResetPin.name}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">รหัสนักศึกษา:</span>
                <span className="font-mono font-bold text-slate-800">{studentToResetPin.studentId}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">กลุ่มเรียน (Sec):</span>
                <span className="font-semibold text-slate-800">Sec {studentToResetPin.sec}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">ลำดับที่ (เลขที่):</span>
                <span className="text-slate-700">{studentToResetPin.no || '-'}</span>
              </div>
            </div>

            <div className="space-y-2 mb-6 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-xl p-3.5">
              <div className="font-semibold flex items-center gap-1.5 text-amber-950">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                คำชี้แจงการรีเซ็ตรหัสผ่าน
              </div>
              <p className="leading-relaxed">
                เมื่อทำการรีเซ็ตแล้ว รหัสผ่าน PIN 6 หลักเดิมของนักศึกษาจะถูกลบออก และสถานะจะเปลี่ยนเป็น <strong>"ยังไม่ตั้ง"</strong> เพื่อให้นักศึกษาสามารถเข้าลงทะเบียนรหัสผ่าน 6 หลักใหม่ได้ด้วยตนเองทันที
              </p>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                disabled={isResettingPin}
                onClick={() => setStudentToResetPin(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={isResettingPin}
                onClick={handleConfirmResetPin}
                className="flex-1 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white text-xs font-semibold shadow-xs flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                {isResettingPin ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    กำลังรีเซ็ต...
                  </>
                ) : (
                  <>
                    <KeyRound className="w-4 h-4" />
                    ยืนยันการรีเซ็ต PIN
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
