import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  ChevronRight, BookOpen, Camera, Layers, CheckCircle, Users, Loader2, Trash2, 
  ArrowRight, Sparkles, CloudUpload, Zap, ZapOff, AlertCircle, Mail, KeyRound, 
  Check, Wifi, WifiOff, History as HistoryIcon, Search, X, UserCheck, Moon, 
  Sun, Target, Chrome, Apple as AppleIcon, RefreshCw, ScanLine, FileText, 
  PlusCircle, Mic, MicOff, Settings, Home, MessageCircle, LayoutDashboard,
  Calendar, Timer, Shuffle, Volume2, ClipboardList, FolderOpen, Link, Minus, Plus,
  Share2, Printer, Cloud, Wand2, UploadCloud
} from 'lucide-react';
import { AppPhase, GradingMode, Course, Assignment, Student, GradedWork, GradingResponse, GeometricData, SubscriptionStatus } from './types';
import { analyzeMultiPagePaper, analyzePaper, extractRubricFromImage, generateRubric, generateLessonScript, generateDifferentiatedLesson, type LessonScriptResult } from './services/geminiService';
import { ClassroomService } from './services/classroomService';
import { logEvent } from './analytics';
import { CommunicationDashboard } from './CommunicationDashboard';
import { card, sectionTitle, label, input, textarea, btnPrimary, btnSecondary, chip, chipInactive, helperText } from './uiStyles';

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

// --- STABLE SUB-COMPONENTS ---

const ThemeToggle: React.FC<{ isDarkMode: boolean, setIsDarkMode: (val: boolean) => void, className?: string }> = ({ isDarkMode, setIsDarkMode, className = "" }) => (
  <button 
    onClick={() => setIsDarkMode(!isDarkMode)} 
    title="Toggle theme" 
    aria-label="Toggle theme"
    className={`p-2 rounded-full transition-colors ${className}`}
  >
    {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
  </button>
);

const PageWrapper: React.FC<{ 
  children: React.ReactNode, 
  headerTitle?: string, 
  headerSubtitle?: string,
  onBack?: () => void, 
  isOnline: boolean,
  isDarkMode: boolean,
  setIsDarkMode: (val: boolean) => void,
  syncStatus?: 'idle' | 'ok' | 'error',
  onSyncClick?: () => void,
}> = ({ children, headerTitle = "DoneGrading", headerSubtitle, onBack, isOnline, isDarkMode, setIsDarkMode, syncStatus = 'idle', onSyncClick }) => {
  return (
    <div className="fixed inset-0 flex items-center justify-center p-4 overflow-hidden z-10 selection:bg-indigo-500/30">
      <div className="absolute top-4 right-4 z-50">
        <ThemeToggle isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} />
      </div>
      
      <div className="w-full max-w-lg h-full bg-transparent flex flex-col overflow-hidden animate-in zoom-in-[0.98] duration-500">
        <header className="h-16 shrink-0 flex items-center justify-between px-6">
          <div className="flex items-center gap-3">
            {onBack && (
              <button onClick={onBack} className="p-1.5 -ml-1.5 rounded-full bg-white/10 dark:bg-black/10 backdrop-blur-md shadow-sm transition-all active:scale-90">
                <ChevronRight className="w-5 h-5 rotate-180 text-slate-800 dark:text-slate-100" />
              </button>
            )}
            
            <div className="flex flex-col backdrop-blur-md bg-white/10 dark:bg-black/10 px-3 py-1.5 rounded-xl shadow-sm">
              <h1 className="text-lg font-black bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-200 text-transparent bg-clip-text tracking-tight truncate leading-none pb-0.5 drop-shadow-sm">
                {headerTitle}
              </h1>
              {headerSubtitle && (
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-800 dark:text-slate-200 mt-0.5 drop-shadow-sm min-w-0 max-w-[min(100%,280px)]">
                  {headerSubtitle}
                </p>
              )}
            </div>
          </div>
          
          <button
            type="button"
            onClick={onSyncClick}
            className="flex items-center gap-2 backdrop-blur-md bg-white/10 dark:bg-black/10 px-3 py-1.5 rounded-xl shadow-sm active:scale-95 transition-transform"
            title={isOnline ? 'Tap to sync now' : 'Offline'}
            aria-label={isOnline ? 'Cloud sync status, tap to sync now' : 'Offline, using local cache'}
          >
            <span
              className={`w-2 h-2 rounded-full shadow-sm ${
                !isOnline
                  ? 'bg-amber-500 shadow-amber-500/50'
                  : syncStatus === 'error'
                    ? 'bg-red-500 shadow-red-500/50 animate-pulse'
                    : syncStatus === 'ok'
                      ? 'bg-emerald-500 shadow-emerald-500/50 animate-pulse'
                      : 'bg-slate-400 shadow-slate-400/50'
              }`}
            />
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-800 dark:text-slate-200 hidden sm:inline drop-shadow-sm">
              {isOnline ? (syncStatus === 'error' ? 'Sync Error' : 'Cloud Sync') : 'Local Cache'}
            </span>
          </button>
        </header>
        
        <main className="flex-1 overflow-y-auto custom-scrollbar flex flex-col p-4 pb-16 relative min-h-0">
          {children}
        </main>
      </div>
    </div>
  );
};

const useSpeechToText = (onResult: (text: string) => void) => {
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        onResult(transcript);
        setIsListening(false);
      };

      recognitionRef.current.onerror = () => setIsListening(false);
      recognitionRef.current.onend = () => setIsListening(false);
    }
  }, [onResult]);

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      try {
        recognitionRef.current?.start();
        setIsListening(true);
      } catch (e) {
        console.error("Speech recognition start failed", e);
      }
    }
  };

  return { isListening, toggleListening, hasSupport: !!recognitionRef.current };
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

const getOrCreateDriveFolder = async (token: string, folderName: string, parentId?: string) => {
  let query = `mimeType='application/vnd.google-apps.folder' and name='${folderName}' and trashed=false`;
  if (parentId) query += ` and '${parentId}' in parents`;
  
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
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [classroom, setClassroom] = useState<ClassroomService | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isOfflineBannerDismissed, setIsOfflineBannerDismissed] = useState(false);
  const [showOnlineRestore, setShowOnlineRestore] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'ok' | 'error'>('idle');
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('dg_dark_mode');
    return saved ? JSON.parse(saved) : window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [assignmentSearchQuery, setAssignmentSearchQuery] = useState('');
  
  const [educatorName, setEducatorName] = useState<string>(() => localStorage.getItem('dg_educator_name') || "");

  // Subscription state (stubbed; wire to Firebase/Stripe later)
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus>('trialing');
  const isPaid = subscriptionStatus === 'trialing' || subscriptionStatus === 'active';
  const [showMoreAuthOptions, setShowMoreAuthOptions] = useState(false);
  const [isDemoSignedIn, setIsDemoSignedIn] = useState(false);

  const [dashboardSort, setDashboardSort] = useState<SortMode>(() => localStorage.getItem('dg_dash_sort') as SortMode || 'recent');
  const [assignmentSort, setAssignmentSort] = useState<SortMode>(() => localStorage.getItem('dg_asn_sort') as SortMode || 'recent');

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

  const welcomeSnippets = useMemo(() => {
    return [
      {
        id: 'why-teachers-love',
        render: () => (
          <div className="mt-3 w-full flex flex-wrap justify-center gap-1.5">
            <span className="px-2.5 py-1 rounded-full bg-white/80 dark:bg-slate-900/80 text-[9px] font-semibold text-slate-700 dark:text-slate-200 border border-slate-200/80 dark:border-slate-700/80">
              Auto‑grades stacks of papers
            </span>
            <span className="px-2.5 py-1 rounded-full bg-white/80 dark:bg-slate-900/80 text-[9px] font-semibold text-slate-700 dark:text-slate-200 border border-slate-200/80 dark:border-slate-700/80">
              Syncs to Google Classroom
            </span>
            <span className="px-2.5 py-1 rounded-full bg-white/80 dark:bg-slate-900/80 text-[9px] font-semibold text-slate-700 dark:text-slate-200 border border-slate-200/80 dark:border-slate-700/80">
              Emails students with feedback
            </span>
          </div>
        ),
      },
      {
        id: 'today-this-will-do',
        render: () => (
          <p className="mt-3 text-[10px] text-slate-600 dark:text-slate-300 text-center font-semibold">
            Today this app will help you: import a class, scan work, and post grades back to Classroom.
          </p>
        ),
      },
      {
        id: 'trust-safety',
        render: () => (
          <p className="mt-3 text-[9px] text-slate-500 dark:text-slate-400 text-center">
            FERPA‑aware · Data stays in your Google account · You approve every grade.
          </p>
        ),
      },
      {
        id: 'micro-stats',
        render: () => (
          <p className="mt-3 text-[10px] text-slate-600 dark:text-slate-300 text-center font-semibold">
            Up to 5× faster grading, no special forms, built for your phone.
          </p>
        ),
      },
      {
        id: 'quick-start',
        render: () => (
          <p className="mt-3 text-[10px] text-slate-600 dark:text-slate-300 text-center">
            To get started you need: a Google Classroom class, a stack of student work, and 5 spare minutes.
          </p>
        ),
      },
      {
        id: 'role-selector',
        render: () => (
          <div className="mt-3 flex justify-center gap-2 text-[9px]">
            <span className="px-2 py-1 rounded-full bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-700/80 text-slate-600 dark:text-slate-300">
              Elementary
            </span>
            <span className="px-2 py-1 rounded-full bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-700/80 text-slate-600 dark:text-slate-300">
              Middle
            </span>
            <span className="px-2 py-1 rounded-full bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-700/80 text-slate-600 dark:text-slate-300">
              High School
            </span>
          </div>
        ),
      },
      {
        id: 'support-line',
        render: () => (
          <p className="mt-3 text-[9px] text-slate-500 dark:text-slate-400 text-center">
            Need help getting set up? Email <span className="font-semibold">donegrading@gmail.com</span>.
          </p>
        ),
      },
      {
        id: 'orientation',
        render: () => (
          <p className="mt-3 text-[10px] text-slate-600 dark:text-slate-300 text-center">
            In 2 minutes: pick a class, scan work, and sync grades back to Classroom.
          </p>
        ),
      },
    ];
  }, []);

  const welcomeSnippetIndex = useMemo(
    () => Math.floor(Math.random() * welcomeSnippets.length),
    [welcomeSnippets.length]
  );
  
  // Fixed Google OAuth Client ID for Classroom integration
  const GOOGLE_CLIENT_ID = '137273476022-4il1dq3mj28v0g1c2t59mt3l341evlbl.apps.googleusercontent.com';
  
  const [authError, setAuthError] = useState<string | null>(null);
  const [creationError, setCreationError] = useState<string | null>(null);

  const [courses, setCourses] = useState<Course[]>(() => {
    const saved = localStorage.getItem('dg_cache_courses');
    return saved ? JSON.parse(saved) : [];
  });
  const [assignments, setAssignments] = useState<Assignment[]>(() => {
    const saved = localStorage.getItem('dg_cache_assignments');
    return saved ? JSON.parse(saved) : [];
  });
  
  const [students, setStudents] = useState<Student[]>(() => {
    const saved = localStorage.getItem('dg_cache_students');
    return saved ? JSON.parse(saved) : [];
  });

  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
  const [gradingMode, setGradingMode] = useState<GradingMode | null>(null);

  const isSignedIn = useMemo(
    () => !!accessToken || isDemoSignedIn,
    [accessToken, isDemoSignedIn]
  );
  
  const [gradedWorks, setGradedWorks] = useState<GradedWork[]>(() => {
    const saved = localStorage.getItem('dg_pending_sync');
    return saved ? JSON.parse(saved) : [];
  });

  const [history, setHistory] = useState<GradedWork[]>(() => {
    const saved = localStorage.getItem('dg_history');
    return saved ? JSON.parse(saved) : [];
  });

  const [isProcessing, setIsProcessing] = useState(false);
  const [isGeneratingRubric, setIsGeneratingRubric] = useState(false);
  const [isSyncingClassroom, setIsSyncingClassroom] = useState(false);
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
  
  const [isAutoMode, setIsAutoMode] = useState(true);
  const [isFlashOn, setIsFlashOn] = useState(false);
  const [showQuickPick, setShowQuickPick] = useState(false);
  const [pendingWork, setPendingWork] = useState<Partial<GradingResponse> & { imageUrls: string[] } | null>(null);
  const [activeGeometry, setActiveGeometry] = useState<GeometricData | null>(null);
  const [scanHealth, setScanHealth] = useState<number>(0);
  const [oneWordCommand, setOneWordCommand] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  
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

  // Plan tab (The Architect)
  const PLAN_STATE_KEY = 'dg_plan_state_v1';
  const FILE_VAULT_KEY = 'dg_file_vault_links';

  const [lessonTopic, setLessonTopic] = useState('');
  const [lessonResult, setLessonResult] = useState<LessonScriptResult | null>(null);
  const [lessonLoading, setLessonLoading] = useState(false);
  const [diffLevel, setDiffLevel] = useState<'simplified' | 'advanced' | null>(null);
  const [differentiationText, setDifferentiationText] = useState('');
  const [diffLoading, setDiffLoading] = useState(false);
  const [fileVaultLinks, setFileVaultLinks] = useState<{ label: string; url: string }[]>(() => {
    try {
      const raw = localStorage.getItem(FILE_VAULT_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  });

  const [planLessonTitle, setPlanLessonTitle] = useState('');
  const [planUnit, setPlanUnit] = useState('Unit 4: Ecosystems');
  const [planVersion, setPlanVersion] = useState<PlanVersion>('Standard');
  const [planTab, setPlanTab] = useState<'context' | 'blocks' | 'resources' | 'assessment'>('context');
  const [planBlockTab, setPlanBlockTab] = useState<'A' | 'B' | 'C' | 'D'>('A');
  const [planLastSaved, setPlanLastSaved] = useState<Date | null>(null);
  const [isPlanSaving, setIsPlanSaving] = useState(false);

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

  // Classroom tab (Control Center)
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerInitialMinutes, setTimerInitialMinutes] = useState(5);
  const [randomPicked, setRandomPicked] = useState<Student | null>(null);
  const [noiseLevel, setNoiseLevel] = useState(0);
  const [noiseMeterMicOn, setNoiseMeterMicOn] = useState(false);
  const [behaviorScores, setBehaviorScores] = useState<Record<string, number>>({});
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micAnimationRef = useRef<number | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const sortItems = <T extends { name?: string, title?: string, lastUsed?: number }>(items: T[], mode: SortMode): T[] => {
    const result = [...items];
    if (mode === 'recent') return result.sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0));
    if (mode === 'alphabetical') return result.sort((a, b) => (a.name || a.title || '').localeCompare(b.name || b.title || ''));
    return result; 
  };

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
  useEffect(() => { try { localStorage.setItem(FILE_VAULT_KEY, JSON.stringify(fileVaultLinks)); } catch (_) {} }, [fileVaultLinks, FILE_VAULT_KEY]);
  useEffect(() => {
    // Lightweight autosave for the Plan tab so educators don't lose work.
    try {
      const payload = {
        lessonTopic,
        lessonTitle: planLessonTitle,
        unit: planUnit,
        version: planVersion,
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
      setPlanLastSaved(new Date());
    } catch {
      // ignore
    }
  }, [
    PLAN_STATE_KEY,
    lessonTopic,
    planLessonTitle,
    planUnit,
    planVersion,
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
  useEffect(() => {
    if (!timerRunning) return;
    timerIntervalRef.current = setInterval(() => {
      setTimerSeconds((s) => {
        if (s <= 1) {
          if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
          timerIntervalRef.current = null;
          setTimerRunning(false);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => { if (timerIntervalRef.current) clearInterval(timerIntervalRef.current); };
  }, [timerRunning]);

  // Noise meter: real microphone input when enabled
  useEffect(() => {
    if (!noiseMeterMicOn) {
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((t) => t.stop());
        micStreamRef.current = null;
      }
      if (micAnimationRef.current != null) {
        cancelAnimationFrame(micAnimationRef.current);
        micAnimationRef.current = null;
      }
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        micStreamRef.current = stream;
        const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioContextClass) return;
        const audioContext = new AudioContextClass();
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.7;
        source.connect(analyser);
        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        const update = () => {
          if (cancelled) return;
          analyser.getByteFrequencyData(dataArray);
          const sum = dataArray.reduce((a, b) => a + b, 0);
          const avg = sum / dataArray.length;
          const level = Math.min(100, Math.round((avg / 255) * 180));
          setNoiseLevel(level);
          micAnimationRef.current = requestAnimationFrame(update);
        };
        micAnimationRef.current = requestAnimationFrame(update);
      } catch (e) {
        console.error('Microphone access failed', e);
        setNoiseMeterMicOn(false);
      }
    })();
    return () => {
      cancelled = true;
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((t) => t.stop());
        micStreamRef.current = null;
      }
      if (micAnimationRef.current != null) {
        cancelAnimationFrame(micAnimationRef.current);
        micAnimationRef.current = null;
      }
    };
  }, [noiseMeterMicOn]);

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

  const loginMock = () => {
    if (courses.length === 0) {
      setCourses([
        { id: 'demo1', name: 'AP Biology - Period 3', period: 'Period 3', source: 'local', lastUsed: Date.now() },
        { id: 'demo2', name: 'Chemistry Honors', period: 'Period 1', source: 'local', lastUsed: Date.now() - 100000 },
        { id: 'demo3', name: 'Environmental Science', period: 'Period 5', source: 'local', lastUsed: Date.now() - 500000 }
      ]);
    }
    logEvent('auth_demo_login');
    setIsDemoSignedIn(true);
    setPhase(AppPhase.DASHBOARD);
  };

  const handleEmailLogin = (e: React.FormEvent) => { e.preventDefault(); if (!email || !password) { setAuthError("Email and password required."); return; } loginMock(); };

  // Shared logic: complete sign-in after we have an access token (used by both popup callback and redirect hash)
  const completeGoogleSignIn = useCallback((accessToken: string) => {
    setAccessToken(accessToken);
    const service = new ClassroomService(accessToken);
    setClassroom(service);
    setAuthError(null);
    logEvent('auth_google_sign_in');
    setPhase(AppPhase.DASHBOARD);

    fetch('https://classroom.googleapis.com/v1/userProfiles/me', {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
      .then(res => res.json())
      .then(profileData => {
        if (profileData.name?.fullName) {
          setEducatorName(profileData.name.fullName);
          localStorage.setItem('dg_educator_name', profileData.name.fullName);
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

  // Handle return from Google OAuth redirect (token in URL hash) so we never get stuck on "One moment please" in a popup
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash) return;
    const params = new URLSearchParams(hash.replace(/^#/, ''));
    const accessToken = params.get('access_token');
    if (accessToken) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
      completeGoogleSignIn(accessToken);
    }
  }, [completeGoogleSignIn]);

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
        client_id: GOOGLE_CLIENT_ID,
        scope: "https://www.googleapis.com/auth/classroom.courses https://www.googleapis.com/auth/classroom.courses.readonly https://www.googleapis.com/auth/classroom.coursework.me https://www.googleapis.com/auth/classroom.rosters.readonly https://www.googleapis.com/auth/classroom.coursework.students https://www.googleapis.com/auth/classroom.profile.emails https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/drive.file",
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

  const startGrading = (mode: GradingMode) => { setGradingMode(mode); setPhase(AppPhase.GRADING_LOOP); };
  
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
    const shareText = 'DoneGrading – scan, grade, and sync to Google Classroom.';
    try {
      if ((navigator as any).share) {
        await (navigator as any).share({
          title: 'DoneGrading',
          text: shareText,
          url: shareUrl,
        });
      } else if (navigator.clipboard && (navigator.clipboard as any).writeText) {
        await navigator.clipboard.writeText(shareUrl);
        alert('Link copied to clipboard: ' + shareUrl);
      }
    } catch (e) {
      console.error('Share failed', e);
    }
  };

  const handleSignOut = () => {
    setAccessToken(null);
    setClassroom(null);
    setIsDemoSignedIn(false);
    setSelectedCourse(null);
    setSelectedAssignment(null);
    setAuthError(null);
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
  };

  const handleRescan = (index: number) => {
    handleDeleteScan(index);
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
    if (isProcessing || cooldownRef.current || showQuickPick || cameraError) return;
    if (gradingMode === GradingMode.MULTI_PAGE && multiPageCaptureInFlightRef.current) return;
    
    const optimalHighResBase64 = captureFrame(0.9);
    const apiBase64 = captureFrame(0.4);
    
    if (!optimalHighResBase64 || !apiBase64 || !selectedAssignment) return;

    if (!isOnline) {
      return; 
    }

    try {
      const result = await analyzePaper(apiBase64, customRubric || selectedAssignment.rubric, selectedAssignment.maxScore, students.map(s => s.name), true);
      if (result) { setScanHealth(result.scanHealth || 0); setOneWordCommand(result.oneWordCommand || null); setActiveGeometry(result.corners || null); }
      
      const captureThreshold = gradingMode === GradingMode.MULTI_PAGE ? 88 : 80;
      if (!result || (result.scanHealth ?? 0) < captureThreshold) return;
      
      setIsProcessing(true);
      
      const croppedBase64 = await cropImageToBoundingBox(optimalHighResBase64, result.corners || null);

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
            detectedStudentName: prev.detectedStudentName || result.studentName || undefined,
          };
        });
        setMultiPageHint('Captured. Turn the page, then keep scanning.');
        window.setTimeout(() => setMultiPageHint(null), 1200);
        cooldownRef.current = true;
        setTimeout(() => { cooldownRef.current = false; }, 2500);
        multiPageCaptureInFlightRef.current = false;
        return;
      }

      setPendingWork({ ...result, imageUrls: [`data:image/jpeg;base64,${croppedBase64}`] });
      setManualScore(result.score?.toString() || ''); setManualFeedback(result.feedback || '');
      
      const detectedIds = new Set<string>();
      if (result.studentName) {
         const lowerDetected = result.studentName.toLowerCase().replace(/[^a-z]/g, '');
         if (lowerDetected.length > 2) {
             const match = students.find(s => {
               const sName = s.name.toLowerCase().replace(/[^a-z]/g, '');
               return sName.includes(lowerDetected) || lowerDetected.includes(sName);
             });
             if (match) detectedIds.add(match.id);
         }
      }
      setSelectedQuickPickIds(detectedIds); 
      setShowQuickPick(true);
    } catch (err) { 
      console.error(err); 
    } finally { 
      setIsProcessing(false); 
    }
  }, [isProcessing, isOnline, cameraError, captureFrame, selectedAssignment, students, showQuickPick, customRubric, gradingMode, computeAHash, hammingDistance]);

  useEffect(() => {
    let interval: number | null = null;
    if (phase === AppPhase.GRADING_LOOP && isOnline && !showQuickPick && !isProcessing && !cameraError) {
      interval = window.setInterval(() => handleAutoSnap(), 500); 
    }
    return () => { if (interval) clearInterval(interval); };
  }, [phase, isOnline, showQuickPick, isProcessing, cameraError, handleAutoSnap]);

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
    setStudents(students.map(s => selectedQuickPickIds.has(s.id) ? { ...s, lastUsed: Date.now() } : s));
    setShowQuickPick(false); setPendingWork(null); setActiveGeometry(null); setScanHealth(0); setOneWordCommand(null);
    cooldownRef.current = true; setTimeout(() => { cooldownRef.current = false; }, 1000); 
  };

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
      if (detectedName) {
        const lowerDetected = detectedName.toLowerCase().replace(/[^a-z]/g, '');
        if (lowerDetected.length > 2) {
          const match = students.find(s => {
            const sName = s.name.toLowerCase().replace(/[^a-z]/g, '');
            return sName.includes(lowerDetected) || lowerDetected.includes(sName);
          });
          if (match) detectedIds.add(match.id);
        }
      }
      setSelectedQuickPickIds(detectedIds);
      setShowQuickPick(true);
    } catch (e) {
      console.error('Multi-page finalize failed', e);
    } finally {
      setIsProcessing(false);
    }
  };

  const startSyncProcess = async () => {
    if (!classroom || !isOnline || gradedWorks.length === 0 || !accessToken) return; 
    if (!isPaid) {
      setPhase(AppPhase.PAYWALL);
      return;
    }
    
    logEvent('sync_start', { count: gradedWorks.length });
    setPhase(AppPhase.SYNCING); 
    setSyncProgress({
      current: 0,
      total: gradedWorks.length,
      message: 'Preparing Google Drive...',
      successes: 0,
      failures: 0,
      emailSuccesses: 0,
      emailFailures: 0,
    });
    
    let targetFolderId: string | null = null;
    
    try {
      const rootFolderId = await getOrCreateDriveFolder(accessToken, 'DoneGrading Scans');
      const safeAssignmentFolderName = gradedWorks[0]?.assignmentName ? gradedWorks[0].assignmentName.replace(/[^a-zA-Z0-9 ]/g, "").trim() : 'Misc Scans';
      targetFolderId = await getOrCreateDriveFolder(accessToken, safeAssignmentFolderName, rootFolderId);
    } catch (e) {
      console.error("Could not set up Drive folders. We will skip Drive upload for this sync.", e);
    }

    const worksToSync = [...gradedWorks];
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
    setGradedWorks([]);
    setTimeout(() => setPhase(AppPhase.FINALE), 1000);
  };

  const renderAuth = () => {
    if (isSignedIn) {
      const signedInVia = accessToken ? 'Google Classroom' : 'demo mode';
      return (
        <PageWrapper
          headerTitle={educatorName || 'Welcome'}
          headerSubtitle={todayLabel || undefined}
          isOnline={isOnline}
          isDarkMode={isDarkMode}
          setIsDarkMode={setIsDarkMode}
          syncStatus={syncStatus}
        >
          <div className="h-full w-full flex flex-col max-w-sm mx-auto pt-2 pb-8">
            <div className="flex-none flex flex-col items-center justify-start pt-3 pb-2">
              <img
                src="/DoneGradingLogo.png"
                alt="DoneGrading"
                className="w-24 max-w-full mb-2 drop-shadow-lg"
              />
              <p className="text-center text-slate-700 dark:text-slate-200 font-semibold text-[13px]">
                Welcome back, {educatorName || 'teacher'}.
              </p>
              <p className="text-center text-[10px] font-bold text-slate-500 dark:text-slate-400 mt-1">
                You’re signed in via {signedInVia}. Use the tabs below to grade or communicate.
              </p>
            </div>

            <div className="flex-none mt-3 space-y-2">
              <button
                type="button"
                onClick={() => setPhase(AppPhase.DASHBOARD)}
                className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold uppercase tracking-wider text-[11px] shadow-sm active:scale-[0.98] transition-all flex items-center justify-center gap-2"
              >
                Go to Grade workspace
              </button>
              <button
                type="button"
                onClick={() => setPhase(AppPhase.RECORDS)}
                className="w-full py-2.5 bg-sky-500 hover:bg-sky-600 text-white rounded-xl font-bold uppercase tracking-wider text-[11px] shadow-sm active:scale-[0.98] transition-all flex items-center justify-center gap-2"
              >
                Open Communicate hub
              </button>
              <button
                type="button"
                onClick={handleShareApp}
                className="w-full py-2.5 bg-white/90 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-700 rounded-xl text-[11px] font-semibold text-slate-700 dark:text-slate-200 flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
              >
                Share DoneGrading
              </button>
              <button
                type="button"
                onClick={handleSignOut}
                className="w-full py-2 text-[10px] font-semibold text-slate-500 dark:text-slate-400 underline underline-offset-2"
              >
                Sign out
              </button>
            </div>

            <div className="flex-1 mt-3 space-y-2 pb-2 flex flex-col justify-end">
              <div className="w-full text-[9px] text-slate-500 dark:text-slate-400 text-center mt-1 mb-2 space-y-1">
                <p>
                  <a href="http://donegrading.com/terms-of-services" target="_blank" rel="noreferrer" className="underline underline-offset-2">
                    Terms of Service
                  </a>
                  {" | "}
                  <a href="http://donegrading.com/Privacy-Policy" target="_blank" rel="noreferrer" className="underline underline-offset-2">
                    Privacy Policy
                  </a>
                  {" | "}
                  <a href="http://donegrading.com/Contact" target="_blank" rel="noreferrer" className="underline underline-offset-2">
                    Contact
                  </a>
                </p>
                <p>
                  © DoneGrading | Created with ♥ by an educator for educators.
                </p>
              </div>
            </div>
          </div>
        </PageWrapper>
      );
    }

    return (
      <PageWrapper
        headerTitle="Welcome"
        headerSubtitle={undefined}
        isOnline={isOnline}
        isDarkMode={isDarkMode}
        setIsDarkMode={setIsDarkMode}
        syncStatus={syncStatus}
      >
        <div className="h-full w-full flex flex-col max-w-sm mx-auto pt-2 pb-8">
          {/* Top: logo + promise (fixed band, stable position) */}
          <div className="flex-none flex flex-col items-center justify-start pt-3 pb-2">
            <img
              src="/DoneGradingLogo.png"
              alt="DoneGrading"
              className="w-28 max-w-full mb-2 drop-shadow-lg"
            />
            <p className="text-center text-slate-700 dark:text-slate-200 font-semibold text-[13px]">
              Cut grading time & focus on teaching.
            </p>
            <p className="text-center text-[10px] font-bold text-slate-500 dark:text-slate-400 mt-1">
              30-day free trial · then $19.99/month · Cancel anytime.
            </p>
            {authError && (
              <div className="mt-2 px-3 py-2 bg-red-500/10 border border-red-500/50 rounded-xl text-red-500 text-[10px] font-bold w-full text-center">
                {authError}
              </div>
            )}
          </div>

          {/* Middle: primary actions */}
          <div className="flex-none mt-3 space-y-2">
            <button
              onClick={handleGoogleLogin}
              className="w-full py-3 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border border-slate-200 dark:border-slate-700 rounded-xl flex items-center justify-center gap-3 shadow-sm active:scale-[0.98] transition-all"
            >
              <Chrome className="w-5 h-5 text-indigo-500" />
              <span className="font-black text-[11px] uppercase tracking-[0.16em] text-slate-700 dark:text-slate-200">
                Sign in with Google
              </span>
            </button>
            <button
              type="button"
              onClick={loginMock}
              className="w-full py-3 bg-slate-900/85 dark:bg-slate-100/95 border border-slate-900/20 dark:border-slate-100/20 rounded-xl flex items-center justify-center gap-2 shadow-sm active:scale-[0.98] transition-all text-white dark:text-slate-900 text-[11px] font-black uppercase tracking-[0.16em]"
            >
              <Zap className="w-4 h-4" />
              Try a live demo
            </button>

            {/* Rotating educational snippet */}
            {welcomeSnippets[welcomeSnippetIndex]?.render()}
          </div>

          {/* Bottom: compact reveal for secondary options + tiny footer */}
          <div className="flex-1 mt-3 space-y-2 pb-2 flex flex-col justify-end">
            <button
              type="button"
              onClick={() => setShowMoreAuthOptions(v => !v)}
              className="w-full py-2 rounded-xl bg-white/40 dark:bg-slate-900/70 border border-slate-200/80 dark:border-slate-700/80 text-[10px] font-semibold text-slate-600 dark:text-slate-300 flex items-center justify-between px-3 active:scale-[0.98] transition-all"
            >
              <span>{showMoreAuthOptions ? 'Hide other sign-in options' : 'More sign-in options'}</span>
              <ChevronRight className={`w-4 h-4 transition-transform ${showMoreAuthOptions ? 'rotate-90' : ''}`} />
            </button>

            {showMoreAuthOptions && (
              <div className="w-full bg-white/80 dark:bg-slate-950/85 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 grid grid-cols-1 gap-2">
                <form onSubmit={handleEmailLogin} className="space-y-1.5">
                  <input
                    type="email"
                    placeholder="Email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="w-full px-3 py-2 bg-white/90 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700 rounded-lg text-[12px] font-semibold outline-none focus:border-indigo-400 transition-all"
                  />
                  <input
                    type="password"
                    placeholder="Password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full px-3 py-2 bg-white/90 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700 rounded-lg text-[12px] font-semibold outline-none focus:border-indigo-400 transition-all"
                  />
                  <button
                    type="submit"
                    className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-black uppercase tracking-[0.12em] text-[10px] shadow-sm active:scale-[0.98] transition-all"
                  >
                    Sign in with Email
                  </button>
                </form>

                <button
                  type="button"
                  className="w-full py-2.5 bg-black dark:bg-white border border-slate-900 dark:border-white rounded-lg flex items-center justify-center gap-3 shadow-sm active:scale-[0.98] transition-all text-white dark:text-slate-900 text-[10px] font-black uppercase tracking-[0.16em]"
                >
                  <AppleIcon className="w-4 h-4" />
                  Sign in with Apple
                </button>
              </div>
            )}

            <div className="w-full text-[9px] text-slate-500 dark:text-slate-400 text-center mt-1 mb-2 space-y-1">
              <p>
                <a href="http://donegrading.com/terms-of-services" target="_blank" rel="noreferrer" className="underline underline-offset-2">
                  Terms of Service
                </a>
                {" | "}
                <a href="http://donegrading.com/Privacy-Policy" target="_blank" rel="noreferrer" className="underline underline-offset-2">
                  Privacy Policy
                </a>
                {" | "}
                <a href="http://donegrading.com/Contact" target="_blank" rel="noreferrer" className="underline underline-offset-2">
                  Contact
                </a>
              </p>
              <p>
                © DoneGrading | Created with ♥ by an educator for educators.
              </p>
            </div>
          </div>
        </div>
      </PageWrapper>
    );
  };

  const renderDashboard = () => {
    const totalCourses = courses.length;
    const connectedCourses = courses.filter(c => c.source !== 'local').length;
    const localCourses = totalCourses - connectedCourses;
    const totalAssignments = assignments.length;
    const totalStudents = students.length;
    const pendingGrades = gradedWorks.length;

    const now = Date.now();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const gradedLast7 = history.filter(w => now - w.timestamp < sevenDaysMs).length;

    const studentStats: Record<string, { name: string; totalScore: number; totalMax: number }> = {};
    history.forEach(w => {
      if (!w.studentId) return;
      if (!studentStats[w.studentId]) {
        studentStats[w.studentId] = { name: w.studentName || 'Student', totalScore: 0, totalMax: 0 };
      }
      studentStats[w.studentId].totalScore += w.score;
      studentStats[w.studentId].totalMax += w.maxScore || 100;
    });
    const atRiskStudents = Object.values(studentStats)
      .map(s => ({ ...s, pct: s.totalMax > 0 ? (s.totalScore / s.totalMax) * 100 : 0 }))
      .filter(s => s.pct < 70)
      .sort((a, b) => a.pct - b.pct)
      .slice(0, 3);

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
        <div className="h-full flex flex-col gap-4 overflow-y-auto pb-20 custom-scrollbar">
          {/* What needs your attention – at top */}
          <div className="p-4 rounded-xl bg-white/90 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-500" />
                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-600 dark:text-slate-300">
                  What needs your attention
                </p>
              </div>
            </div>

            <div className="space-y-2 text-[11px] text-slate-700 dark:text-slate-200">
              {pendingGrades > 0 && (
                <button
                  type="button"
                  onClick={() => startSyncProcess()}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-emerald-50/80 dark:bg-emerald-500/10 border border-emerald-300/70 dark:border-emerald-500/60 text-emerald-800 dark:text-emerald-200 text-left hover:bg-emerald-100/80 dark:hover:bg-emerald-500/20 transition-colors"
                >
                  <span>
                    <span className="font-semibold">{pendingGrades} grade{pendingGrades === 1 ? '' : 's'}</span> ready to sync to Classroom.
                  </span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              )}

              {atRiskStudents.length > 0 && (
                <div className="px-3 py-2 rounded-xl bg-rose-50/80 dark:bg-rose-500/10 border border-rose-200/80 dark:border-rose-500/60">
                  <div className="flex items-center gap-2 mb-1">
                    <Target className="w-3 h-3 text-rose-500 dark:text-rose-300" />
                    <span className="font-semibold text-[11px]">Students to check in on</span>
                  </div>
                  <ul className="space-y-0.5">
                    {atRiskStudents.map(s => (
                      <li key={s.name} className="flex justify-between text-[10px]">
                        <span>{s.name}</span>
                        <span className="font-semibold">{s.pct.toFixed(0)}%</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="px-3 py-2 rounded-xl bg-slate-50/80 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="font-semibold text-[11px] flex items-center gap-1">
                    <Mail className="w-3 h-3 text-sky-500" />
                    Student updates
                  </span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">
                    Emails sent: {syncProgress.emailSuccesses} · Failed: {syncProgress.emailFailures}
                  </span>
                </div>
              </div>

              {pendingGrades === 0 && atRiskStudents.length === 0 && (
                <p className="text-[10px] text-slate-500 dark:text-slate-400">
                  You're all caught up. When new work comes in, we'll surface it here.
                </p>
              )}
            </div>
          </div>

          {/* Summary tiles */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-white/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between mb-1">
                <span className={sectionTitle}>Grading queue</span>
                <CheckCircle className="w-4 h-4 text-emerald-500" />
              </div>
              <p className="text-2xl font-black text-slate-900 dark:text-slate-50 leading-tight">{pendingGrades}</p>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">Ready to post to Classroom</p>
            </div>

            <div className="p-3 rounded-xl bg-white/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between mb-1">
                <span className={sectionTitle}>Classes & work</span>
                <Layers className="w-4 h-4 text-indigo-500" />
              </div>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-50 leading-tight">
                {totalCourses} courses · {totalAssignments} assignments
              </p>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                {connectedCourses} synced · {localCourses} local
              </p>
            </div>

            <div className="p-3 rounded-xl bg-white/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between mb-1">
                <span className={sectionTitle}>Students</span>
                <Users className="w-4 h-4 text-sky-500" />
              </div>
              <p className="text-2xl font-black text-slate-900 dark:text-slate-50 leading-tight">{totalStudents}</p>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">Across all synced rosters</p>
            </div>

            <div className="p-3 rounded-xl bg-white/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between mb-1">
                <span className={sectionTitle}>Last 7 days</span>
                <HistoryIcon className="w-4 h-4 text-purple-500" />
              </div>
              <p className="text-2xl font-black text-slate-900 dark:text-slate-50 leading-tight">{gradedLast7}</p>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">Papers graded with DoneGrading</p>
            </div>
          </div>

          {/* Course list as organized navigation */}
          <div className="mt-1 space-y-2">
            <div className="flex items-center justify-between px-1">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                Courses
              </p>
            </div>

            {dashboardResults.courses.map((course, index) => (
              <div
                key={course.id}
                className="p-4 bg-white/70 dark:bg-slate-800/70 backdrop-blur-xl border border-slate-200 dark:border-slate-700 rounded-xl flex items-center justify-between shadow-sm hover:border-indigo-400 hover:-translate-y-0.5 transition-all"
              >
                <button
                  type="button"
                  onClick={() => selectCourse(course)}
                  className="flex items-center gap-4 flex-1 text-left"
                >
                  <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-xl flex items-center justify-center text-white">
                    <BookOpen className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-slate-800 dark:text-slate-100">{course.name}</h4>
                    <p className="text-indigo-500 text-[9px] font-black uppercase tracking-[0.15em]">
                      {course.period}{course.source === 'local' ? ' · Local only' : ''}
                    </p>
                  </div>
                </button>

                <div className="flex items-center gap-1 ml-3">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      const action = window.prompt(
                        'Course options:\n- Type "rename" to rename\n- Type "up" or "down" to reorder\n- Type "delete" to remove the course',
                        'rename'
                      );
                      if (!action) return;
                      const cmd = action.trim().toLowerCase();

                      if (cmd === 'rename') {
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
                      } else if (cmd === 'up') {
                        if (index === 0) return;
                        setDashboardSort('manual');
                        setCourses(prev => {
                          const copy = [...prev];
                          const from = copy.findIndex(c => c.id === course.id);
                          if (from <= 0) return prev;
                          const to = from - 1;
                          const [item] = copy.splice(from, 1);
                          copy.splice(to, 0, item);
                          return copy;
                        });
                      } else if (cmd === 'down') {
                        if (index === dashboardResults.courses.length - 1) return;
                        setDashboardSort('manual');
                        setCourses(prev => {
                          const copy = [...prev];
                          const from = copy.findIndex(c => c.id === course.id);
                          if (from === -1 || from === copy.length - 1) return prev;
                          const to = from + 1;
                          const [item] = copy.splice(from, 1);
                          copy.splice(to, 0, item);
                          return copy;
                        });
                      } else if (cmd === 'delete') {
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
                      }
                    }}
                    className="p-1.5 rounded-full bg-white/60 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
                    title="Course settings"
                  >
                    <Settings className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}

            <div
              onClick={() => { setNewCourseName(''); setPhase('COURSE_CREATION'); }}
              className="p-4 mt-1 bg-white/40 dark:bg-slate-800/40 border-2 border-dashed border-indigo-400 dark:border-indigo-500 rounded-xl flex items-center justify-center gap-3 shadow-sm cursor-pointer hover:bg-white/60 dark:hover:bg-slate-800/60 hover:-translate-y-0.5 transition-all"
            >
              <PlusCircle className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
              <h4 className="text-sm font-black text-indigo-700 dark:text-indigo-300 uppercase tracking-widest">Create Course</h4>
            </div>

            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={handleSignOut}
                className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 hover:underline"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      </PageWrapper>
    );
  };

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
       <div className="h-full overflow-y-auto flex flex-col gap-4 custom-scrollbar">
          {filteredAssignmentsList.map((assignment, index) => (
            <div
              key={assignment.id}
              className="p-4 bg-white/70 dark:bg-slate-800/70 backdrop-blur-xl border border-slate-200 dark:border-slate-700 rounded-xl flex items-center justify-between shadow-sm hover:border-emerald-400 hover:-translate-y-0.5 transition-all"
            >
               <button
                 type="button"
                 onClick={() => { setSelectedAssignment(assignment); setPhase(AppPhase.RUBRIC_SETUP); }}
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
                     const action = window.prompt(
                       'Assignment options:\n- Type "rename" to rename\n- Type "up" or "down" to reorder\n- Type "delete" to remove the assignment',
                       'rename'
                     );
                     if (!action) return;
                     const cmd = action.trim().toLowerCase();

                     if (cmd === 'rename') {
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
                     } else if (cmd === 'up') {
                       if (index === 0) return;
                       setAssignmentSort('manual');
                       setAssignments(prev => {
                         const copy = [...prev];
                         const from = copy.findIndex(a => a.id === assignment.id);
                         if (from <= 0) return prev;
                         const to = from - 1;
                         const [item] = copy.splice(from, 1);
                         copy.splice(to, 0, item);
                         return copy;
                       });
                     } else if (cmd === 'down') {
                       if (index === filteredAssignmentsList.length - 1) return;
                       setAssignmentSort('manual');
                       setAssignments(prev => {
                         const copy = [...prev];
                         const from = copy.findIndex(a => a.id === assignment.id);
                         if (from === -1 || from === copy.length - 1) return prev;
                         const to = from + 1;
                         const [item] = copy.splice(from, 1);
                         copy.splice(to, 0, item);
                         return copy;
                       });
                     } else if (cmd === 'delete') {
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
                     }
                   }}
                   className="p-1.5 rounded-full bg-white/60 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-emerald-50 hover:text-emerald-600 transition-colors"
                   title="Assignment settings"
                 >
                   <Settings className="w-4 h-4" />
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
       <form onSubmit={handleCreateCourseLocal} className="flex flex-col gap-4 max-w-sm mx-auto w-full pt-10">
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
    </PageWrapper>
  );

  const renderAssignmentCreation = () => (
    <PageWrapper headerTitle="New Assignment" headerSubtitle={creationCourse?.name} onBack={() => setPhase(AppPhase.ASSIGNMENT_SELECT)} isOnline={isOnline} isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} syncStatus={syncStatus}>
       <form onSubmit={handleCreateAssignment} className="flex flex-col gap-4 max-w-sm mx-auto w-full pt-10">
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
        <div className="h-full flex flex-col gap-4">
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
       <div className="flex flex-col gap-4 max-w-sm mx-auto w-full pt-10">
         <button onClick={() => startGrading(GradingMode.SINGLE_PAGE)} className="p-5 bg-white/70 dark:bg-slate-800/70 backdrop-blur-xl border border-slate-200 dark:border-slate-700 rounded-xl flex items-center justify-between shadow-sm hover:border-emerald-400 hover:-translate-y-0.5 transition-all">
           <div className="flex items-center gap-4">
             <div className="w-12 h-12 bg-emerald-500 rounded-xl flex items-center justify-center text-white"><Camera className="w-6 h-6" /></div>
             <div className="text-left">
               <h3 className="text-base font-black text-slate-800 dark:text-slate-100">Single Page Mode</h3>
               <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mt-1">One Scan = One Student</p>
             </div>
           </div>
         </button>

         <button onClick={() => startGrading(GradingMode.MULTI_PAGE)} className="p-5 bg-white/70 dark:bg-slate-800/70 backdrop-blur-xl border border-slate-200 dark:border-slate-700 rounded-xl flex items-center justify-between shadow-sm hover:border-indigo-400 hover:-translate-y-0.5 transition-all">
           <div className="flex items-center gap-4">
             <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center text-white"><FileText className="w-6 h-6" /></div>
             <div className="text-left">
               <h3 className="text-base font-black text-slate-800 dark:text-slate-100">Multi Page Mode</h3>
               <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mt-1">Capture multiple pages per student</p>
             </div>
           </div>
         </button>
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

            <div className="relative z-40 flex items-center justify-center gap-6 mb-6 mt-auto pb-4">
              <div className="bg-black/50 backdrop-blur-xl p-2 rounded-full flex gap-3 items-center shadow-lg border border-white/20">
                 <button onClick={toggleFlash} className={`p-4 rounded-full border-2 transition-all ${isFlashOn ? 'bg-yellow-400 text-black border-transparent shadow-[0_0_20px_rgba(250,204,21,0.6)]' : 'bg-white/10 text-white border-white/30 hover:bg-white/20'}`} title="Toggle Flash">
                   <Zap className="w-6 h-6" />
                 </button>

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
                         {[...students].sort((a, b) => {
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
         {gradedWorks.map((work, idx) => (
           <div key={idx} className="bg-white/70 dark:bg-slate-800/70 p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col">
              <div className="flex justify-between items-center mb-3">
                 <h4 className="font-black text-slate-800 dark:text-slate-100 truncate pr-2">{work.studentName}</h4>
                 <div className="flex items-center gap-1 shrink-0">
                   <input type="number" value={work.score} onChange={(e) => { const w = [...gradedWorks]; w[idx].score = parseFloat(e.target.value)||0; setGradedWorks(w); }} className="w-12 bg-transparent text-right font-black text-indigo-600 outline-none text-[16px]" />
                   <span className="text-slate-400 font-bold text-[16px]">/{work.maxScore}</span>
                 </div>
              </div>
              <textarea value={work.feedback} onChange={(e) => { const w = [...gradedWorks]; w[idx].feedback = e.target.value; setGradedWorks(w); }} className="w-full bg-slate-50 dark:bg-slate-900 rounded-xl p-3 text-[16px] border border-slate-200 dark:border-slate-700 outline-none resize-none mb-3" rows={2} />
              
              <div className="flex gap-2 mt-auto">
                 <button onClick={() => handleRescan(idx)} className="flex-1 py-2.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-xl font-bold text-[11px] uppercase tracking-widest hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors flex items-center justify-center gap-1.5 border border-indigo-200/50 dark:border-indigo-500/20">
                    <RefreshCw className="w-3.5 h-3.5" /> Rescan
                 </button>
                 <button onClick={() => handleDeleteScan(idx)} className="flex-1 py-2.5 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-xl font-bold text-[11px] uppercase tracking-widest hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors flex items-center justify-center gap-1.5 border border-red-200/50 dark:border-red-500/20">
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                 </button>
              </div>
           </div>
         ))}
         {gradedWorks.length === 0 && (
           <div className="flex flex-col items-center justify-center h-full text-slate-400 mt-10">
             <Layers className="w-12 h-12 mb-3 opacity-50" />
             <p className="font-bold text-[16px]">No scans pending.</p>
           </div>
         )}
       </div>
       <button onClick={startSyncProcess} disabled={gradedWorks.length === 0} className="w-full mt-4 py-4 bg-emerald-500 text-white rounded-xl font-black uppercase tracking-widest text-[16px] shadow-sm hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:hover:translate-y-0">
         Sync to Classroom <CloudUpload className="inline ml-2 w-4 h-4" />
       </button>
    </PageWrapper>
  );

  const renderSyncing = () => (
    <PageWrapper isOnline={isOnline} isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} syncStatus={syncStatus}>
       <div className="h-full flex flex-col items-center justify-center">
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
       <div className="h-full flex flex-col items-center justify-center text-center">
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

    return (
      <PageWrapper
        headerTitle={educatorName || 'Plan'}
        headerSubtitle={todayLabel || undefined}
        isOnline={isOnline}
        isDarkMode={isDarkMode}
        setIsDarkMode={setIsDarkMode}
        syncStatus={syncStatus}
      >
        <div className="h-full flex flex-col min-h-0 overflow-hidden">
          {/* Compact header + tab bar: no scroll on Plan screen */}
          <div className="flex-none flex flex-col gap-1.5 -mx-4 px-4 pt-0 pb-1.5 bg-white/95 dark:bg-slate-950/95 border-b border-slate-200/80 dark:border-slate-700/80">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                <span>My Lessons</span>
                <ChevronRight className="w-3 h-3 opacity-60" />
                <span className="truncate max-w-[100px]">{planUnit}</span>
                <ChevronRight className="w-3 h-3 opacity-60" />
                <input
                  value={planLessonTitle}
                  onChange={(e) => setPlanLessonTitle(e.target.value)}
                  placeholder="Lesson title"
                  className="px-2 py-0.5 rounded-md bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700 text-[10px] font-semibold text-slate-700 dark:text-slate-100 w-24 min-w-0"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <select
                  value={planVersion}
                  onChange={(e) => setPlanVersion(e.target.value as PlanVersion)}
                  className="px-1.5 py-0.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/80 text-[9px] font-semibold text-slate-700 dark:text-slate-100"
                >
                  <option value="Standard">Standard</option>
                  <option value="Sub Plan">Sub Plan</option>
                  <option value="Period 2 (Advanced)">Period 2 (Advanced)</option>
                </select>
                <span className="text-[8px] text-slate-400">{lastSavedLabel}</span>
                <button type="button" onClick={() => window.print()} className="p-1 rounded border border-slate-200 dark:border-slate-700" title="Print"><Printer className="w-3 h-3" /></button>
                <button type="button" onClick={() => { const url = 'https://donegrading.com/lessons/preview'; const subject = encodeURIComponent(`View: ${planLessonTitle || 'Lesson'}`); const body = encodeURIComponent(`Link: ${url}\n— ${educatorName || 'Teacher'}`); window.location.href = `mailto:?subject=${subject}&body=${body}`; }} className="p-1 rounded border border-slate-200 dark:border-slate-700" title="Share"><Share2 className="w-3 h-3" /></button>
              </div>
            </div>
            <div className="flex gap-1">
              {(['context', 'blocks', 'resources', 'assessment'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setPlanTab(tab)}
                  className={`flex-1 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-wider ${planTab === tab ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}
                >
                  {tab === 'context' ? 'Context' : tab === 'blocks' ? 'Blocks' : tab === 'resources' ? 'Resources' : 'Assessment'}
                </button>
              ))}
            </div>
          </div>

          {/* Single panel: only active tab content, no page scroll */}
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
            {planTab === 'context' && (
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-2 space-y-2">
            <aside className="space-y-2">
              <section className="bg-white/85 dark:bg-slate-900/85 border border-slate-200 dark:border-slate-700 rounded-xl p-3 space-y-2">
                <p className={sectionTitle}>
                  Context & Constraints
                </p>
                <div className="grid grid-cols-3 gap-2 text-[10px]">
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
                        onClick={async () => {
                          if (!effectiveTopic.trim()) return;
                          setLessonLoading(true);
                          const res = await generateLessonScript(effectiveTopic.trim());
                          setLessonLoading(false);
                          if (res) {
                            setLessonResult(res);
                            setDirectPoints(res.outline);
                            setCfuIdeas(res.discussionQuestions.join('\n'));
                            if (res.outline) setDifferentiationText(res.outline);
                          }
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
        </div>
      </PageWrapper>
    );
  };

  const renderClassroom = () => (
    <PageWrapper
      headerTitle={educatorName || 'Classroom'}
      headerSubtitle={todayLabel || undefined}
      isOnline={isOnline}
      isDarkMode={isDarkMode}
      setIsDarkMode={setIsDarkMode}
      syncStatus={syncStatus}
    >
      <div className="space-y-4 pb-4">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setPhase(AppPhase.CLASS_PRESENTER)}
            className="px-3 py-1.5 rounded-full text-[10px] font-semibold border border-slate-300 dark:border-slate-600 bg-white/80 dark:bg-slate-900/80 text-slate-700 dark:text-slate-100"
          >
            Open Class Presenter
          </button>
        </div>
        <section className="bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700 rounded-xl p-3">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100 mb-3">
            <Timer className="w-4 h-4 text-amber-500" /> Magic Timer
          </h2>
          <div className="flex items-center gap-2 mb-2">
            <input
              type="number"
              min={0}
              max={60}
              value={timerInitialMinutes}
              onChange={(e) => setTimerInitialMinutes(Math.max(0, Math.min(60, parseInt(e.target.value, 10) || 0)))}
              className="w-20 px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm"
            />
            <span className="text-sm text-slate-600 dark:text-slate-400">minutes</span>
          </div>
          <div className="text-4xl font-mono font-bold text-center py-4 text-slate-800 dark:text-slate-100">
            {Math.floor(timerSeconds / 60)}:{(timerSeconds % 60).toString().padStart(2, '0')}
          </div>
          <div className="flex gap-2 justify-center">
            {!timerRunning && (
              <>
                <button
                  type="button"
                  onClick={() => setTimerSeconds(timerInitialMinutes * 60)}
                  className="py-2 px-4 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 text-sm font-semibold"
                >
                  Set
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTimerSeconds((s) => (s || timerInitialMinutes * 60));
                    setTimerRunning(true);
                  }}
                  className="py-2 px-4 rounded-xl bg-amber-500 text-white text-sm font-semibold"
                >
                  Start
                </button>
              </>
            )}
            {timerRunning && (
              <button type="button" onClick={() => setTimerRunning(false)} className="py-2 px-4 rounded-xl bg-red-500 text-white text-sm font-semibold">
                Pause
              </button>
            )}
            <button type="button" onClick={() => { setTimerRunning(false); setTimerSeconds(0); }} className="py-2 px-4 rounded-xl border border-slate-300 dark:border-slate-600 text-sm font-semibold">
              Reset
            </button>
          </div>
        </section>

        <section className="bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700 rounded-xl p-3">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100 mb-3">
            <Shuffle className="w-4 h-4 text-emerald-500" /> Randomizer
          </h2>
          <button
            type="button"
            onClick={() => {
              if (students.length === 0) return;
              const idx = Math.floor(Math.random() * students.length);
              setRandomPicked(students[idx]);
            }}
            className="w-full py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold"
          >
            Pick random student
          </button>
          {randomPicked && (
            <p className="mt-2 text-center text-lg font-bold text-slate-800 dark:text-slate-100">{randomPicked.name}</p>
          )}
          {students.length === 0 && <p className="mt-2 text-[10px] text-slate-500">Select a course from Grade to load students.</p>}
        </section>

        <section className="bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700 rounded-xl p-3">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100 mb-3">
            <Volume2 className="w-4 h-4 text-sky-500" /> Noise Meter
          </h2>
          <div className="h-4 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
            <div className="h-full bg-sky-500 transition-all duration-300" style={{ width: `${noiseLevel}%` }} />
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={noiseLevel}
            onChange={(e) => setNoiseLevel(parseInt(e.target.value, 10))}
            className="w-full mt-2"
          />
          <p className="text-[10px] text-slate-500 mt-1">Adjust or use mic when available.</p>
        </section>

        <section className="bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700 rounded-xl p-3">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100 mb-3">
            <ClipboardList className="w-4 h-4 text-violet-500" /> Quick Behavior Logger
          </h2>
          <p className="text-[10px] text-slate-500 mb-2">+ / − for participation or behavior. Uses current roster.</p>
          <ul className="space-y-1 max-h-48 overflow-y-auto">
            {students.length === 0 ? (
              <li className="text-xs text-slate-500">No students loaded. Pick a course from Grade.</li>
            ) : (
              students.slice(0, 30).map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 py-1">
                  <span className="text-sm truncate flex-1">{s.name}</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setBehaviorScores((prev) => ({ ...prev, [s.id]: (prev[s.id] ?? 0) - 1 }))}
                      className="w-7 h-7 rounded-lg border border-slate-300 dark:border-slate-600 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="w-6 text-center text-sm font-mono">{behaviorScores[s.id] ?? 0}</span>
                    <button
                      type="button"
                      onClick={() => setBehaviorScores((prev) => ({ ...prev, [s.id]: (prev[s.id] ?? 0) + 1 }))}
                      className="w-7 h-7 rounded-lg border border-slate-300 dark:border-slate-600 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                </li>
              ))
            )}
          </ul>
        </section>
      </div>
    </PageWrapper>
  );

  const renderClassPresenter = () => (
    <PageWrapper
      headerTitle="Class Display"
      headerSubtitle={todayLabel || undefined}
      isOnline={isOnline}
      isDarkMode={isDarkMode}
      setIsDarkMode={setIsDarkMode}
      syncStatus={syncStatus}
      onBack={() => setPhase(AppPhase.CLASSROOM)}
    >
      <div className="h-full w-full flex flex-col gap-4 items-center justify-center px-2">
        {/* Big timer + controls */}
        <div className="flex flex-col items-center gap-2">
          <p className="text-xs font-semibold tracking-[0.2em] uppercase text-slate-500 dark:text-slate-400">
            Time Remaining
          </p>
          <div className="text-6xl md:text-7xl font-mono font-black text-slate-900 dark:text-slate-50 tracking-[0.15em]">
            {Math.floor(timerSeconds / 60)}:{(timerSeconds % 60).toString().padStart(2, '0')}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <input
              type="number"
              min={0}
              max={60}
              value={timerInitialMinutes}
              onChange={(e) => setTimerInitialMinutes(Math.max(0, Math.min(60, parseInt(e.target.value, 10) || 0)))}
              className="w-14 px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-center font-semibold"
            />
            <span className="text-xs text-slate-500 dark:text-slate-400">min</span>
            {!timerRunning && (
              <>
                <button
                  type="button"
                  onClick={() => setTimerSeconds(timerInitialMinutes * 60)}
                  className="py-1.5 px-3 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold"
                >
                  Set
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTimerSeconds((s) => s || timerInitialMinutes * 60);
                    setTimerRunning(true);
                  }}
                  className="py-1.5 px-3 rounded-xl bg-amber-500 text-white text-xs font-semibold"
                >
                  Start
                </button>
              </>
            )}
            {timerRunning && (
              <button type="button" onClick={() => setTimerRunning(false)} className="py-1.5 px-3 rounded-xl bg-red-500 text-white text-xs font-semibold">
                Pause
              </button>
            )}
            <button type="button" onClick={() => { setTimerRunning(false); setTimerSeconds(0); }} className="py-1.5 px-3 rounded-xl border border-slate-300 dark:border-slate-600 text-xs font-semibold text-slate-700 dark:text-slate-200">
              Reset
            </button>
          </div>
        </div>

        {/* Random student display + pick button */}
        <div className="w-full max-w-md">
          <p className="text-[10px] font-semibold tracking-[0.18em] uppercase text-slate-500 dark:text-slate-400 mb-1 text-center">
            Next up
          </p>
          <div className="min-h-[64px] flex items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-900/40 border border-indigo-200 dark:border-indigo-600 px-4">
            <span className="text-xl md:text-2xl font-black text-indigo-700 dark:text-indigo-200 truncate">
              {randomPicked ? randomPicked.name : 'Waiting for a name…'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              if (students.length === 0) return;
              const idx = Math.floor(Math.random() * students.length);
              setRandomPicked(students[idx]);
            }}
            className="mt-2 w-full py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold"
          >
            Pick random student
          </button>
          {students.length === 0 && (
            <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400 text-center">
              Select a course from Grade to load students.
            </p>
          )}
        </div>

        {/* Noise meter */}
        <div className="w-full max-w-md">
          <p className="text-[10px] font-semibold tracking-[0.18em] uppercase text-slate-500 dark:text-slate-400 mb-1 text-center">
            Room Volume
          </p>
          <div className="h-4 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
            <div
              className="h-full transition-all duration-300"
              style={{
                width: `${noiseLevel}%`,
                background:
                  noiseLevel < 40
                    ? '#22c55e'
                    : noiseLevel < 75
                      ? '#eab308'
                      : '#ef4444',
              }}
            />
          </div>
          <button
            type="button"
            onClick={() => setNoiseMeterMicOn((on) => !on)}
            className={"mt-2 w-full py-2 rounded-xl text-sm font-semibold " + (noiseMeterMicOn ? "bg-red-500 text-white" : "bg-sky-600 text-white")}
          >
            {noiseMeterMicOn ? "Stop microphone" : "Use microphone"}
          </button>
          <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400 text-center">
            {noiseMeterMicOn ? "Mic is on — the bar shows room volume." : "Tap \"Use microphone\" so the bar picks up sound."}
          </p>
        </div>
      </div>
    </PageWrapper>
  );

  return (
    <div className="min-h-screen font-sans text-slate-800 dark:text-slate-200 selection:bg-indigo-500/30 overflow-hidden relative gradient-animate">

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

      {/* RENDER ROUTER */}
      {phase === AppPhase.AUTHENTICATION && renderAuth()}
      {phase === AppPhase.PLAN && renderPlan()}
      {phase === AppPhase.DASHBOARD && renderDashboard()}
      {phase === AppPhase.CLASSROOM && renderClassroom()}
      {phase === AppPhase.CLASS_PRESENTER && renderClassPresenter()}
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
          <CommunicationDashboard educatorName={educatorName} />
        </PageWrapper>
      )}

      {/* GLOBAL BOTTOM NAV (hidden in Class Presenter for clean projection) */}
      {phase !== AppPhase.CLASS_PRESENTER && (
      <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-[90] w-full max-w-md px-4">
        <div className="bg-white/95 dark:bg-slate-900/95 border border-slate-200/80 dark:border-slate-700/80 rounded-xl shadow-lg px-3 py-1.5 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setPhase(AppPhase.AUTHENTICATION)}
            className={`flex flex-col items-center flex-1 py-1 rounded-xl ${
              phase === AppPhase.AUTHENTICATION
                ? 'text-indigo-500'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            <Home className="w-4 h-4 mb-0.5" />
            <span className="text-[9px] font-semibold uppercase tracking-[0.14em]">Home</span>
          </button>
          <button
            type="button"
            disabled={!isSignedIn}
            onClick={() => { if (!isSignedIn) return; setPhase(AppPhase.PLAN); }}
            className={`flex flex-col items-center flex-1 py-1 rounded-xl ${
              phase === AppPhase.PLAN ? 'text-indigo-400' : isSignedIn ? 'text-slate-600 dark:text-slate-300' : 'text-slate-400 dark:text-slate-600'
            }`}
          >
            <Calendar className="w-4 h-4 mb-0.5" />
            <span className="text-[9px] font-semibold uppercase tracking-[0.14em]">Plan</span>
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
                ? 'text-emerald-400'
                : isSignedIn
                  ? 'text-slate-600 dark:text-slate-300'
                  : 'text-slate-400 dark:text-slate-600'
            }`}
          >
            <LayoutDashboard className="w-4 h-4 mb-0.5" />
            <span className="text-[9px] font-semibold uppercase tracking-[0.14em]">Grade</span>
          </button>
          <button
            type="button"
            disabled={!isSignedIn}
            onClick={() => { if (!isSignedIn) return; setPhase(AppPhase.CLASSROOM); }}
            className={`flex flex-col items-center flex-1 py-1 rounded-xl ${
              phase === AppPhase.CLASSROOM ? 'text-amber-400' : isSignedIn ? 'text-slate-600 dark:text-slate-300' : 'text-slate-400 dark:text-slate-600'
            }`}
          >
            <Timer className="w-4 h-4 mb-0.5" />
            <span className="text-[9px] font-semibold uppercase tracking-[0.14em]">Class</span>
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
                ? 'text-sky-400'
                : isSignedIn
                  ? 'text-slate-600 dark:text-slate-300'
                  : 'text-slate-400 dark:text-slate-600'
            }`}
          >
            <MessageCircle className="w-4 h-4 mb-0.5" />
            <span className="text-[9px] font-semibold uppercase tracking-[0.14em]">Communicate</span>
          </button>
        </div>
      </div>
      )}
    </div>
  );
};

export default App;