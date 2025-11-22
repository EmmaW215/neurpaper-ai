import { GoogleGenAI, Type } from "@google/genai";
import { Paper } from '../types';

// Initialize Gemini Client
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generateArxivPapers = async (topic: string, count: number): Promise<Paper[]> => {
  const prompt = `Find ${count} real or realistic arXiv papers about "${topic}". 
  Return a structured JSON list. 
  For each paper, provide:
  - "title": string
  - "authors": array of strings
  - "year": string
  - "summary": A brief summary (approx 50 words)
  - "highlights": array of strings (key bullet points)
  - "link": string (use a real arxiv.org link if found, or generate a plausible one).
  
  IMPORTANT: Return ONLY the valid JSON array. Do not use Markdown formatting. Do not include explanations.
  Use Google Search to ensure the papers are real.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        // Note: responseMimeType and responseSchema are NOT used here because they are incompatible with googleSearch tool in the current API version.
        // We rely on the prompt to get JSON.
      }
    });

    let text = response.text || "[]";
    
    // cleanup markdown if present
    text = text.replace(/```json/g, '').replace(/```/g, '');
    
    // Extract JSON array if there's surrounding text
    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    
    if (start !== -1 && end !== -1) {
      text = text.substring(start, end + 1);
      return JSON.parse(text) as Paper[];
    }
    
    // Attempt parse if brackets weren't found but it might be bare
    return JSON.parse(text) as Paper[];

  } catch (error) {
    console.error("Error fetching papers:", error);
    // Return empty array rather than throw to allow app to handle gracefully
    return [];
  }
};

export const chatWithKnowledgeBase = async (
  history: { role: string; parts: { text: string }[] }[],
  message: string,
  context: string
) => {
  try {
    // We simulate RAG by injecting the context into the system instruction or the first message
    const systemInstruction = `You are a helpful research assistant. 
    You have access to a database of papers (Context provided below).
    Always prioritize the provided context for your answers.
    If the answer involves complex reasoning, break it down step-by-step.
    If the context is insufficient, use your internal knowledge or Google Search to supplement, but explicitly state you are doing so.
    
    CONTEXT DATABASE:
    ${context}
    `;

    const chat = ai.chats.create({
      model: "gemini-3-pro-preview", // Using Pro for complex reasoning
      config: {
        systemInstruction: systemInstruction,
        tools: [{ googleSearch: {} }],
        thinkingConfig: { thinkingBudget: 1024 }, // Force some thinking for complex queries
      },
      history: history.map(h => ({
        role: h.role,
        parts: h.parts
      })),
    });

    const result = await chat.sendMessageStream({ message });
    return result;

  } catch (error) {
    console.error("Chat error:", error);
    throw error;
  }
};

// Audio Utils for Live API
export const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64data = reader.result as string;
      resolve(base64data.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

// Custom encoder/decoder as per guidelines
export function encodeAudio(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function decodeAudio(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

export const getLiveClient = () => {
  return ai.live;
};