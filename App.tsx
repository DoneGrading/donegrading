import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  BookOpen,
  Camera,
  Layers,
  CheckCircle,
  Users,
  Loader2,
  Trash2,
  ArrowRight,
  Sparkles,
  CloudUpload,
  Zap,
  AlertCircle,
  Check,
  Wifi,
  WifiOff,
  History as HistoryIcon,
  X,
  Target,
  RefreshCw,
  FileText,
  PlusCircle,
  Mic,
  MicOff,
  Home,
  MessageCircle,
  LayoutDashboard,
  Calendar,
  Settings,
  Share2,
} from 'lucide-react';
import { AppPhase, GradingMode, Course, Assignment, Student, GradedWork, GradingResponse, GeometricData, SubscriptionStatus } from './types';
import {
  analyzeMultiPagePaper,
  analyzePaper,
  assessFrame,
  extractRubricFromImage,
  generateRubric,
  generateLessonScript,
  generateDifferentiatedLesson,
  type LessonScriptResult,
} from './services/geminiService';
import { scheduleReminderNotification } from './lib/notifications';
import { loadAuthSession, saveAuthSession, clearAuthSession, touchAuthSession } from './lib/authSession';
import { auth } from './lib/firebase';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signOut as firebaseSignOut,
  updateProfile,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { ClassroomService } from './services/classroomService';
import { logEvent } from './analytics';
import { CommunicationDashboard } from './CommunicationDashboard';
import { sectionTitle, label } from './uiStyles';
import { safeParseJson } from './utils/safeParseJson';
import { PageWrapper } from './components/PageWrapper';
import { ConsentBanner } from './components/ConsentBanner';
import { Onboarding, hasCompletedOnboarding } from './components/Onboarding';
import { AppContext } from './context/AppContext';
import { AuthView } from './views/AuthView';

type SortMode = 'recent' | 'alphabetical' | 'manual';

type PlanVersion = 'Standard' | 'Sub Plan' | 'Period 2 (Advanced)';

type StandardItem = { code: string; label: string };

type ResourceCard = {
  title: string;
  kind: 'video' | 'article' | 'simulation' | 'doc';
  source: string;
  url: string;
  blurb: string;
};

type ScheduleViewMode = 'daily' | 'weekly' | 'monthly';

type ScheduleItem = {
  id: string;
  title: string;
  date: string; // ISO date string
  view: ScheduleViewMode;
   // type of block for coloring and grouping
  kind?: 'event' | 'reminder' | 'teacherBlock' | 'appointment' | 'meeting';
  courseId?: string;
  assignmentId?: string;
  notes?: string;
  time?: string; // HH:MM (24h) start
  endTime?: string; // optional HH:MM end time for blocks
  recurrence: 'once' | 'daily' | 'weekly' | 'monthly';
};

const useSpeechToText = (
  onResult: (text: string) => void,
  options?: {
    continuous?: boolean;
    interimResults?: boolean;
    autoRestart?: boolean;
    lang?: string;
  },
) => {
  const [isListening, setIsListening] = useState(false);
  const [hasSupport, setHasSupport] = useState(false);
  const recognitionRef = useRef<any>(null);
  const shouldListenRef = useRef(false);
  const optsRef = useRef(options);
  optsRef.current = options;

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = !!optsRef.current?.continuous;
      recognitionRef.current.interimResults = !!optsRef.current?.interimResults;
      recognitionRef.current.lang = optsRef.current?.lang || 'en-US';
      setHasSupport(true);

      recognitionRef.current.onstart = () => {
        setIsListening(true);
      };
      recognitionRef.current.onresult = (event: any) => {
        try {
          const transcript = event.results?.[0]?.[0]?.transcript ?? '';
          if (transcript) onResult(transcript);
        } catch {
          // ignore
        }
      };

      recognitionRef.current.onerror = () => {
        // Keep UI responsive even when recognition errors out.
        setIsListening(false);
        shouldListenRef.current = false;
      };
      recognitionRef.current.onend = () => {
        if (shouldListenRef.current && optsRef.current?.autoRestart) {
          try {
            recognitionRef.current?.start();
            return;
          } catch {
            // fall through
          }
        }
        setIsListening(false);
        shouldListenRef.current = false;
      };
    } else {
      setHasSupport(false);
    }
  }, [onResult]);

  const toggleListening = () => {
    if (isListening) {
      shouldListenRef.current = false;
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      try {
        shouldListenRef.current = true;
        recognitionRef.current?.start();
        // isListening will flip true in onstart
      } catch (e) {
        console.error("Speech recognition start failed", e);
        shouldListenRef.current = false;
      }
    }
  };

  return { isListening, toggleListening, hasSupport };
};

const VoiceInputButton: React.FC<{ onResult: (text: string) => void, className?: string }> = ({ onResult, className = "" }) => {
  const { isListening, toggleListening, hasSupport } = useSpeechToText(onResult);

  if (!hasSupport) return null;

  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); toggleListening(); }}
      className={`p-2 rounded-xl transition-all duration-300 shadow-sm backdrop-blur-md ${isListening ? 'bg-red-500 text-white animate-pulse shadow-[0_0_15px_rgba(239,68,68,0.6)]' : 'bg-white/60 dark:bg-slate-800/60 border border-white/50 dark:border-slate-700/50 text-slate-500 dark:text-slate-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/20 hover:text-indigo-600 dark:hover:text-indigo-300 active:scale-95'} ${className}`}
      title={isListening ? "Stop Listening" : "Start Voice Input"}
    >
      {isListening ? <MicOff className="w-3 h-3" /> : <Mic className="w-3 h-3" />}
    </button>
  );
};

// --- ADVANCED IMAGE CROPPER HELPER ---
const cropImageToBoundingBox = (base64: string, corners: GeometricData | null): Promise<string> => {
  if (!corners) return Promise.resolve(base64);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const actualXs = [corners.topLeft[0], corners.topRight[0], corners.bottomRight[0], corners.bottomLeft[0]].map(x => (x / 1000) * img.width);
        const actualYs = [corners.topLeft[1], corners.topRight[1], corners.bottomRight[1], corners.bottomLeft[1]].map(y => (y / 1000) * img.height);

        const cx = actualXs.reduce((a, b) => a + b, 0) / 4;
        const cy = actualYs.reduce((a, b) => a + b, 0) / 4;

        const scale = 0.96;
        const insetXs = actualXs.map(x => cx + (x - cx) * scale);
        const insetYs = actualYs.map(y => cy + (y - cy) * scale);

        const minX = Math.max(0, Math.min(...insetXs));
        const maxX = Math.min(img.width, Math.max(...insetXs));
        const minY = Math.max(0, Math.min(...insetYs));
        const maxY = Math.min(img.height, Math.max(...insetYs));

        const cropW = maxX - minX;
        const cropH = maxY - minY;

        if (cropW <= 0 || cropH <= 0) return resolve(base64);

        const canvas = document.createElement('canvas');
        canvas.width = cropW;
        canvas.height = cropH;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(base64);

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, cropW, cropH);

        ctx.beginPath();
        ctx.moveTo(insetXs[0] - minX, insetYs[0] - minY);
        ctx.lineTo(insetXs[1] - minX, insetYs[1] - minY);
        ctx.lineTo(insetXs[2] - minX, insetYs[2] - minY);
        ctx.lineTo(insetXs[3] - minX, insetYs[3] - minY);
        ctx.closePath();
        ctx.clip();

        ctx.drawImage(img, minX, minY, cropW, cropH, 0, 0, cropW, cropH);
        resolve(canvas.toDataURL('image/jpeg', 0.9).split(',')[1]);
      } catch (e) {
        resolve(base64);
      }
    };
    img.onerror = () => resolve(base64);
    img.src = `data:image/jpeg;base64,${base64}`;
  });
};

/** Escape single quotes for Drive API query string (double the quote). */
const escapeDriveQueryValue = (s: string) => (s || '').replace(/'/g, "''");

const getOrCreateDriveFolder = async (token: string, folderName: string, parentId?: string) => {
  const safeName = escapeDriveQueryValue(folderName);
  const safeParent = parentId ? escapeDriveQueryValue(parentId) : '';
  let query = `mimeType='application/vnd.google-apps.folder' and name='${safeName}' and trashed=false`;
  if (safeParent) query += ` and '${safeParent}' in parents`;

  const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&spaces=drive`, { headers: { 'Authorization': `Bearer ${token}` } });
  const searchData = await searchRes.json();
  
  if (searchData.files && searchData.files.length > 0) return searchData.files[0].id;
  
  const metadata = { name: folderName, mimeType: 'application/vnd.google-apps.folder', ...(parentId ? { parents: [parentId] } : {}) };
  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', { method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(metadata) });
  const createData = await createRes.json();
  return createData.id;
};

const uploadImageToDrive = async (token: string, base64Data: string, fileName: string, folderId: string) => {
  const boundary = '-------314159265358979323846';
  const delimiter = "\r\n--" + boundary + "\r\n";
  const close_delim = "\r\n--" + boundary + "--";
  const multipartRequestBody = delimiter + 'Content-Type: application/json\r\n\r\n' + JSON.stringify({ name: fileName, parents: [folderId] }) + delimiter + 'Content-Type: image/jpeg\r\n' + 'Content-Transfer-Encoding: base64\r\n\r\n' + base64Data + close_delim;

  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body: multipartRequestBody
  });
  
  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Drive Upload Error: ${err.error?.message}`);
  }
  return res.json();
};

// --- MAIN APP COMPONENT ---

const App: React.FC = () => {
  const [phase, setPhase] = useState<AppPhase | 'COURSE_CREATION'>(AppPhase.AUTHENTICATION);
  const [showOnboarding, setShowOnboarding] = useState(() => !hasCompletedOnboarding());
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [classroom, setClassroom] = useState<ClassroomService | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isOfflineBannerDismissed, setIsOfflineBannerDismissed] = useState(false);
  const [showOnlineRestore, setShowOnlineRestore] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'ok' | 'error'>('idle');
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const dark = safeParseJson<boolean | null>(localStorage.getItem('dg_dark_mode'), null);
    return dark ?? window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [globalSearchQuery, _setGlobalSearchQuery] = useState('');
  const [assignmentSearchQuery, setAssignmentSearchQuery] = useState('');
  
  const [educatorName, setEducatorName] = useState<string>(() => localStorage.getItem('dg_educator_name') || "");

  // Subscription state (stubbed; wire to Firebase/Stripe later)
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus>('trialing');
  const isPaid = subscriptionStatus === 'trialing' || subscriptionStatus === 'active';
  const [showMoreAuthOptions, setShowMoreAuthOptions] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');

  const [dashboardSort, setDashboardSort] = useState<SortMode>(() => safeParseJson<SortMode>(localStorage.getItem('dg_dash_sort'), 'recent'));
  const [assignmentSort, setAssignmentSort] = useState<SortMode>(() => safeParseJson<SortMode>(localStorage.getItem('dg_asn_sort'), 'recent'));

  const todayLabel = useMemo(() => {
    try {
      return new Date().toLocaleDateString(undefined, {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: '2-digit',
      });
    } catch {
      return '';
    }
  }, []);

 
  // Google OAuth Client ID – production client for app.donegrading.com; fix bad/truncated env values
  const PRODUCTION_GOOGLE_CLIENT_ID =
    '705695813275-roaepb7an7bkq4gn9b7fr5c73vp26303.apps.googleusercontent.com';
  const raw =
    (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID) ||
    PRODUCTION_GOOGLE_CLIENT_ID;
  const isInvalid =
    raw !== PRODUCTION_GOOGLE_CLIENT_ID &&
    (raw === '137273476022-4il1dq3mj28v0g1c2t59mt3l341evlbl.apps.googleusercontent.com' ||
     !/^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/i.test(String(raw).trim()));
  const effectiveGoogleClientId = isInvalid ? PRODUCTION_GOOGLE_CLIENT_ID : String(raw).trim();
  
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccessMessage, setAuthSuccessMessage] = useState<string | null>(null);
  const [creationError, setCreationError] = useState<string | null>(null);

  const [courses, setCourses] = useState<Course[]>(() => safeParseJson<Course[]>(localStorage.getItem('dg_cache_courses'), []));
  const [assignments, setAssignments] = useState<Assignment[]>(() => safeParseJson<Assignment[]>(localStorage.getItem('dg_cache_assignments'), []));
  const [students, setStudents] = useState<Student[]>(() => safeParseJson<Student[]>(localStorage.getItem('dg_cache_students'), []));

  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
  const [gradingMode, setGradingMode] = useState<GradingMode | null>(null);

  const [firebaseUser, setFirebaseUser] = useState<import('firebase/auth').User | null>(null);

  const isSignedIn = useMemo(() => !!accessToken || !!firebaseUser, [accessToken, firebaseUser]);
  
  const [gradedWorks, setGradedWorks] = useState<GradedWork[]>(() => safeParseJson<GradedWork[]>(localStorage.getItem('dg_pending_sync'), []));
  const [history, setHistory] = useState<GradedWork[]>(() => safeParseJson<GradedWork[]>(localStorage.getItem('dg_history'), []));

  const SCHEDULE_KEY = 'dg_schedule_items_v1';
  const [scheduleItems, setScheduleItems] = useState<ScheduleItem[]>(() =>
    safeParseJson<ScheduleItem[]>(localStorage.getItem(SCHEDULE_KEY), [])
  );
  const [scheduleView, setScheduleView] = useState<ScheduleViewMode>('daily');
  const [scheduleTitle, setScheduleTitle] = useState('');
  const [scheduleKind, setScheduleKind] = useState<'event' | 'reminder' | 'teacherBlock' | 'appointment' | 'meeting'>('reminder');
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleNotes, setScheduleNotes] = useState('');
  const [scheduleCourseId, setScheduleCourseId] = useState('');
  const [scheduleAssignmentId, setScheduleAssignmentId] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [scheduleRecurrence, setScheduleRecurrence] = useState<'once' | 'daily' | 'weekly' | 'monthly'>('once');
  const [scheduleFormOpen, setScheduleFormOpen] = useState(false);
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const [activeScheduleHour, setActiveScheduleHour] = useState<number | null>(null);

  const [isProcessing, setIsProcessing] = useState(false);
  const [isGeneratingRubric, setIsGeneratingRubric] = useState(false);
  const [_isSyncingClassroom, setIsSyncingClassroom] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{
    current: number;
    total: number;
    message: string;
    successes: number;
    failures: number;
    emailSuccesses: number;
    emailFailures: number;
  }>({
    current: 0,
    total: 0,
    message: '',
    successes: 0,
    failures: 0,
    emailSuccesses: 0,
    emailFailures: 0,
  });

  const [creationCourse, setCreationCourse] = useState<Course | null>(null);
  const [newCourseName, setNewCourseName] = useState('');
  const [isCreatingCourse, setIsCreatingCourse] = useState(false);

  const [newAsnTitle, setNewAsnTitle] = useState('');
  const [newAsnDesc, setNewAsnDesc] = useState('');
  const [newAsnMaxScore, setNewAsnMaxScore] = useState<number>(100);
  const [isCreatingAssignment, setIsCreatingAssignment] = useState(false);
  
  const [_isAutoMode, _setIsAutoMode] = useState(true);
  const [isFlashOn, setIsFlashOn] = useState(false);
  const [showQuickPick, setShowQuickPick] = useState(false);
  const [pendingWork, setPendingWork] = useState<Partial<GradingResponse> & { imageUrls: string[] } | null>(null);
  const [activeGeometry, setActiveGeometry] = useState<GeometricData | null>(null);
  const [scanHealth, setScanHealth] = useState<number>(0);
  const [_oneWordCommand, setOneWordCommand] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  
  // Student targeting mode for scan attribution.
  // - single: match each scan to one student (manual or OCR match)
  // - batch: teacher selects multiple students once; scans map sequentially
  const [scanStudentMode, setScanStudentMode] = useState<'single' | 'batch'>('single');
  const [batchSelectedStudentIds, setBatchSelectedStudentIds] = useState<Set<string>>(new Set());
  const batchStudentOrderRef = useRef<string[]>([]);
  const batchNextIndexRef = useRef<number>(0);

  // Audit selection (bulk edit/sync/delete)
  const [auditSelectedIndexes, setAuditSelectedIndexes] = useState<Set<number>>(new Set());
  const [auditEditSelectedOnly, setAuditEditSelectedOnly] = useState(false);

  const [scanQueueCount, setScanQueueCount] = useState(0);
  const [scanReviewQueueCount, setScanReviewQueueCount] = useState(0);
  const [scanQueueHint, setScanQueueHint] = useState<string | null>(null);
  const scanQueueRef = useRef<{
    id: string;
    base64: string;
    dataUrl: string;
    createdAt: number;
    scanHealth?: number;
    corners?: GeometricData | null;
    transcription?: string;
  }[]>([]);
  const scanReviewRef = useRef<{ id: string; result: GradingResponse; dataUrl: string }[]>([]);
  const frameAssessInFlightRef = useRef<boolean>(false);
  
  const [manualScore, setManualScore] = useState<string>('');
  const [manualFeedback, setManualFeedback] = useState<string>('');
  
  const cooldownRef = useRef<boolean>(false);
  const multiPageCaptureInFlightRef = useRef<boolean>(false);
  const multiPageLastHashRef = useRef<string | null>(null);

  const [multiPageCapture, setMultiPageCapture] = useState<{
    croppedDataUrls: string[];
    apiBase64s: string[];
    detectedStudentName?: string;
  }>({ croppedDataUrls: [], apiBase64s: [], detectedStudentName: undefined });
  const [multiPageHint, setMultiPageHint] = useState<string | null>(null);

  const [selectedQuickPickIds, setSelectedQuickPickIds] = useState<Set<string>>(new Set());
  const [customRubric, setCustomRubric] = useState('');
  const [isScanningRubric, setIsScanningRubric] = useState(false);
  const [rubricSuccess, setRubricSuccess] = useState(false);
  const [rubricScanProgress, setRubricScanProgress] = useState<number>(0);
  const [rubricScanError, setRubricScanError] = useState<string | null>(null);
  const [rubricAutoAttempts, setRubricAutoAttempts] = useState<number>(0);

  // If the teacher switches assignments, reset rubric UI so scanning starts clean.
  useEffect(() => {
    setCustomRubric('');
    setRubricSuccess(false);
    setIsScanningRubric(false);
    setRubricScanProgress(0);
    setRubricScanError(null);
    setRubricAutoAttempts(0);
  }, [selectedAssignment?.id]);

  // Phase 2: Voice-to-task (local)
  const GRADE_FOLLOWUPS_KEY = 'dg_grade_followups_v1';
  const QUICK_TODOS_KEY = 'dg_quick_todos_v1';
  const [gradeFollowUps, setGradeFollowUps] = useState<{ id: string; text: string; createdAt: number; done?: boolean }[]>(() =>
    safeParseJson(localStorage.getItem(GRADE_FOLLOWUPS_KEY), [] as { id: string; text: string; createdAt: number; done?: boolean }[])
  );
  const [quickTodos, setQuickTodos] = useState<{ id: string; text: string; createdAt: number; done?: boolean }[]>(() =>
    safeParseJson(localStorage.getItem(QUICK_TODOS_KEY), [] as { id: string; text: string; createdAt: number; done?: boolean }[])
  );
  // Voice capture: bottom mic inserts into currently focused field (no modal UI).
  const lastFocusedFieldRef = useRef<HTMLElement | null>(null);
  const voiceTargetRef = useRef<HTMLElement | null>(null);
  const insertTextIntoFocusedField = useCallback((raw: string) => {
    const text = (raw || '').trim();
    if (!text) return;

    const isEditable = (el: HTMLElement | null) =>
      !!el &&
      (el instanceof HTMLTextAreaElement ||
        el instanceof HTMLInputElement ||
        (el as any).isContentEditable);

    const activeEl = document.activeElement as HTMLElement | null;
    const el = isEditable(activeEl)
      ? activeEl
      : isEditable(lastFocusedFieldRef.current)
        ? (lastFocusedFieldRef.current as HTMLElement)
        : null;

    if (!el) return;

    // Inputs: use setRangeText for reliable cursor insert + fire input event for React.
    if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
      if (el.disabled || (el as any).readOnly) return;
      const value = el.value ?? '';
      const start = typeof el.selectionStart === 'number' ? el.selectionStart : value.length;
      const end = typeof el.selectionEnd === 'number' ? el.selectionEnd : value.length;
      const needsSpace = start > 0 && !/\s/.test(value[start - 1]);
      const insert = `${needsSpace ? ' ' : ''}${text}`;
      try {
        el.setRangeText(insert, start, end, 'end');
      } catch {
        // Fallback: append
        (el as any).value = value + (value && !value.endsWith(' ') ? ' ' : '') + text;
      }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.focus();
      return;
    }

    // ContentEditable fallback
    try {
      document.execCommand('insertText', false, text);
    } catch {
      // no-op
    }
  }, []);

  useEffect(() => {
    const onFocusIn = (event: FocusEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const isField =
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLInputElement ||
        (target as any).isContentEditable;
      if (!isField) return;
      lastFocusedFieldRef.current = target;
    };
    const onPointerDown = (event: PointerEvent) => {
      const t = event.target as HTMLElement | null;
      if (!t) return;
      const closest = (t.closest('textarea,input,[contenteditable="true"]') as HTMLElement | null) ?? null;
      if (closest) lastFocusedFieldRef.current = closest;
    };
    window.addEventListener('focusin', onFocusIn);
    window.addEventListener('pointerdown', onPointerDown, { capture: true });
    return () => window.removeEventListener('focusin', onFocusIn);
  }, []);

  const {
    isListening: isNavListening,
    toggleListening: toggleNavListening,
    hasSupport: navHasSupport,
  } = useSpeechToText(insertTextIntoFocusedField, { continuous: true, interimResults: false, autoRestart: true, lang: 'en-US' });
  useEffect(() => {
    if (!isNavListening) {
      if (voiceTargetRef.current) {
        voiceTargetRef.current.classList.remove('dg-voice-target');
        voiceTargetRef.current = null;
      }
    }
  }, [isNavListening]);
  const NAV_USAGE_KEY = 'dg_nav_usage_v1';
  const [navUsage, setNavUsage] = useState<Record<string, number>>(() => safeParseJson(localStorage.getItem(NAV_USAGE_KEY), {} as Record<string, number>));
  const [dragCourseId, setDragCourseId] = useState<string | null>(null);
  const [dragAssignmentId, setDragAssignmentId] = useState<string | null>(null);

  useEffect(() => {
    try { localStorage.setItem(GRADE_FOLLOWUPS_KEY, JSON.stringify(gradeFollowUps)); } catch { /* ignore */ }
  }, [gradeFollowUps]);
  useEffect(() => {
    try { localStorage.setItem(QUICK_TODOS_KEY, JSON.stringify(quickTodos)); } catch { /* ignore */ }
  }, [quickTodos]);
  useEffect(() => {
    try { localStorage.setItem(NAV_USAGE_KEY, JSON.stringify(navUsage)); } catch { /* ignore */ }
  }, [navUsage]);

  // Plan tab (The Architect)
  const PLAN_STATE_KEY = 'dg_plan_state_v1';
  const PLAN_US_STATE_KEY = 'dg_plan_us_state';
  const FILE_VAULT_KEY = 'dg_file_vault_links';

  const [lessonTopic, _setLessonTopic] = useState('');
  const [lessonResult, setLessonResult] = useState<LessonScriptResult | null>(null);
  const [lessonLoading, setLessonLoading] = useState(false);
  const [planAiError, setPlanAiError] = useState<string | null>(null);
  const [planActionLoading, setPlanActionLoading] = useState<null | 'share'>(null);
  const [planActionMessage, setPlanActionMessage] = useState<string | null>(null);
  const [_diffLevel, setDiffLevel] = useState<'simplified' | 'advanced' | null>(null);
  const [differentiationText, setDifferentiationText] = useState('');
  const [diffLoading, setDiffLoading] = useState(false);
  const [fileVaultLinks, setFileVaultLinks] = useState<{ label: string; url: string }[]>(() => safeParseJson(localStorage.getItem(FILE_VAULT_KEY), [] as { label: string; url: string }[]));

  const [planLessonTitle, _setPlanLessonTitle] = useState('');
  const [planUnit, _setPlanUnit] = useState('Unit 4: Ecosystems');
  const [planVersion, _setPlanVersion] = useState<PlanVersion>('Standard');
  const [planTab, setPlanTab] = useState<'context' | 'blocks' | 'resources' | 'assessment'>('context');
  const [planBlockTab, setPlanBlockTab] = useState<'A' | 'B' | 'C' | 'D'>('A');
  const [planLastSaved, setPlanLastSaved] = useState<Date | null>(null);
  const [_isPlanSaving, _setIsPlanSaving] = useState(false);

  const [planStateRegion, setPlanStateRegion] = useState<string>(() => {
    try {
      return localStorage.getItem(PLAN_US_STATE_KEY) || 'National';
    } catch {
      return 'National';
    }
  });
  const [planGrade, setPlanGrade] = useState('6');
  const [planSubject, setPlanSubject] = useState('Science');
  const [planDuration, setPlanDuration] = useState(55);
  const [standardsQuery, setStandardsQuery] = useState('');
  const [standardsSuggestions, setStandardsSuggestions] = useState<StandardItem[]>([]);
  const [pinnedStandards, setPinnedStandards] = useState<StandardItem[]>([]);
  const [classProfile, setClassProfile] = useState('');
  const [safetyStatus, setSafetyStatus] = useState<'idle' | 'scanning' | 'done' | 'error'>('idle');
  const [safetyFindings, setSafetyFindings] = useState<string | null>(null);

  const [hookType, setHookType] = useState<'video' | 'question' | 'mystery'>('question');
  const [hookContent, setHookContent] = useState('');
  const [directPoints, setDirectPoints] = useState('');
  const [cfuIdeas, setCfuIdeas] = useState('');
  const [guidedTemplate, setGuidedTemplate] = useState<'Socratic Seminar' | 'Jigsaw' | 'Lab' | 'Think-Pair-Share'>('Think-Pair-Share');
  const [guidedNotes, setGuidedNotes] = useState('');
  const [independentNotes, setIndependentNotes] = useState('');
  const [attachmentName, setAttachmentName] = useState<string | null>(null);

  const [resourceQuery, setResourceQuery] = useState('');
  const [resourceCards, setResourceCards] = useState<ResourceCard[]>([]);
  const [levelerValue, setLevelerValue] = useState(8);

  const [exitTicketPrompt, setExitTicketPrompt] = useState('');
  const [exitTicketQuestions, setExitTicketQuestions] = useState<string[]>([]);
  const [successCriteria, setSuccessCriteria] = useState<string[]>([]);
  const [reflectionNote, setReflectionNote] = useState('');

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const sortItems = <T extends { name?: string, title?: string, lastUsed?: number }>(items: T[], mode: SortMode): T[] => {
    const result = [...items];
    if (mode === 'recent') return result.sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0));
    if (mode === 'alphabetical') return result.sort((a, b) => (a.name || a.title || '').localeCompare(b.name || b.title || ''));
    return result; 
  };

  const [showCourses, setShowCourses] = useState(true);
  const [rosterCourseOpenId, setRosterCourseOpenId] = useState<string | null>(null);
  const [rosterCourseStudents, setRosterCourseStudents] = useState<Record<string, Student[]>>({});
  const [rosterCourseAssignments, setRosterCourseAssignments] = useState<Record<string, Assignment[]>>({});
  const [rosterSelectedStudentIds, setRosterSelectedStudentIds] = useState<Set<string>>(new Set());
  const [rosterSelectedAssignmentId, setRosterSelectedAssignmentId] = useState<string>('');
  const [rosterLoadingCourseId, setRosterLoadingCourseId] = useState<string | null>(null);
  const [rosterError, setRosterError] = useState<string | null>(null);

  const [attentionExpanded, setAttentionExpanded] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem('dg_attention_expanded_v1');
      return raw === null ? true : raw === 'true';
    } catch {
      // Some browsers/settings block storage; default to expanded so the UI still works.
      return true;
    }
  });
  const [courseSearch, setCourseSearch] = useState('');
  const [showLast7Details, setShowLast7Details] = useState(false);

  const [voiceInboxExpanded, setVoiceInboxExpanded] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem('dg_voice_inbox_expanded_v1');
      return raw === null ? false : raw === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('dg_voice_inbox_expanded_v1', voiceInboxExpanded ? 'true' : 'false');
    } catch {
      // Ignore storage errors; UI should continue to work.
    }
  }, [voiceInboxExpanded]);

  useEffect(() => {
    try {
      localStorage.setItem('dg_attention_expanded_v1', attentionExpanded ? 'true' : 'false');
    } catch {
      // Ignore storage errors; UI should continue to work.
    }
  }, [attentionExpanded]);

  const dashboardResults = useMemo(() => {
    const query = globalSearchQuery.toLowerCase().trim();
    let filteredCourses = sortItems([...courses], dashboardSort);
    let filteredAssignments = sortItems([...assignments], assignmentSort);
    
    if (query) {
      filteredCourses = filteredCourses.filter(c => c.name.toLowerCase().includes(query) || c.period.toLowerCase().includes(query));
      filteredAssignments = filteredAssignments.filter(a => a.title.toLowerCase().includes(query));
    }
    
    return { courses: filteredCourses, assignments: filteredAssignments };
  }, [courses, assignments, globalSearchQuery, dashboardSort, assignmentSort]);

  const filteredAssignmentsList = useMemo(() => {
    let result = sortItems([...assignments], assignmentSort);
    if (assignmentSearchQuery.trim()) {
      const query = assignmentSearchQuery.toLowerCase();
      result = result.filter(assignment => assignment.title.toLowerCase().includes(query));
    }
    return result;
  }, [assignments, assignmentSearchQuery, assignmentSort]);

  // Viewport setup to absolutely prevent zooming when typing on mobile
  useEffect(() => {
    let metaViewport = document.querySelector('meta[name="viewport"]');
    if (!metaViewport) {
      metaViewport = document.createElement('meta');
      metaViewport.setAttribute('name', 'viewport');
      document.head.appendChild(metaViewport);
    }
    metaViewport.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=0');
  }, []);

  useEffect(() => {
    const handleOnline = () => { setIsOnline(true); setShowOnlineRestore(true); setTimeout(() => setShowOnlineRestore(false), 4000); };
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => { window.removeEventListener('online', handleOnline); window.removeEventListener('offline', handleOffline); };
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
    localStorage.setItem('dg_dark_mode', JSON.stringify(isDarkMode));
  }, [isDarkMode]);

  useEffect(() => localStorage.setItem('dg_pending_sync', JSON.stringify(gradedWorks)), [gradedWorks]);
  useEffect(() => {
    try {
      localStorage.setItem(SCHEDULE_KEY, JSON.stringify(scheduleItems));
    } catch {
      // ignore
    }
  }, [scheduleItems]);
  useEffect(() => { try { localStorage.setItem(FILE_VAULT_KEY, JSON.stringify(fileVaultLinks)); } catch (_) { /* ignore */ } }, [fileVaultLinks, FILE_VAULT_KEY]);
  useEffect(() => {
    // Lightweight autosave for the Plan tab so educators don't lose work.
    try {
      const payload = {
        lessonTopic,
        lessonTitle: planLessonTitle,
        unit: planUnit,
        version: planVersion,
        state: planStateRegion,
        grade: planGrade,
        subject: planSubject,
        duration: planDuration,
        standardsQuery,
        pinnedStandards,
        classProfile,
        hookType,
        hookContent,
        directPoints,
        cfuIdeas,
        guidedTemplate,
        guidedNotes,
        independentNotes,
        resourceQuery,
        exitTicketPrompt,
        exitTicketQuestions,
        successCriteria,
        reflectionNote,
      };
      localStorage.setItem(PLAN_STATE_KEY, JSON.stringify(payload));
      localStorage.setItem(PLAN_US_STATE_KEY, planStateRegion);
      setPlanLastSaved(new Date());
    } catch {
      // ignore
    }
  }, [
    PLAN_STATE_KEY,
    PLAN_US_STATE_KEY,
    lessonTopic,
    planLessonTitle,
    planUnit,
    planVersion,
    planStateRegion,
    planGrade,
    planSubject,
    planDuration,
    standardsQuery,
    pinnedStandards,
    classProfile,
    hookType,
    hookContent,
    directPoints,
    cfuIdeas,
    guidedTemplate,
    guidedNotes,
    independentNotes,
    resourceQuery,
    exitTicketPrompt,
    exitTicketQuestions,
    successCriteria,
    reflectionNote,
  ]);
  useEffect(() => localStorage.setItem('dg_history', JSON.stringify(history)), [history]);
  useEffect(() => localStorage.setItem('dg_cache_courses', JSON.stringify(courses)), [courses]);
  useEffect(() => localStorage.setItem('dg_cache_assignments', JSON.stringify(assignments)), [assignments]);
  useEffect(() => localStorage.setItem('dg_cache_students', JSON.stringify(students)), [students]);

  useEffect(() => {
    if (phase === AppPhase.GRADING_LOOP) {
      setIsProcessing(false);
      cooldownRef.current = false;
      setScanHealth(0);
      setActiveGeometry(null);
      setIsFlashOn(false);
      setCameraError(null);
      setMultiPageCapture({ croppedDataUrls: [], apiBase64s: [], detectedStudentName: undefined });
      setMultiPageHint(null);
      multiPageCaptureInFlightRef.current = false;
      multiPageLastHashRef.current = null;
    }
  }, [phase]);

  const loadCourses = async () => {
    if (!classroom || !isOnline) return;
    setIsSyncingClassroom(true);
    try {
      const courseData = await classroom.getCourses();
      setCourses(courseData);
      setSyncStatus('ok');
    } catch (err) {
      console.error("Failed to load courses:", err);
      setAuthError("Could not sync courses from Classroom. Please check your connection.");
      setSyncStatus('error');
    } finally {
      setIsSyncingClassroom(false);
    }
  };

  // Periodic background sync for courses so changes made directly in Google Classroom stay mirrored
  useEffect(() => {
    if (!classroom || !isOnline || phase !== AppPhase.DASHBOARD) return;
    const id = window.setInterval(() => {
      void loadCourses();
    }, 20000);
    return () => window.clearInterval(id);
  }, [classroom, isOnline, phase]);

  // Attention items for dashboard (used for notification and UI)
  const dashboardAttention = useMemo(() => {
    const studentStats: Record<string, { name: string; totalScore: number; totalMax: number }> = {};
    history.forEach(w => {
      if (!w.studentId) return;
      if (!studentStats[w.studentId]) {
        studentStats[w.studentId] = { name: w.studentName || 'Student', totalScore: 0, totalMax: 0 };
      }
      studentStats[w.studentId].totalScore += w.score;
      studentStats[w.studentId].totalMax += w.maxScore || 100;
    });
    const atRisk = Object.values(studentStats)
      .map(s => ({ ...s, pct: s.totalMax > 0 ? (s.totalScore / s.totalMax) * 100 : 0 }))
      .filter(s => s.pct < 70)
      .sort((a, b) => a.pct - b.pct)
      .slice(0, 3);
    return { pendingGrades: gradedWorks.length, atRiskStudents: atRisk };
  }, [history, gradedWorks.length]);

  // Summary for the signed-in home screen (AuthView when isSignedIn)
  const homeSummary = useMemo(() => {
    const now = new Date();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const sameDay = (isoDate: string) => {
      const d = new Date(isoDate);
      if (Number.isNaN(d.getTime())) return false;
      d.setHours(0, 0, 0, 0);
      return d.getTime() === today.getTime();
    };

    // Lesson today: first teacher block on today's schedule
    const teacherBlocksToday = scheduleItems
      .filter((item) => (item.kind ?? 'reminder') === 'teacherBlock' && sameDay(item.date))
      .sort((a, b) => (a.time || '').localeCompare(b.time || ''));

    let lesson: { title: string; course?: string; timeLabel?: string } | undefined;
    if (teacherBlocksToday.length > 0) {
      const item = teacherBlocksToday[0];
      const courseName = item.courseId ? courses.find((c) => c.id === item.courseId)?.name : undefined;
      let timeLabel: string | undefined;
      if (item.time) {
        const [hRaw, mRaw] = item.time.split(':');
        const h = Number(hRaw);
        const m = Number(mRaw ?? '0');
        if (!Number.isNaN(h) && !Number.isNaN(m)) {
          const start = new Date();
          start.setHours(h, m, 0, 0);
          const diffMs = start.getTime() - now.getTime();
          if (diffMs > 0) {
            const diffMins = Math.round(diffMs / 60000);
            if (diffMins < 60) {
              timeLabel = `Starts in ${diffMins} minute${diffMins === 1 ? '' : 's'}`;
            } else {
              const diffHours = Math.round(diffMins / 60);
              timeLabel = `Starts in ${diffHours} hour${diffHours === 1 ? '' : 's'}`;
            }
          } else {
            timeLabel = 'Happening now or earlier today';
          }
        }
      }
      if (!timeLabel) {
        timeLabel = 'Any time today';
      }
      lesson = {
        title: item.title,
        course: courseName,
        timeLabel,
      };
    }

    const assignmentsToGrade = dashboardAttention.pendingGrades;

    const parentsToContact = gradeFollowUps.filter((f) => !f.done).length;

    // Upcoming: next scheduled item in the future (any kind)
    const upcomingCandidates = scheduleItems
      .map((item) => {
        const d = new Date(item.date);
        if (Number.isNaN(d.getTime())) return null;
        if (item.time) {
          const [hRaw, mRaw] = item.time.split(':');
          const h = Number(hRaw);
          const m = Number(mRaw ?? '0');
          if (!Number.isNaN(h) && !Number.isNaN(m)) {
            d.setHours(h, m, 0, 0);
          }
        }
        return { item, when: d };
      })
      .filter((x): x is { item: ScheduleItem; when: Date } => !!x && x.when.getTime() > now.getTime())
      .sort((a, b) => a.when.getTime() - b.when.getTime());

    let upcoming: { title: string; whenLabel: string } | undefined;
    if (upcomingCandidates.length > 0) {
      const { item, when } = upcomingCandidates[0];
      let whenLabel = '';
      const diffMs = when.getTime() - now.getTime();
      const oneDayMs = 24 * 60 * 60 * 1000;
      if (sameDay(when.toISOString().slice(0, 10))) {
        whenLabel = `Later today at ${when.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
      } else if (diffMs > 0 && diffMs < oneDayMs * 2) {
        whenLabel = `Tomorrow at ${when.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
      } else {
        try {
          whenLabel = when.toLocaleDateString(undefined, {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
          });
        } catch {
          whenLabel = 'Coming up';
        }
      }
      upcoming = {
        title: item.title,
        whenLabel,
      };
    }

    let todayShortLabel = '';
    try {
      todayShortLabel = new Date().toLocaleDateString(undefined, {
        weekday: 'long',
      });
    } catch {
      todayShortLabel = '';
    }

    return {
      todayShortLabel,
      lesson,
      assignmentsToGrade,
      parentsToContact,
      upcoming,
    };
  }, [scheduleItems, courses, dashboardAttention, gradeFollowUps]);

  const dashboardNotifiedRef = useRef<{ pending: number; atRisk: number } | null>(null);

  // Push notification when Grade screen has tasks needing attention
  useEffect(() => {
    if (phase !== AppPhase.DASHBOARD) return;
    const { pendingGrades, atRiskStudents } = dashboardAttention;
    const hasAttention = pendingGrades > 0 || atRiskStudents.length > 0;
    if (!hasAttention) return;
    if (dashboardNotifiedRef.current && dashboardNotifiedRef.current.pending === pendingGrades && dashboardNotifiedRef.current.atRisk === atRiskStudents.length) return;
    dashboardNotifiedRef.current = { pending: pendingGrades, atRisk: atRiskStudents.length };

    if (typeof window === 'undefined' || !('Notification' in window)) return;
    const requestAndNotify = () => {
      if (Notification.permission === 'granted') {
        const parts: string[] = [];
        if (pendingGrades > 0) parts.push(`${pendingGrades} grade${pendingGrades === 1 ? '' : 's'} ready to sync`);
        if (atRiskStudents.length > 0) parts.push(`${atRiskStudents.length} student${atRiskStudents.length === 1 ? '' : 's'} to check in on`);
        if (parts.length) {
          new Notification('DoneGrading – What needs your attention', { body: parts.join(' · '), icon: '/DoneGradingLogo.png' });
        }
      } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then(p => {
          if (p === 'granted') {
            const parts: string[] = [];
            if (pendingGrades > 0) parts.push(`${pendingGrades} grade${pendingGrades === 1 ? '' : 's'} ready to sync`);
            if (atRiskStudents.length > 0) parts.push(`${atRiskStudents.length} student${atRiskStudents.length === 1 ? '' : 's'} to check in on`);
            if (parts.length) {
              new Notification('DoneGrading – What needs your attention', { body: parts.join(' · '), icon: '/DoneGradingLogo.png' });
            }
          }
        });
      }
    };
    const t = window.setTimeout(requestAndNotify, 800);
    return () => window.clearTimeout(t);
  }, [phase, dashboardAttention]);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthSuccessMessage(null);
    if (authMode === 'signup' && !fullName.trim()) {
      setAuthError('Please enter your full name.');
      return;
    }
    if (!email.trim() || !password) {
      setAuthError('Please enter your email and password.');
      return;
    }
    if (!isOnline) {
      setAuthError('You are offline. Connect to the internet to sign in.');
      return;
    }
    setAuthError(null);
    try {
      if (authMode === 'signup') {
        const userCred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        const name = fullName.trim();
        if (name && userCred.user) {
          await updateProfile(userCred.user, { displayName: name });
          setEducatorName(name);
          localStorage.setItem('dg_educator_name', name);
        }
        setCourses([]);
        setAssignments([]);
        setStudents([]);
        setGradedWorks([]);
        setHistory([]);
        localStorage.removeItem('dg_cache_courses');
        localStorage.removeItem('dg_cache_assignments');
        localStorage.removeItem('dg_cache_students');
        localStorage.removeItem('dg_pending_sync');
        localStorage.removeItem('dg_history');
        logEvent('auth_email_sign_up');
        setPhase(AppPhase.AUTHENTICATION);
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
        setCourses([]);
        setAssignments([]);
        setStudents([]);
        setGradedWorks([]);
        setHistory([]);
        localStorage.removeItem('dg_cache_courses');
        localStorage.removeItem('dg_cache_assignments');
        localStorage.removeItem('dg_cache_students');
        localStorage.removeItem('dg_pending_sync');
        localStorage.removeItem('dg_history');
        logEvent('auth_email_sign_in');
        setPhase(AppPhase.AUTHENTICATION);
      }
    } catch (err: any) {
      const code = err?.code || '';
      if (authMode === 'signin' && code === 'auth/user-not-found') {
        setAuthError('No account found. Switch to "Sign up" to create one.');
      } else if (authMode === 'signup' && code === 'auth/email-already-in-use') {
        setAuthError('This email is already registered. Switch to "Sign in" to log in.');
      } else if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        setAuthError('Incorrect password. Please try again.');
      } else if (code === 'auth/invalid-email') {
        setAuthError('Please enter a valid email address.');
      } else if (code === 'auth/weak-password') {
        setAuthError('Password should be at least 6 characters.');
      } else {
        setAuthError(err?.message?.replace('Firebase: ', '') || 'Sign in failed. Please try again.');
      }
    }
  };

  const handlePasswordReset = async () => {
    setAuthSuccessMessage(null);
    if (!email.trim()) {
      setAuthError('Enter your email above to reset your password.');
      return;
    }
    if (!isOnline) {
      setAuthError('You are offline. Connect to the internet to reset your password.');
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setAuthError(null);
      setAuthSuccessMessage('Check your email/spam for a link to reset your password.');
    } catch (err: any) {
      setAuthSuccessMessage(null);
      const code = err?.code || '';
      if (code === 'auth/user-not-found') {
        setAuthError('No account found with that email.');
      } else if (code === 'auth/invalid-email') {
        setAuthError('Please enter a valid email address.');
      } else if (code === 'auth/too-many-requests') {
        setAuthError('Too many reset attempts. Try again later.');
      } else {
        setAuthError(err?.message?.replace('Firebase: ', '') || 'Could not send reset email. Please try again.');
      }
    }
  };

  // Shared logic: complete sign-in after we have an access token (used by both popup callback and redirect hash)
  const completeGoogleSignIn = useCallback((token: string) => {
    setAccessToken(token);
    const service = new ClassroomService(token);
    setClassroom(service);
    setAuthError(null);
    logEvent('auth_google_sign_in');
    setPhase(AppPhase.AUTHENTICATION);
    saveAuthSession(token, '');

    fetch('https://classroom.googleapis.com/v1/userProfiles/me', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(profileData => {
        if (profileData.name?.fullName) {
          const name = profileData.name.fullName;
          setEducatorName(name);
          localStorage.setItem('dg_educator_name', name);
          saveAuthSession(token, name);
        }
      })
      .catch(e => console.error("Could not fetch educator profile name", e));

    service.getCourses()
      .then(setCourses)
      .catch(e => {
        console.error("Could not load courses", e);
        setAuthError("Could not load courses. Check that Google Classroom API is enabled for your project.");
      });
  }, []);

  // Restore session on load if user signed in within the last week
  useEffect(() => {
    const session = loadAuthSession();
    if (session?.accessToken) {
      setAccessToken(session.accessToken);
      const service = new ClassroomService(session.accessToken);
      setClassroom(service);
      if (session.educatorName) {
        setEducatorName(session.educatorName);
      }
      service.getCourses().then(setCourses).catch(() => {});
    }
  }, []);

  // Sync Firebase Auth state (email sign-in)
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      if (user) {
        const name = user.displayName || user.email?.split('@')[0] || 'Teacher';
        setEducatorName(name);
        localStorage.setItem('dg_educator_name', name);
      }
    });
    return () => unsub();
  }, []);

  // Handle return from Google OAuth redirect (token in URL hash) so we never get stuck on "One moment please" in a popup
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash) return;
    const params = new URLSearchParams(hash.replace(/^#/, ''));
    const tokenFromUrl = params.get('access_token');
    if (tokenFromUrl) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
      completeGoogleSignIn(tokenFromUrl);
    }
  }, [completeGoogleSignIn]);

  // Extend session on activity (phase change, visibility) so 7‑day window resets with use
  useEffect(() => {
    if (!accessToken) return;
    touchAuthSession();
  }, [accessToken, phase]);
  useEffect(() => {
    if (!accessToken) return;
    const onVisibility = () => {
      if (document.visibilityState === 'visible') touchAuthSession();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [accessToken]);

  const handleGoogleLogin = () => {
    if (!isOnline) {
      setAuthError('You are offline. Connect to the internet to sign in with Google.');
      return;
    }
    try {
      const g = (window as any).google;
      if (!g?.accounts?.oauth2?.initTokenClient) {
        setAuthError('Google sign-in SDK is still loading. Please wait a moment and try again.');
        return;
      }

      const redirectUri = `${window.location.origin}${window.location.pathname || '/'}`;

      const client = g.accounts.oauth2.initTokenClient({
        client_id: effectiveGoogleClientId,
        scope: "https://www.googleapis.com/auth/classroom.courses https://www.googleapis.com/auth/classroom.courses.readonly https://www.googleapis.com/auth/classroom.coursework.me https://www.googleapis.com/auth/classroom.rosters.readonly https://www.googleapis.com/auth/classroom.coursework.students https://www.googleapis.com/auth/classroom.profile.emails https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/spreadsheets",
        prompt: 'consent',
        ux_mode: 'redirect',
        redirect_uri: redirectUri,
        error_callback: (err: any) => {
          const msg = err?.type ? `Google sign-in error: ${err.type}` : 'Google sign-in failed.';
          setAuthError(msg);
        },
        callback: (response: any) => {
          if (response?.access_token) completeGoogleSignIn(response.access_token);
        },
      });
      client.requestAccessToken();
    } catch (err: any) { 
      setAuthError(`OAuth Failure: ${err.message}`); 
    }
  };

  const handleAppleLogin = () => {
    if (!isOnline) {
      setAuthError('You are offline. Connect to the internet to sign in with Apple.');
      return;
    }
    const clientId = import.meta.env.VITE_APPLE_CLIENT_ID;
    const AppleIDAuth = (window as any).AppleID?.auth;
    if (!clientId || !AppleIDAuth?.init) {
      setAuthError('Apple Sign-In is not yet configured. Please use Sign in with Google for now.');
      return;
    }
    AppleIDAuth.init({
      clientId,
      scope: 'name email',
      redirectURI: `${window.location.origin}${window.location.pathname || '/'}`,
      usePopup: true,
    })
      .then(() =>
        AppleIDAuth.signIn().then(
          (res: any) => {
            if (res?.authorization?.code) {
              // TODO: exchange code for tokens and complete sign-in
              setAuthError('Apple Sign-In integration is in progress. Please use Sign in with Google.');
            }
          },
          () => setAuthError('Apple Sign-In was cancelled or failed.')
        )
      )
      .catch(() =>
        setAuthError('Apple Sign-In is not yet configured. Please use Sign in with Google for now.')
      );
  };

  const selectCourse = async (course: Course) => {
    setCourses(courses.map(c => c.id === course.id ? { ...c, lastUsed: Date.now() } : c));
    setSelectedCourse(course);
    logEvent('course_select', { courseId: course.id, source: course.source || 'local' });
    setAssignmentSearchQuery(''); 
    setPhase(AppPhase.ASSIGNMENT_SELECT);

    // If this is a real Google Classroom course, load its assignments and students.
    if (classroom && isOnline && course.source !== 'local') {
      try {
        const [assignmentData, studentData] = await Promise.all([
          classroom.getAssignments(course.id),
          classroom.getStudents(course.id)
        ]);
        setAssignments(assignmentData);
        setStudents(studentData);
        setSyncStatus('ok');
      } catch (err) {
        console.error("Failed to load assignments/students for course", course.id, err);
        // Make sure we don't accidentally show assignments from a different course
        setAssignments([]);
        setStudents([]);
        setSyncStatus('error');
      }
    } else {
      // Local-only courses: start with a clean slate
      setAssignments([]);
      setStudents([]);
    }
  };

  const handleStartGrading = () => {
    // Scan attribution requires an already selected course + assignment.
    // Route through the existing selection flow instead of jumping directly to the camera.
    if (!selectedCourse) {
      setShowCourses(true);
      setPhase(AppPhase.GRADE_COURSE_PICKER);
      return;
    }
    if (!selectedAssignment) {
      setPhase(AppPhase.ASSIGNMENT_SELECT);
      return;
    }
    setPhase(AppPhase.RUBRIC_SETUP);
  };

  const startGrading = (mode: GradingMode) => {
    setGradingMode(mode);
    // Prepare batch scan ordering (scan attribution).
    if (scanStudentMode === 'batch') {
      const ordered = students
        .filter(s => batchSelectedStudentIds.has(s.id))
        .map(s => s.id);
      batchStudentOrderRef.current = ordered;
      batchNextIndexRef.current = 0;
    } else {
      batchStudentOrderRef.current = [];
      batchNextIndexRef.current = 0;
    }
    setPhase(AppPhase.GRADING_LOOP);
  };

  // (Removed) old modal voice capture flow.
  
  const handleScanPaperRubric = () => { 
    setCameraError(null);
    setRubricAutoAttempts(0);
    setIsScanningRubric(true); 
  };

  // Periodic background sync for assignments/students for the currently selected Google Classroom course
  useEffect(() => {
    if (!classroom || !isOnline || !selectedCourse || selectedCourse.source === 'local' || phase !== AppPhase.ASSIGNMENT_SELECT) {
      return;
    }
    const courseId = selectedCourse.id;
    const id = window.setInterval(() => {
      Promise.all([
        classroom.getAssignments(courseId),
        classroom.getStudents(courseId),
      ])
        .then(([assignmentData, studentData]) => {
          setAssignments(assignmentData);
          setStudents(studentData);
        })
        .catch((err) => {
          console.error("Auto-sync assignments/students failed", err);
        });
    }, 20000);
    return () => window.clearInterval(id);
  }, [classroom, isOnline, selectedCourse, phase]);

  const handleGenerateRubric = async () => {
    if (!selectedAssignment) return;
    setIsGeneratingRubric(true);
    try {
      const text = await generateRubric(selectedAssignment.title, selectedAssignment.rubric, selectedAssignment.maxScore);
      if (text) { setCustomRubric(text); }
    } catch (err) { console.error(err); } finally { setIsGeneratingRubric(false); }
  };

  const handleOpenAsnCreation = (course: Course, e: React.MouseEvent) => {
    e.stopPropagation();
    setCreationCourse(course);
    setPhase(AppPhase.ASSIGNMENT_CREATION);
    setNewAsnTitle('');
    setNewAsnDesc('');
    setNewAsnMaxScore(100);
    setCreationError(null);
  };

  const handleShareApp = async () => {
    const shareUrl = window.location.origin;
    const shareText = 'Checkout DoneGrading! An app made for educators to plan lessons, teach with timers, grade with AI, schedule classes, and communicate with students—all in one place.';
    try {
      if ((navigator as any).share) {
        await (navigator as any).share({
          title: 'DoneGrading',
          text: shareText,
          url: shareUrl,
        });
      } else if (navigator.clipboard && (navigator.clipboard as any).writeText) {
        await navigator.clipboard.writeText(`${shareText}\n\n${shareUrl}`);
        alert('Message and link copied to clipboard!');
      }
    } catch (e) {
      console.error('Share failed', e);
    }
  };

  const handleSignOut = async () => {
    clearAuthSession();
    if (firebaseUser) {
      await firebaseSignOut(auth);
      setFirebaseUser(null);
    }
    setAccessToken(null);
    setClassroom(null);
    setSelectedCourse(null);
    setSelectedAssignment(null);
    setAuthError(null);
    setCourses([]);
    setAssignments([]);
    setStudents([]);
    setGradedWorks([]);
    setHistory([]);
    localStorage.removeItem('dg_cache_courses');
    localStorage.removeItem('dg_cache_assignments');
    localStorage.removeItem('dg_cache_students');
    localStorage.removeItem('dg_pending_sync');
    localStorage.removeItem('dg_history');
    setPhase(AppPhase.AUTHENTICATION);
  };

  const handleCreateCourseLocal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCourseName.trim()) return;
    setIsCreatingCourse(true);
    setCreationError(null);
    try {
      let newCourse: Course;
      if (classroom && isOnline) {
        // Create in Google Classroom so the course exists everywhere
        newCourse = await classroom.createCourse(newCourseName, 'New Course');
        setSyncStatus('ok');
      } else {
        // Fallback: local-only course inside the app
        newCourse = {
          id: Date.now().toString(),
          name: newCourseName,
          period: 'New Course',
          source: 'local',
          lastUsed: Date.now()
        };
      }
      setCourses([newCourse, ...courses]);
      setPhase(AppPhase.DASHBOARD);
    } catch (err: any) {
      console.error("Failed to create course", err);
      setCreationError(err.message || "Failed to create course.");
      setSyncStatus('error');
    } finally {
      setIsCreatingCourse(false);
    }
  };

  const handleCreateAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!classroom || !creationCourse || !newAsnTitle.trim()) return;
    setIsCreatingAssignment(true);
    setCreationError(null);
    try {
      await classroom.createAssignment(creationCourse.id, newAsnTitle, newAsnDesc, newAsnMaxScore);
      setPhase(AppPhase.DASHBOARD);
      await loadCourses();
      setSyncStatus('ok');
    } catch (err: any) {
      console.error(err);
      setCreationError(err.message || "Failed to create assignment.");
      setSyncStatus('error');
    } finally {
      setIsCreatingAssignment(false);
    }
  };

  const handleDeleteScan = (index: number) => {
    setGradedWorks(prev => prev.filter((_, i) => i !== index));
    setAuditSelectedIndexes(new Set());
    setAuditEditSelectedOnly(false);
  };

  const handleRescan = (index: number) => {
    // If we are in batch mode, re-align the next scan to the same student.
    if (scanStudentMode === 'batch') {
      const targetStudentId = gradedWorks[index]?.studentId;
      const order = batchStudentOrderRef.current;
      if (targetStudentId) {
        const idxInOrder = order.indexOf(targetStudentId);
        if (idxInOrder >= 0) batchNextIndexRef.current = idxInOrder;
      }
    }
    handleDeleteScan(index);
    setAuditSelectedIndexes(new Set());
    setAuditEditSelectedOnly(false);
    setPhase(AppPhase.GRADING_LOOP);
  };

  useEffect(() => {
    let currentStream: MediaStream | null = null;
    const setupCamera = async () => {
      if (phase !== AppPhase.GRADING_LOOP && !isScanningRubric) return;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } } });
        currentStream = stream; 
        streamRef.current = stream;
        if (videoRef.current) { 
          videoRef.current.srcObject = stream; 
          videoRef.current.onloadedmetadata = () => videoRef.current?.play().catch(e => console.error(e)); 
        }
      } catch (err: any) { 
        console.error("Camera access denied:", err);
        setCameraError("Camera access denied or unavailable. Please check device settings.");
      }
    };
    setupCamera();
    return () => { if (currentStream) currentStream.getTracks().forEach(track => track.stop()); streamRef.current = null; };
  }, [phase, isScanningRubric]); 

  const toggleFlash = async () => {
    if (streamRef.current) {
      const track = streamRef.current.getVideoTracks()[0];
      if (track && typeof track.getCapabilities === 'function') {
        const capabilities = track.getCapabilities();
        if (capabilities && (capabilities as any).torch) {
          try {
            await track.applyConstraints({ advanced: [{ torch: !isFlashOn } as any] });
            setIsFlashOn(!isFlashOn);
            return;
          } catch (e) {
            console.warn("Torch apply failed", e);
          }
        }
      }
      alert("Camera flash is not supported on this device/browser.");
    }
  };

  const captureFrame = useCallback((quality: number = 0.8): string | null => {
    if (!videoRef.current || !canvasRef.current) return null;
    const video = videoRef.current; if (video.readyState < 2) return null;
    const canvas = canvasRef.current; canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true }); if (!ctx) return null;
    ctx.drawImage(video, 0, 0); return canvas.toDataURL('image/jpeg', quality).split(',')[1];
  }, []);

  const handleRubricSnap = useCallback(async () => {
    if (isProcessing || !isScanningRubric || cameraError) return;
    
    setRubricScanError(null);
    
    const base64 = captureFrame(0.5); 
    if (!base64) return;

    setIsProcessing(true);
    setRubricScanProgress(0);
    
    const progressInterval = setInterval(() => {
      setRubricScanProgress((prev) => {
        if (prev >= 98) {
          clearInterval(progressInterval);
          return 98; 
        }
        return prev + 2; 
      });
    }, 40);

    try {
      const text = await extractRubricFromImage(base64);
      const trimmed = (text || '').trim();
      const upper = trimmed.toUpperCase();
      // Consider it a failure only if the model explicitly says NO RUBRIC or returns almost nothing
      const isFailure = !trimmed || trimmed.length < 5 || upper === 'NO RUBRIC';
      
      if (!isFailure) {
        clearInterval(progressInterval);
        setRubricScanProgress(100);
        
        setTimeout(() => {
            setCustomRubric(trimmed);
            setIsScanningRubric(false);
            setIsProcessing(false);
            setRubricSuccess(true);
            setTimeout(() => setRubricSuccess(false), 5000);
        }, 600); 
      } else {
         clearInterval(progressInterval);
         setRubricScanProgress(0);
         setIsProcessing(false);
         setRubricScanError("Could not clearly read the document. Please ensure it is well-lit and try again.");
         setTimeout(() => setRubricScanError(null), 4000);
      }
    } catch (err) {
      console.error("Rubric scan error", err);
      clearInterval(progressInterval);
      setRubricScanProgress(0);
      setIsProcessing(false);
      setRubricScanError("Network error occurred. Please try again.");
      setTimeout(() => setRubricScanError(null), 4000);
    }
  }, [isProcessing, isScanningRubric, cameraError, captureFrame]);

  const computeAHash = useCallback((base64: string, size: number = 8): Promise<string | null> => {
    return new Promise((resolve) => {
      try {
        const img = new Image();
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d', { willReadFrequently: true } as any) as CanvasRenderingContext2D | null;
            if (!ctx) return resolve(null);
            ctx.drawImage(img, 0, 0, size, size);
            const data = ctx.getImageData(0, 0, size, size).data;
            const grays: number[] = [];
            for (let i = 0; i < data.length; i += 4) {
              const r = data[i] || 0;
              const g = data[i + 1] || 0;
              const b = data[i + 2] || 0;
              grays.push(0.299 * r + 0.587 * g + 0.114 * b);
            }
            const avg = grays.reduce((a, v) => a + v, 0) / grays.length;
            const bits = grays.map(v => (v >= avg ? '1' : '0')).join('');
            resolve(bits);
          } catch {
            resolve(null);
          }
        };
        img.onerror = () => resolve(null);
        img.src = `data:image/jpeg;base64,${base64}`;
      } catch {
        resolve(null);
      }
    });
  }, []);

  const hammingDistance = useCallback((a: string, b: string): number => {
    const n = Math.min(a.length, b.length);
    let d = 0;
    for (let i = 0; i < n; i++) if (a[i] !== b[i]) d++;
    return d + Math.abs(a.length - b.length);
  }, []);

  // Auto-snap helper for rubric view: take a few automatic shots while scanning is active
  useEffect(() => {
    if (!isScanningRubric || !isOnline || cameraError) return;
    if (isProcessing) return;
    if (rubricAutoAttempts >= 3) return; // avoid spamming the API

    const timeoutId = window.setTimeout(() => {
      setRubricAutoAttempts((prev) => prev + 1);
      void handleRubricSnap();
    }, 1500);

    return () => window.clearTimeout(timeoutId);
  }, [isScanningRubric, isOnline, cameraError, isProcessing, rubricAutoAttempts, handleRubricSnap]);

  const handleAutoSnap = useCallback(async () => {
    if (cooldownRef.current || showQuickPick || cameraError) return;
    if (gradingMode === GradingMode.MULTI_PAGE && multiPageCaptureInFlightRef.current) return;
    
    const optimalHighResBase64 = captureFrame(0.9);
    const apiBase64 = captureFrame(0.4);
    
    if (!optimalHighResBase64 || !apiBase64 || !selectedAssignment) return;

    if (frameAssessInFlightRef.current) return;
    frameAssessInFlightRef.current = true;

    try {
      const assess = await assessFrame(apiBase64);
      if (assess) {
        setScanHealth(assess.scanHealth || 0);
        setActiveGeometry((assess as any).corners || null);
      }
      
      const captureThreshold = gradingMode === GradingMode.MULTI_PAGE ? 88 : 80;
      const assessHealth = assess?.scanHealth ?? 0;
      if (!assess || assessHealth < captureThreshold) return;

      // Capture accepted: crop using assessed corners (if any)
      const corners = (assess as any).corners || null;
      const croppedBase64 = await cropImageToBoundingBox(optimalHighResBase64, corners);

      if (gradingMode === GradingMode.MULTI_PAGE) {
        multiPageCaptureInFlightRef.current = true;
        const hash = await computeAHash(apiBase64, 8);
        const lastHash = multiPageLastHashRef.current;
        const distance = hash && lastHash ? hammingDistance(hash, lastHash) : null;

        // If the new capture looks too similar to the last accepted page, skip it.
        // (64-bit aHash: distance < ~8 is usually the same page.)
        if (distance !== null && distance < 8) {
          setMultiPageHint('Same page detected — turn the page or move to the next page.');
          window.setTimeout(() => setMultiPageHint(null), 1400);
          cooldownRef.current = true;
          setTimeout(() => { cooldownRef.current = false; }, 900);
          multiPageCaptureInFlightRef.current = false;
          return;
        }

        if (hash) multiPageLastHashRef.current = hash;

        setMultiPageCapture(prev => {
          const nextUrls = [...prev.croppedDataUrls, `data:image/jpeg;base64,${croppedBase64}`].slice(0, 10);
          const nextApi = [...prev.apiBase64s, apiBase64].slice(0, 10);
          return {
            croppedDataUrls: nextUrls,
            apiBase64s: nextApi,
            detectedStudentName: prev.detectedStudentName || assess.transcription || undefined,
          };
        });
        setMultiPageHint('Captured. Turn the page, then keep scanning.');
        window.setTimeout(() => setMultiPageHint(null), 1200);
        cooldownRef.current = true;
        setTimeout(() => { cooldownRef.current = false; }, 2500);
        multiPageCaptureInFlightRef.current = false;
        return;
      }

      // Single-page: enqueue for background grading + later review.
      const id = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
      const dataUrl = `data:image/jpeg;base64,${croppedBase64}`;
      scanQueueRef.current.push({
        id,
        base64: croppedBase64,
        dataUrl,
        createdAt: Date.now(),
        scanHealth: assessHealth,
        corners,
        transcription: assess.transcription || undefined,
      });
      setScanQueueCount(scanQueueRef.current.length);
      setScanQueueHint(`Queued (${scanQueueRef.current.length}). Keep scanning.`);
      window.setTimeout(() => setScanQueueHint(null), 1200);
      cooldownRef.current = true;
      setTimeout(() => { cooldownRef.current = false; }, 1200);
    } catch (err) { 
      console.error(err); 
    } finally { 
      frameAssessInFlightRef.current = false;
    }
  }, [isOnline, cameraError, captureFrame, selectedAssignment, students, showQuickPick, customRubric, gradingMode, computeAHash, hammingDistance]);

  useEffect(() => {
    let interval: number | null = null;
    if (phase === AppPhase.GRADING_LOOP && isOnline && !showQuickPick && !isProcessing && !cameraError) {
      interval = window.setInterval(() => handleAutoSnap(), 500); 
    }
    return () => { if (interval) clearInterval(interval); };
  }, [phase, isOnline, showQuickPick, isProcessing, cameraError, handleAutoSnap]);

  const openNextQueuedReview = useCallback(() => {
    if (showQuickPick) return;
    const next = scanReviewRef.current.shift();
    setScanReviewQueueCount(scanReviewRef.current.length);
    if (!next) return;

    setPendingWork({ ...next.result, imageUrls: [next.dataUrl] });
    setManualScore(next.result.score?.toString() || '');
    setManualFeedback(next.result.feedback || '');

    const detectedIds = new Set<string>();
    const candidateStudents =
      scanStudentMode === 'batch' && batchSelectedStudentIds.size > 0
        ? students.filter(s => batchSelectedStudentIds.has(s.id))
        : students;

    if (next.result.studentName) {
      const lowerDetected = next.result.studentName.toLowerCase().replace(/[^a-z]/g, '');
      if (lowerDetected.length > 2) {
        const match = candidateStudents.find(s => {
          const sName = s.name.toLowerCase().replace(/[^a-z]/g, '');
          return sName.includes(lowerDetected) || lowerDetected.includes(sName);
        });
        if (match) detectedIds.add(match.id);
      }
    }

    // If we are in batch mode and detection found nothing, attribute this scan to the next student.
    if (scanStudentMode === 'batch' && detectedIds.size === 0) {
      const nextId = batchStudentOrderRef.current[batchNextIndexRef.current];
      if (nextId) detectedIds.add(nextId);
    }
    setSelectedQuickPickIds(detectedIds);
    setShowQuickPick(true);
  }, [showQuickPick, students, scanStudentMode, batchSelectedStudentIds]);

  // Background worker: grade queued single-page captures while teacher keeps scanning.
  useEffect(() => {
    if (gradingMode !== GradingMode.SINGLE_PAGE) return;
    if (!isOnline) return;
    if (!selectedAssignment) return;

    let cancelled = false;
    const workerInFlightRef = { current: false };

    const tick = async () => {
      if (cancelled) return;
      if (showQuickPick) return;
      if (workerInFlightRef.current) return;
      if (scanQueueRef.current.length === 0) return;

      workerInFlightRef.current = true;
      const job = scanQueueRef.current[0];
      try {
        const result = await analyzePaper(
          job.base64,
          customRubric || selectedAssignment.rubric,
          selectedAssignment.maxScore,
          students.map(s => s.name),
          false
        );
        const finalResult: GradingResponse =
          result ||
          ({
            detected: true,
            studentName: "",
            score: 0,
            feedback: "AI unavailable right now. Your scan is saved in the review queue so you can match the student and fill in a score/feedback manually.",
            confidence: 0,
            scanHealth: job.scanHealth,
            alignment: "IN_FRAME",
            corners: job.corners || undefined,
            transcription: job.transcription,
          } as GradingResponse);

        scanReviewRef.current.push({ id: job.id, result: finalResult, dataUrl: job.dataUrl });
        setScanReviewQueueCount(scanReviewRef.current.length);
      } catch (e) {
        console.error("Queued grading failed", e);
        const fallback = {
          detected: true,
          studentName: "",
          score: 0,
          feedback: "Grading failed due to a network/API error. Your scan is saved in the review queue so you can match the student and fill in a score/feedback manually.",
          confidence: 0,
          scanHealth: job.scanHealth,
          alignment: "IN_FRAME",
          corners: job.corners || undefined,
          transcription: job.transcription,
        } as GradingResponse;
        scanReviewRef.current.push({ id: job.id, result: fallback, dataUrl: job.dataUrl });
        setScanReviewQueueCount(scanReviewRef.current.length);
      } finally {
        scanQueueRef.current.shift();
        setScanQueueCount(scanQueueRef.current.length);
        workerInFlightRef.current = false;
      }
    };

    const intervalId = window.setInterval(() => { void tick(); }, 450);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [gradingMode, isOnline, selectedAssignment, customRubric, students, showQuickPick]);

  const confirmQuickPickStudents = () => {
    if (!pendingWork || !selectedAssignment || selectedQuickPickIds.size === 0) return;
    const selectedStudents = students.filter(s => selectedQuickPickIds.has(s.id));
    selectedStudents.forEach(student => {
      const newWork: GradedWork = {
        studentId: student.id,
        studentName: student.name,
        studentEmail: student.email,
        score: parseFloat(manualScore) || (pendingWork.score ?? 0),
        maxScore: selectedAssignment.maxScore,
        feedback: manualFeedback || (pendingWork.feedback || ''), 
        imageUrls: pendingWork.imageUrls || [], 
        status: 'draft', timestamp: Date.now(),
        courseName: selectedCourse?.name || '', assignmentName: selectedAssignment.title, courseId: selectedCourse?.id || '',
        assignmentId: selectedAssignment.id, scanHealth: pendingWork.scanHealth, transcription: pendingWork.transcription, geometry: pendingWork.corners
      };
      setGradedWorks(prev => [...prev, newWork]);
    });

    // Advance batch pointer only after the teacher confirms which student this scan belongs to.
    if (scanStudentMode === 'batch') {
      const selectedId = Array.from(selectedQuickPickIds)[0];
      const order = batchStudentOrderRef.current;
      const idx = selectedId ? order.indexOf(selectedId) : -1;
      if (idx >= 0) batchNextIndexRef.current = idx + 1;
      else batchNextIndexRef.current = batchNextIndexRef.current + 1;
    }

    setStudents(students.map(s => selectedQuickPickIds.has(s.id) ? { ...s, lastUsed: Date.now() } : s));
    setShowQuickPick(false); setPendingWork(null); setActiveGeometry(null); setScanHealth(0); setOneWordCommand(null);
    cooldownRef.current = true; setTimeout(() => { cooldownRef.current = false; }, 1000); 
  };

  const handleManualCaptureSinglePage = useCallback(async () => {
    if (gradingMode !== GradingMode.SINGLE_PAGE) return;
    if (cooldownRef.current || showQuickPick || cameraError) return;
    if (!selectedAssignment) return;

    const highRes = captureFrame(0.9);
    if (!highRes) return;

    try {
      const croppedBase64 = await cropImageToBoundingBox(highRes, activeGeometry || null);
      const id = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
      const dataUrl = `data:image/jpeg;base64,${croppedBase64}`;
      scanQueueRef.current.push({
        id,
        base64: croppedBase64,
        dataUrl,
        createdAt: Date.now(),
        scanHealth: Math.max(0, Math.min(100, Math.round(scanHealth))),
        corners: activeGeometry || null,
      });
      setScanQueueCount(scanQueueRef.current.length);
      setScanQueueHint(`Captured (${scanQueueRef.current.length}). ${isOnline ? 'Grading in background.' : 'Will grade when online.'}`);
      window.setTimeout(() => setScanQueueHint(null), 1200);
      cooldownRef.current = true;
      setTimeout(() => { cooldownRef.current = false; }, 900);
    } catch (e) {
      console.error(e);
    }
  }, [gradingMode, cooldownRef, showQuickPick, cameraError, selectedAssignment, captureFrame, activeGeometry, isOnline]);

  const finalizeMultiPage = async () => {
    if (isProcessing || showQuickPick) return;
    if (!selectedAssignment) return;
    if (multiPageCapture.apiBase64s.length === 0) return;
    if (!isOnline) return;

    setIsProcessing(true);
    try {
      const result = await analyzeMultiPagePaper(
        multiPageCapture.apiBase64s,
        customRubric || selectedAssignment.rubric,
        selectedAssignment.maxScore,
        students.map(s => s.name)
      );
      if (!result) return;

      const merged: Partial<GradingResponse> & { imageUrls: string[] } = {
        ...result,
        imageUrls: multiPageCapture.croppedDataUrls,
        scanHealth: scanHealth || result.scanHealth,
      };

      setPendingWork(merged);
      setManualScore(result.score?.toString() || '');
      setManualFeedback(result.feedback || '');

      const detectedName = result.studentName || multiPageCapture.detectedStudentName || '';
      const detectedIds = new Set<string>();
      const candidateStudents =
        scanStudentMode === 'batch' && batchSelectedStudentIds.size > 0
          ? students.filter(s => batchSelectedStudentIds.has(s.id))
          : students;

      if (detectedName) {
        const lowerDetected = detectedName.toLowerCase().replace(/[^a-z]/g, '');
        if (lowerDetected.length > 2) {
          const match = candidateStudents.find(s => {
            const sName = s.name.toLowerCase().replace(/[^a-z]/g, '');
            return sName.includes(lowerDetected) || lowerDetected.includes(sName);
          });
          if (match) detectedIds.add(match.id);
        }
      }

      // If detection found nothing and we are batching, attribute to the next student.
      if (scanStudentMode === 'batch' && detectedIds.size === 0) {
        const nextId = batchStudentOrderRef.current[batchNextIndexRef.current];
        if (nextId) detectedIds.add(nextId);
      }

      setSelectedQuickPickIds(detectedIds);
      setShowQuickPick(true);
    } catch (e) {
      console.error('Multi-page finalize failed', e);
    } finally {
      setIsProcessing(false);
    }
  };

  const startSyncProcess = async (indexesToSync?: number[]) => {
    if (!classroom || !isOnline || !accessToken) return;
    if (gradedWorks.length === 0) return;

    const currentWorks = [...gradedWorks];
    const indexSet = indexesToSync && indexesToSync.length > 0 ? new Set(indexesToSync) : null;
    const worksToSync = indexSet
      ? (indexesToSync ?? []).map(i => currentWorks[i]).filter(Boolean)
      : currentWorks;
    if (worksToSync.length === 0) return;
    if (!isPaid) {
      setPhase(AppPhase.PAYWALL);
      return;
    }
    
    logEvent('sync_start', { count: worksToSync.length });
    setPhase(AppPhase.SYNCING); 
    setSyncProgress({
      current: 0,
      total: worksToSync.length,
      message: 'Preparing Google Drive...',
      successes: 0,
      failures: 0,
      emailSuccesses: 0,
      emailFailures: 0,
    });
    
    let targetFolderId: string | null = null;
    
    try {
      const rootFolderId = await getOrCreateDriveFolder(accessToken, 'DoneGrading Scans');
      const safeAssignmentFolderName = worksToSync[0]?.assignmentName
        ? worksToSync[0].assignmentName.replace(/[^a-zA-Z0-9 ]/g, "").trim()
        : 'Misc Scans';
      targetFolderId = await getOrCreateDriveFolder(accessToken, safeAssignmentFolderName, rootFolderId);
    } catch (e) {
      console.error("Could not set up Drive folders. We will skip Drive upload for this sync.", e);
    }

    // Important: worksToSync is derived from either selected indexes or the full pending list.
    let successes = 0, failures = 0;
    
    for (let i = 0; i < worksToSync.length; i++) {
      const work = worksToSync[i]; 
      setSyncProgress(prev => ({ ...prev, current: i + 1, message: `Syncing grade for ${work.studentName}...` }));
      
      try { 
        await classroom.postGrade(work.courseId, work.assignmentId, work.studentId, work.score, work.feedback); 

        const base64Images =
          work.imageUrls && work.imageUrls.length > 0
            ? work.imageUrls
                .map((u) => {
                  const parts = u.split(',');
                  return parts.length > 1 ? parts[1] : '';
                })
                .filter(Boolean)
                .slice(0, 10)
            : [];

        if (targetFolderId && base64Images.length > 0) {
          setSyncProgress(prev => ({ ...prev, message: `Saving scan${base64Images.length > 1 ? 's' : ''} to Drive for ${work.studentName}...` }));
          for (let p = 0; p < base64Images.length; p++) {
            const b64 = base64Images[p];
            await uploadImageToDrive(
              accessToken,
              b64,
              `${work.studentName}_${work.assignmentName}_p${p + 1}.jpg`,
              targetFolderId
            );
          }
        }

        // Send email to student with grade, feedback, and attached scan (independent of Drive upload)
        if (work.studentEmail) {
          // Subject from student perspective
          const subject = `${work.assignmentName} grade & feedback`;

          // Plain continuous feedback text, no explicit line breaks
          const shortFeedback = (work.feedback || '').trim();
          const normalizedFeedback = shortFeedback.replace(/\s+/g, ' ');
          const feedbackSentence = normalizedFeedback
            ? // ensure it ends with a period
              (normalizedFeedback.endsWith('.') ? normalizedFeedback : `${normalizedFeedback}.`)
            : '';

          // Example: "In Photosynthesis Lab in Biology you scored 18/20. You explained ... A scan of your work is attached."
          const bodyParts: string[] = [];
          bodyParts.push(
            `In ${work.assignmentName} in ${work.courseName} you scored ${work.score}/${work.maxScore}.`
          );
          if (feedbackSentence) {
            bodyParts.push(feedbackSentence);
          }
          if (base64Images.length > 0) {
            bodyParts.push(base64Images.length === 1 ? 'A scan of your work is attached.' : 'Scans of your work are attached.');
          } else {
            bodyParts.push('Your grade and feedback have been updated in Google Classroom.');
          }

          const body = bodyParts.join(' ');

            try {
              await classroom.sendGradeEmail(
                work.studentEmail,
                subject,
                body,
                base64Images.length > 0 ? (base64Images as any) : undefined
              );
              setSyncProgress(prev => ({
                ...prev,
                emailSuccesses: prev.emailSuccesses + 1,
              }));
              logEvent('sync_email_success', { studentEmail: work.studentEmail, assignmentId: work.assignmentId });
            } catch (e) {
              console.warn(`Grade posted but email to ${work.studentEmail} failed:`, e);
              setSyncProgress(prev => ({
                ...prev,
                emailFailures: prev.emailFailures + 1,
              }));
              logEvent('sync_email_error', { studentEmail: work.studentEmail, assignmentId: work.assignmentId, error: String(e) });
            }
        }

        successes++;
      } catch (err) {
        console.error(err);
        failures++;
      }
    }
    
    setSyncProgress(prev => ({ ...prev, message: 'Finalizing...', successes, failures }));
    if (failures === 0) {
      logEvent('sync_success', { total: worksToSync.length });
    } else {
      logEvent('sync_error', { total: worksToSync.length, successes, failures });
    }
    setHistory(prev => [...worksToSync, ...prev]);
    setGradedWorks(indexSet ? currentWorks.filter((_, i) => !indexSet.has(i)) : []);
    setTimeout(() => setPhase(AppPhase.FINALE), 1000);
  };

  const bumpNavUsage = useCallback((key: 'plan' | 'grade' | 'teach' | 'communicate') => {
    setNavUsage(prev => ({ ...prev, [key]: (prev[key] || 0) + 1 }));
  }, []);

  const appContextValue: import('./context/AppContext').AppContextValue = {
    phase,
    setPhase,
    isSignedIn,
    accessToken,
    educatorName,
    todayLabel,
    isOnline,
    isDarkMode,
    setIsDarkMode,
    syncStatus,
    navUsage,
    bumpNavUsage,
    homeSummary,
    handleShareApp,
    handleSignOut,
    authError,
    authSuccessMessage,
    handleGoogleLogin,
    handleAppleLogin,
    handlePasswordReset,
    showMoreAuthOptions,
    setShowMoreAuthOptions,
    authMode,
    setAuthMode,
    handleEmailLogin,
    email,
    setEmail,
    password,
    setPassword,
    fullName,
    setFullName,
  };

  const renderDashboard = () => {
    const totalCourses = courses.length;
    const connectedCourses = courses.filter(c => c.source !== 'local').length;
    const totalAssignments = assignments.length;
    const totalStudents = students.length;
    const pendingGrades = gradedWorks.length;

    const now = Date.now();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const gradedLast7Works = history.filter(w => now - w.timestamp < sevenDaysMs);
    const gradedLast7 = gradedLast7Works.length;
    const gradedLast7StudentCount = new Set(gradedLast7Works.map(w => w.studentId || w.studentEmail || w.studentName)).size;
    const gradedLast7Pages = gradedLast7Works.reduce((sum, w) => sum + (w.imageUrls?.length || 1), 0);
    const minutesSavedApprox = gradedLast7Pages * 3; // assume ~3 minutes saved per scanned page
    const hoursSavedApprox = minutesSavedApprox / 60;

    const studentStats: Record<string, { name: string; totalScore: number; totalMax: number }> = {};
    const atRiskCourseIds = new Set<string>();
    history.forEach(w => {
      if (!w.studentId) return;
      if (!studentStats[w.studentId]) {
        studentStats[w.studentId] = { name: w.studentName || 'Student', totalScore: 0, totalMax: 0 };
      }
      studentStats[w.studentId].totalScore += w.score;
      studentStats[w.studentId].totalMax += w.maxScore || 100;
      const pct = w.maxScore ? (w.score / w.maxScore) * 100 : 0;
      if (pct < 70 && w.courseId) atRiskCourseIds.add(w.courseId);
    });
    const atRiskStudents = Object.values(studentStats)
      .map(s => ({ ...s, pct: s.totalMax > 0 ? (s.totalScore / s.totalMax) * 100 : 0 }))
      .filter(s => s.pct < 70)
      .sort((a, b) => a.pct - b.pct)
      .slice(0, 3);

    const pendingByCourseId: Record<string, number> = {};
    gradedWorks.forEach(w => {
      if (!w.courseId) return;
      pendingByCourseId[w.courseId] = (pendingByCourseId[w.courseId] || 0) + 1;
    });

    // Dashboard course grouping:
    // - Recent: first 3 after sorting + local search filter
    // - Other: remaining courses (toggleable)
    const coursesFilteredForUI = dashboardResults.courses.filter((course) =>
      courseSearch.trim()
        ? course.name.toLowerCase().includes(courseSearch.toLowerCase())
        : true
    );
    const otherCourses = coursesFilteredForUI.slice(3);

    const canScan = !!selectedCourse && !!selectedAssignment;

    return (
      <PageWrapper
        headerTitle={educatorName || 'Grade'}
        headerSubtitle={todayLabel || undefined}
        isOnline={isOnline}
        isDarkMode={isDarkMode}
        setIsDarkMode={setIsDarkMode}
        syncStatus={syncStatus}
        onSyncClick={() => {
          if (!classroom || !isOnline) return;
          void (async () => {
            try {
              await loadCourses();
              if (selectedCourse && selectedCourse.source !== 'local') {
                const [assignmentData, studentData] = await Promise.all([
                  classroom.getAssignments(selectedCourse.id),
                  classroom.getStudents(selectedCourse.id),
                ]);
                setAssignments(assignmentData);
                setStudents(studentData);
              }
              setSyncStatus('ok');
            } catch (err) {
              console.error('Manual sync failed', err);
              setSyncStatus('error');
            }
          })();
        }}
      >
        <div className="flex-1 min-h-0 flex flex-col gap-4 overflow-hidden pb-24 pt-1">
          <div className="grid grid-cols-1 gap-3">
            <button
              type="button"
              onClick={() => setPhase(AppPhase.GRADE_COURSE_PICKER)}
              className="p-4 rounded-2xl bg-white/70 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/60 text-left shadow-sm hover:opacity-90 transition-opacity"
            >
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Step 1</div>
              <div className="mt-1 text-base font-black text-slate-900 dark:text-white">
                {selectedCourse ? selectedCourse.name : 'Select course'}
              </div>
              <div className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">
                Choose the class you will post grades to
              </div>
            </button>

            <button
              type="button"
              onClick={() => setPhase(AppPhase.ASSIGNMENT_SELECT)}
              disabled={!selectedCourse}
              className="p-4 rounded-2xl bg-white/70 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/60 text-left shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Step 2</div>
              <div className="mt-1 text-base font-black text-slate-900 dark:text-white">
                {selectedAssignment ? selectedAssignment.title : 'Select assignment'}
              </div>
              <div className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">
                Pick or create the assignment in Google Classroom
              </div>
            </button>

            <button
              type="button"
              onClick={handleStartGrading}
              disabled={!canScan}
              className="p-4 rounded-2xl bg-emerald-500 text-white text-left shadow-sm hover:bg-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="text-[10px] font-black uppercase tracking-widest text-emerald-100">Step 3</div>
              <div className="mt-1 text-base font-black">Scan student work</div>
              <div className="text-sm text-emerald-50/90 mt-0.5">
                Single or batch scan, then verify feedback
              </div>
            </button>

            <button
              type="button"
              onClick={() => setPhase(AppPhase.AUDIT)}
              disabled={pendingGrades <= 0}
              className="p-4 rounded-2xl bg-indigo-600 text-white text-left shadow-sm hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="text-[10px] font-black uppercase tracking-widest text-indigo-100">Step 4</div>
              <div className="mt-1 text-base font-black">Review & sync</div>
              <div className="text-sm text-indigo-50/90 mt-0.5">
                Sync selected ({pendingGrades}) to Classroom
              </div>
            </button>
          </div>

          <div className="mt-auto grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setPhase(AppPhase.RECORDS)}
              disabled={atRiskStudents.length === 0}
              className="p-3 rounded-2xl bg-white/60 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-700/60 text-left hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">At-risk</div>
              <div className="text-lg font-black text-slate-900 dark:text-white">{atRiskStudents.length}</div>
            </button>
            <button
              type="button"
              onClick={() => setPhase(AppPhase.ROSTER_VIEW)}
              className="p-3 rounded-2xl bg-white/60 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-700/60 text-left hover:opacity-90 transition-opacity"
            >
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Students</div>
              <div className="text-lg font-black text-slate-900 dark:text-white">{totalStudents}</div>
            </button>
          </div>
        </div>
      </PageWrapper>
    );

    return (
      <PageWrapper
        headerTitle={educatorName || 'Grade'}
        headerSubtitle={todayLabel || undefined}
        isOnline={isOnline}
        isDarkMode={isDarkMode}
        setIsDarkMode={setIsDarkMode}
        syncStatus={syncStatus}
        onSyncClick={() => {
          if (!classroom || !isOnline) return;
          void (async () => {
            try {
              await loadCourses();
              if (selectedCourse && selectedCourse.source !== 'local') {
                const [assignmentData, studentData] = await Promise.all([
                  classroom.getAssignments(selectedCourse.id),
                  classroom.getStudents(selectedCourse.id),
                ]);
                setAssignments(assignmentData);
                setStudents(studentData);
              }
              setSyncStatus('ok');
            } catch (err) {
              console.error('Manual sync failed', err);
              setSyncStatus('error');
            }
          })();
        }}
      >
        <div className="flex-1 min-h-0 flex flex-col gap-5 overflow-y-auto pb-24 pt-1 custom-scrollbar">
          {/* Sticky attention + metrics */}
          <div className="sticky top-0 z-10 -mx-4 px-4 pt-2 pb-3 bg-slate-950/0 backdrop-blur-sm">
            <div className="bg-white/65 dark:bg-slate-800/55 border border-slate-200/70 dark:border-slate-700/60 rounded-2xl p-3 shadow-sm">
            {/* What needs your attention */}
            <div className="py-2">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />
                  <p className="text-sm font-semibold uppercase tracking-wide text-slate-100">
                    What needs your attention
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setAttentionExpanded(prev => !prev)}
                  className="text-[10px] font-semibold uppercase tracking-wide text-slate-300 hover:text-slate-100"
                >
                  {attentionExpanded ? 'Hide' : 'Show'}
                </button>
              </div>
              {attentionExpanded ? (
                <div className="space-y-2 text-sm text-slate-100">
                  {pendingGrades > 0 && (
                    <button
                      type="button"
                      onClick={() => setPhase(AppPhase.AUDIT)}
                      className="w-full flex items-center justify-between py-2.5 text-left text-emerald-100 hover:opacity-90 transition-opacity"
                    >
                      <span className="font-semibold">{pendingGrades} grade{pendingGrades === 1 ? '' : 's'} ready to review</span>
                      <ArrowRight className="w-4 h-4 shrink-0" />
                    </button>
                  )}
                  {atRiskStudents.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setPhase(AppPhase.RECORDS)}
                      className="w-full flex items-center justify-between py-2 text-left text-rose-100 hover:opacity-90 transition-opacity"
                    >
                      <span className="font-semibold">
                        {atRiskStudents.length} student{atRiskStudents.length === 1 ? '' : 's'} to check in on
                      </span>
                      <Target className="w-4 h-4 shrink-0" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleStartGrading}
                    className="w-full mt-1 py-2.5 rounded-xl bg-emerald-500 text-white font-bold text-xs uppercase tracking-widest hover:bg-emerald-600 transition-colors flex items-center justify-center gap-1.5"
                  >
                    Start grading
                    <Camera className="w-3.5 h-3.5" />
                  </button>
                  <p className="text-[10px] text-slate-300 pt-1">
                    Emails: {syncProgress.emailSuccesses} sent · {syncProgress.emailFailures} failed
                  </p>
                </div>
              ) : (
                <p className="text-xs text-slate-200">
                  Queue: {pendingGrades} · At-risk: {atRiskStudents.length} · Emails failed: {syncProgress.emailFailures}
                </p>
              )}
            </div>
            </div>
          </div>

          {(gradeFollowUps.length > 0 || quickTodos.length > 0) && (
            <div className="py-2">
              <div className="bg-white/60 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-700/60 rounded-2xl p-3 shadow-sm">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <Mic className="w-5 h-5 text-indigo-500 shrink-0" />
                    <p className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300 truncate">
                      Voice inbox
                    </p>
                    <span className="text-[11px] font-bold text-slate-500 dark:text-slate-300 shrink-0">
                      {gradeFollowUps.filter(f => !f.done).length + quickTodos.filter(t => !t.done).length}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setVoiceInboxExpanded(prev => !prev)}
                    className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300 hover:text-slate-800 dark:hover:text-slate-100"
                  >
                    {voiceInboxExpanded ? 'Hide' : 'Show'}
                  </button>
                </div>

                {voiceInboxExpanded && (
                  <div className="space-y-3">
                    {gradeFollowUps.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
                          Grade follow‑ups
                        </p>
                        <div className="space-y-2">
                          {gradeFollowUps.slice(0, 4).map((f) => (
                            <div key={f.id} className="flex items-start gap-3 py-1">
                              <button
                                type="button"
                                onClick={() => setGradeFollowUps((prev) => prev.map(p => p.id === f.id ? { ...p, done: !p.done } : p))}
                                className={`mt-0.5 w-4 h-4 rounded border shrink-0 ${f.done ? 'bg-emerald-500 border-emerald-500' : 'bg-transparent border-slate-300 dark:border-slate-600'}`}
                                title={f.done ? 'Mark not done' : 'Mark done'}
                              />
                              <div className="flex-1 text-sm text-slate-700 dark:text-slate-200 min-w-0">
                                <span className={f.done ? 'line-through opacity-70' : ''}>{f.text}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {quickTodos.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
                          To‑dos
                        </p>
                        <div className="space-y-2">
                          {quickTodos.slice(0, 4).map((t) => (
                            <div key={t.id} className="flex items-start gap-3 py-1">
                              <button
                                type="button"
                                onClick={() => setQuickTodos((prev) => prev.map(p => p.id === t.id ? { ...p, done: !p.done } : p))}
                                className={`mt-0.5 w-4 h-4 rounded border shrink-0 ${t.done ? 'bg-emerald-500 border-emerald-500' : 'bg-transparent border-slate-300 dark:border-slate-600'}`}
                                title={t.done ? 'Mark not done' : 'Mark done'}
                              />
                              <div className="flex-1 text-sm text-slate-700 dark:text-slate-200 min-w-0">
                                <span className={t.done ? 'line-through opacity-70' : ''}>{t.text}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Summary tiles */}
          <div className="grid grid-cols-2 gap-4 py-2">
            <button
              type="button"
              onClick={() => {
                if (pendingGrades <= 0) return;
                setPhase(AppPhase.AUDIT);
              }}
              disabled={pendingGrades <= 0}
              className={`p-4 text-left rounded-2xl bg-white/60 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-700/60 transition-opacity ${
                pendingGrades > 0 ? 'hover:opacity-90' : 'opacity-60 cursor-default'
              }`}
              title={pendingGrades > 0 ? 'Open pending grades' : 'No pending grades'}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Grading queue</span>
                <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0" />
              </div>
              <p className={`text-2xl font-bold text-slate-900 dark:text-slate-50 leading-tight ${pendingGrades > 0 ? 'underline underline-offset-4 decoration-slate-300/60 dark:decoration-slate-600/60' : ''}`}>
                {pendingGrades}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Ready to post</p>
            </button>
            <div className="p-4 rounded-2xl bg-white/60 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-700/60">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Classes</span>
                <Layers className="w-5 h-5 text-indigo-500 shrink-0" />
              </div>
              <p className="text-base font-semibold text-slate-900 dark:text-slate-50 leading-tight">{totalCourses} courses · {totalAssignments} assignments</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{connectedCourses} synced</p>
            </div>
            <div className="p-4 rounded-2xl bg-white/60 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-700/60">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Students</span>
                <Users className="w-5 h-5 text-sky-500 shrink-0" />
              </div>
              <button
                type="button"
                onClick={() => setPhase(AppPhase.ROSTER_VIEW)}
                className="text-left w-full"
                title="Open roster"
              >
                <p className="text-2xl font-bold text-slate-900 dark:text-slate-50 leading-tight underline underline-offset-4 decoration-slate-300/60 dark:decoration-slate-600/60">
                  {totalStudents}
                </p>
              </button>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">All rosters</p>
            </div>
            <button
              type="button"
              onClick={() => setShowLast7Details(prev => !prev)}
              className="p-4 text-left rounded-2xl bg-white/60 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-700/60 hover:opacity-90 transition-opacity"
              title="Show details"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Last 7 days</span>
                <HistoryIcon className="w-5 h-5 text-purple-500 shrink-0" />
              </div>
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-50 leading-tight">{gradedLast7}</p>
              {showLast7Details ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Papers: {gradedLast7Pages} · Students: {gradedLast7StudentCount || 0} · ~{hoursSavedApprox.toFixed(1)} hrs saved
                </p>
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Graded · {gradedLast7StudentCount || 0} students · tap for details
                </p>
              )}
            </button>
          </div>

          {/* Course list */}
          <div className="flex-1 min-h-0 flex flex-col gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowCourses((prev) => !prev)}
              className="flex items-center justify-between text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
            >
              <span>Courses</span>
              <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500">
                {showCourses ? 'Hide' : 'Show'} · {otherCourses.length} more
              </span>
            </button>
            <div className="space-y-2 flex-1 min-h-0 overflow-y-auto custom-scrollbar">
              <div className="sticky top-0 z-5 -mx-1 mb-1 px-1 pb-1 bg-gradient-to-b from-slate-950/90 via-slate-950/40 to-transparent">
                <input
                  type="search"
                  value={courseSearch}
                  onChange={(e) => setCourseSearch(e.target.value)}
                  placeholder="Search courses…"
                  className="w-full px-3 py-1.5 rounded-xl bg-slate-900/60 border border-slate-700 text-xs text-slate-100 placeholder:text-slate-500 outline-none"
                />
              </div>
              {dashboardResults.courses
                .filter((course) =>
                  courseSearch.trim()
                    ? course.name.toLowerCase().includes(courseSearch.toLowerCase())
                    : true
                )
                .filter((_, idx) => (showCourses ? true : idx < 3))
                .map((course) => (
                <div
                  key={course.id}
                  draggable
                  onDragStart={() => setDragCourseId(course.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (!dragCourseId || dragCourseId === course.id) return;
                    setDashboardSort('manual');
                    setCourses(prev => {
                      const next = [...prev];
                      const from = next.findIndex(c => c.id === dragCourseId);
                      const to = next.findIndex(c => c.id === course.id);
                      if (from === -1 || to === -1) return prev;
                      const [item] = next.splice(from, 1);
                      next.splice(to, 0, item);
                      return next;
                    });
                    setDragCourseId(null);
                  }}
                  className={`p-4 rounded-2xl bg-white/60 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-700/60 flex items-center justify-between transition-opacity ${dragCourseId === course.id ? 'opacity-80 ring-2 ring-indigo-300/70 dark:ring-indigo-500/30' : ''}`}
                >
                  <button
                    type="button"
                    onClick={() => selectCourse(course)}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      const name = window.prompt('Rename course', course.name);
                      if (!name || !name.trim()) return;
                      if (classroom && isOnline && course.source !== 'local') {
                        classroom.updateCourse(course.id, name.trim(), course.period)
                          .then((updated) => {
                            setCourses(prev => prev.map(c => c.id === course.id ? { ...c, ...updated } : c));
                          })
                          .catch(err => {
                            console.error('Failed to rename course', err);
                            setAuthError('Could not rename course in Google Classroom.');
                          });
                      } else {
                        setCourses(prev => prev.map(c => c.id === course.id ? { ...c, name: name.trim() } : c));
                      }
                    }}
                    className="flex items-center gap-4 flex-1 text-left min-w-0"
                  >
                    <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-xl flex items-center justify-center text-white shrink-0">
                      <BookOpen className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-base font-semibold text-slate-800 dark:text-slate-100 truncate">{course.name}</h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {course.period}{course.source === 'local' ? ' · Local' : ''}{' '}
                      </p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => selectCourse(course)}
                    className="mr-2 px-2 py-1 rounded-lg text-[10px] font-semibold uppercase tracking-wide bg-indigo-600 text-white hover:bg-indigo-700 transition-colors shrink-0"
                    title="Start grading for this course"
                  >
                    Grade
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!window.confirm('Delete this course? This will also remove it from Google Classroom if it is synced.')) return;
                      if (classroom && isOnline && course.source !== 'local') {
                        classroom.deleteCourse(course.id)
                          .then(() => {
                            setCourses(prev => prev.filter(c => c.id !== course.id));
                            if (selectedCourse?.id === course.id) {
                              setSelectedCourse(null);
                              setAssignments([]);
                              setStudents([]);
                              setPhase(AppPhase.DASHBOARD);
                            }
                          })
                          .catch(err => {
                            console.error('Failed to delete course', err);
                            setAuthError('Could not delete course in Google Classroom.');
                          });
                      } else {
                        setCourses(prev => prev.filter(c => c.id !== course.id));
                        if (selectedCourse?.id === course.id) {
                          setSelectedCourse(null);
                          setAssignments([]);
                          setStudents([]);
                          setPhase(AppPhase.DASHBOARD);
                        }
                      }
                    }}
                    className="p-2 text-rose-500 hover:text-rose-600 hover:opacity-80 transition-colors shrink-0"
                    title="Delete course"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}

              <button
                type="button"
                onClick={() => { setNewCourseName(''); setPhase('COURSE_CREATION'); }}
                className="w-full py-4 flex items-center justify-center gap-2 text-indigo-600 dark:text-indigo-400 hover:opacity-80 transition-opacity"
              >
                <PlusCircle className="w-6 h-6 shrink-0" />
                <span className="text-sm font-semibold uppercase tracking-wide">Create Course</span>
              </button>
            </div>
          </div>
        </div>
      </PageWrapper>
    );
  };

  const renderGradeCoursePicker = () => {
    const pendingByCourseId: Record<string, number> = {};
    gradedWorks.forEach(w => {
      if (!w.courseId) return;
      pendingByCourseId[w.courseId] = (pendingByCourseId[w.courseId] || 0) + 1;
    });

    const coursesFilteredForUI = dashboardResults.courses.filter((course) =>
      courseSearch.trim()
        ? course.name.toLowerCase().includes(courseSearch.toLowerCase())
        : true
    );
    const coursesForPicker = showCourses ? coursesFilteredForUI : coursesFilteredForUI.slice(0, 8);

    return (
      <PageWrapper
        headerTitle="Select course"
        headerSubtitle={todayLabel || undefined}
        isOnline={isOnline}
        isDarkMode={isDarkMode}
        setIsDarkMode={setIsDarkMode}
        syncStatus={syncStatus}
        onBack={() => setPhase(AppPhase.DASHBOARD)}
      >
        <div className="flex-1 min-h-0 flex flex-col gap-3 overflow-hidden pb-24 pt-1">
          <div className="bg-white/70 dark:bg-slate-800/55 border border-slate-200/70 dark:border-slate-700/60 rounded-2xl p-4 shadow-sm">
            <input
              type="search"
              value={courseSearch}
              onChange={(e) => setCourseSearch(e.target.value)}
              placeholder="Search courses…"
              className="w-full px-4 py-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-700/60 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 outline-none"
            />
            <div className="mt-3 flex items-center justify-between">
              <div className="text-xs font-black uppercase tracking-widest text-slate-500">
                {coursesFilteredForUI.length} course{coursesFilteredForUI.length === 1 ? '' : 's'}
              </div>
              <button
                type="button"
                className="text-[11px] font-semibold uppercase tracking-widest text-slate-600 dark:text-slate-300 hover:opacity-90"
                onClick={() => setShowCourses(prev => !prev)}
              >
                {showCourses ? 'Show less' : 'Show all'}
              </button>
            </div>
          </div>

          <div className="flex-1 min-h-0 bg-white/60 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-700/60 rounded-2xl shadow-sm overflow-hidden">
            <div className="h-full overflow-y-auto custom-scrollbar p-2">
              {coursesForPicker.length === 0 && (
                <div className="py-10 text-center text-slate-500 text-sm font-bold">No courses match.</div>
              )}
              {coursesForPicker.map((course) => {
                const active = selectedCourse?.id === course.id;
                const pending = pendingByCourseId[course.id] || 0;
                return (
                  <button
                    key={course.id}
                    type="button"
                    onClick={() => void selectCourse(course)}
                    className={`w-full p-3 rounded-xl border flex items-center justify-between gap-3 text-left mb-2 ${
                      active
                        ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-400/60'
                        : 'bg-white dark:bg-slate-800 border-slate-200/70 dark:border-slate-700/60 hover:opacity-90'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="font-black text-sm truncate text-slate-900 dark:text-white">{course.name}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-300 mt-0.5">
                        {course.period}{course.source === 'local' ? ' · Local' : ''}
                        {pending > 0 ? ` · ${pending} in queue` : ''}
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </PageWrapper>
    );
  };

  const ensureRosterData = async (course: Course) => {
    setRosterError(null);
    if (rosterCourseStudents[course.id] && rosterCourseAssignments[course.id]) return;
    if (!classroom || !isOnline || course.source === 'local') {
      setRosterCourseStudents(prev => (prev[course.id] ? prev : { ...prev, [course.id]: prev[course.id] ?? [] }));
      setRosterCourseAssignments(prev => (prev[course.id] ? prev : { ...prev, [course.id]: prev[course.id] ?? [] }));
      return;
    }
    try {
      setRosterLoadingCourseId(course.id);
      const [studentsData, assignmentsData] = await Promise.all([
        classroom.getStudents(course.id),
        classroom.getAssignments(course.id),
      ]);
      setRosterCourseStudents(prev => ({ ...prev, [course.id]: studentsData }));
      setRosterCourseAssignments(prev => ({ ...prev, [course.id]: assignmentsData }));
    } catch (e) {
      console.error('Failed to load roster data', e);
      setRosterError('Could not load students/assignments for this course.');
    } finally {
      setRosterLoadingCourseId(null);
    }
  };

  const renderRosterView = () => {
    const openCourse = rosterCourseOpenId ? courses.find(c => c.id === rosterCourseOpenId) : null;
    const openStudents = openCourse ? (rosterCourseStudents[openCourse.id] ?? []) : [];
    const openAssignments = openCourse ? (rosterCourseAssignments[openCourse.id] ?? []) : [];
    const selectedAssignment = openAssignments.find(a => a.id === rosterSelectedAssignmentId) ?? null;
    const canAdd = !!openCourse && !!selectedAssignment && rosterSelectedStudentIds.size > 0;

    return (
      <PageWrapper
        headerTitle={educatorName || 'Roster'}
        headerSubtitle={todayLabel || undefined}
        onBack={() => setPhase(AppPhase.DASHBOARD)}
        isOnline={isOnline}
        isDarkMode={isDarkMode}
        setIsDarkMode={setIsDarkMode}
        syncStatus={syncStatus}
      >
        <div className="flex-1 min-h-0 flex flex-col gap-4 overflow-y-auto pb-24 custom-scrollbar">
          <div className="text-sm text-slate-600 dark:text-slate-300">
            Select a course, choose an assignment, then pick one or more students to add to <span className="font-semibold">Review Grades</span> for manual grading.
          </div>

          {rosterError && (
            <div className="px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-300 text-sm">
              {rosterError}
            </div>
          )}

          <div className="space-y-2">
            {courses.map((course) => {
              const isOpen = rosterCourseOpenId === course.id;
              const isLoading = rosterLoadingCourseId === course.id;
              const count = rosterCourseStudents[course.id]?.length;
              return (
                <div key={course.id} className="border border-slate-200/60 dark:border-slate-700/60 rounded-xl overflow-hidden">
                  <button
                    type="button"
                    onClick={() => {
                      const nextOpen = isOpen ? null : course.id;
                      setRosterCourseOpenId(nextOpen);
                      setRosterSelectedStudentIds(new Set());
                      setRosterSelectedAssignmentId('');
                      if (!isOpen) void ensureRosterData(course);
                    }}
                    className="w-full flex items-center justify-between px-3 py-3 bg-white/40 dark:bg-slate-900/40 hover:bg-white/60 dark:hover:bg-slate-900/60 transition-colors"
                  >
                    <div className="min-w-0 text-left">
                      <div className="text-base font-semibold text-slate-900 dark:text-slate-100 truncate">{course.name}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {course.period}{typeof count === 'number' ? ` · ${count} students` : ''}
                      </div>
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 shrink-0">
                      {isLoading ? 'Loading…' : isOpen ? 'Hide' : 'Open'}
                    </div>
                  </button>

                  {isOpen && (
                    <div className="px-3 py-3 space-y-3 bg-white/20 dark:bg-slate-900/20">
                      <div className="space-y-1">
                        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Assignment
                        </label>
                        <select
                          value={rosterSelectedAssignmentId}
                          onChange={(e) => setRosterSelectedAssignmentId(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/80 text-sm text-slate-800 dark:text-slate-100 outline-none"
                        >
                          <option value="">Select an assignment…</option>
                          {openAssignments.map(a => (
                            <option key={a.id} value={a.id}>
                              {a.title} ({a.maxScore})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            Students
                          </label>
                          <button
                            type="button"
                            onClick={() => {
                              if (openStudents.length === 0) return;
                              const all = rosterSelectedStudentIds.size !== openStudents.length;
                              setRosterSelectedStudentIds(all ? new Set(openStudents.map(s => s.id)) : new Set());
                            }}
                            className="text-xs font-semibold text-slate-500 dark:text-slate-400 underline underline-offset-2"
                          >
                            {openStudents.length === 0 ? '' : rosterSelectedStudentIds.size === openStudents.length ? 'Clear' : 'Select all'}
                          </button>
                        </div>

                        {openStudents.length === 0 ? (
                          <div className="text-sm text-slate-500 dark:text-slate-400">
                            {course.source === 'local'
                              ? 'Local courses do not have a roster.'
                              : isOnline
                                ? 'No students found.'
                                : 'Offline — connect to load roster.'}
                          </div>
                        ) : (
                          <div className="max-h-64 overflow-y-auto custom-scrollbar border border-slate-200/60 dark:border-slate-700/60 rounded-xl bg-white/50 dark:bg-slate-900/50">
                            {openStudents.map((s) => {
                              const checked = rosterSelectedStudentIds.has(s.id);
                              return (
                                <button
                                  key={s.id}
                                  type="button"
                                  onClick={() => {
                                    setRosterSelectedStudentIds(prev => {
                                      const next = new Set(prev);
                                      if (next.has(s.id)) next.delete(s.id);
                                      else next.add(s.id);
                                      return next;
                                    });
                                  }}
                                  className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-white/60 dark:hover:bg-slate-900/60 transition-colors"
                                >
                                  <div className="min-w-0">
                                    <div className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{s.name}</div>
                                    {s.email && <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{s.email}</div>}
                                  </div>
                                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${checked ? 'border-indigo-500 bg-indigo-500' : 'border-slate-300 dark:border-slate-600'}`}>
                                    {checked && <Check className="w-3 h-3 text-white" />}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        )}

                        <button
                          type="button"
                          disabled={!canAdd}
                          onClick={() => {
                            if (!openCourse || !selectedAssignment) return;
                            const picked = openStudents.filter(s => rosterSelectedStudentIds.has(s.id));
                            if (picked.length === 0) return;
                            const nowTs = Date.now();
                            const newWorks: GradedWork[] = picked.map((student) => ({
                              studentId: student.id,
                              studentName: student.name,
                              studentEmail: student.email,
                              score: 0,
                              maxScore: selectedAssignment.maxScore,
                              feedback: '',
                              imageUrls: [],
                              status: 'draft',
                              timestamp: nowTs,
                              courseName: openCourse.name,
                              assignmentName: selectedAssignment.title,
                              courseId: openCourse.id,
                              assignmentId: selectedAssignment.id,
                            }));
                            setGradedWorks(prev => [...prev, ...newWorks]);
                            setSelectedCourse(openCourse);
                            setSelectedAssignment(selectedAssignment);
                            setAssignments(openAssignments);
                            setStudents(openStudents);
                            setPhase(AppPhase.AUDIT);
                          }}
                          className={`w-full py-3 rounded-xl text-sm font-bold uppercase tracking-wide transition-colors ${
                            canAdd
                              ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                              : 'bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-500 cursor-not-allowed'
                          }`}
                        >
                          Add to Review Grades ({rosterSelectedStudentIds.size || 0})
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </PageWrapper>
    );
  };

  const renderOptions = () => (
    <PageWrapper
      headerTitle={educatorName || 'Options'}
      headerSubtitle={todayLabel || undefined}
      isOnline={isOnline}
      isDarkMode={isDarkMode}
      setIsDarkMode={setIsDarkMode}
      syncStatus={syncStatus}
      onBack={() => setPhase(AppPhase.DASHBOARD)}
    >
      <div className="flex-1 min-h-0 flex flex-col gap-4 overflow-y-auto pb-20 custom-scrollbar">
        <button
          type="button"
          onClick={handleShareApp}
          className="group relative w-full py-3 overflow-hidden rounded-xl text-[11px] font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-all shadow-lg border-0 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500"
        >
          <Share2 className="w-4 h-4 text-white drop-shadow-sm shrink-0" />
          <span className="text-white drop-shadow-sm uppercase tracking-[0.12em]">Share DoneGrading</span>
        </button>
        <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-700">
          <a
            href="https://www.donegrading.com/Terms-of-Service"
            target="_blank"
            rel="noreferrer"
            className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 underline underline-offset-2"
          >
            Terms of Service
          </a>
          <a
            href="https://www.donegrading.com/Privacy-Policy"
            target="_blank"
            rel="noreferrer"
            className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 underline underline-offset-2"
          >
            Privacy Policy
          </a>
          <a
            href="https://www.donegrading.com/Contact"
            target="_blank"
            rel="noreferrer"
            className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 underline underline-offset-2"
          >
            Support
          </a>
          <button
            type="button"
            onClick={handleSignOut}
            className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 underline underline-offset-2 text-left"
          >
            Sign out
          </button>
        </div>
        <p className="text-[10px] text-slate-500 dark:text-slate-400 pt-4">
          Copyright © 2026 DoneGrading LLC. All rights reserved.
        </p>
      </div>
    </PageWrapper>
  );

  const renderAssignmentSelect = () => (
    <PageWrapper
      headerTitle={selectedCourse?.name}
      headerSubtitle={undefined}
      onBack={() => setPhase(AppPhase.DASHBOARD)}
      isOnline={isOnline}
      isDarkMode={isDarkMode}
      setIsDarkMode={setIsDarkMode}
      syncStatus={syncStatus}
      onSyncClick={() => {
        if (!classroom || !isOnline || !selectedCourse || selectedCourse.source === 'local') return;
        void (async () => {
          try {
            const [assignmentData, studentData] = await Promise.all([
              classroom.getAssignments(selectedCourse.id),
              classroom.getStudents(selectedCourse.id),
            ]);
            setAssignments(assignmentData);
            setStudents(studentData);
            setSyncStatus('ok');
          } catch (err) {
            console.error('Manual sync (assignments) failed', err);
            setSyncStatus('error');
          }
        })();
      }}
    >
       <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-4 custom-scrollbar">
         {filteredAssignmentsList.map((assignment) => (
            <div
              key={assignment.id}
              draggable
              onDragStart={() => setDragAssignmentId(assignment.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (!dragAssignmentId || dragAssignmentId === assignment.id) return;
                setAssignmentSort('manual');
                setAssignments(prev => {
                  const next = [...prev];
                  const from = next.findIndex(a => a.id === dragAssignmentId);
                  const to = next.findIndex(a => a.id === assignment.id);
                  if (from === -1 || to === -1) return prev;
                  const [item] = next.splice(from, 1);
                  next.splice(to, 0, item);
                  return next;
                });
                setDragAssignmentId(null);
              }}
              className={`p-4 bg-white/70 dark:bg-slate-800/70 backdrop-blur-xl border rounded-xl flex items-center justify-between shadow-sm hover:-translate-y-0.5 transition-all ${
                dragAssignmentId === assignment.id ? 'border-emerald-400 ring-2 ring-emerald-300' : 'border-slate-200 dark:border-slate-700 hover:border-emerald-400'
              }`}
            >
               <button
                 type="button"
                 onClick={() => { setSelectedAssignment(assignment); setPhase(AppPhase.RUBRIC_SETUP); }}
                 onDoubleClick={(e) => {
                   e.stopPropagation();
                   if (!selectedCourse) return;
                   const title = window.prompt('Rename assignment', assignment.title);
                   if (!title || !title.trim()) return;
                   if (classroom && isOnline && selectedCourse.source !== 'local') {
                     classroom.updateAssignment(selectedCourse.id, assignment.id, title.trim())
                       .then((updated) => {
                         setAssignments(prev => prev.map(a => a.id === assignment.id ? { ...a, ...updated } : a));
                       })
                       .catch(err => {
                         console.error('Failed to rename assignment', err);
                         setAuthError('Could not rename assignment in Google Classroom.');
                       });
                   } else {
                     setAssignments(prev => prev.map(a => a.id === assignment.id ? { ...a, title: title.trim() } : a));
                   }
                 }}
                 className="flex items-center gap-4 flex-1 text-left"
               >
                 <div className="w-10 h-10 bg-slate-100 dark:bg-slate-700 rounded-xl flex items-center justify-center text-slate-500 dark:text-slate-400">
                   <Layers className="w-5 h-5" />
                 </div>
                 <div>
                   <h4 className="text-sm font-black text-slate-800 dark:text-slate-100">{assignment.title}</h4>
                   <p className="text-slate-500 text-[9px] font-black uppercase tracking-[0.15em]">{assignment.maxScore} Points</p>
                 </div>
               </button>

               <div className="flex items-center gap-1 ml-3">
                 <button
                   type="button"
                   onClick={(e) => {
                     e.stopPropagation();
                     if (!selectedCourse) return;
                     if (!window.confirm('Delete this assignment? This will also remove it from Google Classroom if it is synced.')) return;
                     if (classroom && isOnline && selectedCourse.source !== 'local') {
                       classroom.deleteAssignment(selectedCourse.id, assignment.id)
                         .then(() => {
                           setAssignments(prev => prev.filter(a => a.id !== assignment.id));
                           if (selectedAssignment?.id === assignment.id) {
                             setSelectedAssignment(null);
                           }
                         })
                         .catch(err => {
                           console.error('Failed to delete assignment', err);
                           setAuthError('Could not delete assignment in Google Classroom.');
                         });
                     } else {
                       setAssignments(prev => prev.filter(a => a.id !== assignment.id));
                       if (selectedAssignment?.id === assignment.id) {
                         setSelectedAssignment(null);
                       }
                     }
                   }}
                   className="p-1.5 rounded-full bg-white/60 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-rose-500 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                   title="Delete assignment"
                 >
                   <Trash2 className="w-4 h-4" />
                 </button>
               </div>
            </div>
          ))}

          <div onClick={(e) => handleOpenAsnCreation(selectedCourse!, e)} className="p-4 mt-2 bg-white/40 dark:bg-slate-800/40 border-2 border-dashed border-emerald-400 dark:border-emerald-500 rounded-xl flex items-center justify-center gap-3 shadow-sm cursor-pointer hover:bg-white/60 dark:hover:bg-slate-800/60 hover:-translate-y-0.5 transition-all">
            <PlusCircle className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
            <h4 className="text-sm font-black text-emerald-700 dark:text-emerald-300 uppercase tracking-widest">Create Assignment</h4>
          </div>
       </div>
    </PageWrapper>
  );

  const getScanStatusText = (progress: number) => {
    if (progress === 100) return "Success!";
    if (progress < 30) return "Detecting Document...";
    if (progress < 70) return "Enhancing Text...";
    return "Extracting Criteria...";
  };

  const renderCourseCreation = () => (
    <PageWrapper headerTitle="New Course" headerSubtitle="Google Classroom" onBack={() => setPhase(AppPhase.DASHBOARD)} isOnline={isOnline} isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} syncStatus={syncStatus}>
       <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
       <form onSubmit={handleCreateCourseLocal} className="flex flex-col gap-4 max-w-sm mx-auto w-full pt-10 pb-8">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-xl flex items-center justify-center mx-auto shadow-sm mb-4">
              <BookOpen className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white drop-shadow-sm">Create Course</h2>
          </div>
          {creationError && <div className="p-3 bg-red-500/10 border border-red-500/50 rounded-xl text-red-500 text-xs font-bold w-full text-center">{creationError}</div>}
          <input value={newCourseName} onChange={e => setNewCourseName(e.target.value)} placeholder="Course Name (e.g., Biology 101)" className="w-full p-4 bg-white/60 dark:bg-slate-800/60 backdrop-blur-xl border border-slate-200 dark:border-slate-700 rounded-xl text-[16px] font-bold outline-none shadow-sm" required />
          <button type="submit" disabled={isCreatingCourse} className="w-full py-4 mt-4 bg-indigo-600 text-white rounded-xl font-black uppercase tracking-widest text-[16px] shadow-sm flex items-center justify-center gap-2">
            {isCreatingCourse ? <Loader2 className="animate-spin w-5 h-5" /> : 'Create Course'}
          </button>
       </form>
       </div>
    </PageWrapper>
  );

  const renderAssignmentCreation = () => (
    <PageWrapper headerTitle="New Assignment" headerSubtitle={creationCourse?.name} onBack={() => setPhase(AppPhase.ASSIGNMENT_SELECT)} isOnline={isOnline} isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} syncStatus={syncStatus}>
       <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
       <form onSubmit={handleCreateAssignment} className="flex flex-col gap-4 max-w-sm mx-auto w-full pt-10 pb-8">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-xl flex items-center justify-center mx-auto shadow-sm mb-4">
              <Layers className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white drop-shadow-sm">Create Assignment</h2>
          </div>
          {creationError && <div className="p-3 bg-red-500/10 border border-red-500/50 rounded-xl text-red-500 text-xs font-bold w-full text-center">{creationError}</div>}
          <input value={newAsnTitle} onChange={e => setNewAsnTitle(e.target.value)} placeholder="Assignment Title" className="w-full p-4 bg-white/60 dark:bg-slate-800/60 backdrop-blur-xl border border-slate-200 dark:border-slate-700 rounded-xl text-[16px] font-bold outline-none shadow-sm" required />
          <textarea value={newAsnDesc} onChange={e => setNewAsnDesc(e.target.value)} placeholder="Description or Rubric details..." className="w-full p-4 bg-white/60 dark:bg-slate-800/60 backdrop-blur-xl border border-slate-200 dark:border-slate-700 rounded-xl text-[16px] font-bold outline-none shadow-sm resize-none" rows={3} />
          <input type="number" value={newAsnMaxScore} onChange={e => setNewAsnMaxScore(Number(e.target.value))} placeholder="Max Score (e.g., 100)" className="w-full p-4 bg-white/60 dark:bg-slate-800/60 backdrop-blur-xl border border-slate-200 dark:border-slate-700 rounded-xl text-[16px] font-bold outline-none shadow-sm" required />
          <button type="submit" disabled={isCreatingAssignment} className="w-full py-4 mt-4 bg-emerald-500 text-white rounded-xl font-black uppercase tracking-widest text-[16px] shadow-sm flex items-center justify-center gap-2">
            {isCreatingAssignment ? <Loader2 className="animate-spin w-5 h-5" /> : 'Create Assignment'}
          </button>
       </form>
       </div>
    </PageWrapper>
  );

  const renderRubricSetup = () => {
    return (
      <PageWrapper 
        headerTitle="Scan Rubric" 
        headerSubtitle={selectedAssignment?.title || "Criteria Setup"} 
        onBack={() => setPhase(AppPhase.ASSIGNMENT_SELECT)} 
        isOnline={isOnline}
        isDarkMode={isDarkMode}
        setIsDarkMode={setIsDarkMode}
        syncStatus={syncStatus}
      >
        <div className="flex-1 min-h-0 flex flex-col gap-4 overflow-hidden">
          {rubricSuccess && (
            <div className="p-3 bg-emerald-500/10 backdrop-blur-xl border border-emerald-500/30 rounded-xl flex items-center gap-3 text-emerald-600 dark:text-emerald-400 font-bold text-[10px] tracking-widest uppercase animate-in slide-in-from-top shrink-0 shadow-sm">
              <CheckCircle className="w-4 h-4" /> <span>Rubric Captured Successfully</span>
            </div>
          )}

          <div className="flex-1 min-h-0 bg-white/70 dark:bg-slate-800/70 backdrop-blur-xl rounded-3xl border border-white/60 dark:border-slate-700 overflow-hidden flex flex-col shadow-sm">
            {!isScanningRubric ? (
              <div className="flex-1 p-6 flex flex-col overflow-hidden">
                <div className="flex justify-between items-center mb-3 shrink-0">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2">
                    <FileText className="w-3 h-3" /> Custom Criteria
                  </h3>
                  <div className="flex gap-2">
                    <button onClick={handleGenerateRubric} disabled={isGeneratingRubric} className="px-3 py-1.5 bg-indigo-50 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-indigo-100 transition-colors disabled:opacity-50 flex items-center gap-1">
                      {isGeneratingRubric ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                      Auto-Generate
                    </button>
                    <button onClick={handleScanPaperRubric} className="px-3 py-1.5 bg-emerald-50 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-emerald-100 transition-colors flex items-center gap-1">
                      <Camera className="w-3 h-3" /> Scan Paper
                    </button>
                  </div>
                </div>
                <div className="relative flex-1 min-h-0">
                  <textarea 
                    value={customRubric} 
                    onChange={(e) => setCustomRubric(e.target.value)} 
                    placeholder="Paste your rubric, tap 'Auto-Generate' to build from the assignment details, or 'Scan Paper' to use your camera..." 
                className="w-full h-full p-4 pr-10 bg-white/50 dark:bg-slate-900/50 backdrop-blur-md border border-slate-200 dark:border-slate-700 rounded-xl resize-none outline-none focus:border-indigo-400 text-[16px] italic shadow-inner custom-scrollbar" 
                  />
                  <VoiceInputButton onResult={(text) => setCustomRubric(prev => prev + (prev ? '\n' : '') + text)} className="absolute right-3 top-3 p-1.5" />
                </div>
              </div>
            ) : (
              <div className="flex-1 relative bg-black flex flex-col overflow-hidden animate-in zoom-in-[0.98] duration-300">
                <style>{`
                  @keyframes scanSweep {
                    0% { top: 0%; opacity: 0; }
                    10% { opacity: 1; }
                    90% { opacity: 1; }
                    100% { top: 98%; opacity: 0; }
                  }
                  .animate-scan-sweep {
                    position: absolute;
                    width: 100%;
                    height: 3px;
                    background: #4ade80; 
                    box-shadow: 0 0 15px 3px rgba(52, 211, 153, 0.6);
                    animation: scanSweep 2s linear infinite;
                    z-index: 20;
                  }
                `}</style>

                {cameraError ? (
                  <div className="flex-1 flex items-center justify-center p-6 text-center">
                    <div className="bg-red-500/20 text-red-400 p-4 rounded-xl border border-red-500/50 flex flex-col items-center">
                      <AlertCircle className="w-8 h-8 mb-2" />
                      <p className="font-bold text-[16px]">{cameraError}</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <video ref={videoRef} autoPlay playsInline muted className={`absolute inset-0 w-full h-full object-cover transition-all duration-500 ${isProcessing ? 'opacity-20 blur-md scale-105' : 'opacity-90'}`} />
                    <canvas ref={canvasRef} className="hidden" />
                    
                    {/* ASPECT RATIO BOUNDING BOX FOR RUBRIC SCAN */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none p-6 pb-24 z-10">
                      <div className={`relative w-full max-w-sm aspect-[3/4] border-2 transition-colors duration-500 rounded-xl ${isProcessing ? 'border-emerald-500/30' : 'border-white/10'}`}>
                         <div className={`absolute top-0 left-0 w-10 h-10 border-t-4 border-l-4 rounded-tl-2xl transition-colors duration-300 ${isProcessing ? 'border-emerald-500' : 'border-indigo-500'}`} />
                         <div className={`absolute top-0 right-0 w-10 h-10 border-t-4 border-r-4 rounded-tr-2xl transition-colors duration-300 ${isProcessing ? 'border-emerald-500' : 'border-indigo-500'}`} />
                         <div className={`absolute bottom-0 left-0 w-10 h-10 border-b-4 border-l-4 rounded-bl-2xl transition-colors duration-300 ${isProcessing ? 'border-emerald-500' : 'border-indigo-500'}`} />
                         <div className={`absolute bottom-0 right-0 w-10 h-10 border-b-4 border-r-4 rounded-br-2xl transition-colors duration-300 ${isProcessing ? 'border-emerald-500' : 'border-indigo-500'}`} />
                         
                         {!isProcessing && <div className="animate-scan-sweep" />}
                      </div>
                    </div>

                    <div className="absolute inset-0 z-30 flex flex-col items-center justify-between p-6 pb-8 pointer-events-none">
                       <div className="mt-4 px-5 py-2 bg-black/60 backdrop-blur-md rounded-full border border-white/10 shadow-lg pointer-events-auto">
                          <span className="text-[10px] font-black uppercase tracking-widest text-white">
                             {isProcessing ? "Processing Document..." : "Align Rubric & Tap Capture"}
                          </span>
                       </div>

                       {rubricScanError && (
                         <div className="mt-4 px-4 py-3 bg-rose-500/90 backdrop-blur-md border border-rose-400 rounded-xl text-white text-[11px] font-bold text-center shadow-lg animate-in slide-in-from-top fade-in pointer-events-auto">
                           {rubricScanError}
                         </div>
                       )}

                       {isProcessing && (
                         <div className="flex flex-col items-center justify-center animate-in zoom-in duration-300 mb-10 pointer-events-auto">
                             <div className="relative w-32 h-32 flex items-center justify-center bg-black/40 rounded-full shadow-[0_0_30px_rgba(16,185,129,0.2)] backdrop-blur-md">
                                <svg className="w-full h-full transform -rotate-90">
                                  <circle cx="64" cy="64" r="56" className="stroke-slate-800" strokeWidth="8" fill="none" />
                                  <circle 
                                    cx="64" cy="64" r="56" 
                                    className="stroke-emerald-400 transition-all duration-[50ms] ease-linear" 
                                    strokeWidth="8" strokeLinecap="round" fill="none" 
                                    strokeDasharray="351.8" strokeDashoffset={351.8 - (351.8 * rubricScanProgress) / 100} 
                                  />
                                </svg>
                                <div className="absolute flex flex-col items-center">
                                   <span className="text-white font-black text-3xl">{rubricScanProgress}<span className="text-sm text-emerald-400">%</span></span>
                                </div>
                             </div>
                             <div className="mt-6 px-6 py-3 bg-black/70 backdrop-blur-xl rounded-xl border border-emerald-500/30 flex items-center gap-3 shadow-lg">
                                {rubricScanProgress < 100 ? <Loader2 className="w-4 h-4 animate-spin text-emerald-400" /> : <CheckCircle className="w-4 h-4 text-emerald-400" />}
                                <span className="text-[11px] font-black uppercase tracking-widest text-emerald-400">
                                   {getScanStatusText(rubricScanProgress)}
                                </span>
                             </div>
                         </div>
                       )}

                       <div className="flex flex-col items-center gap-6 mt-auto pointer-events-auto">
                         {!isProcessing && (
                           <button onClick={handleRubricSnap} className="w-20 h-20 rounded-full border-[4px] border-emerald-400 bg-emerald-500/20 active:scale-90 flex items-center justify-center transition-all shadow-[0_0_30px_rgba(52,211,153,0.3)] backdrop-blur-md">
                             <Camera className="w-8 h-8 text-emerald-400" />
                           </button>
                         )}
                         <button onClick={() => setIsScanningRubric(false)} className="px-8 py-3 bg-white/10 hover:bg-white/20 text-white backdrop-blur-md rounded-xl font-black uppercase text-[10px] tracking-widest border border-white/20 active:scale-95 transition-all">
                           Cancel Scan
                         </button>
                       </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          <button 
            onClick={() => setPhase(AppPhase.MODE_SELECTION)} 
            disabled={!customRubric.trim()} 
            className={`w-full py-4 rounded-xl font-black text-[16px] tracking-[0.1em] uppercase shadow-sm transition-all shrink-0 ${customRubric.trim() ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:-translate-y-0.5 active:scale-[0.98]' : 'bg-slate-200/50 dark:bg-slate-800/50 text-slate-400 cursor-not-allowed border border-white/50 dark:border-slate-700'}`}
          >
            Scan Student Work
          </button>
        </div>
      </PageWrapper>
    );
  };

  const renderModeSelection = () => (
    <PageWrapper headerTitle="Scan Student Work" headerSubtitle={educatorName} onBack={() => setPhase(AppPhase.RUBRIC_SETUP)} isOnline={isOnline} isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} syncStatus={syncStatus}>
      <div className="flex flex-col gap-4 max-w-sm mx-auto w-full pt-10 pb-6">
        <div className="flex flex-col gap-3">
          <div className="text-slate-500 text-[10px] font-black uppercase tracking-widest">Choose scan attribution</div>

          <div className="flex flex-col gap-3">
            <button
              onClick={() => {
                setScanStudentMode('single');
                setBatchSelectedStudentIds(new Set());
              }}
              className={`p-5 bg-white/70 dark:bg-slate-800/70 backdrop-blur-xl border rounded-xl flex items-center justify-between shadow-sm transition-all ${
                scanStudentMode === 'single'
                  ? 'border-emerald-400 hover:border-emerald-400'
                  : 'border-slate-200 dark:border-slate-700 hover:border-emerald-400/60'
              }`}
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-emerald-500 rounded-xl flex items-center justify-center text-white">
                  <Camera className="w-6 h-6" />
                </div>
                <div className="text-left">
                  <h3 className="text-base font-black text-slate-800 dark:text-slate-100">One student at a time</h3>
                  <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mt-1">Match each scan to a student</p>
                </div>
              </div>
              <div className={`w-6 h-6 rounded-full border ${scanStudentMode === 'single' ? 'border-emerald-400 bg-emerald-500' : 'border-slate-300 dark:border-slate-600'} flex items-center justify-center`}>
                {scanStudentMode === 'single' && <Check className="w-4 h-4 text-white" />}
              </div>
            </button>

            <button
              onClick={() => setScanStudentMode('batch')}
              className={`p-5 bg-white/70 dark:bg-slate-800/70 backdrop-blur-xl border rounded-xl flex items-center justify-between shadow-sm transition-all ${
                scanStudentMode === 'batch'
                  ? 'border-indigo-400 hover:border-indigo-400'
                  : 'border-slate-200 dark:border-slate-700 hover:border-indigo-400/60'
              }`}
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center text-white">
                  <FileText className="w-6 h-6" />
                </div>
                <div className="text-left">
                  <h3 className="text-base font-black text-slate-800 dark:text-slate-100">Batch scan multiple students</h3>
                  <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mt-1">Select students once, then scan in order</p>
                </div>
              </div>
              <div className={`w-6 h-6 rounded-full border ${scanStudentMode === 'batch' ? 'border-indigo-400 bg-indigo-600' : 'border-slate-300 dark:border-slate-600'} flex items-center justify-center`}>
                {scanStudentMode === 'batch' && <Check className="w-4 h-4 text-white" />}
              </div>
            </button>
          </div>

          {scanStudentMode === 'batch' && (
            <div className="p-4 rounded-xl bg-white/50 dark:bg-slate-800/40 backdrop-blur-xl border border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-sm font-black text-slate-800 dark:text-slate-100">Students in this batch</div>
                  <div className="text-slate-500 text-[10px] font-black uppercase tracking-widest mt-1">
                    {batchSelectedStudentIds.size} selected
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setBatchSelectedStudentIds(new Set(students.map(s => s.id)))}
                    className="px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-200 text-[10px] font-black uppercase tracking-widest border border-indigo-200/60"
                    disabled={students.length === 0}
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    onClick={() => setBatchSelectedStudentIds(new Set())}
                    className="px-3 py-1.5 rounded-lg bg-white/60 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 text-[10px] font-black uppercase tracking-widest border border-slate-200/70"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="max-h-44 overflow-y-auto pr-1 custom-scrollbar space-y-1">
                {students.map(s => {
                  const checked = batchSelectedStudentIds.has(s.id);
                  return (
                    <label
                      key={s.id}
                      className={`flex items-center justify-between gap-3 p-2 rounded-lg border transition-colors ${
                        checked
                          ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-300/70'
                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <span className="text-[13px] font-bold text-slate-800 dark:text-slate-100 truncate">{s.name}</span>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          setBatchSelectedStudentIds(prev => {
                            const next = new Set(prev);
                            if (next.has(s.id)) next.delete(s.id);
                            else next.add(s.id);
                            return next;
                          });
                        }}
                      />
                    </label>
                  );
                })}
                {students.length === 0 && (
                  <div className="text-slate-500 text-[12px] font-bold">No students loaded.</div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3 mt-2">
          <button
            onClick={() => startGrading(GradingMode.SINGLE_PAGE)}
            disabled={scanStudentMode === 'batch' && batchSelectedStudentIds.size === 0}
            className={`p-5 bg-white/70 dark:bg-slate-800/70 backdrop-blur-xl border rounded-xl flex items-center justify-between shadow-sm transition-all ${
              scanStudentMode === 'batch' && batchSelectedStudentIds.size === 0
                ? 'border-slate-200/70 text-slate-400 cursor-not-allowed'
                : 'border-slate-200 dark:border-slate-700 hover:border-emerald-400'
            }`}
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-emerald-500 rounded-xl flex items-center justify-center text-white">
                <Camera className="w-6 h-6" />
              </div>
              <div className="text-left">
                <h3 className="text-base font-black text-slate-800 dark:text-slate-100">Single Page Mode</h3>
                <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mt-1">One scan = one student</p>
              </div>
            </div>
          </button>

          <button
            onClick={() => startGrading(GradingMode.MULTI_PAGE)}
            disabled={scanStudentMode === 'batch' && batchSelectedStudentIds.size === 0}
            className={`p-5 bg-white/70 dark:bg-slate-800/70 backdrop-blur-xl border rounded-xl flex items-center justify-between shadow-sm transition-all ${
              scanStudentMode === 'batch' && batchSelectedStudentIds.size === 0
                ? 'border-slate-200/70 text-slate-400 cursor-not-allowed'
                : 'border-slate-200 dark:border-slate-700 hover:border-indigo-400'
            }`}
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center text-white">
                <FileText className="w-6 h-6" />
              </div>
              <div className="text-left">
                <h3 className="text-base font-black text-slate-800 dark:text-slate-100">Multi Page Mode</h3>
                <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mt-1">Capture multiple pages per student</p>
              </div>
            </div>
          </button>
        </div>
      </div>
    </PageWrapper>
  );

  const renderGradingLoop = () => {
    // Dynamic derived states for the Review & Match modal
    const selectedStudentId = selectedQuickPickIds.size > 0 ? Array.from(selectedQuickPickIds)[0] : null;
    const selectedStudentObj = students.find(s => s.id === selectedStudentId);
    const displayStudentName = selectedStudentObj ? selectedStudentObj.name : (pendingWork?.studentName || "Unknown Student");

    return (
      <PageWrapper headerTitle={gradingMode === GradingMode.MULTI_PAGE ? 'Multi Page Mode' : 'Single Page Mode'} onBack={() => setPhase(AppPhase.MODE_SELECTION)} isOnline={isOnline} isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode}>
        <div className="flex-1 relative bg-black rounded-3xl overflow-hidden shadow-2xl border border-white/20 flex flex-col">
            <style>{`
              @keyframes scanSweepVertical {
                0% { top: 0%; opacity: 0; }
                10% { opacity: 1; }
                90% { opacity: 1; }
                100% { top: 100%; opacity: 0; }
              }
              .animate-scan-sweep-vertical {
                animation: scanSweepVertical 3s ease-in-out infinite alternate;
              }
            `}</style>

            <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover" />
            <canvas ref={canvasRef} className="hidden" />
            
            {/* ASPECT RATIO BOUNDING BOX (Matches Letter 8.5x11 and A4 perfectly on mobile) */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none p-6 pb-24">
              <div className={`relative w-full max-w-sm aspect-[3/4] border-[3px] border-dashed transition-all duration-500 rounded-3xl z-10 flex flex-col items-center justify-center overflow-hidden pointer-events-none ${isProcessing ? 'border-emerald-400 bg-emerald-400/20' : 'border-white/60 bg-black/10'}`}>
                 {!isProcessing && (
                     <div className="absolute left-0 w-full h-1 bg-emerald-400 shadow-[0_0_20px_4px_rgba(52,211,153,0.8)] animate-scan-sweep-vertical" />
                 )}
                 <span className="bg-black/70 text-white font-black uppercase tracking-widest text-[10px] px-5 py-2.5 rounded-full backdrop-blur-md shadow-lg">
                     {isProcessing ? "Processing..." : "Align document within frame"}
                 </span>

                 {gradingMode === GradingMode.MULTI_PAGE && (
                   <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2">
                     <div className="px-3 py-1.5 rounded-full bg-black/70 backdrop-blur-md border border-white/20 text-white text-[9px] font-black uppercase tracking-widest">
                       Multi‑page · {multiPageCapture.croppedDataUrls.length} page{multiPageCapture.croppedDataUrls.length === 1 ? '' : 's'}
                     </div>
                     {multiPageHint && (
                       <div className="px-3 py-1.5 rounded-full bg-black/70 backdrop-blur-md border border-white/20 text-white text-[9px] font-semibold truncate">
                         {multiPageHint}
                       </div>
                     )}
                   </div>
                 )}
              </div>
            </div>

            <div className="absolute top-4 left-4 z-40 flex flex-col gap-2 pointer-events-auto">
              <div className="px-3 py-1.5 rounded-full bg-black/70 backdrop-blur-md border border-white/20 text-white text-[9px] font-black uppercase tracking-widest">
                Health · {Math.max(0, Math.min(100, Math.round(scanHealth)))}%
              </div>
              {(scanQueueCount > 0 || scanReviewQueueCount > 0) && (
                <div className="flex items-center gap-2">
                  {scanQueueCount > 0 && (
                    <div className="px-3 py-1.5 rounded-full bg-black/70 backdrop-blur-md border border-white/20 text-white text-[9px] font-black uppercase tracking-widest">
                      Queue · {scanQueueCount}
                    </div>
                  )}
                  {scanReviewQueueCount > 0 && (
                    <button
                      type="button"
                      onClick={openNextQueuedReview}
                      className="px-3 py-1.5 rounded-full bg-emerald-500/25 hover:bg-emerald-500/35 backdrop-blur-md border border-emerald-400/40 text-emerald-100 text-[9px] font-black uppercase tracking-widest transition-all"
                      title="Review next graded scan"
                    >
                      Review · {scanReviewQueueCount}
                    </button>
                  )}
                </div>
              )}
              {scanQueueHint && (
                <div className="px-3 py-2 rounded-xl bg-black/70 backdrop-blur-md border border-white/20 text-white text-[10px] font-semibold shadow-lg max-w-[220px]">
                  {scanQueueHint}
                </div>
              )}
              {!isOnline && scanQueueCount > 0 && (
                <div className="px-3 py-2 rounded-xl bg-amber-500/20 backdrop-blur-md border border-amber-400/30 text-amber-100 text-[10px] font-semibold shadow-lg max-w-[220px]">
                  Offline — queued scans will grade when you’re back online (keep app open).
                </div>
              )}
            </div>

            <div className="relative z-40 flex items-center justify-center gap-6 mb-6 mt-auto pb-4">
              <div className="bg-black/50 backdrop-blur-xl p-2 rounded-full flex gap-3 items-center shadow-lg border border-white/20">
                 <button onClick={toggleFlash} className={`p-4 rounded-full border-2 transition-all ${isFlashOn ? 'bg-yellow-400 text-black border-transparent shadow-[0_0_20px_rgba(250,204,21,0.6)]' : 'bg-white/10 text-white border-white/30 hover:bg-white/20'}`} title="Toggle Flash">
                   <Zap className="w-6 h-6" />
                 </button>

                 {gradingMode === GradingMode.SINGLE_PAGE && (
                   <button
                     type="button"
                     onClick={() => void handleManualCaptureSinglePage()}
                     className="w-16 h-16 rounded-full border-[4px] border-emerald-400 bg-emerald-500/20 hover:bg-emerald-500/30 active:scale-95 flex items-center justify-center transition-all shadow-[0_0_30px_rgba(52,211,153,0.25)] backdrop-blur-md"
                     title="Capture now"
                   >
                     <Camera className="w-7 h-7 text-emerald-200" />
                   </button>
                 )}

                 {gradingMode === GradingMode.MULTI_PAGE && (
                   <>
                     <button
                       type="button"
                       onClick={() => setMultiPageCapture({ croppedDataUrls: [], apiBase64s: [], detectedStudentName: undefined })}
                       className="px-4 py-3 rounded-full bg-white/10 text-white border-2 border-white/30 hover:bg-white/20 transition-all text-[10px] font-black uppercase tracking-widest"
                       title="Reset captured pages"
                     >
                       Reset
                     </button>
                     <button
                       type="button"
                       disabled={multiPageCapture.apiBase64s.length === 0 || isProcessing}
                       onClick={() => void finalizeMultiPage()}
                       className={`px-4 py-3 rounded-full border-2 transition-all text-[10px] font-black uppercase tracking-widest ${
                         multiPageCapture.apiBase64s.length === 0 || isProcessing
                           ? 'bg-white/5 text-white/40 border-white/10'
                           : 'bg-emerald-500/20 text-emerald-200 border-emerald-400/60 hover:bg-emerald-500/30'
                       }`}
                       title="Finish scanning pages and grade"
                     >
                       Finish & Grade
                     </button>
                   </>
                 )}
              </div>
            </div>

            {showQuickPick && pendingWork && (
               <div className="absolute inset-0 z-50 bg-slate-900/95 backdrop-blur-2xl flex flex-col p-4 animate-in fade-in zoom-in duration-300">
                 <div className="flex-1 w-full max-w-md mx-auto bg-white dark:bg-slate-900 rounded-3xl p-5 shadow-2xl border border-slate-200 dark:border-slate-700 flex flex-col overflow-hidden">
                   
                   <h3 className="font-black text-slate-800 dark:text-slate-100 text-center mb-4 text-[16px] uppercase tracking-widest border-b border-slate-100 dark:border-slate-700 pb-4">
                     Review & Match
                   </h3>

                   {/* 1st Line: Student Name & Score */}
                   <div className="flex gap-4 mb-4 shrink-0 h-20">
                     <div className="flex flex-col flex-1">
                       <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1 text-center w-full block">Student</label>
                       <div className="flex-1 flex items-center justify-center bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-500/30 rounded-xl px-4 shadow-inner overflow-hidden">
                         <span className="text-emerald-600 dark:text-emerald-400 font-black text-lg text-center leading-tight truncate w-full">
                           {displayStudentName}
                         </span>
                       </div>
                     </div>
                     <div className="flex flex-col w-28 shrink-0">
                       <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1 text-center w-full block">Score</label>
                       <input 
                         type="number" 
                         value={manualScore} 
                         onChange={e => setManualScore(e.target.value)} 
                         className="flex-1 w-full text-center font-black text-3xl text-indigo-600 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl outline-none border border-indigo-100 dark:border-indigo-500/30 shadow-inner" 
                       />
                     </div>
                   </div>

                   {/* 2nd Line: Feedback (Larger & Scrollable) + Voice Button */}
                   <div className="flex flex-col mb-4 shrink-0">
                     <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1 text-center w-full block">Feedback</label>
                     <div className="relative">
                       <textarea 
                         value={manualFeedback} 
                         onChange={e => setManualFeedback(e.target.value)} 
                         rows={5} 
                         className="w-full p-4 pr-14 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none resize-none text-[16px] text-slate-700 dark:text-slate-300 overflow-y-auto custom-scrollbar shadow-inner" 
                         placeholder="Add or review feedback..." 
                       />
                       <VoiceInputButton 
                         onResult={(text) => setManualFeedback(prev => prev + (prev ? ' ' : '') + text)} 
                         className="absolute bottom-3 right-3 bg-white dark:bg-slate-700 shadow-md border-slate-200 dark:border-slate-600" 
                       />
                     </div>
                   </div>

                   {/* Student List */}
                   <div className="flex flex-col flex-1 min-h-0">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 text-center w-full block">
                        Select Student to Match
                      </label>
                      <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-2 space-y-1 shadow-inner">
                        {/* Dynamic Listing: Matches are always pushed to the top */}
                        {(scanStudentMode === 'batch' && batchSelectedStudentIds.size > 0
                          ? students.filter(s => batchSelectedStudentIds.has(s.id))
                          : students
                        ).sort((a, b) => {
                             if (!pendingWork.studentName) return 0;
                             const lowerDetected = pendingWork.studentName.toLowerCase().replace(/[^a-z]/g, '');
                             if (lowerDetected.length <= 2) return 0;
                             const aName = a.name.toLowerCase().replace(/[^a-z]/g, '');
                             const bName = b.name.toLowerCase().replace(/[^a-z]/g, '');
                             const aMatch = aName.includes(lowerDetected) || lowerDetected.includes(aName);
                             const bMatch = bName.includes(lowerDetected) || lowerDetected.includes(bName);
                             if (aMatch && !bMatch) return -1;
                             if (!aMatch && bMatch) return 1;
                             return a.name.localeCompare(b.name);
                        }).map(student => (
                           <div 
                             key={student.id} 
                             onClick={() => setSelectedQuickPickIds(new Set([student.id]))}
                             className={`p-3 rounded-xl flex items-center justify-between cursor-pointer transition-all border ${selectedQuickPickIds.has(student.id) ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-400 dark:border-indigo-500 shadow-sm' : 'bg-white dark:bg-slate-800 border-transparent hover:border-slate-300 dark:hover:border-slate-600'}`}
                           >
                             <span className={`font-bold text-[16px] ${selectedQuickPickIds.has(student.id) ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-700 dark:text-slate-300'}`}>
                               {student.name}
                             </span>
                             <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${selectedQuickPickIds.has(student.id) ? 'border-indigo-500 bg-indigo-500' : 'border-slate-300 dark:border-slate-600'}`}>
                                {selectedQuickPickIds.has(student.id) && <Check className="w-3 h-3 text-white" />}
                             </div>
                           </div>
                         ))}
                      </div>
                   </div>

                   <div className="flex gap-3 mt-4 shrink-0">
                     <button onClick={() => { setShowQuickPick(false); setPendingWork(null); }} className="flex-1 py-4 bg-slate-100 dark:bg-slate-800 rounded-xl font-black text-slate-600 dark:text-slate-300 uppercase text-[11px] tracking-widest hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors shadow-sm">Cancel</button>
                     <button onClick={confirmQuickPickStudents} disabled={selectedQuickPickIds.size === 0} className="flex-1 py-4 bg-emerald-500 text-white rounded-xl font-black uppercase text-[11px] tracking-widest disabled:opacity-50 hover:bg-emerald-600 transition-colors shadow-md">Done</button>
                   </div>

                 </div>
               </div>
            )}
         </div>
         
         {gradedWorks.length > 0 && (
           <button onClick={() => setPhase(AppPhase.AUDIT)} className="mt-4 w-full py-4 bg-indigo-600 text-white rounded-xl font-black uppercase tracking-widest text-[16px] shadow-sm hover:-translate-y-0.5 transition-all">
             Review {gradedWorks.length} Scans <ArrowRight className="inline ml-2 w-4 h-4" />
           </button>
         )}
      </PageWrapper>
    );
  };

  const renderAudit = () => (
    <PageWrapper headerTitle="Review Grades" headerSubtitle={`${gradedWorks.length} pending`} onBack={() => setPhase(AppPhase.GRADING_LOOP)} isOnline={isOnline} isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} syncStatus={syncStatus}>
      <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-4">
        <div className="sticky top-0 z-20 bg-white/70 dark:bg-slate-800/70 backdrop-blur-md border border-slate-200 dark:border-slate-700 rounded-xl p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-slate-500 text-[10px] font-black uppercase tracking-widest">Bulk review</div>
              <div className="font-black text-slate-800 dark:text-slate-100 text-[14px] mt-1">
                {auditSelectedIndexes.size > 0 ? `${auditSelectedIndexes.size} selected` : 'All pending are editable'}
              </div>
            </div>

            <div className="flex flex-col items-end gap-2 shrink-0">
              <label className="flex items-center gap-2 select-none cursor-pointer">
                <input
                  type="checkbox"
                  checked={auditEditSelectedOnly}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    if (checked && auditSelectedIndexes.size === 0) {
                      setAuditSelectedIndexes(new Set(gradedWorks.map((_, i) => i)));
                    }
                    setAuditEditSelectedOnly(checked);
                  }}
                />
                <span className="text-[12px] font-bold text-slate-700 dark:text-slate-200">Edit selected only</span>
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setAuditSelectedIndexes(new Set(gradedWorks.map((_, i) => i)))}
                  disabled={gradedWorks.length === 0}
                  className="px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-200 text-[10px] font-black uppercase tracking-widest border border-indigo-200/60 disabled:opacity-50"
                >
                  Select all
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuditSelectedIndexes(new Set());
                    setAuditEditSelectedOnly(false);
                  }}
                  disabled={gradedWorks.length === 0}
                  className="px-3 py-1.5 rounded-lg bg-white/60 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 text-[10px] font-black uppercase tracking-widest border border-slate-200/70 disabled:opacity-50"
                >
                  Clear
                </button>
              </div>
            </div>
          </div>

          <div className="flex gap-2 mt-4">
            <button
              type="button"
              onClick={() => {
                if (auditSelectedIndexes.size === 0) return;
                setGradedWorks(prev => prev.filter((_, i) => !auditSelectedIndexes.has(i)));
                setAuditSelectedIndexes(new Set());
                setAuditEditSelectedOnly(false);
              }}
              disabled={auditSelectedIndexes.size === 0}
              className="flex-1 py-2.5 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-xl font-bold text-[11px] uppercase tracking-widest hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors flex items-center justify-center gap-1.5 border border-red-200/50 dark:border-red-500/20 disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete selected
            </button>
            <button
              type="button"
              onClick={() => {
                if (auditSelectedIndexes.size === 0) return;
                setGradedWorks(prev =>
                  prev.map((w, i) => (auditSelectedIndexes.has(i) ? { ...w, status: 'draft' as const } : w))
                );
              }}
              disabled={auditSelectedIndexes.size === 0}
              className="flex-1 py-2.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-xl font-bold text-[11px] uppercase tracking-widest hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors flex items-center justify-center gap-1.5 border border-indigo-200/50 dark:border-indigo-500/20 disabled:opacity-50"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Mark as draft
            </button>
          </div>
        </div>

        {gradedWorks.map((work, idx) => {
          const isSelected = auditSelectedIndexes.has(idx);
          const editAllowed = !auditEditSelectedOnly || isSelected;
          return (
            <div key={idx} className="bg-white/70 dark:bg-slate-800/70 p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col">
              <div className="flex justify-between items-center mb-3 gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setAuditSelectedIndexes(prev => {
                        const next = new Set(prev);
                        if (checked) next.add(idx);
                        else next.delete(idx);
                        return next;
                      });
                    }}
                  />
                  <h4 className="font-black text-slate-800 dark:text-slate-100 truncate pr-2">
                    {work.studentName}
                  </h4>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <input
                    type="number"
                    value={work.score}
                    disabled={!editAllowed}
                    onChange={(e) => {
                      if (!editAllowed) return;
                      const w = [...gradedWorks];
                      w[idx].score = parseFloat(e.target.value) || 0;
                      setGradedWorks(w);
                    }}
                    className={`w-12 bg-transparent text-right font-black text-indigo-600 outline-none text-[16px] ${editAllowed ? '' : 'opacity-50 cursor-not-allowed'}`}
                  />
                  <span className="text-slate-400 font-bold text-[16px]">/{work.maxScore}</span>
                </div>
              </div>

              <textarea
                value={work.feedback}
                disabled={!editAllowed}
                onChange={(e) => {
                  if (!editAllowed) return;
                  const w = [...gradedWorks];
                  w[idx].feedback = e.target.value;
                  setGradedWorks(w);
                }}
                className={`w-full bg-slate-50 dark:bg-slate-900 rounded-xl p-3 text-[16px] border border-slate-200 dark:border-slate-700 outline-none resize-none mb-3 ${editAllowed ? '' : 'opacity-60 cursor-not-allowed'}`}
                rows={2}
              />

              <div className="flex gap-2 mt-auto">
                <button onClick={() => handleRescan(idx)} className="flex-1 py-2.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-xl font-bold text-[11px] uppercase tracking-widest hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors flex items-center justify-center gap-1.5 border border-indigo-200/50 dark:border-indigo-500/20">
                   <RefreshCw className="w-3.5 h-3.5" /> Rescan
                </button>
                <button onClick={() => handleDeleteScan(idx)} className="flex-1 py-2.5 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-xl font-bold text-[11px] uppercase tracking-widest hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors flex items-center justify-center gap-1.5 border border-red-200/50 dark:border-red-500/20">
                   <Trash2 className="w-3.5 h-3.5" /> Delete
                </button>
              </div>
            </div>
          );
        })}

        {gradedWorks.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 mt-10">
            <Layers className="w-12 h-12 mb-3 opacity-50" />
            <p className="font-bold text-[16px]">No scans pending.</p>
          </div>
        )}
      </div>

      <button
        onClick={() => {
          const idxs = auditSelectedIndexes.size > 0 ? Array.from(auditSelectedIndexes) : undefined;
          setAuditSelectedIndexes(new Set());
          setAuditEditSelectedOnly(false);
          void startSyncProcess(idxs);
        }}
        disabled={gradedWorks.length === 0}
        className="w-full mt-4 py-4 bg-emerald-500 text-white rounded-xl font-black uppercase tracking-widest text-[16px] shadow-sm hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:hover:translate-y-0"
      >
         {auditSelectedIndexes.size > 0 ? `Sync selected (${auditSelectedIndexes.size})` : `Sync all (${gradedWorks.length})`} <CloudUpload className="inline ml-2 w-4 h-4" />
      </button>
    </PageWrapper>
  );

  const renderSyncing = () => (
    <PageWrapper isOnline={isOnline} isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} syncStatus={syncStatus}>
       <div className="flex-1 min-h-0 flex flex-col items-center justify-center">
          <Loader2 className="w-12 h-12 text-indigo-500 animate-spin mb-6" />
          <h2 className="text-xl font-black text-slate-800 dark:text-slate-100 mb-2">Syncing Data</h2>
          <p className="text-[16px] font-bold text-slate-500 uppercase tracking-widest">{syncProgress.message}</p>
          <div className="w-full max-w-xs h-2 bg-slate-200 dark:bg-slate-700 rounded-full mt-6 overflow-hidden">
             <div className="h-full bg-indigo-500 transition-all duration-300" style={{ width: `${(syncProgress.current / Math.max(1, syncProgress.total)) * 100}%` }} />
          </div>
       </div>
    </PageWrapper>
  );

  const renderFinale = () => (
    <PageWrapper isOnline={isOnline} isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} syncStatus={syncStatus}>
       <div className="flex-1 min-h-0 flex flex-col items-center justify-center text-center">
          <div className="w-20 h-20 bg-emerald-500 rounded-full flex items-center justify-center text-white mb-6 shadow-lg"><CheckCircle className="w-10 h-10" /></div>
          <h2 className="text-3xl font-black text-emerald-500 mb-2">Published!</h2>
          <p className="text-slate-500 font-bold text-[16px] mb-2">Grades and feedback successfully synced.</p>
          <p className="text-slate-500 font-bold text-[12px] mb-8">
            Emails sent: {syncProgress.emailSuccesses}
            {syncProgress.emailFailures > 0 && ` · Failed: ${syncProgress.emailFailures} (check console)`}
          </p>
          <button onClick={() => setPhase(AppPhase.DASHBOARD)} className="py-4 px-8 bg-indigo-600 text-white rounded-xl font-black uppercase tracking-widest text-[16px] shadow-sm hover:-translate-y-0.5 transition-all">
             Back to Dashboard
          </button>
       </div>
    </PageWrapper>
  );

  const renderPaywall = () => (
    <PageWrapper
      headerTitle="Upgrade to Continue"
      headerSubtitle={undefined}
      isOnline={isOnline}
      isDarkMode={isDarkMode}
      setIsDarkMode={setIsDarkMode}
      syncStatus={syncStatus}
    >
      <div className="flex flex-col h-full w-full max-w-sm mx-auto">
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <h2 className="text-xl font-black text-slate-900 dark:text-slate-50 text-center">
            Unlock syncing & student emails
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-300 text-center">
            Syncing grades back to Google Classroom, emailing students, and saving scans to Drive are premium features.
          </p>
          <div className="w-full bg-white/70 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-700 rounded-xl p-3 space-y-2 text-sm text-slate-700 dark:text-slate-200">
            <p className="font-semibold">Your DoneGrading Pro plan includes:</p>
            <ul className="list-disc list-inside space-y-1 text-[13px]">
              <li>30-day free trial, then $19.99/month.</li>
              <li>Unlimited scans and AI‑assisted grading.</li>
              <li>One‑tap sync of grades to Google Classroom.</li>
              <li>Email summaries with feedback and scans for students.</li>
            </ul>
          </div>
          <button
            type="button"
            onClick={() => {
              // TODO: Call backend to create Stripe Checkout session and redirect.
              // Placeholder: mark as trialing so you can test the flow.
              setSubscriptionStatus('trialing');
              setPhase(AppPhase.DASHBOARD);
            }}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black uppercase tracking-[0.12em] text-[14px] shadow-sm hover:-translate-y-0.5 transition-all"
          >
            Start 30‑day free trial
          </button>
          <button
            type="button"
            onClick={() => setPhase(AppPhase.DASHBOARD)}
            className="w-full py-3 bg-white/70 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl text-[13px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-white/90 dark:hover:bg-slate-800/90 transition-colors"
          >
            Maybe later – keep exploring
          </button>
          <p className="mt-2 text-[10px] text-slate-500 dark:text-slate-400 text-center">
            You can start your trial anytime from the Sync screen. We never sell your data and you can cancel anytime.
          </p>
        </div>
      </div>
    </PageWrapper>
  );

  const renderPlan = () => {
    const lastSavedLabel =
      planLastSaved == null
        ? 'Not yet saved'
        : `Saved ${planLastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

    const effectiveTopic = lessonTopic || planLessonTitle || 'Your lesson topic';
    const handleSavePlanNow = () => {
      try {
        const payload = {
          lessonTopic,
          lessonTitle: planLessonTitle,
          unit: planUnit,
          version: planVersion,
          state: planStateRegion,
          grade: planGrade,
          subject: planSubject,
          duration: planDuration,
          standardsQuery,
          pinnedStandards,
          classProfile,
          hookType,
          hookContent,
          directPoints,
          cfuIdeas,
          guidedTemplate,
          guidedNotes,
          independentNotes,
          resourceQuery,
          exitTicketPrompt,
          exitTicketQuestions,
          successCriteria,
          reflectionNote,
        };
        localStorage.setItem(PLAN_STATE_KEY, JSON.stringify(payload));
        localStorage.setItem(PLAN_US_STATE_KEY, planStateRegion);
        setPlanLastSaved(new Date());
      } catch {
        // ignore
      }
    };
    const buildPlanText = () => {
      const standards = pinnedStandards.map((s) => `${s.code}: ${s.label}`).join('\n');
      const vocab = lessonResult?.vocabulary?.join(', ') || '';
      const discussion = lessonResult?.discussionQuestions?.map((q, i) => `${i + 1}. ${q}`).join('\n') || cfuIdeas;
      return [
        `Lesson: ${planLessonTitle || lessonTopic || 'Untitled Lesson'}`,
        `State: ${planStateRegion}`,
        `Grade: ${planGrade}`,
        `Subject: ${planSubject}`,
        `Duration: ${planDuration} mins`,
        '',
        'Standards',
        standards || standardsQuery || 'N/A',
        '',
        'Direct Instruction',
        directPoints || 'N/A',
        '',
        'Guided Practice',
        guidedNotes || 'N/A',
        '',
        'Independent Practice',
        independentNotes || 'N/A',
        '',
        'Resources',
        resourceCards.map((c) => `- ${c.title} (${c.source}) ${c.url}`).join('\n') || resourceQuery || 'N/A',
        '',
        'Assessment',
        `Exit ticket prompt: ${exitTicketPrompt || 'N/A'}`,
        exitTicketQuestions.length ? `Questions:\n${exitTicketQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}` : '',
        successCriteria.length ? `Success criteria:\n${successCriteria.map((s, i) => `${i + 1}. ${s}`).join('\n')}` : '',
        '',
        'Vocabulary',
        vocab || 'N/A',
        '',
        'Discussion / CFU',
        discussion || 'N/A',
        '',
        `Created by DoneGrading`,
      ].filter(Boolean).join('\n');
    };
    const handleEmailPlan = () => {
      const subject = encodeURIComponent(`Lesson Plan: ${planLessonTitle || 'Lesson'}`);
      const body = encodeURIComponent(`${buildPlanText()}\n\nCreated by DoneGrading`);
      window.location.href = `mailto:?subject=${subject}&body=${body}`;
    };
    const handleSharePlan = async () => {
      const title = `Lesson Plan: ${planLessonTitle || 'Lesson'}`;
      const text = buildPlanText();
      try {
        setPlanActionLoading('share');
        if ((navigator as any).share) {
          await (navigator as any).share({ title, text });
        } else {
          await navigator.clipboard.writeText(text);
          setPlanActionMessage('Lesson plan copied to clipboard.');
        }
      } catch {
        setPlanActionMessage('Could not share right now.');
      } finally {
        setPlanActionLoading(null);
      }
    };
    const buildFallbackLesson = (topic: string): LessonScriptResult => ({
      outline: `1) Warm-up: Activate prior knowledge about ${topic}.\n2) Teach core concept with a short model and examples.\n3) Guided practice with think-pair-share checks.\n4) Independent task applying the concept.\n5) Exit ticket to verify mastery.`,
      vocabulary: [topic.split(' ')[0] || 'concept', 'evidence', 'analyze', 'apply', 'explain'],
      discussionQuestions: [
        `How would you explain ${topic} in your own words?`,
        `What is one example of ${topic} in real life?`,
        `What part of ${topic} still feels confusing?`,
      ],
    });
    const handlePlanActionSelect = async (action: string) => {
      if (action === 'save') {
        handleSavePlanNow();
        setPlanActionMessage('Lesson plan saved.');
        return;
      }
      if (action === 'print') {
        window.print();
        return;
      }
      if (action === 'email') {
        handleEmailPlan();
        return;
      }
      if (action === 'share') {
        await handleSharePlan();
      }
    };
    const handleGeneratePlan = async () => {
      const topic = (lessonTopic || planLessonTitle || `${planSubject} lesson for grade ${planGrade}`).trim();
      if (!topic) {
        setPlanAiError('Add a lesson title or topic first.');
        return;
      }
      setPlanAiError(null);
      setLessonLoading(true);
      try {
        let timedOut = false;
        const timeoutPromise = new Promise<null>((resolve) => {
          window.setTimeout(() => {
            timedOut = true;
            resolve(null);
          }, 20000);
        });
        const res = await Promise.race([generateLessonScript(topic), timeoutPromise]);
        if (timedOut) {
          const fallback = buildFallbackLesson(topic);
          setLessonResult(fallback);
          setDirectPoints(fallback.outline);
          setCfuIdeas(fallback.discussionQuestions.join('\n'));
          setPlanAiError(null);
          setPlanActionMessage('AI timed out. Generated a template draft instead.');
          return;
        }
        const finalRes = res || buildFallbackLesson(topic);
        setLessonResult(finalRes);
        setDirectPoints(finalRes.outline);
        setCfuIdeas(finalRes.discussionQuestions.join('\n'));
        if (!res) {
          setPlanActionMessage('AI unavailable. Generated a template draft instead.');
        }
        if (!exitTicketQuestions.length) {
          setExitTicketQuestions(finalRes.discussionQuestions.slice(0, 3));
        }
        if (!successCriteria.length && finalRes.vocabulary.length > 0) {
          setSuccessCriteria([
            `Use at least 2 key terms correctly (${finalRes.vocabulary.slice(0, 2).join(', ')}).`,
            'Explain the objective in your own words.',
          ]);
        }
      } catch {
        const fallback = buildFallbackLesson(topic);
        setLessonResult(fallback);
        setDirectPoints(fallback.outline);
        setCfuIdeas(fallback.discussionQuestions.join('\n'));
        setPlanAiError(null);
        setPlanActionMessage('AI failed unexpectedly. Generated a template draft instead.');
      } finally {
        setLessonLoading(false);
      }
    };

    return (
      <PageWrapper
        headerTitle={educatorName || 'Plan'}
        headerSubtitle={todayLabel || undefined}
        isOnline={isOnline}
        isDarkMode={isDarkMode}
        setIsDarkMode={setIsDarkMode}
        syncStatus={syncStatus}
      >
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <style>{`
            @media print {
              @page {
                margin: 12mm 10mm 16mm 10mm;
              }
              .plan-no-print { display: none !important; }
              .plan-print-plain {
                background: white !important;
                color: black !important;
                border: none !important;
                box-shadow: none !important;
              }
              .plan-print-plain * {
                background: transparent !important;
                color: black !important;
                border-color: #d1d5db !important;
                box-shadow: none !important;
              }
              .plan-print-plain input,
              .plan-print-plain select,
              .plan-print-plain textarea {
                border: none !important;
                padding: 0 !important;
                min-height: auto !important;
              }
              .plan-print-footer {
                position: fixed;
                left: 0;
                right: 0;
                bottom: 4mm;
                display: flex !important;
                align-items: center;
                justify-content: center;
                gap: 6px;
                font-size: 9px;
                color: #6b7280 !important;
                z-index: 9999;
              }
              .plan-print-footer img {
                width: 34px;
                height: 34px;
              }
            }
            .plan-print-footer { display: none; }
          `}</style>
          {/* Compact header + tab bar: inset card to match sections */}
          <div className="plan-no-print flex-none flex flex-col gap-2 mx-2 mt-1 mb-2 px-3 py-2 bg-white/90 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm">
            <div className="grid grid-cols-2 gap-1">
              <button
                type="button"
                onClick={() => void handleGeneratePlan()}
                disabled={lessonLoading}
                className="flex-1 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-wider bg-indigo-600 text-white disabled:opacity-50 flex items-center justify-center gap-1"
              >
                {lessonLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                {lessonLoading ? 'Generating…' : 'Generate'}
              </button>
              <select
                className="flex-1 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-wider bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700"
                defaultValue=""
                disabled={planActionLoading === 'share'}
                onChange={(e) => {
                  const action = e.target.value;
                  e.target.value = '';
                  if (!action) return;
                  void handlePlanActionSelect(action);
                }}
              >
                <option value="">Actions</option>
                <option value="save">Save</option>
                <option value="print">Print</option>
                <option value="email">Email</option>
                <option value="share">{planActionLoading === 'share' ? 'Sharing…' : 'Share'}</option>
              </select>
            </div>
            <div className="flex gap-1 bg-slate-100/70 dark:bg-slate-900/70 p-0.5 rounded-lg">
              {(['context', 'blocks', 'resources', 'assessment'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setPlanTab(tab)}
                  className={`flex-1 py-1.5 rounded-md text-[9px] font-bold uppercase tracking-wider flex items-center justify-center gap-1 ${
                    planTab === tab
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {tab === 'context'
                    ? '1 Standards'
                    : tab === 'blocks'
                      ? '2 Instruction'
                      : tab === 'resources'
                        ? '3 Resources'
                        : '4 Assessment'}
                </button>
              ))}
            </div>
            <p className="text-[8px] text-slate-400 text-center">{lastSavedLabel}</p>
            {planAiError && (
              <p className="text-[9px] text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded px-2 py-1">
                {planAiError}
              </p>
            )}
            {planActionMessage && (
              <p className="text-[9px] text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-2 py-1">
                {planActionMessage}
              </p>
            )}
          </div>

          {/* Single panel: only active tab content, no page scroll */}
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
            {planTab === 'context' && (
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-2 space-y-2">
            <aside className="space-y-2">
              <section className="plan-print-plain bg-indigo-50/70 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-700 rounded-xl p-3 space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-700 dark:text-indigo-200">
                  State compliance checkpoint
                </p>
                <p className="text-[10px] text-slate-700 dark:text-slate-200">
                  {planStateRegion === 'National'
                    ? 'Using national template: objective, standards, differentiation, formative checks, and assessment evidence.'
                    : `Using ${planStateRegion} alignment workflow: standards mapping, objective language, differentiation plan, accommodations, and evidence of mastery.`}
                </p>
              </section>
              <section className="bg-white/85 dark:bg-slate-900/85 border border-slate-200 dark:border-slate-700 rounded-xl p-3 space-y-2">
                <p className={sectionTitle}>
                  Context & Constraints
                </p>
                <div className="grid grid-cols-3 gap-2 text-[10px]">
                  <div className="flex flex-col gap-1 col-span-3">
                    <label className={label}>State (standards)</label>
                    <select
                      value={planStateRegion}
                      onChange={(e) => setPlanStateRegion(e.target.value)}
                      className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/80"
                    >
                      <option value="National">National / General</option>
                      <option value="AL">Alabama</option>
                      <option value="AK">Alaska</option>
                      <option value="AZ">Arizona</option>
                      <option value="AR">Arkansas</option>
                      <option value="CA">California</option>
                      <option value="CO">Colorado</option>
                      <option value="CT">Connecticut</option>
                      <option value="DE">Delaware</option>
                      <option value="FL">Florida</option>
                      <option value="GA">Georgia</option>
                      <option value="HI">Hawaii</option>
                      <option value="ID">Idaho</option>
                      <option value="IL">Illinois</option>
                      <option value="IN">Indiana</option>
                      <option value="IA">Iowa</option>
                      <option value="KS">Kansas</option>
                      <option value="KY">Kentucky</option>
                      <option value="LA">Louisiana</option>
                      <option value="ME">Maine</option>
                      <option value="MD">Maryland</option>
                      <option value="MA">Massachusetts</option>
                      <option value="MI">Michigan</option>
                      <option value="MN">Minnesota</option>
                      <option value="MS">Mississippi</option>
                      <option value="MO">Missouri</option>
                      <option value="MT">Montana</option>
                      <option value="NE">Nebraska</option>
                      <option value="NV">Nevada</option>
                      <option value="NH">New Hampshire</option>
                      <option value="NJ">New Jersey</option>
                      <option value="NM">New Mexico</option>
                      <option value="NY">New York</option>
                      <option value="NC">North Carolina</option>
                      <option value="ND">North Dakota</option>
                      <option value="OH">Ohio</option>
                      <option value="OK">Oklahoma</option>
                      <option value="OR">Oregon</option>
                      <option value="PA">Pennsylvania</option>
                      <option value="RI">Rhode Island</option>
                      <option value="SC">South Carolina</option>
                      <option value="SD">South Dakota</option>
                      <option value="TN">Tennessee</option>
                      <option value="TX">Texas</option>
                      <option value="UT">Utah</option>
                      <option value="VT">Vermont</option>
                      <option value="VA">Virginia</option>
                      <option value="WA">Washington</option>
                      <option value="WV">West Virginia</option>
                      <option value="WI">Wisconsin</option>
                      <option value="WY">Wyoming</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className={label}>Grade</label>
                    <input
                      value={planGrade}
                      onChange={(e) => setPlanGrade(e.target.value)}
                      className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/80"
                    />
                  </div>
                  <div className="flex flex-col gap-1 col-span-2">
                    <label className={label}>Subject</label>
                    <input
                      value={planSubject}
                      onChange={(e) => setPlanSubject(e.target.value)}
                      className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/80"
                    />
                  </div>
                  <div className="flex flex-col gap-1 col-span-3">
                    <label className="font-semibold text-slate-600 dark:text-slate-300">Duration (mins)</label>
                    <input
                      type="number"
                      min={10}
                      max={120}
                      value={planDuration}
                      onChange={(e) => setPlanDuration(parseInt(e.target.value || '0', 10))}
                      className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/80"
                    />
                  </div>
                </div>
              </section>

              <section className="bg-white/85 dark:bg-slate-900/85 border border-slate-200 dark:border-slate-700 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className={sectionTitle}>
                    Standards
                  </p>
                </div>
                <input
                  value={standardsQuery}
                  onChange={(e) => setStandardsQuery(e.target.value)}
                  placeholder="e.g. Water Cycle, NGSS"
                  className="w-full px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/80 text-[11px]"
                />
                <button
                  type="button"
                  disabled={!standardsQuery.trim()}
                  onClick={() => {
                    // Placeholder AI behavior: turn the query into 2–3 pseudo-codes to pin
                    const base = standardsQuery.trim();
                    const suggestions: StandardItem[] = [
                      { code: 'NGSS-MS-ESS2-4', label: `Develop a model of the ${base.toLowerCase()}.` },
                      { code: 'NGSS-5-ESS2-1', label: `Describe interactions in the ${base.toLowerCase()} within ecosystems.` },
                    ];
                    setStandardsSuggestions(suggestions);
                  }}
                  className="w-full mt-1 px-2 py-1 rounded-lg bg-indigo-600 text-white text-[10px] font-semibold disabled:opacity-40"
                >
                  Suggest standards
                </button>
                {standardsSuggestions.length > 0 && (
                  <div className="mt-1 space-y-1 max-h-24 overflow-y-auto custom-scrollbar">
                    {standardsSuggestions.map((s) => (
                      <button
                        key={s.code}
                        type="button"
                        onClick={() => {
                          if (pinnedStandards.some((p) => p.code === s.code)) return;
                          setPinnedStandards((prev) => [...prev, s]);
                        }}
                        className="w-full text-left px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/80 text-[10px] hover:bg-indigo-50/80 dark:hover:bg-indigo-900/40"
                      >
                        <span className="font-semibold">{s.code}</span>
                        <span className="ml-1 text-slate-600 dark:text-slate-300">{s.label}</span>
                      </button>
                    ))}
                  </div>
                )}
                {pinnedStandards.length > 0 && (
                  <div className="mt-1 space-y-1">
                    <p className="text-[9px] font-semibold text-slate-500 dark:text-slate-400">Pinned</p>
                    {pinnedStandards.map((s) => (
                      <div
                        key={s.code}
                        className="flex items-center justify-between gap-2 px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700 text-[10px]"
                      >
                        <span className="truncate">
                          <span className="font-semibold">{s.code}</span>
                          <span className="ml-1 text-slate-600 dark:text-slate-300">{s.label}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setPinnedStandards((prev) => prev.filter((p) => p.code !== s.code))
                          }
                          className="p-1 text-slate-400 hover:text-red-500"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="bg-white/85 dark:bg-slate-900/85 border border-slate-200 dark:border-slate-700 rounded-xl p-3 space-y-2">
                <p className={sectionTitle}>
                  Class Profile
                </p>
                <textarea
                  value={classProfile}
                  onChange={(e) => setClassProfile(e.target.value)}
                  placeholder='e.g. "3 students with ADHD, 2 ELL Level 1"'
                  className="w-full min-h-[64px] px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/80 text-[11px] resize-none custom-scrollbar"
                />
                <button
                  type="button"
                  disabled={!classProfile.trim()}
                  onClick={() => {
                    setSafetyStatus('scanning');
                    // Placeholder "AI" safety check that just echoes considerations.
                    const msg =
                      'Watch for pacing, visuals, and movement breaks for students mentioned in the class profile.';
                    setTimeout(() => {
                      setSafetyFindings(msg);
                      setSafetyStatus('done');
                    }, 600);
                  }}
                  className="w-full mt-1 px-2 py-1 rounded-lg bg-emerald-600 text-white text-[10px] font-semibold disabled:opacity-40"
                >
                  {safetyStatus === 'scanning' ? 'Running safety check…' : 'Safety check'}
                </button>
                {safetyFindings && (
                  <p className="mt-1 text-[10px] text-amber-700 dark:text-amber-300 bg-amber-50/80 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg px-2 py-1">
                    {safetyFindings}
                  </p>
                )}
              </section>
            </aside>
            </div>
            )}

            {planTab === 'blocks' && (
            <div className="flex-1 min-h-0 overflow-hidden flex flex-col p-2">
              <section className="plan-print-plain mb-2 bg-indigo-50/70 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-700 rounded-xl p-2">
                <p className="text-[10px] font-semibold text-indigo-700 dark:text-indigo-200">
                  Instruction design sequence: Hook → Direct instruction → Guided practice → Independent transfer.
                </p>
              </section>
              <div className="flex gap-1 mb-2">
                {(['A', 'B', 'C', 'D'] as const).map((b) => (
                  <button key={b} type="button" onClick={() => setPlanBlockTab(b)} className={`flex-1 py-1 rounded-lg text-[9px] font-bold ${planBlockTab === b ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}>{b}</button>
                ))}
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
              <section className="bg-white/85 dark:bg-slate-900/85 border border-slate-200 dark:border-slate-700 rounded-xl p-3 flex flex-col gap-3">
                <p className={sectionTitle}>
                  Block {planBlockTab}
                </p>

                {planBlockTab === 'A' && (
                <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-indigo-500 text-white text-[10px] flex items-center justify-center font-bold">
                        A
                      </span>
                      <div>
                        <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                          Hook (5–10 mins)
                        </p>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400">
                          Kick off curiosity so students lean in.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          // Simple regenerate stub based on type
                          const base = effectiveTopic.toLowerCase();
                          const suggestion =
                            hookType === 'video'
                              ? `Short 60‑second video clip showing the ${base} in action.`
                              : hookType === 'mystery'
                                ? `Reveal a mystery object related to the ${base} and ask students to predict what it represents.`
                                : `Pose a provocative question: "What would happen to our classroom if the ${base} stopped working?"`;
                          setHookContent(suggestion);
                        }}
                        className="p-1.5 rounded-full text-[10px] text-indigo-600 dark:text-indigo-300 hover:bg-indigo-50/80 dark:hover:bg-indigo-900/30"
                        title="AI Regenerate"
                      >
                        <Sparkles className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        className="p-1.5 rounded-full text-[10px] text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                        title="Manual edit"
                        onClick={() => {
                          // no-op, textarea is always editable
                        }}
                      >
                        <FileText className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-[10px]">
                    <span className="font-semibold text-slate-600 dark:text-slate-300">Option</span>
                    <button
                      type="button"
                      onClick={() => setHookType('video')}
                      className={`px-2 py-0.5 rounded-full border text-[9px] ${
                        hookType === 'video'
                          ? 'bg-indigo-50 border-indigo-400 text-indigo-700'
                          : 'bg-white/90 dark:bg-slate-900/80 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      Video link
                    </button>
                    <button
                      type="button"
                      onClick={() => setHookType('question')}
                      className={`px-2 py-0.5 rounded-full border text-[9px] ${
                        hookType === 'question'
                          ? 'bg-indigo-50 border-indigo-400 text-indigo-700'
                          : 'bg-white/90 dark:bg-slate-900/80 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      Question
                    </button>
                    <button
                      type="button"
                      onClick={() => setHookType('mystery')}
                      className={`px-2 py-0.5 rounded-full border text-[9px] ${
                        hookType === 'mystery'
                          ? 'bg-indigo-50 border-indigo-400 text-indigo-700'
                          : 'bg-white/90 dark:bg-slate-900/80 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      Mystery object
                    </button>
                  </div>
                  <textarea
                    value={hookContent}
                    onChange={(e) => setHookContent(e.target.value)}
                    placeholder="Write or paste what students will see / hear first…"
                    className="w-full min-h-[60px] text-[11px] px-2 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/80 resize-none custom-scrollbar"
                  />
                </div>
                )}

                {planBlockTab === 'B' && (
                <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-emerald-500 text-white text-[10px] flex items-center justify-center font-bold">
                        B
                      </span>
                      <div>
                        <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                          Direct Instruction (15–20 mins)
                        </p>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400">
                          Capture just the must‑know pieces.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => void handleGeneratePlan()}
                        disabled={lessonLoading}
                        className="p-1.5 rounded-full text-[10px] text-indigo-600 dark:text-indigo-300 hover:bg-indigo-50/80 dark:hover:bg-indigo-900/30"
                        title="AI Regenerate"
                      >
                        {lessonLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                      </button>
                      <button
                        type="button"
                        className="p-1.5 rounded-full text-[10px] text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                        title="Manual edit"
                      >
                        <FileText className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-semibold text-slate-600 dark:text-slate-300">
                        Must‑know bullet points
                      </label>
                      <textarea
                        value={directPoints}
                        onChange={(e) => setDirectPoints(e.target.value)}
                        placeholder="• Key fact 1&#10;• Key fact 2"
                        className="w-full min-h-[64px] text-[11px] px-2 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/80 resize-none custom-scrollbar"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-semibold text-slate-600 dark:text-slate-300">
                        CFU questions to ask live
                      </label>
                      <textarea
                        value={cfuIdeas}
                        onChange={(e) => setCfuIdeas(e.target.value)}
                        placeholder="Type or let AI draft 3–4 quick questions…"
                        className="w-full min-h-[64px] text-[11px] px-2 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/80 resize-none custom-scrollbar"
                      />
                    </div>
                  </div>
                </div>
                )}

                {planBlockTab === 'C' && (
                <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-sky-500 text-white text-[10px] flex items-center justify-center font-bold">
                        C
                      </span>
                      <div>
                        <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                          Guided Practice (≈15 mins)
                        </p>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400">
                          Students try it with you in the middle.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="p-1.5 rounded-full text-[10px] text-indigo-600 dark:text-indigo-300 hover:bg-indigo-50/80 dark:hover:bg-indigo-900/30"
                      title="AI Regenerate"
                      onClick={() => {
                        const templateSummary =
                          guidedTemplate === 'Socratic Seminar'
                            ? 'Inner and outer circles discuss the prompt and rotate midway.'
                            : guidedTemplate === 'Jigsaw'
                              ? 'Expert groups read different sections, then teach in new groups.'
                              : guidedTemplate === 'Lab'
                                ? 'Hands-on investigation with clear safety and procedure steps.'
                                : 'Think, pair, and share responses with a quick whole-class debrief.';
                        setGuidedNotes(templateSummary);
                      }}
                    >
                      <Sparkles className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-[10px]">
                    <span className="font-semibold text-slate-600 dark:text-slate-300">
                      Template
                    </span>
                    {(['Socratic Seminar', 'Jigsaw', 'Lab', 'Think-Pair-Share'] as const).map((tpl) => (
                      <button
                        key={tpl}
                        type="button"
                        onClick={() => setGuidedTemplate(tpl)}
                        className={`px-2 py-0.5 rounded-full border ${
                          guidedTemplate === tpl
                            ? 'bg-sky-50 border-sky-400 text-sky-700'
                            : 'bg-white/90 dark:bg-slate-900/80 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                        } text-[9px]`}
                      >
                        {tpl}
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={guidedNotes}
                    onChange={(e) => setGuidedNotes(e.target.value)}
                    placeholder="Steps, grouping notes, and prompts for this activity…"
                    className="w-full min-h-[64px] text-[11px] px-2 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/80 resize-none custom-scrollbar"
                  />
                </div>
                )}

                {planBlockTab === 'D' && (
                <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-violet-500 text-white text-[10px] flex items-center justify-center font-bold">
                        D
                      </span>
                      <div>
                        <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                          Independent Practice
                        </p>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400">
                          What students do on their own, in class or at home.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        className="p-1.5 rounded-full text-[10px] text-indigo-600 dark:text-indigo-300 hover:bg-indigo-50/80 dark:hover:bg-indigo-900/30"
                        title="AI Generate activity"
                        onClick={() => {
                          const base = effectiveTopic.toLowerCase();
                          setIndependentNotes(
                            `Students complete a short independent task applying the ${base}. Include 5 practice items and 1 challenge question.`
                          );
                        }}
                      >
                        <Sparkles className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  <textarea
                    value={independentNotes}
                    onChange={(e) => setIndependentNotes(e.target.value)}
                    placeholder="Describe the worksheet, reading, or problem set students will complete…"
                    className="w-full min-h-[64px] text-[11px] px-2 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/80 resize-none custom-scrollbar"
                  />
                  <div className="flex items-center justify-between gap-2 text-[10px]">
                    <div className="flex items-center gap-2">
                      <label className="font-semibold text-slate-600 dark:text-slate-300">
                        Attachment
                      </label>
                      <input
                        type="file"
                        className="hidden"
                        id="independent-attachment"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) setAttachmentName(file.name);
                        }}
                      />
                      <label
                        htmlFor="independent-attachment"
                        className="px-2 py-1 rounded-full border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/80 cursor-pointer"
                      >
                        Upload
                      </label>
                      {attachmentName && (
                        <span className="text-slate-500 dark:text-slate-400 truncate max-w-[120px]">
                          {attachmentName}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                )}
              </section>
              </div>
            </div>
            )}

            {planTab === 'resources' && (
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-2">
            <aside className="w-full space-y-3">
              <section className="plan-print-plain bg-indigo-50/70 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-700 rounded-xl p-3">
                <p className="text-[10px] font-semibold text-indigo-700 dark:text-indigo-200">
                  Resource compliance: include accessible text, multimodal materials, and differentiation artifacts tied to selected standards.
                </p>
              </section>
              <section className="bg-white/85 dark:bg-slate-900/85 border border-slate-200 dark:border-slate-700 rounded-xl p-3 space-y-2">
                <p className={sectionTitle}>
                  Resources
                </p>
                <input
                  value={resourceQuery}
                  onChange={(e) => setResourceQuery(e.target.value)}
                  placeholder="Topic for media (e.g. ecosystems)"
                  className="w-full px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/80 text-[11px]"
                />
                <button
                  type="button"
                  onClick={() => {
                    const topic = (resourceQuery || effectiveTopic).toLowerCase();
                    const cards: ResourceCard[] = [
                      {
                        title: `Intro video on the ${topic}`,
                        kind: 'video',
                        source: 'YouTube',
                        url: 'https://www.youtube.com',
                        blurb: '2–3 minute visual overview with strong visuals and captions.',
                      },
                      {
                        title: `Primary source: ${topic}`,
                        kind: 'article',
                        source: 'Open resource',
                        url: 'https://example.com',
                        blurb: 'Short excerpt students can annotate or discuss in pairs.',
                      },
                      {
                        title: `${topic} simulation`,
                        kind: 'simulation',
                        source: 'PhET‑style',
                        url: 'https://example.com',
                        blurb: 'Clickable model students can manipulate to see cause‑and‑effect.',
                      },
                    ];
                    setResourceCards(cards);
                  }}
                  className="w-full mt-1 px-2 py-1 rounded-lg bg-slate-900 text-white text-[10px] font-semibold dark:bg-slate-100 dark:text-slate-900"
                >
                  Curate media
                </button>
                {resourceCards.length > 0 && (
                  <div className="mt-1 space-y-1 max-h-40 overflow-y-auto custom-scrollbar">
                    {resourceCards.map((card, idx) => (
                      <div
                        key={`${card.title}-${idx}`}
                        className="flex items-start justify-between gap-2 px-2 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/80 text-[10px]"
                      >
                        <div className="flex-1">
                          <p className="font-semibold text-slate-800 dark:text-slate-100">
                            {card.title}
                          </p>
                          <p className="text-[9px] text-slate-500 dark:text-slate-400">
                            {card.source} · {card.kind}
                          </p>
                          <p className="mt-0.5 text-[9px] text-slate-600 dark:text-slate-300">
                            {card.blurb}
                          </p>
                        </div>
                        <button
                          type="button"
                          className="px-2 py-0.5 rounded-full bg-indigo-600 text-white text-[9px] font-semibold"
                          title="Open in new tab"
                          onClick={() => window.open(card.url, '_blank')}
                        >
                          Open
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="bg-white/85 dark:bg-slate-900/85 border border-slate-200 dark:border-slate-700 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className={sectionTitle}>
                    Leveler
                  </p>
                  <span className="text-[9px] text-slate-500 dark:text-slate-400">
                    Grade {levelerValue}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={12}
                  value={levelerValue}
                  onChange={(e) => setLevelerValue(parseInt(e.target.value, 10))}
                  className="w-full"
                />
                <button
                  type="button"
                  className="w-full mt-1 px-2 py-1 rounded-lg bg-emerald-600 text-white text-[10px] font-semibold disabled:opacity-50"
                  disabled={!differentiationText.trim()}
                  onClick={async () => {
                    const text = differentiationText.trim();
                    if (!text) return;
                    const level = levelerValue <= 5 ? 'simplified' : 'advanced';
                    setDiffLoading(true);
                    const out = await generateDifferentiatedLesson(text, level);
                    setDiffLoading(false);
                    if (out) {
                      setDifferentiationText(out);
                      setDiffLevel(level);
                    }
                  }}
                >
                  {diffLoading ? 'Leveling…' : 'Apply to lesson text'}
                </button>
                <textarea
                  value={differentiationText}
                  onChange={(e) => setDifferentiationText(e.target.value)}
                  placeholder="This mirrors your lesson blocks; use the slider, then paste pieces back where you want."
                  className="w-full min-h-[70px] text-[11px] px-2 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/80 resize-none custom-scrollbar"
                />
              </section>

              <section className="bg-white/85 dark:bg-slate-900/85 border border-slate-200 dark:border-slate-700 rounded-xl p-3 space-y-2">
                <p className={sectionTitle}>
                  Vocabulary Bank
                </p>
                {lessonResult?.vocabulary?.length ? (
                  <ul className="grid grid-cols-2 gap-1 text-[10px]">
                    {lessonResult.vocabulary.map((word, idx) => (
                      <li
                        key={`${word}-${idx}`}
                        className="px-2 py-1 rounded-full bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 truncate"
                      >
                        {word}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">
                    Run a quick script in Block B to auto‑extract 5–10 academic terms.
                  </p>
                )}
              </section>

              <section className="bg-white/85 dark:bg-slate-900/85 border border-slate-200 dark:border-slate-700 rounded-xl p-3 space-y-2">
                <p className={sectionTitle}>
                  My Links
                </p>
                <ul className="space-y-1 max-h-24 overflow-y-auto custom-scrollbar text-[10px]">
                  {fileVaultLinks.map((link, i) => (
                    <li key={i} className="flex items-center justify-between gap-2">
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-indigo-600 dark:text-indigo-400 truncate flex-1"
                      >
                        {link.label || link.url}
                      </a>
                      <button
                        type="button"
                        onClick={() =>
                          setFileVaultLinks((prev) => prev.filter((_, j) => j !== i))
                        }
                        className="p-1 text-slate-400 hover:text-red-500"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </li>
                  ))}
                  {fileVaultLinks.length === 0 && (
                    <li className="text-slate-500 dark:text-slate-400">
                      Add your go‑to Drive / Docs / Slides links here.
                    </li>
                  )}
                </ul>
                <form
                  className="mt-1 flex gap-1"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const form = e.currentTarget;
                    const label = (form.querySelector(
                      '[name="vault-label"]'
                    ) as HTMLInputElement)?.value?.trim();
                    const url = (form.querySelector(
                      '[name="vault-url"]'
                    ) as HTMLInputElement)?.value?.trim();
                    if (!url) return;
                    setFileVaultLinks((prev) => [...prev, { label: label || url, url }]);
                    form.reset();
                  }}
                >
                  <input
                    name="vault-label"
                    placeholder="Label"
                    className="flex-1 px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-[10px]"
                  />
                  <input
                    name="vault-url"
                    placeholder="https://…"
                    required
                    className="flex-1 px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-[10px]"
                  />
                  <button
                    type="submit"
                    className="px-2 py-1.5 bg-indigo-600 text-white rounded-lg text-[10px] font-semibold"
                  >
                    Add
                  </button>
                </form>
              </section>
            </aside>
            </div>
            )}

            {planTab === 'assessment' && (
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-2">
          <section className="plan-print-plain bg-indigo-50/70 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-700 rounded-xl p-3 mb-2">
            <p className="text-[10px] font-semibold text-indigo-700 dark:text-indigo-200">
              Assessment compliance: align exit ticket + success criteria to objective and preserve evidence of mastery for documentation.
            </p>
          </section>
          <section className="bg-white/90 dark:bg-slate-950/90 border border-slate-200 dark:border-slate-700 rounded-xl p-3 space-y-3">
            <div className="flex flex-col md:flex-row md:items-start gap-3">
              <div className="flex-1 space-y-1.5">
                <p className={sectionTitle}>
                  Exit Ticket Lab
                </p>
                <textarea
                  value={exitTicketPrompt}
                  onChange={(e) => setExitTicketPrompt(e.target.value)}
                  placeholder="What do you want to check in 3 quick questions?"
                  className="w-full min-h-[48px] text-[11px] px-2 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/80 resize-none custom-scrollbar"
                />
                <button
                  type="button"
                  className="mt-1 px-2 py-1 rounded-lg bg-slate-900 text-white text-[10px] font-semibold dark:bg-slate-100 dark:text-slate-900"
                  onClick={() => {
                    const base = exitTicketPrompt || effectiveTopic;
                    setExitTicketQuestions([
                      `Explain one big idea you learned about ${base.toLowerCase()}.`,
                      `Write or sketch an example of ${base.toLowerCase()} in your own words.`,
                      `What is one question you still have about ${base.toLowerCase()}?`,
                    ]);
                  }}
                >
                  Generate 3 questions
                </button>
                {exitTicketQuestions.length > 0 && (
                  <ul className="mt-1 list-decimal list-inside text-[11px] text-slate-700 dark:text-slate-200 space-y-0.5">
                    {exitTicketQuestions.map((q, idx) => (
                      <li key={idx}>{q}</li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="flex-1 space-y-1.5">
                <p className={sectionTitle}>
                  Success Criteria (Look‑fors)
                </p>
                <button
                  type="button"
                  className="px-2 py-1 rounded-lg bg-emerald-600 text-white text-[10px] font-semibold"
                  onClick={() =>
                    setSuccessCriteria([
                      'Students can explain the big idea in their own words without prompts.',
                      'Students can use the key vocabulary accurately in a sentence or diagram.',
                      'Most students can complete the independent task with minimal re‑teaching.',
                    ])
                  }
                >
                  Draft 3 look‑fors
                </button>
                {successCriteria.length > 0 && (
                  <ul className="mt-1 list-disc list-inside text-[11px] text-slate-700 dark:text-slate-200 space-y-0.5">
                    {successCriteria.map((c, idx) => (
                      <li key={idx}>{c}</li>
                    ))}
                  </ul>
                )}
                <div className="mt-2 flex items-center justify-between gap-2 text-[10px]">
                  <span className="text-slate-500 dark:text-slate-400">
                    Send to LMS (coming soon)
                  </span>
                  <button
                    type="button"
                    className="px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-700 text-[10px] text-slate-600 dark:text-slate-300"
                  >
                    Send to LMS
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-2 border-t border-slate-200 dark:border-slate-700 pt-2">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400 mb-1 flex items-center justify-between">
                <span>Pencil‑Down Reflection</span>
              </p>
              <div className="relative">
                <textarea
                  value={reflectionNote}
                  onChange={(e) => setReflectionNote(e.target.value)}
                  placeholder='“Next time, skip the video—it was too long.” This note will be pinned to this lesson.'
                className="w-full min-h-[56px] text-[11px] px-2 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/80 resize-none custom-scrollbar pr-12"
                />
                <VoiceInputButton
                  onResult={(text) =>
                    setReflectionNote((prev) => prev + (prev ? ' ' : '') + text)
                  }
                  className="absolute right-2 bottom-2"
                />
              </div>
            </div>
          </section>
            </div>
            )}
          </div>
          <div className="plan-print-footer">
            <span>Created using the DoneGrading app</span>
            <img
              src="https://api.qrserver.com/v1/create-qr-code/?size=68x68&data=https%3A%2F%2Fdonegrading.com%2F"
              alt="DoneGrading QR"
            />
          </div>
        </div>
      </PageWrapper>
    );
  };

  const [scheduleCursor, setScheduleCursor] = useState<string>(() => new Date().toISOString().slice(0, 10));

  const renderSchedule = () => {
    const sorted = [...scheduleItems].sort((a, b) => a.date.localeCompare(b.date));

    const cursorDate = new Date(scheduleCursor);
    cursorDate.setHours(0, 0, 0, 0);
    const cursorIso = scheduleCursor;
    const todayIso = cursorIso;

    const isOnDate = (item: ScheduleItem, target: Date): boolean => {
      const base = new Date(item.date);
      base.setHours(0, 0, 0, 0);
      const t = new Date(target);
      t.setHours(0, 0, 0, 0);

      const sameDay = base.getTime() === t.getTime();
      if (item.recurrence === 'daily') {
        return t.getTime() >= base.getTime();
      }
      if (item.recurrence === 'weekly') {
        return t.getTime() >= base.getTime() && t.getDay() === base.getDay();
      }
      if (item.recurrence === 'monthly') {
        return t.getTime() >= base.getTime() && t.getDate() === base.getDate();
      }
      return sameDay;
    };

    const dailyItems = sorted.filter((item) => isOnDate(item, cursorDate));

    // 6am–6pm day split into AM (6–11) and PM (12–17), each representing a 1‑hour block (e.g. 6–7, 7–8, …, 17–18)
    const hours = Array.from({ length: 12 }).map((_, idx) => 6 + idx); // 6:00–18:00 end (last block is 17–18)
    const amHours = hours.filter((h) => h < 12);
    const pmHours = hours.filter((h) => h >= 12);

    const formatHourRange = (hour: number) => {
      const start = new Date();
      start.setHours(hour, 0, 0, 0);
      const end = new Date(start.getTime() + 60 * 60 * 1000);
      const fmt = (d: Date) =>
        d.toLocaleTimeString(undefined, {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        });
      return `${fmt(start)} – ${fmt(end)}`;
    };

    const moveCursor = (delta: number) => {
      setScheduleCursor((prevIso) => {
        const d = new Date(prevIso);
        if (scheduleView === 'daily') {
          d.setDate(d.getDate() + delta);
        } else if (scheduleView === 'weekly') {
          d.setDate(d.getDate() + 7 * delta);
        } else {
          d.setMonth(d.getMonth() + delta);
        }
        return d.toISOString().slice(0, 10);
      });
    };

    const getPeriodLabel = () => {
      if (scheduleView === 'daily') {
        try {
          return cursorDate.toLocaleDateString(undefined, {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          });
        } catch {
          return cursorIso;
        }
      }
      if (scheduleView === 'weekly') {
        const start = new Date(cursorDate);
        const day = start.getDay();
        const diff = (day + 6) % 7; // Monday start
        start.setDate(start.getDate() - diff);
        const end = new Date(start);
        end.setDate(start.getDate() + 6);
        try {
          const fmt = (d: Date) =>
            d.toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
            });
          return `${fmt(start)} – ${fmt(end)}`;
        } catch {
          return 'This week';
        }
      }
      try {
        return cursorDate.toLocaleDateString(undefined, {
          month: 'long',
          year: 'numeric',
        });
      } catch {
        return 'This month';
      }
    };

    const resetScheduleForm = () => {
      setScheduleTitle('');
      setScheduleDate('');
      setScheduleNotes('');
      setScheduleCourseId('');
      setScheduleAssignmentId('');
      setScheduleTime('');
      setScheduleRecurrence('once');
      setScheduleKind('reminder');
      setEditingScheduleId(null);
      setActiveScheduleHour(null);
    };

    const computeFirstOccurrence = (item: ScheduleItem): Date | null => {
      if (!item.date || !item.time) return null;
      const [hRaw, mRaw] = item.time.split(':');
      const h = Number(hRaw);
      const m = Number(mRaw ?? '0');
      if (Number.isNaN(h) || Number.isNaN(m)) return null;
      const date = new Date(item.date);
      if (Number.isNaN(date.getTime())) return null;
      date.setHours(h, m, 0, 0);
      if (date.getTime() <= Date.now()) return null;
      return date;
    };

    const saveItem = () => {
      if (!scheduleTitle.trim()) return;
      const base: ScheduleItem = {
        id: editingScheduleId || `s_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        title: scheduleTitle.trim(),
        date: scheduleDate || todayIso,
        view: scheduleView,
        kind: scheduleKind,
        courseId: scheduleCourseId || undefined,
        assignmentId: scheduleAssignmentId || undefined,
        notes: scheduleNotes || undefined,
        time: scheduleTime || undefined,
        recurrence: scheduleRecurrence,
      };

      if (editingScheduleId) {
        setScheduleItems((prev) => prev.map((i) => (i.id === editingScheduleId ? { ...i, ...base } : i)));
      } else {
        setScheduleItems((prev) => [base, ...prev]);
      }

      const when = computeFirstOccurrence(base);
      if (when) {
        void scheduleReminderNotification({
          id: base.id,
          title: base.title,
          body: base.notes || undefined,
          at: when,
        });
      }

      resetScheduleForm();
      setScheduleFormOpen(false);
    };

    const removeItem = (id: string) => {
      setScheduleItems((prev) => prev.filter((i) => i.id !== id));
      if (editingScheduleId === id) {
        resetScheduleForm();
        setScheduleFormOpen(false);
      }
    };

    const openEditorFor = (hour: number | null, item?: ScheduleItem, dateOverride?: string) => {
      setScheduleFormOpen(true);
      setActiveScheduleHour(hour);

      const defaultTime =
        hour != null ? `${hour.toString().padStart(2, '0')}:00` : scheduleTime || new Date().toTimeString().slice(0, 5);

      const effectiveDate = dateOverride || item?.date || todayIso;

      setScheduleTitle(item?.title ?? '');
      setScheduleDate(effectiveDate);
      setScheduleNotes(item?.notes ?? '');
      setScheduleCourseId(item?.courseId ?? '');
      setScheduleAssignmentId(item?.assignmentId ?? '');
      setScheduleTime(item?.time ?? defaultTime);
      setScheduleRecurrence(item?.recurrence ?? 'once');
      setScheduleKind(item?.kind ?? (hour != null ? 'teacherBlock' : 'reminder'));
      setEditingScheduleId(item?.id ?? null);
    };

    return (
      <PageWrapper
        headerTitle={educatorName || 'Schedule'}
        headerSubtitle={todayLabel || undefined}
        isOnline={isOnline}
        isDarkMode={isDarkMode}
        setIsDarkMode={setIsDarkMode}
        syncStatus={syncStatus}
      >
        <div className="flex-1 min-h-0 flex flex-col gap-2 overflow-hidden">
          <div className="shrink-0 flex items-center justify-between rounded-xl bg-white/90 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700 px-2 py-1.5">
            <div className="inline-flex text-[10px] font-black uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              View
            </div>
            <div className="inline-flex rounded-full bg-slate-100 dark:bg-slate-800 p-0.5 text-[10px]">
              {(['daily', 'weekly', 'monthly'] as ScheduleViewMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setScheduleView(mode)}
                  className={`px-3 py-1 rounded-full font-semibold capitalize ${
                    scheduleView === mode
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          <div className="shrink-0 flex items-center justify-between px-2 text-[10px] text-slate-600 dark:text-slate-300">
            <button
              type="button"
              onClick={() => moveCursor(-1)}
              className="px-2 py-1 rounded-full border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/70"
            >
              ‹
            </button>
            <span className="font-semibold uppercase tracking-[0.16em] text-center">
              {getPeriodLabel()}
            </span>
            <button
              type="button"
              onClick={() => moveCursor(1)}
              className="px-2 py-1 rounded-full border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/70"
            >
              ›
            </button>
          </div>

          {/* Top: compact calendar-style overview per view (hidden when editing/adding) */}
          {!scheduleFormOpen && (
            <div
              className={`flex-1 min-h-0 overflow-y-auto custom-scrollbar rounded-2xl bg-white/95 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-700 p-3 ${
                scheduleView === 'daily' ? 'space-y-2' : 'space-y-2'
              }`}
            >
              {scheduleView === 'daily' && (
                <>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                        Today&apos;s schedule
                      </p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">
                        Hour‑by‑hour blocks for classes, prep, lunch, meetings, and reminders.
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                  <div className="space-y-1">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300 text-center">
                      Morning
                    </p>
                    {amHours.map((hour) => {
                      const label = formatHourRange(hour);
                      const eventsAtHour = dailyItems.filter((item) => {
                        const time = item.time || '06:00';
                        const [h] = time.split(':');
                        return Number(h) === hour;
                      });
                      const hasTeacherBlock = eventsAtHour.some((e) => (e.kind ?? 'reminder') === 'teacherBlock');
                      const isActive = activeScheduleHour === hour;
                      return (
                        <div
                          key={hour}
                          onClick={() => openEditorFor(hour, eventsAtHour[0])}
                          className={`cursor-pointer flex flex-col items-center justify-center text-center text-[11px] min-h-14 ${
                            hasTeacherBlock
                              ? 'bg-emerald-50/80 dark:bg-emerald-900/30'
                              : 'bg-emerald-50/40 dark:bg-slate-900/40'
                          } rounded-2xl px-3 py-2 border ${
                            isActive ? 'border-emerald-500 dark:border-emerald-400' : 'border-emerald-100/70 dark:border-slate-700'
                          } shadow-sm`}
                        >
                          <div className="whitespace-nowrap text-emerald-700 dark:text-emerald-200 font-semibold">
                            {label}
                          </div>
                          <div className="w-full space-y-1">
                            {eventsAtHour.length === 0 ? (
                              <p className="text-[10px] text-emerald-900/40 dark:text-emerald-100/40">&nbsp;</p>
                            ) : (
                              eventsAtHour.map((e) => {
                                const kind = e.kind ?? 'reminder';
                                const isEventLike = kind === 'event' || kind === 'appointment' || kind === 'meeting';
                                const chipColor =
                                  kind === 'teacherBlock'
                                    ? 'bg-indigo-500 text-white'
                                    : isEventLike
                                      ? 'bg-emerald-500 text-white'
                                      : 'bg-amber-500 text-white';
                                return (
                                  <div
                                    key={e.id}
                                    onClick={(ev) => {
                                      ev.stopPropagation();
                                      openEditorFor(hour, e);
                                    }}
                                    className="px-2 py-1 rounded-lg bg-white/80 dark:bg-slate-900/80 border border-slate-200/70 dark:border-slate-700/70 flex flex-col items-center text-center gap-1"
                                  >
                                    <div className="flex items-center justify-center gap-2">
                                      <span className="font-semibold truncate max-w-[120px]">{e.title}</span>
                                      <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-[0.16em] ${chipColor}`}>
                                        {kind === 'teacherBlock'
                                          ? 'Teacher'
                                          : isEventLike
                                            ? 'Event'
                                            : 'Reminder'}
                                      </span>
                                    </div>
                                    <p className="text-[10px] text-slate-600 dark:text-slate-300">
                                      {e.time || 'Any time'}
                                      {e.endTime ? ` – ${e.endTime}` : ''}
                                      {e.recurrence !== 'once' && ` · ${e.recurrence}`}
                                    </p>
                                    {e.notes && (
                                      <p className="text-[10px] text-slate-600 dark:text-slate-200 line-clamp-2">
                                        {e.notes}
                                      </p>
                                    )}
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300 text-center">
                      Afternoon
                    </p>
                    {pmHours.map((hour) => {
                      const label = formatHourRange(hour);
                      const eventsAtHour = dailyItems.filter((item) => {
                        const time = item.time || '06:00';
                        const [h] = time.split(':');
                        return Number(h) === hour;
                      });
                      const hasTeacherBlock = eventsAtHour.some((e) => (e.kind ?? 'reminder') === 'teacherBlock');
                      const isActive = activeScheduleHour === hour;
                      return (
                        <div
                          key={hour}
                          onClick={() => openEditorFor(hour, eventsAtHour[0])}
                          className={`cursor-pointer flex flex-col items-center justify-center text-center text-[11px] min-h-14 ${
                            hasTeacherBlock
                              ? 'bg-emerald-50/80 dark:bg-emerald-900/30'
                              : 'bg-emerald-50/40 dark:bg-slate-900/40'
                          } rounded-2xl px-3 py-2 border ${
                            isActive ? 'border-emerald-500 dark:border-emerald-400' : 'border-emerald-100/70 dark:border-slate-700'
                          } shadow-sm`}
                        >
                          <div className="whitespace-nowrap text-emerald-700 dark:text-emerald-200 font-semibold">
                            {label}
                          </div>
                          <div className="w-full space-y-1">
                            {eventsAtHour.length === 0 ? (
                              <p className="text-[10px] text-emerald-900/40 dark:text-emerald-100/40">&nbsp;</p>
                            ) : (
                              eventsAtHour.map((e) => {
                                const kind = e.kind ?? 'reminder';
                                const isEventLike = kind === 'event' || kind === 'appointment' || kind === 'meeting';
                                const chipColor =
                                  kind === 'teacherBlock'
                                    ? 'bg-indigo-500 text-white'
                                    : isEventLike
                                      ? 'bg-emerald-500 text-white'
                                      : 'bg-amber-500 text-white';
                                return (
                                  <div
                                    key={e.id}
                                    onClick={(ev) => {
                                      ev.stopPropagation();
                                      openEditorFor(hour, e);
                                    }}
                                    className="px-2 py-1 rounded-lg bg-white/80 dark:bg-slate-900/80 border border-slate-200/70 dark:border-slate-700/70 flex flex-col items-center text-center gap-1"
                                  >
                                    <div className="flex items-center justify-center gap-2">
                                      <span className="font-semibold truncate max-w-[120px]">{e.title}</span>
                                      <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-[0.16em] ${chipColor}`}>
                                        {kind === 'teacherBlock'
                                          ? 'Teacher'
                                          : isEventLike
                                            ? 'Event'
                                            : 'Reminder'}
                                      </span>
                                    </div>
                                    <p className="text-[10px] text-slate-600 dark:text-slate-300">
                                      {e.time || 'Any time'}
                                      {e.endTime ? ` – ${e.endTime}` : ''}
                                      {e.recurrence !== 'once' && ` · ${e.recurrence}`}
                                    </p>
                                    {e.notes && (
                                      <p className="text-[10px] text-slate-600 dark:text-slate-200 line-clamp-2">
                                        {e.notes}
                                      </p>
                                    )}
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
              )}

              {scheduleView === 'weekly' && (
                <>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400 mb-1">
                    This week
                  </p>
                  <div className="space-y-1 max-h-40 overflow-y-auto custom-scrollbar text-[9px]">
                    {[
                      { label: 'Mon', idx: 1 },
                      { label: 'Tue', idx: 2 },
                      { label: 'Wed', idx: 3 },
                      { label: 'Thu', idx: 4 },
                      { label: 'Fri', idx: 5 },
                      { label: 'Sat', idx: 6 },
                      { label: 'Sun', idx: 0 },
                    ].map(({ label, idx }) => {
                      const weekStart = (() => {
                        const d = new Date(cursorDate);
                        const day = d.getDay();
                        const diff = (day + 6) % 7; // Monday
                        d.setDate(d.getDate() - diff);
                        d.setHours(0, 0, 0, 0);
                        return d;
                      })();
                      const dayDate = new Date(weekStart);
                      dayDate.setDate(weekStart.getDate() + (idx === 0 ? 6 : idx - 1));
                      const dayEvents = sorted
                        .filter((item) => isOnDate(item, dayDate))
                        .sort((a, b) => (a.time || '').localeCompare(b.time || ''));
                      const isWeekend = idx === 0 || idx === 6;
                      return (
                        <div
                          key={label}
                          className={`flex items-start gap-2 rounded-lg border px-1.5 py-1 ${
                            isWeekend
                              ? 'border-amber-300/70 bg-amber-50/70 dark:bg-amber-900/20'
                              : 'border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/70'
                          }`}
                        >
                          <div className="w-10 text-[9px] font-bold text-slate-600 dark:text-slate-300">
                            {label}
                          </div>
                          <div className="flex-1 flex flex-wrap gap-1">
                            {dayEvents.length === 0 ? (
                              <span className="text-[8px] text-slate-400 dark:text-slate-500">No items</span>
                            ) : (
                              dayEvents.map((e) => {
                                const kind = e.kind ?? 'reminder';
                                const isEventLike = kind === 'event' || kind === 'appointment' || kind === 'meeting';
                                const chipColor =
                                  isEventLike
                                    ? 'bg-emerald-500/90 text-white'
                                    : kind === 'teacherBlock'
                                      ? 'bg-indigo-500/90 text-white'
                                      : 'bg-amber-500/90 text-white';
                                return (
                                  <button
                                    key={e.id}
                                    type="button"
                                    onClick={() => openEditorFor(null, e)}
                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${chipColor} whitespace-nowrap max-w-full`}
                                  >
                                    <span className="text-[8px] font-mono">
                                      {e.time || '—'}
                                    </span>
                                    <span className="text-[8px] font-semibold truncate max-w-[96px]">
                                      {e.title}
                                    </span>
                                  </button>
                                );
                              })
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {scheduleView === 'monthly' && (
                <>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-300">
                    This month at a glance
                  </p>
                  <div className="mt-1 text-[9px] text-slate-700 dark:text-slate-200 bg-gradient-to-b from-emerald-50/90 via-white/95 to-white/90 dark:from-emerald-900/40 dark:via-slate-900/80 dark:to-slate-950/90 rounded-2xl border border-emerald-200/80 dark:border-emerald-700/60 px-2 py-2 shadow-inner">
                    <div className="grid grid-cols-7 gap-1 mb-1">
                      {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label) => (
                        <div key={label} className="text-center font-semibold uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-300">
                          {label}
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-7 gap-1 text-[9px]">
                      {(() => {
                        const year = cursorDate.getFullYear();
                        const month = cursorDate.getMonth();
                        const firstOfMonth = new Date(year, month, 1);
                        const startOffset = (firstOfMonth.getDay() + 6) % 7; // Monday as first column
                        const daysInMonth = new Date(year, month + 1, 0).getDate();
                        const cells = 42; // 6 weeks

                        const itemsForMonth = sorted.filter((item) => {
                          if (item.kind === 'teacherBlock') return false;
                          const d = new Date(item.date);
                          return d.getFullYear() === year && d.getMonth() === month;
                        });

                        const cellsArray = [];
                        for (let i = 0; i < cells; i += 1) {
                          const dayNumber = i - startOffset + 1;
                          const inMonth = dayNumber >= 1 && dayNumber <= daysInMonth;
                          const cellDate = new Date(year, month, dayNumber);
                          const iso = cellDate.toISOString().slice(0, 10);

                          const dayItems = inMonth
                            ? itemsForMonth.filter((item) => isOnDate(item, cellDate))
                            : [];

                          const isToday =
                            inMonth &&
                            (() => {
                              const now = new Date();
                              return (
                                now.getFullYear() === year &&
                                now.getMonth() === month &&
                                now.getDate() === dayNumber
                              );
                            })();

                          cellsArray.push(
                            <div
                              key={i}
                              onClick={() => {
                                if (!inMonth) return;
                                openEditorFor(null, undefined, iso);
                              }}
                              className={`min-h-[48px] rounded-lg border px-1 py-1 flex flex-col gap-0.5 ${
                                !inMonth
                                  ? 'border-transparent'
                                  : 'border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/80'
                              }`}
                            >
                              <div
                                className={`text-[9px] font-semibold ${
                                  isToday
                                    ? 'text-emerald-700 dark:text-emerald-300'
                                    : 'text-slate-600 dark:text-slate-300'
                                }`}
                              >
                                {inMonth ? dayNumber : ''}
                              </div>
                              <div className="flex-1 space-y-0.5 overflow-hidden">
                                {dayItems.slice(0, 3).map((item) => {
                                  const kind = item.kind ?? 'reminder';
                                  const isEventLike = kind === 'event' || kind === 'appointment' || kind === 'meeting';
                                  const chipColor = isEventLike
                                    ? 'bg-emerald-500/90 text-white'
                                    : 'bg-lime-400/90 text-emerald-950';
                                  return (
                                    <div
                                      key={item.id}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openEditorFor(null, item, iso);
                                      }}
                                      className={`rounded-full px-1.5 py-0.5 text-[8px] font-semibold truncate ${chipColor}`}
                                    >
                                      {item.title}
                                    </div>
                                  );
                                })}
                                {dayItems.length > 3 && (
                                  <div className="text-[8px] text-slate-400 dark:text-slate-500">
                                    +{dayItems.length - 3} more
                                  </div>
                                )}
                              </div>
                            </div>,
                          );
                        }
                        return cellsArray;
                      })()}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Bottom: sticky add/edit sheet (rendered fixed above bottom nav) */}
          <div
            className="fixed left-1/2 -translate-x-1/2 z-[91] w-full max-w-md px-4"
            style={{ bottom: '6rem' }}
          >
            <div className="rounded-2xl bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-700 shadow-lg overflow-hidden">
              <button
                type="button"
                onClick={() => setScheduleFormOpen((open) => !open)}
                className="w-full flex items-center justify-between px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-600 dark:text-slate-300"
              >
                <span>{editingScheduleId ? 'Edit item' : `Add ${scheduleView} item`}</span>
                <span className="text-[11px] font-semibold">{scheduleFormOpen ? '−' : '+'}</span>
              </button>
              {scheduleFormOpen && (
                <div className="p-3 space-y-2 border-t border-slate-200 dark:border-slate-700 max-h-[55vh] overflow-y-auto custom-scrollbar">
                  <input
                    type="text"
                    value={scheduleTitle}
                    onChange={(e) => setScheduleTitle(e.target.value)}
                    placeholder="Title"
                    className="w-full mb-1 px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/80 text-[11px] text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-400"
                  />
                  <div className="flex gap-2">
                    <select
                      value={scheduleKind}
                      onChange={(e) => setScheduleKind(e.target.value as 'event' | 'reminder' | 'teacherBlock')}
                      className="flex-1 px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/80 text-[11px] text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-400"
                    >
                      <option value="reminder">Reminder</option>
                      <option value="event">Event</option>
                      <option value="appointment">Appointment</option>
                      <option value="meeting">Meeting</option>
                    </select>
                    <input
                      type="time"
                      step={900}
                      value={scheduleTime}
                      onChange={(e) => setScheduleTime(e.target.value)}
                      className="w-[130px] px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/80 text-[11px] text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-400"
                    />
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="date"
                      value={scheduleDate}
                      onChange={(e) => setScheduleDate(e.target.value)}
                      className="flex-1 px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/80 text-[11px] text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-400"
                    />
                    <select
                      value={scheduleRecurrence}
                      onChange={(e) => setScheduleRecurrence(e.target.value as any)}
                      className="flex-1 px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/80 text-[11px] text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-400"
                    >
                      <option value="once">Once</option>
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <select
                      value={scheduleCourseId}
                      onChange={(e) => setScheduleCourseId(e.target.value)}
                      className="flex-1 px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/80 text-[11px] text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-400"
                    >
                      <option value="">Course (optional)</option>
                      {courses.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <select
                    value={scheduleAssignmentId}
                    onChange={(e) => setScheduleAssignmentId(e.target.value)}
                    className="w-full px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/80 text-[11px] text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-400"
                  >
                    <option value="">Assignment (optional)</option>
                    {assignments.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.title}
                      </option>
                    ))}
                  </select>
                  <textarea
                    value={scheduleNotes}
                    onChange={(e) => setScheduleNotes(e.target.value)}
                    placeholder="Notes (optional)"
                    className="w-full h-16 px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/80 text-[11px] text-slate-800 dark:text-slate-100 resize-none outline-none focus:border-indigo-400"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={saveItem}
                      className="mt-1 flex-1 py-2 rounded-xl bg-indigo-600 text-white text-[11px] font-black uppercase tracking-[0.16em] active:scale-[0.98] transition-all"
                    >
                      {editingScheduleId ? 'Update schedule' : 'Add to schedule'}
                    </button>
                    {editingScheduleId && (
                      <button
                        type="button"
                        onClick={() => editingScheduleId && removeItem(editingScheduleId)}
                        className="mt-1 px-3 py-2 rounded-xl border border-red-300 text-[11px] font-semibold text-red-600"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </PageWrapper>
    );
  };

  if (showOnboarding) {
    return (
      <Onboarding
        onComplete={() => setShowOnboarding(false)}
        onSkip={() => setShowOnboarding(false)}
      />
    );
  }

  return (
    <AppContext.Provider value={appContextValue}>
    <>
      <style>{`
        @media print {
          .fixed.bottom-3 {
            display: none !important;
          }
        }
      `}</style>
      <div id="main-content" className="h-full font-sans text-slate-800 dark:text-slate-200 selection:bg-indigo-500/30 overflow-hidden relative gradient-animate flex flex-col" tabIndex={-1}>

      {(!isOnline && !isOfflineBannerDismissed) && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-top duration-500 w-[90%] max-w-sm">
          <div className="px-4 py-3 bg-amber-500/90 backdrop-blur-xl border border-amber-400/50 rounded-xl shadow-xl flex items-center justify-between text-white drop-shadow-md">
            <div className="flex items-center gap-3">
              <WifiOff className="w-4 h-4" /> 
              <span className="font-black text-[10px] uppercase tracking-widest">Offline Mode</span>
            </div>
            <button onClick={() => setIsOfflineBannerDismissed(true)} className="p-1 hover:bg-white/20 rounded-lg transition-colors">
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {(showOnlineRestore && isOnline) && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-top duration-500 w-[90%] max-w-sm">
          <div className="px-4 py-2.5 bg-emerald-500/90 backdrop-blur-xl border border-emerald-400/50 rounded-xl shadow-lg flex items-center gap-2 text-white font-black text-[9px] uppercase tracking-widest justify-center drop-shadow-md">
            <Wifi className="w-4 h-4" /> <span>Real-time Sync Active</span>
          </div>
        </div>
      )}

      {/* RENDER ROUTER — single flex child so content fits viewport */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
      {phase === AppPhase.AUTHENTICATION && <AuthView />}
      {phase === AppPhase.PLAN && renderPlan()}
      {phase === AppPhase.SCHEDULE && renderSchedule()}
      {phase === AppPhase.DASHBOARD && renderDashboard()}
      {phase === AppPhase.GRADE_COURSE_PICKER && renderGradeCoursePicker()}
      {phase === AppPhase.ROSTER_VIEW && renderRosterView()}
      {phase === 'COURSE_CREATION' && renderCourseCreation()}
      {phase === AppPhase.ASSIGNMENT_SELECT && renderAssignmentSelect()}
      {phase === AppPhase.ASSIGNMENT_CREATION && renderAssignmentCreation()}
      {phase === AppPhase.RUBRIC_SETUP && renderRubricSetup()}
      {phase === AppPhase.MODE_SELECTION && renderModeSelection()}
      {phase === AppPhase.GRADING_LOOP && renderGradingLoop()}
      {phase === AppPhase.AUDIT && renderAudit()}
      {phase === AppPhase.SYNCING && renderSyncing()}
      {phase === AppPhase.FINALE && renderFinale()}
      {phase === AppPhase.PAYWALL && renderPaywall()}
      {phase === AppPhase.RECORDS && (
        <PageWrapper
          headerTitle={educatorName || 'Communicate'}
          headerSubtitle={todayLabel || undefined}
          isOnline={isOnline}
          isDarkMode={isDarkMode}
          setIsDarkMode={setIsDarkMode}
          syncStatus={syncStatus}
        >
          <CommunicationDashboard educatorName={educatorName} courses={courses} classroom={classroom} students={students} accessToken={accessToken} />
        </PageWrapper>
      )}
      {phase === AppPhase.OPTIONS && renderOptions()}
      </div>

      {/* Global voice capture overlay disabled – voice handled inline via VoiceInputButton components */}

      {/* GLOBAL BOTTOM NAV (hidden in Class Presenter for clean projection) */}
      {phase !== AppPhase.CLASS_PRESENTER && (
      <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-[90] w-full max-w-md px-4">
        <div className="relative">
          <div className="bg-white/95 dark:bg-slate-900/95 border border-slate-200/80 dark:border-slate-700/80 rounded-xl shadow-lg px-2 h-16 flex items-center justify-between gap-1">
            <button
              type="button"
              onClick={() => setPhase(AppPhase.AUTHENTICATION)}
              className={`flex flex-col items-center flex-1 py-1 rounded-xl ${
                phase === AppPhase.AUTHENTICATION
                  ? 'text-red-500'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              <Home className="w-4 h-4 mb-0.5" />
              <span className="text-[7px] font-semibold uppercase tracking-[0.16em]">Dashboard</span>
            </button>
            <button
              type="button"
              disabled={!isSignedIn}
              onClick={() => {
                if (!isSignedIn) return;
                setPhase(AppPhase.PLAN);
              }}
              className={`flex flex-col items-center flex-1 py-1 rounded-xl ${
                phase === AppPhase.PLAN
                  ? 'text-blue-500'
                  : isSignedIn
                    ? 'text-slate-600 dark:text-slate-300'
                    : 'text-slate-400 dark:text-slate-600'
              }`}
            >
              <BookOpen className="w-4 h-4 mb-0.5" />
              <span className="text-[7px] font-semibold uppercase tracking-[0.16em]">Plan</span>
            </button>
            <button
              type="button"
              disabled={!isSignedIn}
              onClick={() => {
                if (!isSignedIn) return;
                setPhase(AppPhase.DASHBOARD);
              }}
              className={`flex flex-col items-center flex-1 py-1 rounded-xl ${
                phase === AppPhase.DASHBOARD
                  ? 'text-yellow-500'
                  : isSignedIn
                    ? 'text-slate-600 dark:text-slate-300'
                    : 'text-slate-400 dark:text-slate-600'
              }`}
            >
              <LayoutDashboard className="w-4 h-4 mb-0.5" />
              <span className="text-[7px] font-semibold uppercase tracking-[0.16em]">Grade</span>
            </button>
            <button
              type="button"
              onClick={() => {
                if (!navHasSupport) return;
                const isEditable = (el: HTMLElement | null) =>
                  !!el &&
                  (el instanceof HTMLTextAreaElement ||
                    el instanceof HTMLInputElement ||
                    (el as any).isContentEditable);
                const activeEl = document.activeElement as HTMLElement | null;
                const target = isEditable(activeEl)
                  ? activeEl
                  : isEditable(lastFocusedFieldRef.current)
                    ? (lastFocusedFieldRef.current as HTMLElement)
                    : null;
                if (!target) return;
                if (!isNavListening) {
                  if (voiceTargetRef.current && voiceTargetRef.current !== target) {
                    voiceTargetRef.current.classList.remove('dg-voice-target');
                  }
                  voiceTargetRef.current = target;
                  target.classList.add('dg-voice-target');
                  // Keep focus on the field so cursor insertion works.
                  try { target.focus(); } catch { /* ignore */ }
                }
                toggleNavListening();
              }}
              className={`flex items-center justify-center w-11 h-11 rounded-full border-[2px] ${
                !navHasSupport
                  ? 'bg-indigo-400/30 text-white/60 border-white/40 dark:border-slate-900/40 cursor-not-allowed'
                  : isNavListening
                    ? 'bg-red-500 text-white border-white/80 dark:border-slate-900/80 animate-pulse'
                    : 'bg-slate-950 text-white border-white/80 dark:bg-white dark:text-slate-950 dark:border-slate-900/80 active:scale-95 transition-transform'
              }`}
              title={
                !navHasSupport
                  ? 'Voice input unavailable'
                  : isNavListening
                    ? 'Stop voice input'
                    : 'Start voice input for the focused field'
              }
              aria-label="Voice capture"
            >
              <Mic className="w-5 h-5" />
            </button>

            <button
              type="button"
              disabled={!isSignedIn}
              onClick={() => {
                if (!isSignedIn) return;
                setPhase(AppPhase.SCHEDULE);
              }}
              className={`flex flex-col items-center flex-1 py-1 rounded-xl ${
                phase === AppPhase.SCHEDULE
                  ? 'text-green-500'
                  : isSignedIn
                    ? 'text-slate-600 dark:text-slate-300'
                    : 'text-slate-400 dark:text-slate-600'
              }`}
            >
              <Calendar className="w-4 h-4 mb-0.5" />
              <span className="text-[7px] font-semibold uppercase tracking-[0.16em]">Schedule</span>
            </button>
            <button
              type="button"
              disabled={!isSignedIn}
              onClick={() => {
                if (!isSignedIn) return;
                setPhase(AppPhase.RECORDS);
              }}
              className={`flex flex-col items-center flex-1 py-1 rounded-xl ${
                phase === AppPhase.RECORDS
                  ? 'text-purple-500'
                  : isSignedIn
                    ? 'text-slate-600 dark:text-slate-300'
                    : 'text-slate-400 dark:text-slate-600'
              }`}
            >
              <MessageCircle className="w-4 h-4 mb-0.5" />
              <span className="text-[7px] font-semibold uppercase tracking-[0.16em]">Communicate</span>
            </button>
            <button
              type="button"
              disabled={!isSignedIn}
              onClick={() => {
                if (!isSignedIn) return;
                setPhase(AppPhase.OPTIONS);
              }}
              className={`flex flex-col items-center flex-1 py-1 rounded-xl ${
                phase === AppPhase.OPTIONS
                  ? 'text-slate-700 dark:text-slate-200'
                  : isSignedIn
                    ? 'text-slate-600 dark:text-slate-300'
                    : 'text-slate-400 dark:text-slate-600'
              }`}
            >
              <Settings className="w-4 h-4 mb-0.5" />
              <span className="text-[7px] font-semibold uppercase tracking-[0.16em]">Options</span>
            </button>
          </div>
        </div>
      </div>
      )}
    </div>
    <ConsentBanner />
    </>
    </AppContext.Provider>
  );
};

export default App;