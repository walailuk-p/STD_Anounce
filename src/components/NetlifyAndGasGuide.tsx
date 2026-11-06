import React, { useState } from 'react';
import { Copy, Check, ExternalLink, Code2, ShieldCheck, Zap } from 'lucide-react';

export const NetlifyAndGasGuide: React.FC = () => {
  const [copiedGas, setCopiedGas] = useState(false);
  const [copiedEnv, setCopiedEnv] = useState(false);

  const gasCode = `/**
 * Google Apps Script (GAS) สำหรับเชื่อมต่อ Google Sheets กับระบบคะแนน
 * ใช้งานฟรี 100% แทน Google Cloud Run โดยไม่มีค่าใช้จ่ายเซิร์ฟเวอร์
 * 
 * วิธีติดตั้ง:
 * 1. เปิด Google Sheets ที่เก็บคะแนนของอาจารย์
 * 2. ไปที่ Extensions (ส่วนขยาย) > Apps Script
 * 3. วางโค้ดนี้ลงใน Code.gs
 * 4. คลิก Deploy (การทำให้ใช้งานได้) > New deployment > Web app
 * 5. Execute as: Me, Who has access: Anyone
 */

function doGet(e) {
  var action = e.parameter.action;
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var data = sheet.getDataRange().getValues();
  
  if (action === "getScores") {
    var headers = data[0];
    var rows = [];
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      rows.push({
        no: row[0],
        studentId: String(row[1]),
        name: row[2],
        sec: String(row[3]),
        atten: row[4],
        ca: row[5],
        as: row[6],
        mid: row[7],
        total: row[8]
      });
    }
    return ContentService.createTextOutput(JSON.stringify({ success: true, data: rows }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  return ContentService.createTextOutput(JSON.stringify({ status: "Score API Ready" }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    
    // อัปเดตคะแนนลง Sheet อัตโนมัติ
    if (body.action === "updateScore") {
      var studentId = String(body.studentId);
      var data = sheet.getDataRange().getValues();
      for (var i = 1; i < data.length; i++) {
        if (String(data[i][1]) === studentId) {
          // อัปเดตช่องคะแนน
          if (body.atten !== undefined) sheet.getRange(i + 1, 5).setValue(body.atten);
          if (body.ca !== undefined) sheet.getRange(i + 1, 6).setValue(body.ca);
          if (body.as !== undefined) sheet.getRange(i + 1, 7).setValue(body.as);
          if (body.mid !== undefined) sheet.getRange(i + 1, 8).setValue(body.mid);
          if (body.total !== undefined) sheet.getRange(i + 1, 9).setValue(body.total);
          return ContentService.createTextOutput(JSON.stringify({ success: true, updatedRow: i + 1 }))
            .setMimeType(ContentService.MimeType.JSON);
        }
      }
    }
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}`;

  const copyToClipboard = (text: string, type: 'gas' | 'env') => {
    navigator.clipboard.writeText(text);
    if (type === 'gas') {
      setCopiedGas(true);
      setTimeout(() => setCopiedGas(false), 2000);
    } else {
      setCopiedEnv(true);
      setTimeout(() => setCopiedEnv(false), 2000);
    }
  };

  return (
    <div className="space-y-6 text-slate-800">
      {/* Header Info */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5">
        <div className="flex items-start gap-3">
          <ShieldCheck className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-emerald-950 text-base">สถาปัตยกรรมแบบไม่มีค่าใช้จ่าย (100% Free Tier Architecture)</h3>
            <p className="text-sm text-emerald-800 mt-1 leading-relaxed">
              ระบบนี้ถูกออกแบบให้ทำงานบน <strong>Firebase Spark Plan (Free)</strong> ร่วมกับ <strong>Netlify</strong> สำหรับโฮสติ้ง และใช้ <strong>Google Apps Script (GAS)</strong> แทน Google Cloud Run เพื่อไม่ให้เกิดค่าใช้จ่ายใดๆ และรองรับการ Sync ข้อมูลกับ GitHub
            </p>
          </div>
        </div>
      </div>

      {/* Netlify Deployment Section */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-teal-100 flex items-center justify-center text-teal-700 font-bold">1</div>
          <h4 className="text-lg font-bold text-slate-900">การเชื่อมต่อ GitHub และ Deploy บน Netlify</h4>
        </div>
        
        <ol className="list-decimal list-inside space-y-3 text-sm text-slate-700 pl-2">
          <li>
            <strong>Push โค้ดขึ้น GitHub:</strong> Push source code ทั้งหมดนี้ขึ้นบน GitHub Repository ของอาจารย์
          </li>
          <li>
            <strong>เข้าสู่ระบบ Netlify:</strong> ไปที่ <a href="https://app.netlify.com" target="_blank" rel="noreferrer" className="text-indigo-600 underline font-medium inline-flex items-center gap-1">app.netlify.com <ExternalLink className="w-3.5 h-3.5" /></a> แล้วคลิก <em>"Add new site" &gt; "Import an existing project" &gt; GitHub</em>
          </li>
          <li>
            <strong>การตั้งค่า Build Settings บน Netlify:</strong>
            <div className="mt-2 bg-slate-900 text-slate-100 font-mono text-xs p-3 rounded-lg space-y-1">
              <div>Base directory: <span className="text-teal-400">/</span> (ปล่อยว่างได้)</div>
              <div>Build command: <span className="text-teal-400">npm run build</span></div>
              <div>Publish directory: <span className="text-teal-400">dist</span></div>
            </div>
          </li>
          <li>
            <strong>ไฟล์ Redirects สำหรับ Single Page App (SPA):</strong> ในโปรเจกต์มีไฟล์ <code className="bg-slate-100 px-1 py-0.5 rounded text-indigo-700 font-mono">public/_redirects</code> เรียบร้อยแล้ว (/* /index.html 200) เพื่อให้รองรับ routing ทุกหน้าบน Netlify
          </li>
        </ol>
      </div>

      {/* Google Apps Script Replacement for Cloud Run */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold">2</div>
            <div>
              <h4 className="text-lg font-bold text-slate-900">Google Apps Script (GAS) แทน Google Cloud Run</h4>
              <p className="text-xs text-slate-500">สำหรับเชื่อมต่อคะแนนกับ Google Sheets หรือส่งแจ้งเตือน Gmail อัตโนมัติ</p>
            </div>
          </div>
          <button
            onClick={() => copyToClipboard(gasCode, 'gas')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 transition-colors cursor-pointer"
          >
            {copiedGas ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            {copiedGas ? 'คัดลอกแล้ว!' : 'คัดลอกสคริปต์ GAS'}
          </button>
        </div>

        <div className="text-sm text-slate-600 mb-3 space-y-2">
          <p>
            ตามข้อกำหนดของระบบ: <strong>ห้ามใช้ Google Cloud Run</strong> หากต้องการทำระบบดึงคะแนนอัตโนมัติจาก Google Sheets, ส่งอีเมลแจ้งเตือน Gmail, หรือบันทึกปฏิทิน ให้ใช้ <strong>Google Apps Script</strong> ดังโค้ดด้านล่างนี้ โดยไม่ต้องตั้งค่า Server หรือเสียค่าบริการ Cloud
          </p>
        </div>

        <div className="relative">
          <pre className="bg-slate-900 text-slate-200 p-4 rounded-xl text-xs font-mono overflow-x-auto max-h-80 leading-relaxed border border-slate-800">
            {gasCode}
          </pre>
        </div>
      </div>

      {/* Security & Spark Plan Best Practices */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
        <div className="flex items-start gap-3">
          <Zap className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-900 space-y-1">
            <h5 className="font-semibold text-amber-950">เทคนิคการประหยัด Quota ภายใต้ Firebase Spark Plan:</h5>
            <ul className="list-disc list-inside space-y-1 text-xs text-amber-800">
              <li><strong>อ่านเพียง 1 Document ต่อการตรวจสอบ:</strong> นักศึกษาค้นหาด้วยรหัสนักศึกษา ระบบจะดึงเฉพาะ document <code className="font-mono bg-amber-100 px-1 rounded">scores/[courseId]_[studentId]</code> ตรงๆ ทำให้อ่านเพียง 1 ครั้งเท่านั้น</li>
              <li><strong>ความปลอดภัยแบบ Zero-Trust:</strong> ไม่อนุญาตให้ฝั่ง Client ดึงรายชื่อนักศึกษาทั้งหมด กฎ Firestore Rules อนุญาตเฉพาะอาจารย์เท่านั้นที่สามารถ Query รายการทั้งหมดได้</li>
              <li><strong>การเข้ารหัส PIN 6 หลัก:</strong> รหัสผ่าน 6 หลักถูกเข้ารหัสด้วย SHA-256 พร้อม Salt ก่อนบันทึกลงระบบ ไม่มีการเก็บเป็น Plain Text อย่างเด็ดขาด</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
