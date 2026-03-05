export type FirebaseSession = {
  idToken: string;
  refreshToken: string;
  localId: string;
  email?: string;
  displayName?: string;
  expiresAtMs: number;
};

const FIREBASE_SESSION_KEY = "dg_firebase_session_v1";

const getEnv = (key: string): string =>
  (typeof import.meta !== "undefined" && (import.meta as any).env?.[key]) || "";

export const getFirebaseConfig = () => {
  const apiKey = getEnv("VITE_FIREBASE_API_KEY");
  const projectId = getEnv("VITE_FIREBASE_PROJECT_ID");
  return { apiKey, projectId };
};

export const loadFirebaseSession = (): FirebaseSession | null => {
  try {
    const raw = localStorage.getItem(FIREBASE_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FirebaseSession;
    if (!parsed?.idToken || !parsed?.expiresAtMs) return null;
    return parsed;
  } catch {
    return null;
  }
};

export const saveFirebaseSession = (s: FirebaseSession | null) => {
  try {
    if (!s) localStorage.removeItem(FIREBASE_SESSION_KEY);
    else localStorage.setItem(FIREBASE_SESSION_KEY, JSON.stringify(s));
  } catch {
    // ignore
  }
};

export async function firebaseSignInWithGoogleAccessToken(googleAccessToken: string): Promise<FirebaseSession> {
  const { apiKey } = getFirebaseConfig();
  if (!apiKey) throw new Error("Missing Firebase config (VITE_FIREBASE_API_KEY).");
  if (!googleAccessToken) throw new Error("Missing Google access token.");

  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${encodeURIComponent(apiKey)}`;
  const body = {
    postBody: `access_token=${encodeURIComponent(googleAccessToken)}&providerId=google.com`,
    requestUri: typeof window !== "undefined" ? window.location.origin : "http://localhost",
    returnIdpCredential: true,
    returnSecureToken: true,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.error?.message || "Firebase sign-in failed.";
    throw new Error(msg);
  }

  const expiresInSec = Number(json.expiresIn || 0);
  const expiresAtMs = Date.now() + Math.max(0, expiresInSec - 30) * 1000;
  const session: FirebaseSession = {
    idToken: json.idToken,
    refreshToken: json.refreshToken,
    localId: json.localId,
    email: json.email,
    displayName: json.displayName,
    expiresAtMs,
  };
  saveFirebaseSession(session);
  return session;
}

type FirestoreValue =
  | { stringValue: string }
  | { integerValue: string }
  | { doubleValue: number }
  | { booleanValue: boolean }
  | { timestampValue: string }
  | { mapValue: { fields: Record<string, FirestoreValue> } }
  | { arrayValue: { values: FirestoreValue[] } };

const toValue = (v: any): FirestoreValue => {
  if (v === null || v === undefined) return { stringValue: "" };
  if (typeof v === "string") return { stringValue: v };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  if (typeof v === "object") {
    const fields: Record<string, FirestoreValue> = {};
    Object.keys(v).forEach((k) => {
      fields[k] = toValue(v[k]);
    });
    return { mapValue: { fields } };
  }
  return { stringValue: String(v) };
};

const fromValue = (v: any): any => {
  if (!v || typeof v !== "object") return undefined;
  if (v.stringValue !== undefined) return v.stringValue;
  if (v.integerValue !== undefined) return Number(v.integerValue);
  if (v.doubleValue !== undefined) return v.doubleValue;
  if (v.booleanValue !== undefined) return v.booleanValue;
  if (v.timestampValue !== undefined) return v.timestampValue;
  if (v.arrayValue?.values) return v.arrayValue.values.map(fromValue);
  if (v.mapValue?.fields) {
    const out: any = {};
    Object.keys(v.mapValue.fields).forEach((k) => (out[k] = fromValue(v.mapValue.fields[k])));
    return out;
  }
  return undefined;
};

const docIdFromName = (name: string) => {
  const n = (name || "").trim().toLowerCase();
  const cleaned = n.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "unknown";
  return cleaned;
};

const firestoreBase = () => {
  const { projectId } = getFirebaseConfig();
  if (!projectId) throw new Error("Missing Firebase config (VITE_FIREBASE_PROJECT_ID).");
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents`;
};

const authHeaders = (s: FirebaseSession) => ({
  Authorization: `Bearer ${s.idToken}`,
  "Content-Type": "application/json",
});

export type ThreadDoc = {
  id: string;
  studentName: string;
  courseId?: string;
  updatedAt?: string;
  lastMessageText?: string;
  lastMessageAt?: string;
};

export type MessageDoc = {
  id: string;
  text: string;
  language: string;
  translatedText?: string;
  createdAt?: string;
  senderName?: string;
};

export async function upsertThread(session: FirebaseSession, thread: Omit<ThreadDoc, "id"> & { id?: string }) {
  const id = thread.id || docIdFromName(thread.studentName);
  const url = `${firestoreBase()}/threads/${encodeURIComponent(id)}`;
  const nowIso = new Date().toISOString();
  const fields = {
    studentName: thread.studentName,
    courseId: thread.courseId || "",
    updatedAt: thread.updatedAt || nowIso,
    lastMessageText: thread.lastMessageText || "",
    lastMessageAt: thread.lastMessageAt || "",
  };

  const res = await fetch(url, { method: "PATCH", headers: authHeaders(session), body: JSON.stringify({ fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, toValue(v)])) }) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message || "Thread upsert failed.");
  return id;
}

export async function listThreads(session: FirebaseSession, pageSize: number = 30): Promise<ThreadDoc[]> {
  const url = `${firestoreBase()}/threads?pageSize=${pageSize}&orderBy=updatedAt%20desc`;
  const res = await fetch(url, { headers: authHeaders(session) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message || "List threads failed.");
  const docs = Array.isArray(json.documents) ? json.documents : [];
  return docs.map((d: any) => {
    const name: string = d.name || "";
    const id = name.split("/").pop() || "";
    const fields = d.fields || {};
    const data = fromValue({ mapValue: { fields } }) || {};
    return { id, studentName: data.studentName || "", courseId: data.courseId || "", updatedAt: data.updatedAt, lastMessageText: data.lastMessageText, lastMessageAt: data.lastMessageAt };
  });
}

export async function listMessages(session: FirebaseSession, threadId: string, pageSize: number = 50): Promise<MessageDoc[]> {
  const url = `${firestoreBase()}/threads/${encodeURIComponent(threadId)}/messages?pageSize=${pageSize}&orderBy=createdAt%20desc`;
  const res = await fetch(url, { headers: authHeaders(session) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message || "List messages failed.");
  const docs = Array.isArray(json.documents) ? json.documents : [];
  return docs.map((d: any) => {
    const name: string = d.name || "";
    const id = name.split("/").pop() || "";
    const fields = d.fields || {};
    const data = fromValue({ mapValue: { fields } }) || {};
    return { id, text: data.text || "", language: data.language || "en", translatedText: data.translatedText || "", createdAt: data.createdAt, senderName: data.senderName || "" };
  });
}

export async function sendMessage(
  session: FirebaseSession,
  threadId: string,
  msg: { text: string; language: string; translatedText?: string; senderName?: string; createdAt?: string }
) {
  const url = `${firestoreBase()}/threads/${encodeURIComponent(threadId)}/messages`;
  const createdAt = msg.createdAt || new Date().toISOString();
  const fields = {
    text: msg.text,
    language: msg.language,
    translatedText: msg.translatedText || "",
    senderName: msg.senderName || "",
    createdAt,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: authHeaders(session),
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, toValue(v)])) }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message || "Send message failed.");
  return createdAt;
}

