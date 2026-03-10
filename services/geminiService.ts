import { GoogleGenAI, Type } from "@google/genai";
import { GradingResponse, type GeometricData } from "../types";

const getApiKey = () =>
  (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_GEMINI_API_KEY) ||
  (typeof process !== "undefined" && (process as any).env?.API_KEY) ||
  "";

export type FrameAssessmentResult = {
  scanHealth: number;
  alignment: "IN_FRAME" | "OVERLAP_DETECTED" | "OUT_OF_BOUNDS";
  corners?: GeometricData;
  triggerSignal?: string;
  transcription?: string;
};

// Lightweight viewfinder assessment (no grading): scanHealth + corners + OCR text.
export const assessFrame = async (base64Image: string): Promise<FrameAssessmentResult | null> => {
  try {
    const apiKey = getApiKey();
    if (!apiKey) return null;
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: {
        parts: [
          { inlineData: { mimeType: "image/jpeg", data: base64Image } },
          {
            text: `You are an ultra-fast Document Viewfinder Sensor for teachers.

Return ONLY JSON.

## Goal
Assess whether a document is in-frame and readable enough to capture.

## Output rules
- scanHealth: 0-100 (penalize blur, glare, cutoff edges, low light).
- alignment: IN_FRAME / OVERLAP_DETECTED / OUT_OF_BOUNDS
- corners: 4 corners [x,y] (0-1000 scale) when visible
- transcription: OCR any visible handwriting/text (best-effort)
- triggerSignal: set to "SNAP" if scanHealth >= 90 and alignment is IN_FRAME`,
          },
        ],
      },
      config: {
        thinkingConfig: { thinkingBudget: 0 },
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            scanHealth: { type: Type.NUMBER },
            alignment: { type: Type.STRING, enum: ["IN_FRAME", "OVERLAP_DETECTED", "OUT_OF_BOUNDS"] },
            corners: {
              type: Type.OBJECT,
              properties: {
                topLeft: { type: Type.ARRAY, items: { type: Type.NUMBER } },
                topRight: { type: Type.ARRAY, items: { type: Type.NUMBER } },
                bottomLeft: { type: Type.ARRAY, items: { type: Type.NUMBER } },
                bottomRight: { type: Type.ARRAY, items: { type: Type.NUMBER } }
              }
            },
            transcription: { type: Type.STRING },
            triggerSignal: { type: Type.STRING },
          },
          required: ["scanHealth", "alignment"],
        },
      },
    });
    const text = response.text || "{}";
    try {
      return JSON.parse(text) as FrameAssessmentResult;
    } catch {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;
      return JSON.parse(jsonMatch[0]) as FrameAssessmentResult;
    }
  } catch (e) {
    console.error("Frame assessment error", e);
    return null;
  }
};

export type ParsedTeacherScheduleBlock = {
  title: string;
  day: 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';
  startTime: string; // HH:MM 24h
  endTime: string; // HH:MM 24h
  location?: string;
  kind?: 'class' | 'prep' | 'lunch' | 'meeting' | 'pd' | 'other';
};

export const parseTeacherScheduleFromImage = async (
  base64Image: string
): Promise<ParsedTeacherScheduleBlock[] | null> => {
  try {
    const apiKey = getApiKey();
    if (!apiKey) return null;
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: base64Image,
            },
          },
          {
            text: `You are an expert school scheduler.

Teachers will scan a printed daily or weekly teaching schedule that lists periods, classes, prep, lunch, PD, and meetings.

Return ONLY JSON.

Goal: Convert the visual schedule into structured blocks for a mobile planning app.

Rules:
- Assume the school week is Monday–Friday unless the page clearly includes weekends.
- Map each block to a weekday abbreviation: Mon, Tue, Wed, Thu, Fri, Sat, Sun.
- Times MUST be normalized to 24‑hour HH:MM.
- title should be a short label like "Period 1 – ELA 7", "Prep", "Lunch", "PLC Meeting", "PD", etc.
- kind should be one of: "class", "prep", "lunch", "meeting", "pd", "other".
- location is optional (e.g., "Room 204", "Library").

Output schema:
[
  {
    "title": "Period 1 – Algebra",
    "day": "Mon",
    "startTime": "08:00",
    "endTime": "08:50",
    "location": "Room 204",
    "kind": "class"
  }
]

If you cannot confidently see any schedule, return an empty JSON array [].
`,
          },
        ],
      },
      config: {
        thinkingConfig: { thinkingBudget: 0 },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              day: {
                type: Type.STRING,
                enum: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
              },
              startTime: { type: Type.STRING },
              endTime: { type: Type.STRING },
              location: { type: Type.STRING },
              kind: {
                type: Type.STRING,
                enum: ['class', 'prep', 'lunch', 'meeting', 'pd', 'other'],
              },
            },
            required: ['title', 'day', 'startTime', 'endTime'],
          },
        },
      },
    });
    const text = response.text || '[]';
    try {
      return JSON.parse(text) as ParsedTeacherScheduleBlock[];
    } catch {
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) return null;
      return JSON.parse(jsonMatch[0]) as ParsedTeacherScheduleBlock[];
    }
  } catch (e) {
    console.error('Teacher schedule parse error', e);
    return null;
  }
};

// Service to extract rubric text from an image using Gemini
export const extractRubricFromImage = async (base64Image: string): Promise<string | null> => {
  try {
    const apiKey = getApiKey();
    if (!apiKey) return null;
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: base64Image,
            },
          },
          {
            text: `You are an expert educational administrator. Extract all the grading criteria, point distributions, and expectations from this rubric image as clear text. Organize it logically. If there is no readable text or it is clearly not a rubric, reply with exactly "NO RUBRIC".`
          }
        ]
      }
    });
    return response.text || null;
  } catch (e) {
    console.error("Rubric extraction error", e);
    return null;
  }
};

// Service to generate a rubric from a title and description
export const generateRubric = async (assignmentTitle: string, assignmentDescription: string, maxScore: number): Promise<string | null> => {
  try {
    const apiKey = getApiKey();
    if (!apiKey) return null;
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Generate a professional and detailed grading rubric for: ${assignmentTitle}. 
      Context: ${assignmentDescription}. 
      Total points: ${maxScore}. 
      Return only the formatted rubric text.`
    });
    return response.text || null;
  } catch (e) {
    console.error("Rubric generation error", e);
    return null;
  }
};

// Service to analyze a student's work against a rubric
export const analyzePaper = async (
  base64Image: string,
  rubric: string,
  maxScore: number,
  studentList: string[],
  _isAutoDetect: boolean = false
): Promise<GradingResponse | null> => {
  try {
    const apiKey = getApiKey();
    if (!apiKey) return null;
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: base64Image,
            },
          },
          {
            text: `You are an ultra-fast Document Intelligence Sensor for teachers.

## MISSION
Real-time document detection, OCR, and pedagogical assessment.

## Phase 1: Viewfinder Assessment
Active Zone: 10-90% frame. 
- Assessment: 'scanHealth' (0-100). Subtract points heavily for blurriness, cutoff edges, or poor lighting.
- Alignment: 'alignment' (IN_FRAME / OVERLAP_DETECTED / OUT_OF_BOUNDS).

## Phase 2: High-Speed Capture
- TRIGGER: If 'scanHealth' > 92%, set 'triggerSignal' to "SNAP".
- Coordinates: Provide 'corners' coordinates [x,y] for 4 corners (Scale 0-1000).

## Phase 3: Personalized Pedagogical Analysis (Only if health > 92%)
- Match student from: ${studentList.join(', ')}.
- OCR: Extract handwriting carefully.
- SCORE: Evaluate against Rubric: ${rubric} (Max: ${maxScore}).
- CRITICAL GRADING ADJUSTMENTS:
  1. Name Check: You MUST check if the student wrote their name. Deduct points if missing, award/maintain if present.
  2. Effort & Clarity: Adjust the score positively for visible effort and logically clear answers.
  3. Handwriting: Adjust the score based on the neatness and legibility of the handwriting.
- FEEDBACK RULES (MANDATORY): 
  1. DO NOT use any formal greetings or salutations (e.g., NO "Hi", "Hello", "Dear").
  2. You MUST ALWAYS include the student's first name (the first word of their full name, or the only word if applicable) naturally within the feedback text.
  3. Start directly with the evaluation of the work.
  4. Tone MUST be realistic, professional, and highly encouraging.
  5. Content: Use the second person ("you", "your") throughout. Be specific about strengths and provide one clear, constructive path for improvement.
  6. Explicitly mention the student's handwriting, effort, or name inclusion in the feedback to explain their score.
  7. Example: "John, your analysis of the plant cell structure is excellent, and your neat handwriting makes it very easy to read! To improve, try to label the cell wall more clearly next time. Great effort!"

Return ONLY JSON.`
          }
        ]
      },
      config: {
        thinkingConfig: { thinkingBudget: 0 },
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            detected: { type: Type.BOOLEAN },
            scanHealth: { type: Type.NUMBER },
            alignment: { type: Type.STRING, enum: ["IN_FRAME", "OVERLAP_DETECTED", "OUT_OF_BOUNDS"] },
            corners: {
              type: Type.OBJECT,
              properties: {
                topLeft: { type: Type.ARRAY, items: { type: Type.NUMBER } },
                topRight: { type: Type.ARRAY, items: { type: Type.NUMBER } },
                bottomLeft: { type: Type.ARRAY, items: { type: Type.NUMBER } },
                bottomRight: { type: Type.ARRAY, items: { type: Type.NUMBER } }
              }
            },
            triggerSignal: { type: Type.STRING },
            oneWordCommand: { type: Type.STRING },
            studentName: { type: Type.STRING },
            score: { type: Type.NUMBER },
            feedback: { type: Type.STRING },
            transcription: { type: Type.STRING }
          },
          required: ["detected", "scanHealth", "alignment"]
        }
      }
    });

    const text = response.text || '{}';
    try {
      return JSON.parse(text) as GradingResponse;
    } catch {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;
      return JSON.parse(jsonMatch[0]) as GradingResponse;
    }
  } catch (e) {
    console.error("Gemini analysis error", e);
    return null;
  }
};

export const analyzeMultiPagePaper = async (
  base64Images: string[],
  rubric: string,
  maxScore: number,
  studentList: string[]
): Promise<GradingResponse | null> => {
  try {
    const apiKey = getApiKey();
    if (!apiKey) return null;
    const ai = new GoogleGenAI({ apiKey });
    const imageParts = base64Images
      .filter(Boolean)
      .slice(0, 10)
      .map((data) => ({
        inlineData: {
          mimeType: "image/jpeg",
          data,
        },
      }));

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: {
        parts: [
          ...imageParts,
          {
            text: `You are grading ONE student's work that may span multiple pages.

## Instructions
- Consider ALL pages as a single submission.
- Match the student from: ${studentList.join(", ")}.
- OCR handwriting carefully across pages.
- SCORE: Evaluate against Rubric: ${rubric} (Max: ${maxScore}).
- Provide ONE final score and ONE consolidated feedback.

## FEEDBACK RULES (MANDATORY)
1. DO NOT use greetings/salutations.
2. Always include the student's first name naturally.
3. Start directly with the evaluation.
4. Be encouraging and specific; provide one clear improvement path.
5. Mention effort/handwriting/name inclusion to justify the score.

Return ONLY JSON.`,
          },
        ],
      },
      config: {
        thinkingConfig: { thinkingBudget: 0 },
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            detected: { type: Type.BOOLEAN },
            studentName: { type: Type.STRING },
            score: { type: Type.NUMBER },
            feedback: { type: Type.STRING },
            transcription: { type: Type.STRING },
          },
          required: ["detected"],
        },
      },
    });

    const text = response.text || "{}";
    try {
      return JSON.parse(text) as GradingResponse;
    } catch {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;
      return JSON.parse(jsonMatch[0]) as GradingResponse;
    }
  } catch (e) {
    console.error("Gemini multi-page analysis error", e);
    return null;
  }
};

export interface LessonScriptResult {
  outline: string;
  vocabulary: string[];
  discussionQuestions: string[];
}

export const generateLessonScript = async (topic: string): Promise<LessonScriptResult | null> => {
  try {
    const apiKey = getApiKey();
    if (!apiKey) {
      throw new Error("Missing Gemini API key");
    }
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `You are an expert K-12 curriculum designer. For this topic: "${topic}", provide a 30-minute lesson plan.

Return ONLY valid JSON with exactly these keys (no markdown, no extra text):
- "outline": string with a step-by-step 30-minute lesson outline (numbered steps, brief).
- "vocabulary": array of 5-10 key vocabulary words or phrases students should learn.
- "discussionQuestions": array of exactly 3 discussion questions for the class.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            outline: { type: Type.STRING },
            vocabulary: { type: Type.ARRAY, items: { type: Type.STRING } },
            discussionQuestions: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
          required: ["outline", "vocabulary", "discussionQuestions"],
        },
      },
    });
    const text = response.text || "{}";
    try {
      return JSON.parse(text) as LessonScriptResult;
    } catch {
      // Fallback for fenced or extra-text responses
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;
      return JSON.parse(jsonMatch[0]) as LessonScriptResult;
    }
  } catch (e) {
    console.error("Lesson script error", e);
    return null;
  }
};

export const generateDifferentiatedLesson = async (
  lessonText: string,
  level: "simplified" | "advanced"
): Promise<string | null> => {
  const directive =
    level === "simplified"
      ? "Rewrite this lesson for students with learning gaps: shorter sentences, simpler vocabulary, more scaffolding, and one extra practice step. Keep the same learning goal."
      : "Rewrite this lesson for advanced/gifted students: add depth, extension questions, and one enrichment task. Keep the same learning goal.";
  try {
    const apiKey = getApiKey();
    if (!apiKey) return null;
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `${directive}\n\nLesson:\n${lessonText}`,
    });
    return response.text || null;
  } catch (e) {
    console.error("Differentiation error", e);
    return null;
  }
};

export const translateText = async (
  text: string,
  targetLanguage: "es" | "en"
): Promise<string | null> => {
  try {
    const apiKey = getApiKey();
    if (!apiKey) return null;
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Translate this text to ${targetLanguage === "es" ? "Spanish" : "English"}.
Return ONLY the translated text (no quotes, no markdown).

Text:
${text}`,
      config: { thinkingConfig: { thinkingBudget: 0 } },
    });
    return (response.text || "").trim() || null;
  } catch (e) {
    console.error("Translation error", e);
    return null;
  }
};