import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  writeBatch
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Course, Section, StudentScore } from '../types';
import { generateSalt, hashPin } from '../utils/crypto';

// Collection references
const COURSES_COL = 'courses';
const SECTIONS_COL = 'sections';
const SCORES_COL = 'scores';

/**
 * Fetch all available courses
 */
export async function getCourses(): Promise<Course[]> {
  try {
    const snap = await getDocs(collection(db, COURSES_COL));
    return snap.docs.map(d => d.data() as Course);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, COURSES_COL);
  }
}

/**
 * Create or update a course
 */
export async function saveCourse(course: Course): Promise<void> {
  const path = `${COURSES_COL}/${course.id}`;
  try {
    await setDoc(doc(db, COURSES_COL, course.id), {
      ...course,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

/**
 * Delete a course and all its cascaded sections and student scores
 */
export async function deleteCourseWithData(courseId: string): Promise<{ deletedScoresCount: number; deletedSectionsCount: number }> {
  let deletedScoresCount = 0;
  let deletedSectionsCount = 0;

  try {
    // 1. Fetch and delete all scores for this course in batches of 450
    const scoresQuery = query(collection(db, SCORES_COL), where('courseId', '==', courseId));
    const scoresSnap = await getDocs(scoresQuery);
    const scoreDocs = scoresSnap.docs;

    const CHUNK_SIZE = 450;
    for (let i = 0; i < scoreDocs.length; i += CHUNK_SIZE) {
      const chunk = scoreDocs.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      chunk.forEach(d => batch.delete(d.ref));
      await batch.commit();
      deletedScoresCount += chunk.length;
    }

    // 2. Fetch and delete all sections for this course
    const sectionsQuery = query(collection(db, SECTIONS_COL), where('courseId', '==', courseId));
    const sectionsSnap = await getDocs(sectionsQuery);
    const sectionDocs = sectionsSnap.docs;

    for (let i = 0; i < sectionDocs.length; i += CHUNK_SIZE) {
      const chunk = sectionDocs.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      chunk.forEach(d => batch.delete(d.ref));
      await batch.commit();
      deletedSectionsCount += chunk.length;
    }

    // 3. Delete the course document itself
    const courseRef = doc(db, COURSES_COL, courseId);
    await deleteDoc(courseRef);

    return { deletedScoresCount, deletedSectionsCount };
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `${COURSES_COL}/${courseId}`);
  }
}

/**
 * Delete specific section and all its student scores
 */
export async function deleteSectionWithScores(courseId: string, sec: string): Promise<{ deletedScoresCount: number }> {
  let deletedScoresCount = 0;

  try {
    // 1. Fetch and delete all scores for this course & section
    const scoresQuery = query(
      collection(db, SCORES_COL),
      where('courseId', '==', courseId),
      where('sec', '==', sec)
    );
    const scoresSnap = await getDocs(scoresQuery);
    const scoreDocs = scoresSnap.docs;

    const CHUNK_SIZE = 450;
    for (let i = 0; i < scoreDocs.length; i += CHUNK_SIZE) {
      const chunk = scoreDocs.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      chunk.forEach(d => batch.delete(d.ref));
      await batch.commit();
      deletedScoresCount += chunk.length;
    }

    // 2. Delete the section document
    const secDocId = `${courseId}_sec_${sec}`;
    try {
      await deleteDoc(doc(db, SECTIONS_COL, secDocId));
    } catch {
      // ignore if specific ID doesn't exist
    }

    // Also query and delete any section docs matching this section
    const secQuery = query(
      collection(db, SECTIONS_COL),
      where('courseId', '==', courseId),
      where('sec', '==', sec)
    );
    const secSnap = await getDocs(secQuery);
    if (!secSnap.empty) {
      const secBatch = writeBatch(db);
      secSnap.docs.forEach(d => secBatch.delete(d.ref));
      await secBatch.commit();
    }

    return { deletedScoresCount };
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `${SECTIONS_COL}/${courseId}_sec_${sec}`);
  }
}

/**
 * Legacy delete course alias
 */
export async function deleteCourse(courseId: string): Promise<void> {
  await deleteCourseWithData(courseId);
}

/**
 * Get all sections for a course
 */
export async function getSections(courseId: string): Promise<Section[]> {
  const path = SECTIONS_COL;
  try {
    const q = query(collection(db, SECTIONS_COL), where('courseId', '==', courseId));
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as Section);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

/**
 * Single document read for student lookup (1 read quota efficiency)
 */
export async function getStudentScore(courseId: string, studentId: string): Promise<StudentScore | null> {
  const docId = `${courseId}_${studentId.trim()}`;
  const path = `${SCORES_COL}/${docId}`;
  try {
    const snap = await getDoc(doc(db, SCORES_COL, docId));
    if (!snap.exists()) {
      return null;
    }
    return snap.data() as StudentScore;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

/**
 * Direct lookup of student score across available courses without requiring user to pick course
 */
export async function findStudentScoreAcrossCourses(courses: Course[], studentId: string): Promise<StudentScore | null> {
  const cleanId = studentId.trim();
  for (const course of courses) {
    const docId = `${course.id}_${cleanId}`;
    try {
      const snap = await getDoc(doc(db, SCORES_COL, docId));
      if (snap.exists()) {
        return snap.data() as StudentScore;
      }
    } catch {
      // If document not found or access denied for this particular course doc, check next
    }
  }
  return null;
}

/**
 * First-time setup of 6-digit PIN by student
 */
export async function setupStudentPin(courseId: string, studentId: string, pin: string): Promise<void> {
  const docId = `${courseId}_${studentId.trim()}`;
  const path = `${SCORES_COL}/${docId}`;
  const salt = generateSalt();
  const hash = await hashPin(pin, salt);

  try {
    await updateDoc(doc(db, SCORES_COL, docId), {
      pinHash: hash,
      pinSalt: salt,
      pinAttempts: 0,
      lockedUntil: null,
      updatedAt: new Date().toISOString()
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

/**
 * Record a failed PIN attempt and lock if threshold (5) reached
 */
export async function recordFailedAttempt(courseId: string, studentId: string, currentAttempts: number): Promise<{ locked: boolean; lockedUntil?: string }> {
  const docId = `${courseId}_${studentId.trim()}`;
  const path = `${SCORES_COL}/${docId}`;
  const newAttempts = (currentAttempts || 0) + 1;
  const updates: Record<string, any> = {
    pinAttempts: newAttempts,
    updatedAt: new Date().toISOString()
  };

  let locked = false;
  let lockedUntil: string | undefined = undefined;

  if (newAttempts >= 5) {
    locked = true;
    // Lock for 15 minutes
    const lockTime = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    updates.lockedUntil = lockTime;
    lockedUntil = lockTime;
  }

  try {
    await updateDoc(doc(db, SCORES_COL, docId), updates);
    return { locked, lockedUntil };
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

/**
 * Reset failed attempts upon successful login
 */
export async function resetFailedAttempts(courseId: string, studentId: string): Promise<void> {
  const docId = `${courseId}_${studentId.trim()}`;
  const path = `${SCORES_COL}/${docId}`;
  try {
    await updateDoc(doc(db, SCORES_COL, docId), {
      pinAttempts: 0,
      lockedUntil: null,
      updatedAt: new Date().toISOString()
    });
  } catch (err) {
    // Non-blocking
    console.warn('Could not reset attempt count:', err);
  }
}

/**
 * Teacher: Fetch scores for a course and optional section
 */
export async function getTeacherScores(courseId: string, sec?: string): Promise<StudentScore[]> {
  const path = SCORES_COL;
  try {
    let q = query(collection(db, SCORES_COL), where('courseId', '==', courseId));
    if (sec && sec !== 'ALL') {
      q = query(collection(db, SCORES_COL), where('courseId', '==', courseId), where('sec', '==', sec));
    }
    const snap = await getDocs(q);
    const list = snap.docs.map(d => d.data() as StudentScore);
    // Sort by numeric studentId or No
    return list.sort((a, b) => {
      const numA = parseInt(a.no, 10);
      const numB = parseInt(b.no, 10);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return a.studentId.localeCompare(b.studentId);
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

/**
 * Teacher: Save or update individual student score (Manual Override)
 */
export async function saveSingleScore(score: StudentScore): Promise<void> {
  const path = `${SCORES_COL}/${score.id}`;
  try {
    await setDoc(doc(db, SCORES_COL, score.id), {
      ...score,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

/**
 * Teacher: Reset student PIN so student can set a new 6-digit PIN
 */
export async function resetStudentPinByTeacher(scoreId: string): Promise<void> {
  const path = `${SCORES_COL}/${scoreId}`;
  try {
    await updateDoc(doc(db, SCORES_COL, scoreId), {
      pinHash: null,
      pinSalt: null,
      pinAttempts: 0,
      lockedUntil: null,
      updatedAt: new Date().toISOString()
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

/**
 * Teacher: Delete single score
 */
export async function deleteSingleScore(scoreId: string): Promise<void> {
  const path = `${SCORES_COL}/${scoreId}`;
  try {
    await deleteDoc(doc(db, SCORES_COL, scoreId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

/**
 * Teacher: Batch import scores from CSV
 */
export async function batchImportScores(scores: StudentScore[], courseId: string, sec: string): Promise<number> {
  if (scores.length === 0) return 0;

  // Process in chunks of 450 (Firestore limit is 500 per batch)
  const CHUNK_SIZE = 450;
  let count = 0;

  for (let i = 0; i < scores.length; i += CHUNK_SIZE) {
    const chunk = scores.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);

    chunk.forEach(sc => {
      const docRef = doc(db, SCORES_COL, sc.id);
      batch.set(docRef, {
        ...sc,
        updatedAt: new Date().toISOString()
      }, { merge: true });
    });

    try {
      await batch.commit();
      count += chunk.length;
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, SCORES_COL);
    }
  }

  // Update Section studentCount
  try {
    const secDocId = `${courseId}_sec_${sec}`;
    const secRef = doc(db, SECTIONS_COL, secDocId);
    await setDoc(secRef, {
      id: secDocId,
      courseId,
      sec,
      studentCount: count,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch {
    // optional update
  }

  return count;
}

/**
 * Teacher: Toggle Publish Status for a section
 */
export async function toggleSectionPublish(
  courseId: string,
  sec: string,
  isPublished: boolean,
  instructorUid: string
): Promise<void> {
  const secDocId = `${courseId}_sec_${sec}`;
  const now = new Date().toISOString();

  // 1. Update Section document
  try {
    await setDoc(doc(db, SECTIONS_COL, secDocId), {
      id: secDocId,
      courseId,
      sec,
      isPublished,
      instructorUid,
      publishedAt: isPublished ? now : null,
      updatedAt: now
    }, { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `${SECTIONS_COL}/${secDocId}`);
  }

  // 2. Update all student scores in this course & section
  try {
    const q = query(
      collection(db, SCORES_COL),
      where('courseId', '==', courseId),
      where('sec', '==', sec)
    );
    const snap = await getDocs(q);

    const CHUNK_SIZE = 450;
    const docs = snap.docs;
    for (let i = 0; i < docs.length; i += CHUNK_SIZE) {
      const chunk = docs.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      chunk.forEach(d => {
        batch.update(d.ref, {
          isPublished,
          updatedAt: now
        });
      });
      await batch.commit();
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, SCORES_COL);
  }
}
