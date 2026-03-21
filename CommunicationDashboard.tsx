import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Mail,
  MessageCircle,
  Copy,
  ClipboardList,
  FilePlus,
  Link2,
} from 'lucide-react';
import { createContactLogSheet, appendContactLog, parseSheetId } from './services/contactLogSheets';
import { translateText } from './services/geminiService';
import {
  firebaseSignInWithGoogleAccessToken,
  getFirebaseConfig,
  listMessages,
  listThreads,
  loadFirebaseSession,
  saveFirebaseSession,
  sendMessage,
  upsertThread,
  type FirebaseSession,
  type MessageDoc,
  type ThreadDoc,
} from './services/firebaseThreadsRest';
import type { ClassroomService } from './services/classroomService';
import type { Course } from './types';
import {
  card,
  sectionTitle,
  label,
  input,
  textarea,
  btnPrimary,
  chip,
  chipInactive,
  helperText,
} from './uiStyles';
import { safeParseJson } from './utils/safeParseJson';

type Audience = 'student' | 'parent' | 'admin' | 'staff';
type GenderKey = 'male' | 'female' | 'neutral';

type StudentOption = { id: string; name: string; email?: string };

type Behavior = { e: string; s: string };

type MessageTemplate = {
  cat: string;
  style: 'style-support' | 'style-scaffold' | 'style-outreach' | 'style-collab';
  title: string;
  check?: boolean;
  eb: string;
  sb: string;
};

const behaviors: Behavior[] = [
  { e: 'Distracted by peers', s: 'Distraído por compañeros' },
  { e: 'Unauthorized phone use', s: 'Uso no autorizado del celular' },
  { e: 'Wearing headphones', s: 'Uso de audífonos' },
  { e: 'Interrupting class', s: 'Interrumpiendo la clase' },
  { e: 'Off-task / Head down', s: 'Fuera de tarea / Cabeza baja' },
  { e: 'Sleeping in class', s: 'Durmiendo en clase' },
  { e: 'Excessive movement', s: 'Movimiento excesivo' },
  { e: 'Walking out without permission', s: 'Salió sin permiso' },
  { e: 'Lateness to class', s: 'Llegó tarde' },
  { e: 'Peer conflict', s: 'Conflicto con compañero' },
  { e: 'Incomplete classwork', s: 'Trabajo incompleto' },
  { e: 'Difficulty starting', s: 'Dificultad para comenzar' },
  { e: 'Missing materials', s: 'Falta de materiales' },
  { e: 'Frustration / Shutting down', s: 'Frustración / Se cerró' },
  { e: 'Language barrier', s: 'Barrera del idioma' },
];

const messages: MessageTemplate[] = [
  {
    cat: 'Behavioral Support',
    style: 'style-support',
    title: 'Standard Support Check-in',
    check: true,
    eb: 'Hi [Parent_Name], this is [Teacher_Name] from [School]. I want to make sure [First_Name] stays on track in [Subject] ([Ord] period). Recently, [sub] has had trouble with: [Checklist_E]. [Custom_Note]. Could you chat with [obj] about focusing in class? Thanks!',
    sb: 'Hola [Parent_Name], habla [Teacher_Name] de [School]. Quiero asegurar que [First_Name] tenga éxito en [Subject] ([Spa_Ord] período). Ha tenido dificultad con: [Checklist_S]. [Custom_Note]. ¿Podría hablar con [s_obj] sobre esto?',
  },
  {
    cat: 'Behavioral Support',
    style: 'style-support',
    title: 'Reflective Loop',
    check: true,
    eb: 'Hi [Parent_Name], [First_Name] and I had a talk about [pos] choices in class today. Issues: [Checklist_E]. [Custom_Note]. Hoping for a better day tomorrow.',
    sb: 'Hola [Parent_Name], [First_Name] y yo hablamos hoy sobre sus decisiones en clase. [Checklist_S]. [Custom_Note]. Esperamos un mejor día mañana.',
  },
  {
    cat: 'Instructional Scaffolding',
    style: 'style-scaffold',
    title: 'Language Misunderstanding',
    check: true,
    eb: 'Hi [Parent_Name], [First_Name] had confusion today, but just a language barrier. [Checklist_E]. Once clarified, [sub] did great.',
    sb: 'Hola [Parent_Name], [First_Name] tuvo una confusión hoy, pero fue solo por el idioma. Después de aclarar, trabajó muy bien.',
  },
  {
    cat: 'Instructional Scaffolding',
    style: 'style-scaffold',
    title: 'Low-Affective Filter',
    check: false,
    eb: 'Hi [Parent_Name], used small groups today to help [First_Name] feel confident in class. [sub] participated much more! [Custom_Note].',
    sb: 'Hola [Parent_Name], hoy usamos grupos pequeños para que [First_Name] tenga confianza. ¡Participó mucho más! [Custom_Note].',
  },
  {
    cat: 'Parent & Community Outreach',
    style: 'style-outreach',
    title: 'Positive Check-in',
    check: false,
    eb: 'Hi [Parent_Name], [First_Name] is having a great week in [Subject]! Thanks for your support. [Custom_Note].',
    sb: 'Hola [Parent_Name], ¡[First_Name] tiene una gran semana en [Subject]! Gracias por su apoyo. [Custom_Note].',
  },
  {
    cat: 'Parent & Community Outreach',
    style: 'style-outreach',
    title: 'Remote Conference',
    check: false,
    eb: "Hi [Parent_Name], I'd like to schedule a quick call to talk about [First_Name]'s progress in [Subject]. What time works for you? [Custom_Note].",
    sb: 'Hola [Parent_Name], me gustaría programar una llamada para hablar del progreso de [First_Name] en [Subject]. ¿Qué hora le funciona? [Custom_Note].',
  },
  {
    cat: 'Professional Collaboration',
    style: 'style-collab',
    title: 'Staff Collaboration Note',
    check: false,
    eb: 'Internal log: Coordinated supports for [First_Name] in [Subject]. [Custom_Note].',
    sb: 'N/A',
  },
  {
    cat: 'Student Communication',
    style: 'style-scaffold',
    title: 'Quick feedback to student',
    check: false,
    eb: 'Hi [First_Name], [Custom_Note]. -[Teacher_Name] ([Subject])',
    sb: 'N/A',
  },
  {
    cat: 'Student Communication',
    style: 'style-outreach',
    title: 'Encouragement note',
    check: false,
    eb: 'Hi [First_Name], great work on [Subject] today! [Custom_Note]. -[Teacher_Name]',
    sb: 'N/A',
  },
];

const ordinals: Record<string, string> = {
  '1': '1st',
  '2': '2nd',
  '3': '3rd',
  '4': '4th',
  '5': '5th',
  '6': '6th',
  '7': '7th',
  '8': '8th',
};

const ordinalsSp: Record<string, string> = {
  '1': '1er',
  '2': '2do',
  '3': '3er',
  '4': '4to',
  '5': '5to',
  '6': '6to',
  '7': '7mo',
  '8': '8vo',
};

const pronouns: Record<
  GenderKey,
  { sub: string; obj: string; pos: string; s_sub: string; s_obj: string; s_suffix: string }
> = {
  male: { sub: 'he', obj: 'him', pos: 'his', s_sub: 'él', s_obj: 'él', s_suffix: 'o' },
  female: { sub: 'she', obj: 'her', pos: 'her', s_sub: 'ella', s_obj: 'ella', s_suffix: 'a' },
  neutral: { sub: 'they', obj: 'them', pos: 'their', s_sub: 'ell@', s_obj: 'ell@', s_suffix: '@' },
};

const COMM_STATE_KEY = 'dg_communicate_state_v1';
const CONTACT_LOG_SHEET_KEY = 'dg_contact_log_sheet_id';
const COMM_VOICE_DRAFT_KEY = 'dg_comm_voice_draft_v1';
const THREADS_NOTIFY_KEY = 'dg_threads_notify_v1';
const THREADS_QUIET_KEY = 'dg_threads_quiet_hours_v1';
const THREADS_LAST_SEEN_KEY = 'dg_threads_last_seen_v1';
const COMM_TAB_KEY = 'dg_communicate_tab_v1';

type PersistedCommunicateState = {
  schoolName?: string;
  teacherName?: string;
  parentName?: string;
  studentName?: string;
  gender?: GenderKey;
  subject?: string;
  period?: string;
  note?: string;
};

const loadPersistedState = (): PersistedCommunicateState | null => {
  if (typeof window === 'undefined') return null;
  return safeParseJson<PersistedCommunicateState | null>(
    window.localStorage.getItem(COMM_STATE_KEY),
    null
  );
};

export const CommunicationDashboard: React.FC<{
  educatorName: string;
  courses?: Course[];
  classroom?: ClassroomService | null;
  students?: StudentOption[];
  accessToken?: string | null;
  isDemoMode?: boolean;
}> = ({
  educatorName,
  courses = [],
  classroom,
  students: initialStudents = [],
  accessToken,
  isDemoMode,
}) => {
  const persisted = loadPersistedState();

  const [commTab, setCommTab] = useState<'cockpit' | 'compose' | 'threads' | 'log'>(() => {
    try {
      const raw = localStorage.getItem(COMM_TAB_KEY);
      return raw === 'compose' || raw === 'threads' || raw === 'log' || raw === 'cockpit'
        ? raw
        : 'cockpit';
    } catch {
      return 'cockpit';
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(COMM_TAB_KEY, commTab);
    } catch {
      // ignore
    }
  }, [commTab]);

  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [communicateStudents, setCommunicateStudents] = useState<StudentOption[]>(initialStudents);
  const [isLoadingStudents, setIsLoadingStudents] = useState(false);

  const [contactLogSheetId, setContactLogSheetId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(CONTACT_LOG_SHEET_KEY);
    } catch {
      return null;
    }
  });
  const [sheetInputValue, setSheetInputValue] = useState('');
  const [isCreatingSheet, setIsCreatingSheet] = useState(false);
  const [showSheetPicker, setShowSheetPicker] = useState(false);

  const [schoolName, setSchoolName] = useState(() => persisted?.schoolName ?? '');
  const [teacherName, setTeacherName] = useState(
    () => persisted?.teacherName ?? educatorName ?? ''
  );
  const [parentName, setParentName] = useState(() => persisted?.parentName ?? '');
  const [studentName, setStudentName] = useState(() => persisted?.studentName ?? '');
  const [gender, setGender] = useState<GenderKey>(() => persisted?.gender ?? 'neutral');
  const [subject, setSubject] = useState(() => persisted?.subject ?? 'ENL / ESL');
  const [period, setPeriod] = useState(() => persisted?.period ?? 'none');
  const [note, setNote] = useState(() => persisted?.note ?? '');
  const [search, setSearch] = useState('');
  const [activeMsg, setActiveMsg] = useState<MessageTemplate | null>(null);
  const [selectedBehaviors, setSelectedBehaviors] = useState<Set<number>>(new Set());
  const [englishText, setEnglishText] = useState('');
  const [spanishText, setSpanishText] = useState('');
  const [audience, setAudience] = useState<Audience>('parent');
  const [showBehaviors, setShowBehaviors] = useState(false);
  const [showMoreDetails, setShowMoreDetails] = useState(false);
  const [showStudentDropdown, setShowStudentDropdown] = useState(false);
  const [logState, setLogState] = useState<'idle' | 'logging' | 'done' | 'error'>('idle');
  const [logError, setLogError] = useState<string | null>(null);
  const [createSheetError, setCreateSheetError] = useState<string | null>(null);
  const firebaseCfg = getFirebaseConfig();
  const firebaseEnabled = !!firebaseCfg.apiKey && !!firebaseCfg.projectId;
  const [fbSession, setFbSession] = useState<FirebaseSession | null>(() => {
    if (typeof window === 'undefined') return null;
    return loadFirebaseSession();
  });
  const [threads, setThreads] = useState<ThreadDoc[]>([]);
  const [threadsError, setThreadsError] = useState<string | null>(null);
  const [isThreadsLoading, setIsThreadsLoading] = useState(false);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [threadMessages, setThreadMessages] = useState<MessageDoc[]>([]);
  const [isMessagesLoading, setIsMessagesLoading] = useState(false);
  const [isSendingThread, setIsSendingThread] = useState(false);
  const [threadsQuery, setThreadsQuery] = useState('');
  const [notifyEnabled, setNotifyEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem(THREADS_NOTIFY_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [quietStart, setQuietStart] = useState<string>(() => {
    try {
      return localStorage.getItem(THREADS_QUIET_KEY)?.split('|')[0] || '21:00';
    } catch {
      return '21:00';
    }
  });
  const [quietEnd, setQuietEnd] = useState<string>(() => {
    try {
      return localStorage.getItem(THREADS_QUIET_KEY)?.split('|')[1] || '07:00';
    } catch {
      return '07:00';
    }
  });

  // Accept a one-off voice draft from other screens (App-level voice capture).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const draft = window.localStorage.getItem(COMM_VOICE_DRAFT_KEY);
      if (!draft) return;
      window.localStorage.removeItem(COMM_VOICE_DRAFT_KEY);
      setNote((prev) => (prev ? `${prev} ` : '') + draft);
    } catch {
      // ignore
    }
  }, []);

  const ensureFirebase = useCallback(async (): Promise<FirebaseSession> => {
    if (!firebaseEnabled) throw new Error('Threads require Firebase env vars.');
    if (!accessToken) throw new Error('Sign in with Google to enable threads.');
    const now = Date.now();
    if (fbSession && fbSession.expiresAtMs > now + 10_000) return fbSession;
    const next = await firebaseSignInWithGoogleAccessToken(accessToken);
    setFbSession(next);
    saveFirebaseSession(next);
    return next;
  }, [firebaseEnabled, accessToken, fbSession]);

  useEffect(() => {
    try {
      localStorage.setItem(THREADS_NOTIFY_KEY, notifyEnabled ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [notifyEnabled]);
  useEffect(() => {
    try {
      localStorage.setItem(THREADS_QUIET_KEY, `${quietStart}|${quietEnd}`);
    } catch {
      /* ignore */
    }
  }, [quietStart, quietEnd]);

  const isQuietNow = useCallback(() => {
    const parse = (t: string) => {
      const [hh, mm] = t.split(':').map((x) => parseInt(x, 10));
      return (hh || 0) * 60 + (mm || 0);
    };
    const start = parse(quietStart);
    const end = parse(quietEnd);
    const now = new Date();
    const cur = now.getHours() * 60 + now.getMinutes();
    if (start === end) return false;
    // quiet window can wrap over midnight
    if (start < end) return cur >= start && cur < end;
    return cur >= start || cur < end;
  }, [quietStart, quietEnd]);

  const refreshThreads = async () => {
    try {
      setThreadsError(null);
      setIsThreadsLoading(true);
      const s = await ensureFirebase();
      const list = await listThreads(s, 30);
      setThreads(list);
    } catch (e) {
      setThreadsError(e instanceof Error ? e.message : 'Could not load threads');
    } finally {
      setIsThreadsLoading(false);
    }
  };

  // "Push-like" notifications while app is open (polling + Web Notifications).
  useEffect(() => {
    if (!notifyEnabled) return;
    if (!firebaseEnabled || !accessToken) return;
    if (typeof window === 'undefined') return;
    if (typeof Notification === 'undefined') return;
    if (Notification.permission !== 'granted') return;

    let cancelled = false;
    const id = window.setInterval(() => {
      (async () => {
        if (cancelled) return;
        try {
          const s = await ensureFirebase();
          const list = await listThreads(s, 30);
          setThreads(list);

          const raw = window.localStorage.getItem(THREADS_LAST_SEEN_KEY);
          const seen: Record<string, string> = safeParseJson(raw, {} as Record<string, string>);
          let changed = false;

          if (!isQuietNow()) {
            list.forEach((t) => {
              if (!t.lastMessageAt) return;
              const prev = seen[t.id] || '';
              if (!prev || t.lastMessageAt > prev) {
                // Don't spam: only notify once per thread update.
                new Notification(
                  t.studentName ? `New update: ${t.studentName}` : 'New thread update',
                  {
                    body: t.lastMessageText || 'Open DoneGrading to view.',
                  }
                );
                seen[t.id] = t.lastMessageAt;
                changed = true;
              }
            });
          }

          if (changed) window.localStorage.setItem(THREADS_LAST_SEEN_KEY, JSON.stringify(seen));
        } catch {
          // ignore background refresh failures
        }
      })();
    }, 30000);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [
    notifyEnabled,
    firebaseEnabled,
    accessToken,
    quietStart,
    quietEnd,
    fbSession,
    ensureFirebase,
    isQuietNow,
  ]);

  const openThread = async (threadId: string) => {
    try {
      setThreadsError(null);
      setIsMessagesLoading(true);
      setSelectedThreadId(threadId);
      const s = await ensureFirebase();
      const list = await listMessages(s, threadId, 60);
      setThreadMessages(list);
    } catch (e) {
      setThreadsError(e instanceof Error ? e.message : 'Could not load messages');
    } finally {
      setIsMessagesLoading(false);
    }
  };

  const handleSendToThread = async () => {
    if (!studentName.trim()) return;
    if (!englishText.trim()) return;
    setIsSendingThread(true);
    try {
      setThreadsError(null);
      const s = await ensureFirebase();
      const nowIso = new Date().toISOString();

      let translated = spanishText && spanishText !== 'N/A' ? spanishText : '';
      if (!translated) {
        const t = await translateText(englishText, 'es');
        translated = t || '';
      }

      const threadId = await upsertThread(s, {
        studentName,
        courseId: selectedCourseId || '',
        updatedAt: nowIso,
        lastMessageText: englishText.slice(0, 140),
        lastMessageAt: nowIso,
      });

      await sendMessage(s, threadId, {
        text: englishText,
        language: 'en',
        translatedText: translated,
        senderName: teacherName || educatorName || 'Teacher',
        createdAt: nowIso,
      });

      await upsertThread(s, {
        id: threadId,
        studentName,
        courseId: selectedCourseId || '',
        updatedAt: nowIso,
        lastMessageText: englishText.slice(0, 140),
        lastMessageAt: nowIso,
      });

      await refreshThreads();
      await openThread(threadId);
    } catch (e) {
      setThreadsError(e instanceof Error ? e.message : 'Could not send to thread');
    } finally {
      setIsSendingThread(false);
    }
  };

  const students = selectedCourseId ? communicateStudents : initialStudents;

  const handleSelectCourse = async (courseId: string) => {
    const id = courseId || null;
    setSelectedCourseId(id);
    setStudentName('');
    if (!classroom || !id) {
      setCommunicateStudents(initialStudents);
      return;
    }
    setIsLoadingStudents(true);
    try {
      const list = await classroom.getStudents(courseId);
      setCommunicateStudents(list);
    } catch (e) {
      console.error('Failed to load students for Communication dashboard', e);
      setCommunicateStudents([]);
      setThreadsError(
        'Could not load students from Google Classroom. Check your Classroom access and try again.'
      );
    } finally {
      setIsLoadingStudents(false);
    }
  };

  const studentSearch = studentName.trim().toLowerCase();
  const filteredStudents = useMemo(
    () =>
      students
        .filter(
          (s) =>
            s.name.toLowerCase().includes(studentSearch) ||
            (s.email?.toLowerCase().includes(studentSearch) ?? false)
        )
        .slice(0, 12),
    [students, studentSearch]
  );

  const handleFieldChange = (fn: () => void) => {
    fn();
    recomputeTexts(activeMsg);
  };

  // Persist core Communicate form fields on this device so the user
  // doesn't have to re-type them every time.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const payload: PersistedCommunicateState = {
      schoolName,
      teacherName,
      parentName,
      studentName,
      gender,
      subject,
      period,
      note,
    };
    try {
      window.localStorage.setItem(COMM_STATE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore storage errors (e.g., private mode)
    }
  }, [schoolName, teacherName, parentName, studentName, gender, subject, period, note]);
  const filteredMessages = useMemo(
    () =>
      messages.filter((m) => {
        const q = search.toLowerCase().trim();
        if (q && !(m.title + m.cat).toLowerCase().includes(q)) return false;
        // Strict audience filtering: no parent templates for staff, no staff templates for parent
        if (audience === 'parent') {
          return m.cat !== 'Professional Collaboration' && m.cat !== 'Student Communication';
        }
        if (audience === 'student') {
          return m.cat === 'Student Communication';
        }
        if (audience === 'staff' || audience === 'admin') {
          return m.cat === 'Professional Collaboration';
        }
        return true;
      }),
    [search, audience]
  );

  const filteredThreads = useMemo(() => {
    const q = threadsQuery.trim().toLowerCase();
    const list = [...threads].sort((a, b) =>
      (b.lastMessageAt || '').localeCompare(a.lastMessageAt || '')
    );
    if (!q) return list;
    return list.filter((t) => {
      const hay = `${t.studentName || ''} ${t.lastMessageText || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [threads, threadsQuery]);

  const toggleBehavior = (idx: number) => {
    setSelectedBehaviors((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const recomputeTexts = (template: MessageTemplate | null) => {
    if (!template) {
      setEnglishText('');
      setSpanishText('');
      return;
    }
    const p = pronouns[gender] || pronouns.neutral;
    const eList: string[] = [];
    const sList: string[] = [];
    Array.from(selectedBehaviors).forEach((i) => {
      const b = behaviors[i];
      if (b) {
        eList.push(b.e);
        sList.push(b.s);
      }
    });

    const baseMaps = [
      { r: /\[Parent_Name\]/g, v: parentName || 'Guardian' },
      { r: /\[First_Name\]/g, v: studentName || 'the student' },
      { r: /\[Teacher_Name\]/g, v: teacherName || "your child's teacher" },
      { r: /\[School\]/g, v: schoolName || 'our school' },
      { r: /\[Subject\]/g, v: subject || 'class' },
      { r: /\[sub\]/g, v: p.sub },
      { r: /\[obj\]/g, v: p.obj },
      { r: /\[pos\]/g, v: p.pos },
      { r: /\[s_sub\]/g, v: p.s_sub },
      { r: /\[s_obj\]/g, v: p.s_obj },
      { r: /\[s_suffix\]/g, v: p.s_suffix },
      { r: /\[Checklist_E\]/g, v: eList.join(', ') || 'classroom behaviors' },
      { r: /\[Checklist_S\]/g, v: sList.join(', ') || 'comportamientos en la clase' },
      { r: /\[Custom_Note\]/g, v: note || '' },
    ];

    let finalE = template.eb;
    let finalS = template.sb;
    baseMaps.forEach((m) => {
      finalE = finalE.replace(m.r, m.v);
      finalS = finalS.replace(m.r, m.v);
    });

    const ordE = ordinals[period] || '';
    const ordS = ordinalsSp[period] || '';
    finalE = finalE.replace(/\[Ord\]/g, ordE);
    finalS = finalS.replace(/\[Spa_Ord\]/g, ordS);

    const signature =
      template.cat === 'Professional Collaboration'
        ? ''
        : `\n\n-${teacherName || 'Teacher'} (${subject})`;
    setEnglishText(finalE + signature);
    setSpanishText(
      template.cat === 'Professional Collaboration' || template.sb === 'N/A'
        ? 'N/A'
        : finalS + signature
    );
  };

  const handleSelectMessage = (msg: MessageTemplate) => {
    setActiveMsg(msg);
    setSelectedBehaviors(new Set());
    setNote('');
    setLogState('idle');
    recomputeTexts(msg);
  };

  const canLog = !!activeMsg && !!studentName.trim();

  const handleLog = async () => {
    if (!activeMsg || !studentName.trim()) return;
    if (!accessToken) {
      setLogState('error');
      setTimeout(() => setLogState('idle'), 2500);
      return;
    }

    let sheetId = contactLogSheetId;
    if (!sheetId) {
      try {
        setIsCreatingSheet(true);
        sheetId = await createContactLogSheet(accessToken);
        setContactLogSheetId(sheetId);
        localStorage.setItem(CONTACT_LOG_SHEET_KEY, sheetId);
      } catch (e) {
        console.error('Create sheet failed', e);
        setLogError(e instanceof Error ? e.message : 'Could not create sheet');
        setLogState('error');
        setTimeout(() => {
          setLogState('idle');
          setLogError(null);
        }, 5000);
        setIsCreatingSheet(false);
        return;
      } finally {
        setIsCreatingSheet(false);
      }
    }

    try {
      setLogState('logging');
      await appendContactLog(accessToken, sheetId!, {
        student: studentName,
        parent: parentName,
        category: activeMsg.cat,
        title: activeMsg.title,
        note,
        fullMessage: englishText,
        school: schoolName,
        subject,
      });
      setLogState('done');
      setTimeout(() => setLogState('idle'), 2500);
    } catch (e) {
      console.error('Append log failed', e);
      setLogError(e instanceof Error ? e.message : 'Could not save to sheet');
      setLogState('error');
      setTimeout(() => {
        setLogState('idle');
        setLogError(null);
      }, 5000);
    }
  };

  const handleCreateNewSheet = async () => {
    if (!accessToken) return;
    setCreateSheetError(null);
    try {
      setIsCreatingSheet(true);
      const id = await createContactLogSheet(accessToken);
      setContactLogSheetId(id);
      localStorage.setItem(CONTACT_LOG_SHEET_KEY, id);
      setShowSheetPicker(false);
      setSheetInputValue('');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not create sheet';
      setCreateSheetError(msg);
      console.error('Create sheet failed', e);
    } finally {
      setIsCreatingSheet(false);
    }
  };

  const handleUseSheetFromInput = () => {
    const id = parseSheetId(sheetInputValue);
    if (id) {
      setContactLogSheetId(id);
      localStorage.setItem(CONTACT_LOG_SHEET_KEY, id);
      setShowSheetPicker(false);
      setSheetInputValue('');
    }
  };

  const openEmail = () => {
    if (!englishText) return;
    const emailSubject = encodeURIComponent(
      `[${subject}] ${studentName || 'Student'} – ${activeMsg?.title || 'Message'}`
    );
    const body = encodeURIComponent(englishText);
    window.location.href = `mailto:?subject=${emailSubject}&body=${body}`;
  };

  const openSms = () => {
    if (!englishText) return;
    const body = encodeURIComponent(englishText);
    window.location.href = `sms:?body=${body}`;
  };

  const copyToClipboard = async (text: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const el = document.createElement('textarea');
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-2 pb-2 overflow-hidden">
      {/* Communicate cockpit (no-scroll) */}
      <div className="shrink-0 rounded-2xl bg-white/90 dark:bg-slate-900/85 border border-slate-200 dark:border-slate-700 p-2">
        <div className="flex items-center justify-between gap-2">
          <div className="inline-flex rounded-full bg-slate-100 dark:bg-slate-800 p-0.5 text-[10px]">
            {(['cockpit', 'compose', 'threads', 'log'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setCommTab(t)}
                className={`px-3 py-1 rounded-full font-semibold capitalize ${
                  commTab === t ? 'bg-indigo-600 text-white' : 'text-slate-700 dark:text-slate-300'
                }`}
              >
                {t === 'cockpit' ? 'Today' : t}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                setCommTab('compose');
                setActiveMsg(null);
                setEnglishText('');
                setSpanishText('');
                setSelectedBehaviors(new Set());
              }}
              className="px-2 py-1 rounded-full bg-emerald-600 text-white text-[10px] font-semibold"
            >
              + New
            </button>
            {firebaseEnabled && (
              <button
                type="button"
                onClick={() => {
                  setCommTab('threads');
                  void refreshThreads();
                }}
                className="px-2 py-1 rounded-full border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-950/40 text-[10px] font-semibold"
              >
                Refresh
              </button>
            )}
          </div>
        </div>

        <div className="mt-2 grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => setCommTab('compose')}
            className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-950/40 px-3 py-2 text-left"
          >
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              Compose
            </p>
            <p className="text-[11px] font-semibold text-slate-800 dark:text-slate-100">
              Templates
            </p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400">
              {messages.length} ready-to-send
            </p>
          </button>
          <button
            type="button"
            onClick={() => {
              setCommTab('threads');
              void refreshThreads();
            }}
            className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-950/40 px-3 py-2 text-left"
          >
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              Threads
            </p>
            <p className="text-[11px] font-semibold text-slate-800 dark:text-slate-100">
              {threads.length}
            </p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400">
              {firebaseEnabled ? 'Beta inbox' : 'Enable Firebase'}
            </p>
          </button>
          <button
            type="button"
            onClick={() => setCommTab('log')}
            className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-950/40 px-3 py-2 text-left"
          >
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              Log
            </p>
            <p className="text-[11px] font-semibold text-slate-800 dark:text-slate-100">
              {contactLogSheetId ? 'Sheet connected' : 'Connect Sheet'}
            </p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400">One-tap record keeping</p>
          </button>
        </div>
      </div>

      {/* Main content (scroll) */}
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar flex flex-col gap-2">
        {commTab === 'cockpit' && (
          <>
            <div className="rounded-2xl bg-indigo-50/70 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-700 p-3">
              <p className="text-[10px] font-semibold text-indigo-700 dark:text-indigo-200">
                Fast path: pick who you’re contacting, select a template, send, then log it—no
                scrolling required.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-2">
              <div className={card}>
                <p className={`${sectionTitle} mb-2`}>Quick compose</p>
                <div className="flex flex-wrap gap-1.5">
                  {(['parent', 'student', 'staff', 'admin'] as Audience[]).map((a) => (
                    <button
                      key={a}
                      type="button"
                      onClick={() => {
                        setAudience(a);
                        setCommTab('compose');
                        setActiveMsg(null);
                        setEnglishText('');
                        setSpanishText('');
                      }}
                      className={`${chip} ${audience === a ? 'bg-indigo-600 text-white border-indigo-600' : chipInactive}`}
                    >
                      {a === 'parent'
                        ? 'Parent/Guardian'
                        : a === 'student'
                          ? 'Student'
                          : a === 'staff'
                            ? 'Staff'
                            : 'Admin'}
                    </button>
                  ))}
                </div>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setCommTab('compose')}
                    className="flex-1 py-2 rounded-xl bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 text-[11px] font-semibold"
                  >
                    Open composer
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCommTab('threads');
                      void refreshThreads();
                    }}
                    className="flex-1 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-[11px] font-semibold"
                  >
                    Open inbox
                  </button>
                </div>
              </div>

              <div className={card}>
                <p className={`${sectionTitle} mb-1.5`}>Most-used templates</p>
                <div className="space-y-1">
                  {messages.slice(0, 4).map((m) => (
                    <button
                      key={`${m.cat}-${m.title}`}
                      type="button"
                      onClick={() => {
                        setCommTab('compose');
                        handleSelectMessage(m);
                      }}
                      className="w-full text-left px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/70 hover:bg-slate-100 dark:hover:bg-slate-800/50"
                    >
                      <p className="text-[11px] font-semibold text-slate-800 dark:text-slate-100">
                        {m.title}
                      </p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">{m.cat}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}

        {commTab === 'compose' && (
          <>
            <div className={card}>
              <p className={`${sectionTitle} mb-2`}>Who are you contacting?</p>
              <div className="flex flex-wrap gap-1.5">
                {(['parent', 'student', 'staff', 'admin'] as Audience[]).map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => {
                      setAudience(a);
                      setActiveMsg(null);
                      setEnglishText('');
                      setSpanishText('');
                    }}
                    className={`${chip} ${audience === a ? 'bg-indigo-600 text-white border-indigo-600' : chipInactive}`}
                  >
                    {a === 'parent'
                      ? 'Parent/Guardian'
                      : a === 'student'
                        ? 'Student'
                        : a === 'staff'
                          ? 'Staff'
                          : 'Admin'}
                  </button>
                ))}
              </div>
            </div>

            <div className={card}>
              <p className={`${sectionTitle} mb-1.5`}>Context</p>
              <div className="space-y-1.5">
                <div>
                  <label className={label}>Course</label>
                  <select
                    value={selectedCourseId ?? ''}
                    onChange={(e) => handleSelectCourse(e.target.value || '')}
                    className={input}
                  >
                    <option value="">Select a course…</option>
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.period ? `(${c.period})` : ''}
                      </option>
                    ))}
                  </select>
                  {courses.length === 0 && (
                    <p className={`mt-0.5 ${helperText}`}>
                      Pick a course in Grade to load your roster.
                    </p>
                  )}
                </div>

                <div className="relative">
                  <label className={label}>Student</label>
                  {students.length > 0 ? (
                    <>
                      <div
                        className="flex items-center gap-1 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 px-2 py-1.5"
                        onClick={() => setShowStudentDropdown((v) => !v)}
                      >
                        <input
                          value={studentName}
                          onChange={(e) => {
                            setStudentName(e.target.value);
                            setShowStudentDropdown(true);
                            if (activeMsg) recomputeTexts(activeMsg);
                          }}
                          onFocus={() => setShowStudentDropdown(true)}
                          placeholder="Search or select..."
                          className="flex-1 min-w-0 bg-transparent text-[11px] outline-none"
                        />
                        <ChevronDown
                          className={`w-4 h-4 text-slate-400 transition-transform ${showStudentDropdown ? 'rotate-180' : ''}`}
                        />
                      </div>
                      {showStudentDropdown && (
                        <>
                          <div
                            className="fixed inset-0 z-40"
                            onClick={() => setShowStudentDropdown(false)}
                            aria-hidden="true"
                          />
                          <ul className="absolute left-0 right-0 top-full mt-0.5 max-h-36 overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg z-50 py-1">
                            {filteredStudents.length === 0 ? (
                              <li className="px-2 py-2 text-[10px] text-slate-500">
                                No matches. Type to add manually.
                              </li>
                            ) : (
                              filteredStudents.map((s) => (
                                <li key={s.id}>
                                  <button
                                    type="button"
                                    className="w-full text-left px-2 py-1.5 text-[11px] hover:bg-indigo-50 dark:hover:bg-indigo-900/30"
                                    onClick={() => {
                                      setStudentName(s.name);
                                      setShowStudentDropdown(false);
                                      if (activeMsg) recomputeTexts(activeMsg);
                                    }}
                                  >
                                    {s.name}
                                  </button>
                                </li>
                              ))
                            )}
                          </ul>
                        </>
                      )}
                      <span className={helperText}>{students.length} in roster</span>
                    </>
                  ) : (
                    <input
                      value={studentName}
                      onChange={(e) => handleFieldChange(() => setStudentName(e.target.value))}
                      className={input}
                      placeholder={
                        isLoadingStudents ? 'Loading…' : 'Select course first or type name'
                      }
                    />
                  )}
                </div>

                <div className="grid grid-cols-2 gap-1.5 mt-1.5">
                  <div>
                    <label className={label}>Gender / Pronouns</label>
                    <select
                      value={gender}
                      onChange={(e) =>
                        handleFieldChange(() => setGender(e.target.value as GenderKey))
                      }
                      className={input}
                    >
                      <option value="neutral">They/Them</option>
                      <option value="female">She/Her</option>
                      <option value="male">He/Him</option>
                    </select>
                  </div>
                  <div>
                    <label className={label}>Subject</label>
                    <select
                      value={subject}
                      onChange={(e) => handleFieldChange(() => setSubject(e.target.value))}
                      className={input}
                    >
                      <option value="ENL / ESL">ENL / ESL</option>
                      <option value="Language Arts">Language Arts</option>
                      <option value="Math">Math</option>
                      <option value="Science">Science</option>
                      <option value="Social Studies">Social Studies</option>
                      <option value="Homeroom / Advisory">Homeroom</option>
                    </select>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowMoreDetails((v) => !v)}
                  className="mb-2 w-full flex items-center justify-between px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/60 dark:bg-slate-800/60 text-[10px] font-semibold text-slate-600 dark:text-slate-300"
                >
                  <span>{showMoreDetails ? 'Hide' : 'Parent name, period, school…'}</span>
                  <ChevronRight
                    className={`w-4 h-4 transition-transform ${showMoreDetails ? 'rotate-90' : ''}`}
                  />
                </button>
                {showMoreDetails && (
                  <div className="grid grid-cols-2 gap-1.5 text-[10px] mt-1.5">
                    <div>
                      <label className={label}>Parent / Guardian</label>
                      <input
                        value={parentName}
                        onChange={(e) => handleFieldChange(() => setParentName(e.target.value))}
                        className={input}
                        placeholder="Name"
                      />
                    </div>
                    <div>
                      <label className={label}>Period</label>
                      <select
                        value={period}
                        onChange={(e) => handleFieldChange(() => setPeriod(e.target.value))}
                        className={input}
                      >
                        <option value="none">N/A</option>
                        {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                          <option key={n} value={String(n)}>
                            Period {n}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className={label}>School</label>
                      <input
                        value={schoolName}
                        onChange={(e) => handleFieldChange(() => setSchoolName(e.target.value))}
                        className={input}
                        placeholder="Your school"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className={label}>From (your name)</label>
                      <input
                        value={teacherName}
                        onChange={(e) => handleFieldChange(() => setTeacherName(e.target.value))}
                        className={input}
                        placeholder="Your name"
                      />
                    </div>
                  </div>
                )}
                <p className={`mt-1 ${helperText}`}>
                  We remember these details on this device so you don’t have to re‑type them.
                </p>
              </div>
            </div>

            <div className={card}>
              <div className="flex items-center justify-between gap-2">
                <p className={`${sectionTitle}`}>Template</p>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search templates…"
                  className="w-[160px] px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/70 text-[10px]"
                />
              </div>
              <select
                value={
                  activeMsg
                    ? String(
                        filteredMessages.findIndex(
                          (m) => m.title === activeMsg.title && m.cat === activeMsg.cat
                        )
                      )
                    : '-1'
                }
                onChange={(e) => {
                  const idx = parseInt(e.target.value, 10);
                  const msg = idx >= 0 ? filteredMessages[idx] : null;
                  if (msg) handleSelectMessage(msg);
                }}
                className={`${input} mt-1.5`}
              >
                <option value="-1">Select a template…</option>
                {filteredMessages.map((msg, idx) => (
                  <option key={`${msg.cat}-${msg.title}`} value={idx}>
                    {msg.title} ({msg.cat})
                  </option>
                ))}
              </select>
              {filteredMessages.length === 0 && (
                <p className={`mt-1 ${helperText}`}>
                  No templates for {audience}. Change who you're contacting above.
                </p>
              )}
              <button
                type="button"
                onClick={() => setShowBehaviors((v) => !v)}
                className="mt-1.5 w-full px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/80 text-[10px] font-semibold text-slate-700 dark:text-slate-200 flex items-center justify-between"
              >
                <span>
                  {showBehaviors ? 'Hide behavior options' : 'Add behavior/context (optional)'}
                </span>
                <span>{showBehaviors ? '−' : '+'}</span>
              </button>
              {showBehaviors && (
                <div className="mt-1 space-y-1.5">
                  <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto custom-scrollbar">
                    {behaviors.map((b, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          toggleBehavior(idx);
                          if (activeMsg) recomputeTexts(activeMsg);
                        }}
                        className={`${chip} ${selectedBehaviors.has(idx) ? 'bg-emerald-500/20 border-emerald-500 text-emerald-700 dark:text-emerald-200' : chipInactive}`}
                      >
                        {b.e}
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={note}
                    onChange={(e) => handleFieldChange(() => setNote(e.target.value))}
                    className={`${textarea} min-h-[45px] max-h-[80px] text-[10px]`}
                    placeholder="Details to add to the message…"
                  />
                </div>
              )}
            </div>

            <div className={`${card} flex flex-col min-h-0`}>
              <p className={`${sectionTitle} mb-2`}>Preview & send</p>
              <div className="flex flex-wrap gap-2 mb-1.5">
                <button
                  type="button"
                  disabled={!englishText}
                  onClick={openEmail}
                  className={`${chip} ${englishText ? 'bg-sky-500 text-white border-sky-500 hover:bg-sky-600' : 'border-slate-200 dark:border-slate-800 text-slate-400 dark:text-slate-500'}`}
                >
                  <Mail className="w-3.5 h-3.5 mr-1 inline" /> Email
                </button>
                <button
                  type="button"
                  disabled={!englishText}
                  onClick={openSms}
                  className={`${chip} ${englishText ? 'bg-emerald-500 text-white border-emerald-500 hover:bg-emerald-600' : 'border-slate-200 dark:border-slate-800 text-slate-400 dark:text-slate-500'}`}
                >
                  <MessageCircle className="w-3.5 h-3.5 mr-1 inline" /> SMS
                </button>
                <button
                  type="button"
                  disabled={!englishText}
                  onClick={() => copyToClipboard(englishText)}
                  className={`${chip} ${englishText ? 'border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 bg-white/80 dark:bg-slate-900/80' : 'border-slate-200 dark:border-slate-800 text-slate-400 dark:text-slate-500'}`}
                >
                  <Copy className="w-3.5 h-3.5 mr-1 inline" /> Copy
                </button>
                <button
                  type="button"
                  disabled={!spanishText || spanishText === 'N/A'}
                  onClick={() => copyToClipboard(spanishText)}
                  className={`${chip} ${spanishText && spanishText !== 'N/A' ? 'border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 bg-white/80 dark:bg-slate-900/80' : 'border-slate-200 dark:border-slate-800 text-slate-400 dark:text-slate-500'}`}
                >
                  Copy Spanish
                </button>
                {firebaseEnabled && (
                  <button
                    type="button"
                    disabled={!englishText || !studentName.trim() || isSendingThread}
                    onClick={handleSendToThread}
                    className={`${chip} ${
                      englishText && studentName.trim() && !isSendingThread
                        ? 'bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700'
                        : 'border-slate-200 dark:border-slate-800 text-slate-400 dark:text-slate-500'
                    }`}
                    title="Send this message into a thread (beta)"
                  >
                    {isSendingThread ? 'Sending…' : 'Send to thread'}
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 gap-1.5 min-h-0">
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/80 p-2 overflow-y-auto custom-scrollbar">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400 mb-1">
                    English
                  </p>
                  <pre className="whitespace-pre-wrap text-[10px] text-slate-800 dark:text-slate-100 m-0 font-sans">
                    {englishText ||
                      'Select a template and fill in the details to generate a message.'}
                  </pre>
                </div>
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/80 p-2 overflow-y-auto custom-scrollbar">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400 mb-1">
                    Spanish (optional)
                  </p>
                  <pre className="whitespace-pre-wrap text-[10px] text-slate-800 dark:text-slate-100 m-0 font-sans">
                    {spanishText || 'Spanish version will appear here for most family messages.'}
                  </pre>
                </div>
              </div>
            </div>
          </>
        )}

        {commTab === 'threads' && (
          <div className={card}>
            <div className="flex items-center justify-between gap-2">
              <p className={`${sectionTitle}`}>Inbox (threads)</p>
              <div className="flex items-center gap-2">
                {firebaseEnabled && accessToken && (
                  <button
                    type="button"
                    onClick={refreshThreads}
                    disabled={isThreadsLoading}
                    className="text-[10px] font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-800 disabled:opacity-50"
                  >
                    {isThreadsLoading ? 'Refreshing…' : 'Refresh'}
                  </button>
                )}
                {fbSession && (
                  <button
                    type="button"
                    onClick={() => {
                      setFbSession(null);
                      saveFirebaseSession(null);
                      setThreads([]);
                      setSelectedThreadId(null);
                      setThreadMessages([]);
                    }}
                    className="text-[10px] font-semibold text-slate-500 hover:text-slate-700"
                    title="Sign out of threads"
                  >
                    Sign out
                  </button>
                )}
              </div>
            </div>

            {!firebaseEnabled ? (
              <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-500">
                Add `VITE_FIREBASE_API_KEY` + `VITE_FIREBASE_PROJECT_ID` to enable threads.
              </p>
            ) : !accessToken ? (
              <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-500">
                Sign in with Google (Home tab) to enable threads.
              </p>
            ) : (
              <>
                {threadsError && (
                  <p className="mt-2 text-[10px] text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-2 py-1.5 rounded-lg">
                    {threadsError}
                  </p>
                )}

                <div className="mt-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/70 p-2">
                  <input
                    value={threadsQuery}
                    onChange={(e) => setThreadsQuery(e.target.value)}
                    placeholder="Search threads…"
                    className="w-full px-2 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-950/40 text-[11px]"
                  />
                  <div className="mt-2 max-h-56 overflow-y-auto custom-scrollbar space-y-1">
                    {filteredThreads.length === 0 ? (
                      <p className="text-[10px] text-slate-500 dark:text-slate-500 px-1">
                        No threads yet. Use “Send to thread” from the composer to create one.
                      </p>
                    ) : (
                      filteredThreads.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => void openThread(t.id)}
                          className={`w-full text-left px-3 py-2 rounded-xl border text-[10px] transition-colors ${
                            selectedThreadId === t.id
                              ? 'border-indigo-400 bg-indigo-50/80 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-200'
                              : 'border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/80 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/50'
                          }`}
                        >
                          <div className="font-semibold">{t.studentName || 'Student'}</div>
                          <div className="text-[9px] text-slate-500 dark:text-slate-400 truncate">
                            {t.lastMessageText || '—'}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>

                {selectedThreadId && (
                  <div className="mt-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/80 p-2">
                    <div className="flex items-center justify-between">
                      <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                        Thread
                      </p>
                      {isMessagesLoading && (
                        <span className="text-[9px] text-slate-500">Loading…</span>
                      )}
                    </div>
                    <div className="mt-1 max-h-56 overflow-y-auto custom-scrollbar space-y-2">
                      {threadMessages.length === 0 ? (
                        <p className="text-[10px] text-slate-500 dark:text-slate-500">
                          No messages yet.
                        </p>
                      ) : (
                        threadMessages.map((m) => (
                          <div
                            key={m.id}
                            className="px-2 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                          >
                            <p className="text-[10px] text-slate-800 dark:text-slate-100 whitespace-pre-wrap">
                              {m.text}
                            </p>
                            {m.translatedText && (
                              <p className="mt-1 text-[10px] text-slate-600 dark:text-slate-300 whitespace-pre-wrap">
                                {m.translatedText}
                              </p>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}

                <div className="mt-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/70 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] font-semibold text-slate-600 dark:text-slate-400">
                      Notifications (while app is open)
                    </p>
                    <button
                      type="button"
                      onClick={async () => {
                        if (typeof Notification === 'undefined') {
                          setThreadsError("Notifications aren't supported on this device/browser.");
                          return;
                        }
                        const perm = await Notification.requestPermission();
                        setNotifyEnabled(perm === 'granted');
                        if (perm !== 'granted') setThreadsError('Notification permission denied.');
                      }}
                      className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border transition-colors ${
                        notifyEnabled
                          ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-700 dark:text-emerald-200'
                          : 'bg-white/80 dark:bg-slate-900/80 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      {notifyEnabled ? 'Enabled' : 'Enable'}
                    </button>
                  </div>

                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <div>
                      <label className={`${label} !mb-0.5`}>Quiet hours start</label>
                      <input
                        type="time"
                        value={quietStart}
                        onChange={(e) => setQuietStart(e.target.value)}
                        className={`${input} text-[10px]`}
                      />
                    </div>
                    <div>
                      <label className={`${label} !mb-0.5`}>Quiet hours end</label>
                      <input
                        type="time"
                        value={quietEnd}
                        onChange={(e) => setQuietEnd(e.target.value)}
                        className={`${input} text-[10px]`}
                      />
                    </div>
                  </div>
                  <p className={`mt-1 ${helperText}`}>
                    If enabled, we poll threads and show a notification when something changes (no
                    background push yet).
                  </p>
                </div>
              </>
            )}
          </div>
        )}

        {commTab === 'log' && (
          <div className={card}>
            <p className={`${sectionTitle} mb-2`}>Contact log</p>
            {!accessToken ? (
              <p className="text-[10px] text-slate-500 dark:text-slate-500">
                {isDemoMode
                  ? "Demo mode can't save to Sheets. Go to Home → Sign in with Google to log contacts to your own sheet."
                  : 'Go to Home and sign in with Google to save contacts to your own sheet.'}
              </p>
            ) : (
              <>
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 p-2">
                  <p className="text-[10px] font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
                    Google Sheet
                  </p>
                  {contactLogSheetId ? (
                    <div className="flex items-center justify-between gap-2">
                      <a
                        href={`https://docs.google.com/spreadsheets/d/${contactLogSheetId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-indigo-600 dark:text-indigo-400 truncate flex-1"
                      >
                        View sheet ↗
                      </a>
                      <button
                        type="button"
                        onClick={() => setShowSheetPicker(true)}
                        className="text-[9px] font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                      >
                        Change
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <button
                        type="button"
                        disabled={isCreatingSheet}
                        onClick={handleCreateNewSheet}
                        className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-indigo-600 text-white text-[11px] font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <FilePlus className="w-4 h-4 shrink-0" />
                        {isCreatingSheet ? 'Creating…' : 'Create new sheet (default)'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowSheetPicker(true)}
                        className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-dashed border-slate-300 dark:border-slate-600 text-[10px] font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/50"
                      >
                        <Link2 className="w-3.5 h-3.5" /> Or paste existing sheet URL
                      </button>
                    </div>
                  )}
                </div>

                {createSheetError && !contactLogSheetId && (
                  <p className="mt-2 text-[10px] text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-2 py-1.5 rounded-lg">
                    {createSheetError}
                  </p>
                )}

                {showSheetPicker && accessToken && (
                  <div className="mt-2 p-2 rounded-lg border border-indigo-200 dark:border-indigo-700 bg-indigo-50/30 dark:bg-indigo-900/20 space-y-2">
                    {createSheetError && (
                      <p className="text-[10px] text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-2 py-1.5 rounded-lg">
                        {createSheetError}
                      </p>
                    )}
                    <button
                      type="button"
                      disabled={isCreatingSheet}
                      onClick={handleCreateNewSheet}
                      className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-indigo-600 text-white text-[11px] font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <FilePlus className="w-4 h-4 shrink-0" />
                      {isCreatingSheet ? 'Creating…' : 'Create new sheet (default)'}
                    </button>
                    <div className="flex gap-1.5">
                      <input
                        value={sheetInputValue}
                        onChange={(e) => setSheetInputValue(e.target.value)}
                        placeholder="Paste sheet URL or ID"
                        className={`${input} flex-1 text-[10px]`}
                      />
                      <button
                        type="button"
                        onClick={handleUseSheetFromInput}
                        disabled={!parseSheetId(sheetInputValue)}
                        className="px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-[10px] font-semibold disabled:opacity-40"
                      >
                        Use this
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setShowSheetPicker(false);
                        setSheetInputValue('');
                        setCreateSheetError(null);
                      }}
                      className="w-full text-[10px] text-slate-500 hover:text-slate-700"
                    >
                      Cancel
                    </button>
                  </div>
                )}

                {logState === 'error' && logError && (
                  <div className="mt-2 space-y-1">
                    <p className="text-[10px] text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-2 py-1.5 rounded-lg">
                      {logError}
                    </p>
                    {(logError.includes('permission') ||
                      logError.includes('insufficient') ||
                      logError.includes('inaccessible')) && (
                      <p className="text-[9px] text-slate-500 dark:text-slate-400">
                        Tip: The sheet may be view-only or owned by someone else. Try “Create new
                        sheet” or use a sheet you own.
                      </p>
                    )}
                  </div>
                )}

                <button
                  type="button"
                  disabled={!canLog || logState === 'logging' || !accessToken}
                  onClick={handleLog}
                  className={`mt-2 flex items-center justify-center gap-2 ${btnPrimary} ${!canLog || logState === 'logging' || !accessToken ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-500' : 'bg-violet-500 text-white hover:bg-violet-600'}`}
                >
                  <ClipboardList className="w-4 h-4" />
                  {logState === 'idle' &&
                    (contactLogSheetId ? 'Log to contact record' : 'Create sheet & log')}
                  {logState === 'logging' && 'Logging…'}
                  {logState === 'done' && 'Logged!'}
                  {logState === 'error' && 'Error – Try again'}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
