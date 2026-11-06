import React, { useState, useEffect } from 'react';
import {
  Search,
  Lock,
  KeyRound,
  AlertCircle,
  CheckCircle2,
  Calendar,
  User,
  Hash,
  BookOpen,
  Eye,
  EyeOff,
  LogOut,
  Clock,
  Printer,
  ChevronRight
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { Course, StudentScore } from '../types';
import {
  getCourses,
  getStudentScore,
  findStudentScoreAcrossCourses,
  setupStudentPin,
  recordFailedAttempt,
  resetFailedAttempts
} from '../services/courseService';
import { verifyPin } from '../utils/crypto';

interface StudentScoreViewProps {
  onGoToInstructor?: () => void;
}

export const StudentScoreView: React.FC<StudentScoreViewProps> = ({ onGoToInstructor }) => {
  const [courses, setCourses] = useState<Course[]>([]);
  const [studentIdInput, setStudentIdInput] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [initialLoading, setInitialLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Flow states
  // 'search' -> 'first_time_setup' -> 'enter_pin' -> 'view_score'
  const [step, setStep] = useState<'search' | 'first_time_setup' | 'enter_pin' | 'view_score'>('search');
  const [currentScore, setCurrentScore] = useState<StudentScore | null>(null);

  // PIN inputs
  const [pinInput, setPinInput] = useState<string>('');
  const [pinConfirmInput, setPinConfirmInput] = useState<string>('');
  const [showPin, setShowPin] = useState<boolean>(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinAttemptsLeft, setPinAttemptsLeft] = useState<number>(5);
  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [lockRemainingSeconds, setLockRemainingSeconds] = useState<number>(0);

  // Load available courses
  useEffect(() => {
    async function loadCourses() {
      try {
        const list = await getCourses();
        setCourses(list);
      } catch (err) {
        console.error('Failed to load courses', err);
      } finally {
        setInitialLoading(false);
      }
    }
    loadCourses();
  }, []);

  // Countdown timer for lockout
  useEffect(() => {
    if (!isLocked || lockRemainingSeconds <= 0) return;
    const interval = setInterval(() => {
      setLockRemainingSeconds(prev => {
        if (prev <= 1) {
          setIsLocked(false);
          setPinAttemptsLeft(5);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isLocked, lockRemainingSeconds]);

  // Handle student ID search
  const handleSearchStudent = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMessage(null);
    setPinError(null);

    const cleanId = studentIdInput.trim();
    if (!cleanId) {
      setErrorMessage('กรุณากรอกรหัสนักศึกษา');
      return;
    }
    if (cleanId.length < 10) {
      setErrorMessage('กรุณากรอกรหัสนักศึกษา 10 หลักให้ครบถ้วน');
      return;
    }
    setLoading(true);
    try {
      const courseList = courses.length > 0 ? courses : await getCourses();
      if (courseList.length === 0) {
        setErrorMessage('ขณะนี้ยังไม่มีรายวิชาที่อาจารย์บันทึกหรือเปิดประกาศในระบบ กรุณารออาจารย์ผู้สอนเปิดระบบ');
        setLoading(false);
        return;
      }

      // Direct lookup of student score across courses (Single Document Get per course)
      const score = await findStudentScoreAcrossCourses(courseList, cleanId);

      if (!score) {
        setErrorMessage('ไม่พบข้อมูลผลคะแนนของรหัสนักศึกษานี้ในระบบ กรุณาตรวจสอบรหัสนักศึกษาอีกครั้ง หรือติดต่ออาจารย์ผู้สอน');
        setLoading(false);
        return;
      }

      if (!score.isPublished) {
        setErrorMessage('อาจารย์ผู้สอนยังไม่ได้เปิดระบบประกาศคะแนนสำหรับกลุ่มเรียนของคุณ กรุณารอประกาศอย่างเป็นทางการ');
        setLoading(false);
        return;
      }

      setCurrentScore(score);

      // Check if account is locked
      if (score.lockedUntil) {
        const lockTime = new Date(score.lockedUntil).getTime();
        const now = Date.now();
        if (lockTime > now) {
          setIsLocked(true);
          setLockRemainingSeconds(Math.ceil((lockTime - now) / 1000));
          setErrorMessage('บัญชีนี้ถูกระงับการตรวจสอบคะแนนชั่วคราว เนื่องจากกรอกรหัสผ่านผิดเกิน 5 ครั้ง');
          setLoading(false);
          return;
        }
      }

      // Check if student has set PIN before
      if (!score.pinHash) {
        // First-time visitor: redirect to set up their 6-digit PIN
        setStep('first_time_setup');
      } else {
        // Returning visitor with PIN
        const failed = score.pinAttempts || 0;
        const left = Math.max(0, 5 - failed);
        setPinAttemptsLeft(left);

        if (!pinInput || pinInput.length !== 6) {
          setErrorMessage('กรุณากรอกรหัสผ่านตัวเลข 6 หลักของคุณเพื่อตรวจสอบคะแนน');
          setLoading(false);
          return;
        }

        // Verify PIN right away
        const isValid = await verifyPin(pinInput, score.pinSalt || '', score.pinHash);

        if (isValid) {
          await resetFailedAttempts(score.courseId, score.studentId);
          setStep('view_score');
          triggerConfetti();
        } else {
          const result = await recordFailedAttempt(
            score.courseId,
            score.studentId,
            score.pinAttempts || 0
          );

          if (result?.locked) {
            setIsLocked(true);
            setLockRemainingSeconds(15 * 60);
            setErrorMessage('คุณกรอกรหัสผ่านผิดเกิน 5 ครั้ง ระบบถูกระงับชั่วคราว 15 นาที');
          } else {
            const attemptsNow = (score.pinAttempts || 0) + 1;
            const remaining = Math.max(0, 5 - attemptsNow);
            setPinAttemptsLeft(remaining);
            setErrorMessage(`รหัสผ่านไม่ถูกต้อง (สามารถลองได้อีก ${remaining} ครั้ง) หากลืมรหัสผ่านกรุณาติดต่ออาจารย์ผู้สอน`);
          }
        }
      }
    } catch (err) {
      console.error(err);
      setErrorMessage('เกิดข้อผิดพลาดในการเชื่อมต่อฐานข้อมูล กรุณาลองใหม่อีกครั้ง');
    } finally {
      setLoading(false);
    }
  };

  // Handle first-time PIN registration
  const handleSetupPin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinError(null);

    if (pinInput.length !== 6 || !/^\d{6}$/.test(pinInput)) {
      setPinError('รหัสผ่านต้องเป็นตัวเลข 6 หลักเท่านั้น');
      return;
    }
    if (pinInput !== pinConfirmInput) {
      setPinError('รหัสผ่านและการยืนยันรหัสผ่านไม่ตรงกัน');
      return;
    }
    if (!currentScore) return;

    setLoading(true);
    try {
      await setupStudentPin(currentScore.courseId, currentScore.studentId, pinInput);
      
      // Update local state and trigger celebration
      setCurrentScore({
        ...currentScore,
        pinHash: 'set',
        pinAttempts: 0
      });
      setStep('view_score');
      triggerConfetti();
    } catch (err) {
      console.error(err);
      setPinError('ไม่สามารถบันทึกรหัสผ่านได้ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setLoading(false);
    }
  };

  // Handle returning PIN verification
  const handleVerifyPin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinError(null);

    if (pinInput.length !== 6 || !/^\d{6}$/.test(pinInput)) {
      setPinError('กรุณากรอกรหัสผ่านตัวเลข 6 หลัก');
      return;
    }
    if (!currentScore || !currentScore.pinHash || !currentScore.pinSalt) return;

    setLoading(true);
    try {
      const isValid = await verifyPin(pinInput, currentScore.pinSalt, currentScore.pinHash);

      if (isValid) {
        // Reset failed counter
        await resetFailedAttempts(currentScore.courseId, currentScore.studentId);
        setStep('view_score');
        triggerConfetti();
      } else {
        // Record failed attempt
        const result = await recordFailedAttempt(
          currentScore.courseId,
          currentScore.studentId,
          currentScore.pinAttempts || 0
        );

        if (result?.locked) {
          setIsLocked(true);
          setLockRemainingSeconds(15 * 60);
          setPinError('คุณกรอกรหัสผ่านผิดเกิน 5 ครั้ง ระบบถูกระงับชั่วคราว 15 นาที');
        } else {
          const attemptsNow = (currentScore.pinAttempts || 0) + 1;
          const left = Math.max(0, 5 - attemptsNow);
          setPinAttemptsLeft(left);
          setCurrentScore({
            ...currentScore,
            pinAttempts: attemptsNow
          });
          setPinError(`รหัสผ่านไม่ถูกต้อง (สามารถลองได้อีก ${left} ครั้ง) หากลืมรหัสผ่านกรุณาติดต่ออาจารย์ผู้สอน`);
        }
      }
    } catch (err) {
      console.error(err);
      setPinError('เกิดข้อผิดพลาดในการตรวจสอบรหัสผ่าน กรุณาลองใหม่');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setStep('search');
    setCurrentScore(null);
    setPinInput('');
    setPinConfirmInput('');
    setPinError(null);
    setErrorMessage(null);
  };

  const triggerConfetti = () => {
    confetti({
      particleCount: 50,
      spread: 60,
      origin: { y: 0.6 }
    });
  };

  const formatDate = (isoString?: string) => {
    if (!isoString) return '-';
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString('th-TH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return isoString;
    }
  };

  if (initialLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-slate-500">
        <div className="w-10 h-10 border-4 border-teal-500 border-t-transparent rounded-full animate-spin mb-3"></div>
        <p className="text-sm">กำลังเชื่อมต่อระบบประกาศคะแนน...</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-xl mx-auto px-4 py-6 sm:py-10">
      {/* Brand Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-teal-600 to-emerald-500 text-white shadow-md mb-3">
          <BookOpen className="w-7 h-7" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
          ระบบตรวจสอบผลคะแนน
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          สะดวก รวดเร็ว ปลอดภัย ตรวจสอบได้เฉพาะคะแนนของตนเอง
        </p>
      </div>

      {/* STEP 1: Search Form */}
      {step === 'search' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8">
          <form onSubmit={handleSearchStudent} className="space-y-5">
            {/* Student ID Input */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                รหัสนักศึกษา (10 หลัก)
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Hash className="w-5 h-5" />
                </div>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={10}
                  value={studentIdInput}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '');
                    setStudentIdInput(val);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  placeholder="เช่น 1650701001"
                  disabled={loading || isLocked}
                  className="w-full pl-11 pr-4 py-3.5 rounded-xl border border-slate-300 text-slate-900 placeholder:text-slate-400 font-mono text-lg font-bold tracking-wider focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 disabled:bg-slate-100 disabled:cursor-not-allowed transition-all"
                  autoFocus
                />
              </div>
            </div>

            {/* Dynamic Stage 2: 6-digit PIN Input (Reveals when student ID has 10 digits) */}
            {studentIdInput.trim().length === 10 && (
              <div className="space-y-1.5 animate-fadeIn">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    รหัสผ่าน 6 หลัก (PIN)
                  </label>
                  <span className="text-[11px] text-slate-400">
                    ตัวเลข 6 หลัก
                  </span>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Lock className="w-5 h-5" />
                  </div>
                  <input
                    type={showPin ? 'text' : 'password'}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={pinInput}
                    onChange={(e) => {
                      setPinInput(e.target.value.replace(/\D/g, ''));
                      if (errorMessage) setErrorMessage(null);
                    }}
                    placeholder="••••••"
                    disabled={loading || isLocked}
                    className="w-full pl-11 pr-11 py-3.5 rounded-xl border border-slate-300 text-slate-900 placeholder:text-slate-400 font-mono text-xl font-bold tracking-[0.4em] focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 disabled:bg-slate-100 disabled:cursor-not-allowed transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPin(!showPin)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                  >
                    {showPin ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                <p className="text-[11px] text-slate-500">
                  * หากเข้าใช้งานครั้งแรก สามารถกดปุ่มค้นหาเพื่อตั้งรหัสผ่านใหม่ได้ทันที
                </p>
              </div>
            )}

            {/* Error Message */}
            {errorMessage && (
              <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-xs text-rose-800 animate-fadeIn">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div>{errorMessage}</div>
              </div>
            )}

            {/* Lockout Warning */}
            {isLocked && (
              <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2 text-xs text-amber-800">
                <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  กรุณารอ {Math.floor(lockRemainingSeconds / 60)}:{String(lockRemainingSeconds % 60).padStart(2, '0')} นาที ก่อนตรวจสอบอีกครั้ง
                </span>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading || isLocked || studentIdInput.trim().length !== 10}
              className="w-full py-3.5 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white font-semibold text-sm shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  กำลังตรวจสอบข้อมูล...
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" />
                  {studentIdInput.trim().length !== 10 ? 'กรุณากรอกรหัสนักศึกษา 10 หลัก' : 'ค้นหาและตรวจสอบคะแนน'}
                </>
              )}
            </button>
          </form>

          {/* Quick info footer */}
          <div className="mt-8 pt-5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>รองรับมือถือทั้ง Android และ iOS</span>
            {onGoToInstructor && (
              <button
                onClick={onGoToInstructor}
                className="text-teal-700 font-medium hover:underline flex items-center gap-0.5 cursor-pointer"
              >
                สำหรับอาจารย์ <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* STEP 2A: First-Time PIN Setup */}
      {step === 'first_time_setup' && currentScore && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8 animate-fadeIn">
          {/* Identity preview */}
          <div className="bg-teal-50 border border-teal-100 rounded-xl p-4 mb-6">
            <div className="flex items-center gap-2 text-teal-900 font-semibold text-sm mb-1">
              <User className="w-4 h-4 text-teal-600" />
              พบข้อมูล: {currentScore.name}
            </div>
            <div className="text-xs text-teal-700 flex gap-4">
              <span>รหัส: {currentScore.studentId}</span>
              <span>Sec: {currentScore.sec}</span>
              <span>เลขที่: {currentScore.no}</span>
            </div>
          </div>

          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-amber-100 text-amber-700 mb-2">
              <KeyRound className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">
              เข้าสู่ระบบครั้งแรก: กำหนดรหัสผ่าน 6 หลัก
            </h2>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              เพื่อความปลอดภัยและความเป็นส่วนตัว กรุณากำหนดรหัสผ่านตัวเลข 6 หลักที่คุณจำได้ สำหรับใช้ดูคะแนนในครั้งต่อไป
            </p>
          </div>

          <form onSubmit={handleSetupPin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                กำหนดรหัสผ่านตัวเลข 6 หลัก
              </label>
              <div className="relative">
                <input
                  type={showPin ? 'text' : 'password'}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••••"
                  className="w-full text-center tracking-[0.5em] px-4 py-3 rounded-xl border border-slate-300 font-mono text-xl font-bold focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPin(!showPin)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPin ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                ยืนยันรหัสผ่านตัวเลข 6 หลักอีกครั้ง
              </label>
              <input
                type={showPin ? 'text' : 'password'}
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={pinConfirmInput}
                onChange={(e) => setPinConfirmInput(e.target.value.replace(/\D/g, ''))}
                placeholder="••••••"
                className="w-full text-center tracking-[0.5em] px-4 py-3 rounded-xl border border-slate-300 font-mono text-xl font-bold focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              />
            </div>

            {pinError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-xs text-rose-800">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{pinError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || pinInput.length !== 6 || pinConfirmInput.length !== 6}
              className="w-full py-3.5 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-semibold text-sm shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  บันทึกรหัสผ่านและดูคะแนน
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleReset}
              className="w-full py-2 text-xs text-slate-500 hover:text-slate-700 cursor-pointer"
            >
              ยกเลิก / เปลี่ยนรหัสนักศึกษา
            </button>
          </form>
        </div>
      )}

      {/* STEP 2B: Returning PIN Prompt */}
      {step === 'enter_pin' && currentScore && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8 animate-fadeIn">
          {/* Identity preview */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-6">
            <div className="text-xs text-slate-500 mb-0.5">รหัสนักศึกษา: {currentScore.studentId}</div>
            <div className="text-base font-bold text-slate-900">{currentScore.name}</div>
            <div className="text-xs text-slate-600 mt-1 flex gap-3">
              <span>กลุ่มเรียน (Sec): {currentScore.sec}</span>
              <span>ลำดับที่: {currentScore.no}</span>
            </div>
          </div>

          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-teal-100 text-teal-700 mb-2">
              <Lock className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">
              กรอกรหัสผ่าน 6 หลักของคุณ
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              กรอกรหัสผ่าน 6 หลักที่คุณได้ตั้งไว้ตอนเข้าใช้งานครั้งแรก
            </p>
          </div>

          <form onSubmit={handleVerifyPin} className="space-y-4">
            <div>
              <div className="relative">
                <input
                  type={showPin ? 'text' : 'password'}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••••"
                  disabled={loading || isLocked}
                  className="w-full text-center tracking-[0.6em] px-4 py-3.5 rounded-xl border border-slate-300 font-mono text-2xl font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPin(!showPin)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPin ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              <div className="flex justify-between items-center text-xs text-slate-500 mt-2">
                <span>กรอกรหัสผ่านผิดได้อีก {pinAttemptsLeft} ครั้ง</span>
                <span className="text-slate-400">ตัวเลข 6 หลัก</span>
              </div>
            </div>

            {pinError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2 text-xs text-rose-800">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{pinError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || pinInput.length !== 6 || isLocked}
              className="w-full py-3.5 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-semibold text-sm shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  ยืนยันรหัสผ่านเพื่อดูคะแนน
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleReset}
              className="w-full py-2 text-xs text-slate-500 hover:text-slate-700 cursor-pointer"
            >
              กลับหน้าค้นหา
            </button>
          </form>
        </div>
      )}

      {/* STEP 3: Score Breakdown Display (Unlocked) */}
      {step === 'view_score' && currentScore && (
        <div className="space-y-5 animate-fadeIn">
          {/* Student Info Card (Requirement 3: เลขที่, รหัสนักศึกษา, ชื่อ-นามสกุล, Sec มาแสดงก่อน) */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="bg-gradient-to-r from-teal-700 to-emerald-700 text-white p-5 sm:p-6">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-white/20 text-white backdrop-blur-xs">
                  <CheckCircle2 className="w-3.5 h-3.5" /> ยืนยันตัวตนสำเร็จ
                </span>
                <span className="text-xs text-teal-100 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  {formatDate(currentScore.updatedAt)}
                </span>
              </div>

              <div className="mt-4">
                <div className="text-xs text-teal-200 uppercase tracking-wider">ชื่อ-นามสกุล</div>
                <div className="text-xl sm:text-2xl font-bold mt-0.5">{currentScore.name}</div>
              </div>

              <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-white/15 text-center">
                <div className="bg-white/10 rounded-xl p-2.5">
                  <div className="text-[11px] text-teal-200">เลขที่</div>
                  <div className="text-base font-bold font-mono">{currentScore.no || '-'}</div>
                </div>
                <div className="bg-white/10 rounded-xl p-2.5">
                  <div className="text-[11px] text-teal-200">รหัสนักศึกษา</div>
                  <div className="text-base font-bold font-mono">{currentScore.studentId}</div>
                </div>
                <div className="bg-white/10 rounded-xl p-2.5">
                  <div className="text-[11px] text-teal-200">Sec (กลุ่มเรียน)</div>
                  <div className="text-base font-bold font-mono">{currentScore.sec}</div>
                </div>
              </div>
            </div>

            <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 text-xs text-slate-600 flex items-center justify-between">
              <span>รายวิชา: <strong>{currentScore.courseCode}</strong> - {currentScore.courseName}</span>
              <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> ประกาศแล้ว
              </span>
            </div>
          </div>

          {/* Scores Table Card (Requirement 6: ATTEN 10, CA 10, AS 20, MID 25, TOTAL 65) */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 sm:p-6">
            <h3 className="text-base font-bold text-slate-900 mb-4 pb-2 border-b border-slate-100 flex items-center justify-between">
              <span>รายละเอียดคะแนนแต่ละหัวข้อ</span>
              <span className="text-xs font-normal text-slate-500">คะแนนเต็ม</span>
            </h3>

            <div className="space-y-3.5">
              {/* ATTEN */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 hover:bg-slate-100/70 transition-colors">
                <div>
                  <div className="text-sm font-bold text-slate-900">ATTEN : เข้าเรียน</div>
                  <div className="text-xs text-slate-500">การมีส่วนร่วมและการเข้าชั้นเรียน</div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold font-mono text-slate-900">{currentScore.atten}</div>
                  <div className="text-xs text-slate-400">เต็ม 10 คะแนน</div>
                </div>
              </div>

              {/* CA */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 hover:bg-slate-100/70 transition-colors">
                <div>
                  <div className="text-sm font-bold text-slate-900">CA : งานในชั้นเรียน</div>
                  <div className="text-xs text-slate-500">กิจกรรมและแบบฝึกหัดในห้องเรียน</div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold font-mono text-slate-900">{currentScore.ca}</div>
                  <div className="text-xs text-slate-400">เต็ม 10 คะแนน</div>
                </div>
              </div>

              {/* AS */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 hover:bg-slate-100/70 transition-colors">
                <div>
                  <div className="text-sm font-bold text-slate-900">AS : การบ้าน</div>
                  <div className="text-xs text-slate-500">การบ้านและโครงงานย่อย</div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold font-mono text-slate-900">{currentScore.as}</div>
                  <div className="text-xs text-slate-400">เต็ม 20 คะแนน</div>
                </div>
              </div>

              {/* MID */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 hover:bg-slate-100/70 transition-colors">
                <div>
                  <div className="text-sm font-bold text-slate-900">MID : สอบกลางภาค</div>
                  <div className="text-xs text-slate-500">การประเมินผลกลางภาคเรียน</div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold font-mono text-slate-900">{currentScore.mid}</div>
                  <div className="text-xs text-slate-400">เต็ม 25 คะแนน</div>
                </div>
              </div>

              {/* TOTAL (FEATURED) */}
              <div className="mt-4 p-4 rounded-xl bg-gradient-to-r from-teal-50 to-emerald-50 border border-teal-200 flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-teal-800 uppercase tracking-wider">คะแนนรวมทั้งหมด</div>
                  <div className="text-lg font-extrabold text-teal-950">TOTAL : รวมกลางภาค</div>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-extrabold font-mono text-teal-700">
                    {currentScore.total}
                  </div>
                  <div className="text-xs font-medium text-teal-800">เต็ม 65 คะแนน</div>
                </div>
              </div>
            </div>

            {/* Note requirement: ไม่มีการประกาศเกรด */}
            <div className="mt-5 p-3.5 bg-amber-50/80 border border-amber-200/80 rounded-xl text-xs text-amber-900 leading-relaxed flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <strong>หมายเหตุสำคัญ:</strong> ไม่มีการประกาศเกรด เนื่องจากคะแนนที่ประกาศนี้เป็นเพียงคะแนนเก็บส่วนหนึ่ง (65 คะแนน) จากคะแนนรวมทั้งภาคการศึกษา
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => window.print()}
              className="flex-1 py-3 px-4 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              พิมพ์หรือบันทึกเป็น PDF
            </button>
            <button
              onClick={handleReset}
              className="flex-1 py-3 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              ออกจากระบบ / ปิดหน้าคะแนน
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
