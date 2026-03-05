# DoneGrading Architecture

This document describes the app structure and the four main workflow areas. Use this to continue from the latest architecture changes.

## App Boot

- **Dev:** `npm run dev` → http://localhost:5173
- **Build:** `npm run build`
- **Stack:** Vite + React 19 + TypeScript, Google Classroom API, Gemini AI

---

## Navigation (Bottom Bar)

| Nav Label | Phase | Internal Name | Purpose |
|-----------|-------|---------------|---------|
| Home | `AUTHENTICATION` | — | Sign in, demo mode |
| Plan | `PLAN` | Lesson Architect | Plan & Prep, lesson blocks, differentiation, resources |
| Grade | `DASHBOARD` | — | Course/assignment selection, grading queue |
| Class | `CLASSROOM` | Command Center / Control Center | Timer, randomizer, noise meter, behavior logger |
| Communicate | `RECORDS` | — | Parent/guardian messaging, contact logging |

---

## 1. Plan & Prep (Lesson Architect / Differentiate / Slides & Resources)

**Entry:** Bottom nav → Plan

**Tabs:**
- **Context** – Grade, subject, duration, standards, class profile, safety check
- **Blocks** – A (Hook), B (Direct Instruction), C (Guided Practice), D (Independent)
- **Resources** – Curate media, Leveler (differentiation), Vocabulary Bank, My Links (Drive/Docs/Slides)
- **Assessment** – Exit Ticket Lab, Success Criteria, Reflection

**AI Services:**
- `generateLessonScript(topic)` → outline, vocabulary, discussion questions
- `generateDifferentiatedLesson(text, 'simplified' | 'advanced')` → leveled version

**State keys:** `dg_plan_state_v1`, `dg_file_vault_links`

**Continue from here:**
- Wire real standards API instead of placeholder suggestions
- AI-powered resource curation (replace hardcoded cards)
- Slides export / template generation from plan blocks

---

## 2. Command Center (Classroom Tab)

**Entry:** Bottom nav → Class

**Features:**
- **Magic Timer** – Set/Start/Pause/Reset
- **Randomizer** – Pick random student (uses roster from selected course)
- **Noise Meter** – Slider + optional mic
- **Quick Behavior Logger** – +/- per student (participation/behavior)

**Sub-view:** Class Presenter – full-screen timer + randomizer for projection

**Continue from here:**
- Rename nav label "Class" → "Command Center" if desired
- Add groups/teams for randomizer
- Persist behavior scores to Google Sheets / Classroom
- Real mic-based noise level (navigator.mediaDevices)

---

## 3. Grading & Feedback

**Flow:** Dashboard → Course → Assignment → Rubric Setup → Mode (Single/Multi Page) → Grading Loop → Audit → Sync → Finale

**Key phases:**
- `DASHBOARD` – Course/assignment list, grading queue, history
- `RUBRIC_SETUP` – Scan rubric image, quick picks, custom rubric
- `MODE_SELECTION` – Single-page vs multi-page scanning
- `GRADING_LOOP` – Camera capture, AI scoring, Review & Match (student name + score + feedback)
- `AUDIT` – Review before sync
- `SYNCING` – Post to Classroom, email students, save scans to Drive

**AI Services:**
- `extractRubricFromImage`, `generateRubric`, `analyzePaper`, `analyzeMultiPagePaper`

**Continue from here:**
- Batch export feedback to PDF
- Rubric quick picks from saved templates
- Offline queue with retry when back online

---

## 4. Communicate Simplification

**Entry:** Bottom nav → Communicate → `CommunicationDashboard`

**Features:**
- Audience: Parent, Student, Admin, Staff, Other
- Bilingual (English/Spanish) message templates with placeholders
- Behavior checklist (15 items) for parent outreach
- Contact log → Google Sheet (user creates or chooses; Sheets API)
- State persisted: `dg_communicate_state_v1`, `dg_contact_log_sheet_id`

**Template categories:**
- Behavioral Support, Instructional Scaffolding, Parent & Community Outreach, Professional Collaboration

**Continue from here:**
- Simplify form: fewer fields above the fold, progressive disclosure
- One-tap “Send” (SMS/Email) instead of copy-only
- Student selector dropdown from Classroom roster (no manual typing)
- Archive/recent messages list

---

## File Layout

```
tis/
├── App.tsx              # Main app, phases, routing, all render* functions
├── CommunicationDashboard.tsx
├── services/
│   ├── geminiService.ts # AI: lessons, differentiation, rubric, grading
│   └── classroomService.ts
├── types.ts
├── uiStyles.ts
├── analytics.ts
├── index.tsx / main.tsx
└── vite.config.ts
```

---

## Recent Fixes

- **CommunicationDashboard:** Added missing `logState`/`setLogState` and `handleFieldChange` (recomputes message preview on field change).
