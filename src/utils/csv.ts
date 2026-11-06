import { StudentScore } from '../types';

export interface CSVParseResult {
  success: boolean;
  data: Partial<StudentScore>[];
  errors: string[];
}

/**
 * Parses CSV text, handling UTF-8 Thai characters, quoted fields, and commas.
 */
export function parseCSV(csvText: string, courseId: string, courseCode: string, courseName: string, instructorUid: string): CSVParseResult {
  const errors: string[] = [];
  const lines = csvText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);

  if (lines.length < 2) {
    return {
      success: false,
      data: [],
      errors: ['ไฟล์ CSV ต้องมีหัวตาราง (Header) และข้อมูลนักศึกษาอย่างน้อย 1 แถว']
    };
  }

  // Parse header line
  const headerTokens = parseCSVLine(lines[0]).map(h => h.trim().toLowerCase());
  
  // Identify column indices
  const getIndex = (aliases: string[]) => {
    return headerTokens.findIndex(h => aliases.some(alias => h.includes(alias.toLowerCase())));
  };

  const noIdx = getIndex(['เลขที่', 'no', 'ลำดับ', 'order']);
  const idIdx = getIndex(['รหัสนักศึกษา', 'รหัส', 'studentid', 'student_id', 'id']);
  const nameIdx = getIndex(['ชื่อ-นามสกุล', 'ชื่อ', 'name', 'fullname', 'student name']);
  const secIdx = getIndex(['sec', 'กลุ่ม', 'section', 'กลุ่มเรียน']);
  const attenIdx = getIndex(['atten', 'เข้าเรียน', 'attendance']);
  const caIdx = getIndex(['ca', 'งานในชั้นเรียน', 'classwork', 'class work']);
  const asIdx = getIndex(['as', 'การบ้าน', 'assignment', 'homework']);
  const midIdx = getIndex(['mid', 'กลางภาค', 'midterm']);
  const totalIdx = getIndex(['total', 'รวม', 'คะแนนรวม']);

  if (idIdx === -1) {
    errors.push('ไม่พบคอลัมน์ "รหัสนักศึกษา" หรือ "Student ID" ในหัวตาราง');
  }
  if (nameIdx === -1) {
    errors.push('ไม่พบคอลัมน์ "ชื่อ-นามสกุล" ในหัวตาราง');
  }

  if (errors.length > 0) {
    return { success: false, data: [], errors };
  }

  const results: Partial<StudentScore>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const rawLine = lines[i];
    const cols = parseCSVLine(rawLine);
    if (cols.length === 0 || cols.every(c => c.trim() === '')) continue;

    const studentId = (cols[idIdx] || '').trim().replace(/['" \t]/g, '');
    if (!studentId) continue;

    const no = noIdx !== -1 ? (cols[noIdx] || `${i}`).trim() : `${i}`;
    const name = nameIdx !== -1 ? (cols[nameIdx] || '').trim() : '';
    const sec = secIdx !== -1 ? (cols[secIdx] || '1').trim() : '1';

    const parseNum = (idx: number, defVal: number = 0) => {
      if (idx === -1 || !cols[idx]) return defVal;
      const val = parseFloat(cols[idx].replace(/,/g, '').trim());
      return isNaN(val) ? defVal : val;
    };

    const atten = parseNum(attenIdx, 0);
    const ca = parseNum(caIdx, 0);
    const as = parseNum(asIdx, 0);
    const mid = parseNum(midIdx, 0);
    
    // As per specs: "ระบบแสดงคะแนนตามที่อาจารย์กรอกหรือนำเข้าเท่านั้น โดยไม่มีการคำนวณใด ๆ (รวมถึงคะแนน TOTAL ซึ่งนำเข้ามาพร้อมไฟล์)"
    let total = parseNum(totalIdx, -1);
    if (total === -1) {
      // If total was not in CSV, sum provided elements
      total = Number((atten + ca + as + mid).toFixed(2));
    }

    results.push({
      id: `${courseId}_${studentId}`,
      courseId,
      courseCode,
      courseName,
      studentId,
      no,
      name,
      sec,
      atten,
      ca,
      as,
      mid,
      total,
      isPublished: false,
      pinHash: null,
      pinSalt: null,
      pinAttempts: 0,
      instructorUid,
      updatedAt: new Date().toISOString()
    });
  }

  if (results.length === 0) {
    errors.push('ไม่พบรายการข้อมูลนักศึกษาที่ถูกต้องในไฟล์');
    return { success: false, data: [], errors };
  }

  return { success: true, data: results, errors: [] };
}

/**
 * Splits a CSV line taking quotation into account
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

/**
 * Generates sample CSV text ready to download
 */
export function generateSampleCSV(): string {
  const headers = ['เลขที่', 'รหัสนักศึกษา', 'ชื่อ-นามสกุล', 'Sec', 'ATTEN', 'CA', 'AS', 'MID', 'TOTAL'];
  const sampleRows = [
    ['1', '1650701001', 'นายกิตติคุณ สุขสมบูรณ์', '1', '10', '9.5', '18', '22', '59.5'],
    ['2', '1650701002', 'นางสาวณิชาภัทร วัฒนพานิช', '1', '9', '10', '19', '24.5', '62.5'],
    ['3', '1650701003', 'นายธนกฤต ปัญญาดี', '1', '10', '8', '17', '20', '55'],
    ['4', '1650701004', 'นางสาวปภัสรา เจริญเกียรติ', '1', '8.5', '9', '16.5', '21', '55'],
    ['5', '1650701005', 'นายวรเมธ ศรีสว่างวงศ์', '1', '10', '10', '20', '25', '65'],
    ['6', '1650701006', 'นางสาวชลธิชา สิทธิผล', '2', '9.5', '9.5', '19', '23', '61'],
    ['7', '1650701007', 'นายภูมินทร์ ชัยชนะ', '2', '10', '9', '17.5', '21.5', '58'],
    ['8', '1650701008', 'นางสาวพิชญ์นรี รัตนโกสินทร์', '2', '10', '10', '18.5', '23.5', '62']
  ];

  const content = [
    headers.join(','),
    ...sampleRows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(','))
  ].join('\r\n');

  return '\uFEFF' + content; // UTF-8 BOM
}

/**
 * Exports student scores to UTF-8 CSV with BOM for Excel compatibility
 */
export function exportScoresToCSV(scores: StudentScore[], courseCode: string, secName?: string): void {
  const headers = ['เลขที่', 'รหัสนักศึกษา', 'ชื่อ-นามสกุล', 'Sec', 'ATTEN (10)', 'CA (10)', 'AS (20)', 'MID (25)', 'TOTAL (65)', 'สถานะประกาศ', 'ตั้งรหัสแล้ว'];

  const rows = scores.map(s => [
    s.no || '',
    s.studentId,
    s.name,
    s.sec,
    s.atten.toString(),
    s.ca.toString(),
    s.as.toString(),
    s.mid.toString(),
    s.total.toString(),
    s.isPublished ? 'ประกาศแล้ว' : 'ปิดประกาศ',
    s.pinHash ? 'ตั้งแล้ว' : 'ยังไม่ตั้ง'
  ]);

  const csvContent = [
    headers.map(h => `"${h}"`).join(','),
    ...rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(','))
  ].join('\r\n');

  // Prefix with UTF-8 BOM for perfect Thai rendering in Excel
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  const fileName = `scores_${courseCode}_sec${secName || 'ALL'}_${new Date().toISOString().slice(0, 10)}.csv`;
  link.setAttribute('download', fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
