import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { getPromptTemplate } from "../prompts";

export type RecapResult = {
  title: string;
  paragraphs: {
    text: string;
    isInsight: boolean;
  }[];
  citations: {
    id: number;
    context: string;
  }[];
};

export async function uploadFileToGemini(apiKey: string, file: File): Promise<{ uri: string, name: string }> {
  const metadata = { file: { displayName: file.name } };
  
  const initRes = await fetch("https://generativelanguage.googleapis.com/upload/v1beta/files?key=" + apiKey, {
    method: 'POST',
    headers: {
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': file.size.toString(),
      'X-Goog-Upload-Header-Content-Type': file.type,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(metadata)
  });

  if (!initRes.ok) throw new Error("Failed to initialize upload: " + await initRes.text());

  const uploadUrl = initRes.headers.get('x-goog-upload-url');
  if (!uploadUrl) throw new Error("No upload URL received");

  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'X-Goog-Upload-Command': 'upload, finalize',
      'X-Goog-Upload-Offset': '0',
    },
    body: file
  });

  if (!uploadRes.ok) throw new Error("Upload failed: " + await uploadRes.text());

  const fileInfo = await uploadRes.json();
  return { uri: fileInfo.file.uri, name: fileInfo.file.name };
}

export async function waitForFileProcessing(apiKey: string, fileName: string) {
  while (true) {
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/" + fileName + "?key=" + apiKey);
    const data = await res.json();
    if (data.state === 'ACTIVE') return data;
    if (data.state === 'FAILED') throw new Error("Gemini failed to process the media file");
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
}

export const generateRecap = async (
  apiKey: string,
  type: "client" | "coach",
  transcript: string,
  fileUri?: string,
  fileMimeType?: string
): Promise<RecapResult> => {
  const genAI = new GoogleGenerativeAI(apiKey);
  const modelsToTry = ["gemini-2.5-flash", "gemini-1.5-flash"];
  let lastError: any;

  const prompt = getPromptTemplate(type, transcript);
  const parts: any[] = [{ text: prompt }];

  if (fileUri && fileMimeType) {
    parts.unshift({
      fileData: {
        fileUri: fileUri,
        mimeType: fileMimeType,
      }
    });
  }

  for (const modelName of modelsToTry) {
    try {
      const model = genAI.getGenerativeModel({ 
        model: modelName,
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: SchemaType.OBJECT,
            properties: {
              title: { type: SchemaType.STRING, description: "Tiêu đề của Recap" },
              paragraphs: {
                type: SchemaType.ARRAY,
                items: {
                  type: SchemaType.OBJECT,
                  properties: {
                    text: { type: SchemaType.STRING },
                    isInsight: { type: SchemaType.BOOLEAN }
                  },
                  required: ["text", "isInsight"]
                }
              },
              citations: {
                type: SchemaType.ARRAY,
                items: {
                  type: SchemaType.OBJECT,
                  properties: {
                    id: { type: SchemaType.NUMBER },
                    context: { type: SchemaType.STRING }
                  },
                  required: ["id", "context"]
                }
              }
            },
            required: ["title", "paragraphs", "citations"]
          }
        }
      });

      const result = await model.generateContent({
        contents: [{ role: "user", parts }],
      });
      const responseText = result.response.text();
      
      const jsonString = responseText.replace(/```json/g, "").replace(/```/g, "").trim();
      const parsedData: RecapResult = JSON.parse(jsonString);
      
      return parsedData;
    } catch (error: any) {
      console.warn(`Model ${modelName} failed:`, error.message);
      lastError = error;
      
      // If the error is NOT a 503 (High Demand) or 429 (Quota), throw immediately
      if (!error.message || (!error.message.includes('503') && !error.message.includes('429'))) {
        throw new Error(error.message || "Failed to generate recap. Please check your API key and try again.");
      }
      // Otherwise, continue to the next model
    }
  }

  throw new Error(lastError?.message || "All models failed due to high demand or quota limits.");
};
