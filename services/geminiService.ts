import { GoogleGenAI, Type } from "@google/genai";
import { GradingResponse } from "../types";

const getApiKey = () =>
  (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_GEMINI_API_KEY) ||
  (typeof process !== "undefined" && (process as any).env?.API_KEY) ||
  "";

// Service to extract rubric text from an image using Gemini
export const extractRubricFromImage = async (base64Image: string): Promise<string | null> => {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  try {
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
  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  try {
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
  isAutoDetect: boolean = false
): Promise<GradingResponse | null> => {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  try {
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
    return JSON.parse(text) as GradingResponse;
  } catch (e) {
    console.error("Gemini analysis error", e);
    return null;
  }
};