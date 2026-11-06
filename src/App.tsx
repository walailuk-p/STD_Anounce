import React, { useState } from 'react';
import { Navbar } from './components/Navbar';
import { StudentScoreView } from './components/StudentScoreView';
import { InstructorDashboard } from './components/InstructorDashboard';

export default function App() {
  const [currentTab, setCurrentTab] = useState<'student' | 'instructor'>('student');

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans selection:bg-teal-100 selection:text-teal-900">
      {/* Top Navigation */}
      <Navbar currentTab={currentTab} onTabChange={setCurrentTab} />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col justify-start">
        {currentTab === 'student' ? (
          <StudentScoreView onGoToInstructor={() => setCurrentTab('instructor')} />
        ) : (
          <InstructorDashboard />
        )}
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-500">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-left">
            <span className="font-semibold text-slate-700">ระบบประกาศคะแนนนักศึกษา (ScoreAnnounce)</span>
            <span className="block text-[11px] text-slate-400">
              รักษาความเป็นส่วนตัวของข้อมูล (Data Privacy) • ตรวจสอบได้เฉพาะคะแนนของตนเอง
            </span>
          </div>

          <div className="flex items-center gap-4 text-[11px] text-slate-500">
            <span>Firebase Spark Plan (Free)</span>
            <span>•</span>
            <span>Netlify &amp; GitHub Ready</span>
            <span>•</span>
            <span>Google Apps Script</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
