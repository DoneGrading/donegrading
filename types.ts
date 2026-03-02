
export enum AppPhase {
  AUTHENTICATION,
  DASHBOARD,
  ASSIGNMENT_SELECT,
  RUBRIC_SETUP,
  MODE_SELECTION,
  GRADING_LOOP,
  AUDIT,
  SYNCING,
  FINALE,
  RECORDS,
  ROSTER_VIEW,
  ASSIGNMENT_CREATION,
  PAYWALL
}

export enum GradingMode {
  SINGLE_PAGE = 'SINGLE_PAGE',
  MULTI_PAGE = 'MULTI_PAGE'
}

export interface Student {
  id: string;
  name: string;
  email?: string;
  lastUsed?: number;
}

export interface Course {
  id: string;
  name: string;
  period: string;
  // Where this course comes from: 'google' = Google Classroom, 'local' = app-only
  source?: 'google' | 'local';
  lastUsed?: number;
}

export interface Assignment {
  id: string;
  title: string;
  maxScore: number;
  rubric: string;
  lastUsed?: number;
}

export interface BoundingBox {
  ymin: number;
  xmin: number;
  ymax: number;
  xmax: number;
}

// Added GeometricData interface to fix import error in App.tsx
export interface GeometricData {
  topLeft: number[];
  topRight: number[];
  bottomLeft: number[];
  bottomRight: number[];
}

export interface GradedWork {
  studentId: string;
  studentName: string;
  studentEmail?: string;
  score: number;
  maxScore: number;
  feedback: string;
  imageUrls: string[];
  status: 'draft' | 'synced';
  timestamp: number;
  courseName: string;
  assignmentName: string;
  courseId: string;
  assignmentId: string;
  // Added fields to support real-time scanning feedback and audit details
  scanHealth?: number;
  transcription?: string;
  geometry?: GeometricData;
}

export type SubscriptionStatus = 'none' | 'trialing' | 'active' | 'past_due' | 'canceled';

export interface GradingResponse {
  detected: boolean;
  studentName: string;
  score: number;
  feedback: string;
  boundingBox?: BoundingBox;
  confidence: number;
  // Added fields to match the document intelligence schema used in geminiService.ts
  scanHealth?: number;
  alignment?: string;
  corners?: GeometricData;
  triggerSignal?: string;
  oneWordCommand?: string;
  transcription?: string;
}
