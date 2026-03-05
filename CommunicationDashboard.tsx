import React, { useEffect, useMemo, useState } from 'react';
import { card, sectionTitle, label, input, textarea, btnPrimary, chip, chipInactive, listItem, listItemActive, listItemInactive, helperText } from './uiStyles';

type Audience = 'student' | 'parent' | 'admin' | 'staff' | 'other';
type GenderKey = 'male' | 'female' | 'neutral';

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
  { e: "Distracted by peers", s: "Distraído por compañeros" },
  { e: "Unauthorized phone use", s: "Uso no autorizado del celular" },
  { e: "Wearing headphones", s: "Uso de audífonos" },
  { e: "Interrupting class", s: "Interrumpiendo la clase" },
  { e: "Off-task / Head down", s: "Fuera de tarea / Cabeza baja" },
  { e: "Sleeping in class", s: "Durmiendo en clase" },
  { e: "Excessive movement", s: "Movimiento excesivo" },
  { e: "Walking out without permission", s: "Salió sin permiso" },
  { e: "Lateness to class", s: "Llegó tarde" },
  { e: "Peer conflict", s: "Conflicto con compañero" },
  { e: "Incomplete classwork", s: "Trabajo incompleto" },
  { e: "Difficulty starting", s: "Dificultad para comenzar" },
  { e: "Missing materials", s: "Falta de materiales" },
  { e: "Frustration / Shutting down", s: "Frustración / Se cerró" },
  { e: "Language barrier", s: "Barrera del idioma" },
];

const messages: MessageTemplate[] = [
  {
    cat: "Behavioral Support",
    style: "style-support",
    title: "Standard Support Check-in",
    check: true,
    eb: "Hi [Parent_Name], this is [Teacher_Name] from [School]. I want to make sure [First_Name] stays on track in [Subject] ([Ord] period). Recently, [sub] has had trouble with: [Checklist_E]. [Custom_Note]. Could you chat with [obj] about focusing in class? Thanks!",
    sb: "Hola [Parent_Name], habla [Teacher_Name] de [School]. Quiero asegurar que [First_Name] tenga éxito en [Subject] ([Spa_Ord] período). Ha tenido dificultad con: [Checklist_S]. [Custom_Note]. ¿Podría hablar con [s_obj] sobre esto?",
  },
  {
    cat: "Behavioral Support",
    style: "style-support",
    title: "Reflective Loop",
    check: true,
    eb: "Hi [Parent_Name], [First_Name] and I had a talk about [pos] choices in class today. Issues: [Checklist_E]. [Custom_Note]. Hoping for a better day tomorrow.",
    sb: "Hola [Parent_Name], [First_Name] y yo hablamos hoy sobre sus decisiones en clase. [Checklist_S]. [Custom_Note]. Esperamos un mejor día mañana.",
  },
  {
    cat: "Instructional Scaffolding",
    style: "style-scaffold",
    title: "Language Misunderstanding",
    check: true,
    eb: "Hi [Parent_Name], [First_Name] had confusion today, but just a language barrier. [Checklist_E]. Once clarified, [sub] did great.",
    sb: "Hola [Parent_Name], [First_Name] tuvo una confusión hoy, pero fue solo por el idioma. Después de aclarar, trabajó muy bien.",
  },
  {
    cat: "Instructional Scaffolding",
    style: "style-scaffold",
    title: "Low-Affective Filter",
    check: false,
    eb: "Hi [Parent_Name], used small groups today to help [First_Name] feel confident in class. [sub] participated much more! [Custom_Note].",
    sb: "Hola [Parent_Name], hoy usamos grupos pequeños para que [First_Name] tenga confianza. ¡Participó mucho más! [Custom_Note].",
  },
  {
    cat: "Parent & Community Outreach",
    style: "style-outreach",
    title: "Positive Check-in",
    check: false,
    eb: "Hi [Parent_Name], [First_Name] is having a great week in [Subject]! Thanks for your support. [Custom_Note].",
    sb: "Hola [Parent_Name], ¡[First_Name] tiene una gran semana en [Subject]! Gracias por su apoyo. [Custom_Note].",
  },
  {
    cat: "Parent & Community Outreach",
    style: "style-outreach",
    title: "Remote Conference",
    check: false,
    eb: "Hi [Parent_Name], I'd like to schedule a quick call to talk about [First_Name]'s progress in [Subject]. What time works for you? [Custom_Note].",
    sb: "Hola [Parent_Name], me gustaría programar una llamada para hablar del progreso de [First_Name] en [Subject]. ¿Qué hora le funciona? [Custom_Note].",
  },
  {
    cat: "Professional Collaboration",
    style: "style-collab",
    title: "Staff Collaboration Note",
    check: false,
    eb: "Internal log: Coordinated supports for [First_Name] in [Subject]. [Custom_Note].",
    sb: "N/A",
  },
];

const ordinals: Record<string, string> = {
  "1": "1st",
  "2": "2nd",
  "3": "3rd",
  "4": "4th",
  "5": "5th",
  "6": "6th",
  "7": "7th",
  "8": "8th",
};

const ordinalsSp: Record<string, string> = {
  "1": "1er",
  "2": "2do",
  "3": "3er",
  "4": "4to",
  "5": "5to",
  "6": "6to",
  "7": "7mo",
  "8": "8vo",
};

const pronouns: Record<GenderKey, { sub: string; obj: string; pos: string; s_sub: string; s_obj: string; s_suffix: string }> = {
  male: { sub: "he", obj: "him", pos: "his", s_sub: "él", s_obj: "él", s_suffix: "o" },
  female: { sub: "she", obj: "her", pos: "her", s_sub: "ella", s_obj: "ella", s_suffix: "a" },
  neutral: { sub: "they", obj: "them", pos: "their", s_sub: "ell@", s_obj: "ell@", s_suffix: "@" },
};

const GOOGLE_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbwJuXQiiLYofxxCMoRMCLwiN4pOS8ir118GTy_LLLpdFy6aTKE_-Jz1kw64zU_ymPMzqQ/exec";

const COMM_STATE_KEY = "dg_communicate_state_v1";

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
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(COMM_STATE_KEY);
    return raw ? (JSON.parse(raw) as PersistedCommunicateState) : null;
  } catch {
    return null;
  }
};

export const CommunicationDashboard: React.FC<{ educatorName: string }> = ({ educatorName }) => {
  const persisted = loadPersistedState();

  const [schoolName, setSchoolName] = useState(() => persisted?.schoolName ?? "");
  const [teacherName, setTeacherName] = useState(
    () => persisted?.teacherName ?? educatorName ?? ""
  );
  const [parentName, setParentName] = useState(() => persisted?.parentName ?? "");
  const [studentName, setStudentName] = useState(() => persisted?.studentName ?? "");
  const [gender, setGender] = useState<GenderKey>(() => persisted?.gender ?? "neutral");
  const [subject, setSubject] = useState(() => persisted?.subject ?? "ENL / ESL");
  const [period, setPeriod] = useState(() => persisted?.period ?? "none");
  const [note, setNote] = useState(() => persisted?.note ?? "");
  const [search, setSearch] = useState("");
  const [activeMsg, setActiveMsg] = useState<MessageTemplate | null>(null);
  const [selectedBehaviors, setSelectedBehaviors] = useState<Set<number>>(new Set());
  const [englishText, setEnglishText] = useState("");
  const [spanishText, setSpanishText] = useState("");
  const [audience, setAudience] = useState<Audience>('parent');
  const [showBehaviors, setShowBehaviors] = useState(false);

  // Persist core Communicate form fields on this device so the user
  // doesn't have to re-type them every time.
  useEffect(() => {
    if (typeof window === "undefined") return;
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
        // Audience-specific submenus
        if (audience === 'parent') {
          if (m.cat === 'Professional Collaboration') return false;
        } else if (audience === 'student') {
          if (m.cat === 'Professional Collaboration') return false;
        } else if (audience === 'staff' || audience === 'admin') {
          if (m.cat !== 'Professional Collaboration') return false;
        }
        return true;
      }),
    [search, audience]
  );

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
      setEnglishText("");
      setSpanishText("");
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
      { r: /\[Parent_Name\]/g, v: parentName || "Guardian" },
      { r: /\[First_Name\]/g, v: studentName || "the student" },
      { r: /\[Teacher_Name\]/g, v: teacherName || "your child's teacher" },
      { r: /\[School\]/g, v: schoolName || "our school" },
      { r: /\[Subject\]/g, v: subject || "class" },
      { r: /\[sub\]/g, v: p.sub },
      { r: /\[obj\]/g, v: p.obj },
      { r: /\[pos\]/g, v: p.pos },
      { r: /\[s_sub\]/g, v: p.s_sub },
      { r: /\[s_obj\]/g, v: p.s_obj },
      { r: /\[s_suffix\]/g, v: p.s_suffix },
      { r: /\[Checklist_E\]/g, v: eList.join(", ") || "classroom behaviors" },
      { r: /\[Checklist_S\]/g, v: sList.join(", ") || "comportamientos en la clase" },
      { r: /\[Custom_Note\]/g, v: note || "" },
    ];

    let finalE = template.eb;
    let finalS = template.sb;
    baseMaps.forEach((m) => {
      finalE = finalE.replace(m.r, m.v);
      finalS = finalS.replace(m.r, m.v);
    });

    const ordE = ordinals[period] || "";
    const ordS = ordinalsSp[period] || "";
    finalE = finalE.replace(/\[Ord\]/g, ordE);
    finalS = finalS.replace(/\[Spa_Ord\]/g, ordS);

    const signature = template.cat === "Professional Collaboration" ? "" : `\n\n-${teacherName || "Teacher"} (${subject})`;
    setEnglishText(finalE + signature);
    setSpanishText(
      template.cat === "Professional Collaboration" || template.sb === "N/A"
        ? "N/A"
        : finalS + signature
    );
  };

  const handleSelectMessage = (msg: MessageTemplate) => {
    setActiveMsg(msg);
    setSelectedBehaviors(new Set());
    setNote("");
    setLogState("idle");
    recomputeTexts(msg);
  };

  const canLog = !!activeMsg && !!studentName.trim();

  const handleLog = async () => {
    if (!activeMsg || !studentName.trim()) return;
    try {
      setLogState("logging");
      await fetch(GOOGLE_SCRIPT_URL, {
        method: "POST",
        mode: "no-cors",
        body: JSON.stringify({
          student: studentName,
          parent: parentName,
          method: "Text",
          category: activeMsg.cat,
          title: activeMsg.title,
          customNote: note,
          fullMessage: englishText,
          school: schoolName,
          subject,
        }),
      });
      setLogState("done");
      setTimeout(() => setLogState("idle"), 2500);
    } catch {
      setLogState("error");
      setTimeout(() => setLogState("idle"), 2500);
    }
  };

  const copyToClipboard = async (text: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const el = document.createElement("textarea");
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
  };

  return (
    <div className="h-full flex flex-col gap-3">
      <div className={card}>
        <div className="flex items-center justify-between mb-1.5 gap-2">
          <p className={sectionTitle}>Communicate</p>
        </div>
        <div className="flex flex-wrap gap-1 mb-2">
          {(['student','parent','admin','staff','other'] as Audience[]).map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setAudience(a)}
              className={`${chip} ${audience === a ? 'bg-indigo-600 text-white border-indigo-600' : chipInactive}`}
            >
              {a === 'student' ? 'Student' : a === 'parent' ? 'Parent/Guardian' : a === 'admin' ? 'Admin' : a === 'staff' ? 'Staff' : 'Other'}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-1.5 text-[10px]">
          <div className="flex flex-col gap-1">
            <label className={label}>School</label>
            <input
              value={schoolName}
              onChange={(e) => handleFieldChange(() => setSchoolName(e.target.value))}
              className={input}
              placeholder="Your school"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={label}>
              From
              <span className={`ml-1 ${helperText}`}>
                (saved on this device)
              </span>
            </label>
            <input
              value={teacherName}
              onChange={(e) => handleFieldChange(() => setTeacherName(e.target.value))}
              className={input}
              placeholder="Your name"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={label}>Parent / Guardian</label>
            <input
              value={parentName}
              onChange={(e) => handleFieldChange(() => setParentName(e.target.value))}
              className={input}
              placeholder="Name"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={label}>Student</label>
            <input
              value={studentName}
              onChange={(e) => handleFieldChange(() => setStudentName(e.target.value))}
              className={input}
              placeholder="Name"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={label}>Gender / Pronouns</label>
            <select
              value={gender}
              onChange={(e) => handleFieldChange(() => setGender(e.target.value as GenderKey))}
              className={input}
            >
              <option value="neutral">They / Them</option>
              <option value="female">She / Her</option>
              <option value="male">He / Him</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
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
              <option value="Physical Education">Physical Education</option>
              <option value="Art">Art</option>
              <option value="Music">Music</option>
              <option value="Homeroom / Advisory">Homeroom / Advisory</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={label}>Period</label>
            <select
              value={period}
              onChange={(e) => handleFieldChange(() => setPeriod(e.target.value))}
              className={input}
            >
              <option value="none">N/A</option>
              <option value="1">Period 1</option>
              <option value="2">Period 2</option>
              <option value="3">Period 3</option>
              <option value="4">Period 4</option>
              <option value="5">Period 5</option>
              <option value="6">Period 6</option>
              <option value="7">Period 7</option>
              <option value="8">Period 8</option>
            </select>
          </div>
          <div className="flex flex-col gap-1 col-span-2">
            <label className={label}>Search templates</label>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={input}
              placeholder="Search by keyword or category..."
            />
          </div>
        </div>
        <p className={`mt-1 ${helperText}`}>
          We remember these details on this device so you don’t have to re‑type them.
        </p>
      </div>

      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3 min-h-0">
        {/* Templates & context */}
        <div className={`${card} flex flex-col min-h-0`}>
          <p className={`${sectionTitle} mb-1.5`}>Templates</p>
          <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2">
            {filteredMessages.map((msg, idx) => (
              <button
                key={`${msg.title}-${idx}`}
                type="button"
                onClick={() => handleSelectMessage(msg)}
                className={`${listItem} ${activeMsg?.title === msg.title ? listItemActive : listItemInactive}`}
              >
                <p className="font-semibold text-[11px]">{msg.title}</p>
                <div className="mt-0.5 flex items-center justify-between">
                  <span
                    className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-[0.16em] ${
                      msg.cat === "Behavioral Support"
                        ? "bg-orange-50 text-orange-700 border border-orange-200"
                        : msg.cat === "Instructional Scaffolding"
                        ? "bg-sky-50 text-sky-700 border border-sky-200"
                        : msg.cat === "Parent & Community Outreach"
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : "bg-slate-900/80 text-slate-100 border border-slate-700"
                    }`}
                  >
                    {msg.cat}
                  </span>
                </div>
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setShowBehaviors((v) => !v)}
            className="mt-2 w-full px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/80 text-[10px] font-semibold text-slate-700 dark:text-slate-200 flex items-center justify-between"
          >
            <span>{showBehaviors ? "Hide behavior/context options" : "Add behavior/context (optional)"}</span>
            <span>{showBehaviors ? "−" : "+"}</span>
          </button>

          {showBehaviors && (
            <div className="mt-1.5 space-y-1.5">
              <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto custom-scrollbar">
                {behaviors.map((b, idx) => {
                  const selected = selectedBehaviors.has(idx);
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        toggleBehavior(idx);
                        if (activeMsg) recomputeTexts(activeMsg);
                      }}
                      className={`${chip} ${selected ? "bg-emerald-500/20 border-emerald-500 text-emerald-700 dark:text-emerald-200" : chipInactive}`}
                    >
                      {b.e}
                    </button>
                  );
                })}
              </div>

              <textarea
                value={note}
                onChange={(e) => handleFieldChange(() => setNote(e.target.value))}
                className={`${textarea} min-h-[45px] max-h-[80px] text-[10px]`}
                placeholder="Details you want woven into the message..."
              />
            </div>
          )}
        </div>

        {/* Output */}
        <div className={`${card} flex flex-col min-h-0`}>
          <p className={`${sectionTitle} mb-1.5 flex justify-between`}><span>Message Preview</span></p>
          <div className="flex gap-2 mb-1.5">
            <button type="button" disabled={!englishText} onClick={() => copyToClipboard(englishText)} className={`${chip} ${englishText ? "border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 bg-white/80 dark:bg-slate-900/80" : "border-slate-200 dark:border-slate-800 text-slate-400 dark:text-slate-500"}`}>Copy English</button>
            <button type="button" disabled={!spanishText || spanishText === "N/A"} onClick={() => copyToClipboard(spanishText)} className={`${chip} ${spanishText && spanishText !== "N/A" ? "border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 bg-white/80 dark:bg-slate-900/80" : "border-slate-200 dark:border-slate-800 text-slate-400 dark:text-slate-500"}`}>Copy Spanish</button>
          </div>

          <div className="flex-1 grid grid-cols-1 gap-1.5 min-h-0">
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/80 p-2 overflow-y-auto custom-scrollbar">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400 mb-1">
                English
              </p>
              <pre className="whitespace-pre-wrap text-[10px] text-slate-800 dark:text-slate-100 m-0 font-sans">
                {englishText || "Select a template and fill in the details to generate a message."}
              </pre>
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/80 p-2 overflow-y-auto custom-scrollbar">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400 mb-1">
                Spanish (optional)
              </p>
              <pre className="whitespace-pre-wrap text-[10px] text-slate-800 dark:text-slate-100 m-0 font-sans">
                {spanishText || "Spanish version will appear here for most family messages."}
              </pre>
            </div>
          </div>

          <button
            type="button"
            disabled={!canLog || logState === "logging"}
            onClick={handleLog}
            className={`mt-2 ${btnPrimary} ${!canLog || logState === "logging" ? "bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-500" : "bg-emerald-500 text-white hover:bg-emerald-600"}`}
          >
            {logState === "idle" && "Send to Contact Log"}
            {logState === "logging" && "Logging..."}
            {logState === "done" && "Logged!"}
            {logState === "error" && "Error – Try again"}
          </button>
        </div>
      </div>
    </div>
  );
};

