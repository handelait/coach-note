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

export async function uploadFileToGemini(apiKey: string, file: File): Promise<{ uri: string, name: string, mimeType: string }> {
  const metadata = { file: { displayName: file.name } };
  
  let mimeType = file.type;
  if (mimeType.startsWith('video/')) {
      mimeType = 'audio/mp4';
  }
  
  const initRes = await fetch("https://generativelanguage.googleapis.com/upload/v1beta/files?key=" + apiKey, {
    method: 'POST',
    headers: {
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': file.size.toString(),
      'X-Goog-Upload-Header-Content-Type': mimeType,
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
  return { uri: fileInfo.file.uri, name: fileInfo.file.name, mimeType };
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

let cachedModelNames: string[] = [];

export const getBestModelNames = async (apiKey: string): Promise<string[]> => {
  if (cachedModelNames.length > 0) return cachedModelNames;
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    if (!res.ok) return ["gemini-2.5-flash", "gemini-1.5-flash", "gemini-2.0-flash"];
    const data = await res.json();
    const models = data.models || [];
    const supportedModels = models.filter((m: any) => m.supportedGenerationMethods?.includes('generateContent'));
    let names = supportedModels
      .map((m: any) => m.name.replace('models/', ''))
      .filter((n: string) => !n.includes('tts') && !n.includes('8b'));
    
    // Sort models based on preference
    const preferences = [
      "gemini-2.5-flash",
      "gemini-1.5-flash",
      "gemini-2.0-flash", 
      "gemini-2.5-pro",
      "gemini-1.5-pro", 
      "gemini-1.0-pro"
    ];
    
    let sorted: string[] = [];
    for (const pref of preferences) {
      const matches = names.filter((name: string) => name.startsWith(pref));
      sorted.push(...matches);
      names = names.filter((name: string) => !name.startsWith(pref)); // remove added
    }
    sorted.push(...names); // append any remaining models

    cachedModelNames = sorted.length > 0 ? sorted : ["gemini-2.5-flash", "gemini-1.5-flash"];
    return cachedModelNames;
  } catch {
    return ["gemini-2.5-flash", "gemini-1.5-flash", "gemini-2.0-flash"];
  }
};

export const generateTranscript = async (
  apiKey: string,
  fileUri: string,
  fileMimeType: string
): Promise<string> => {
  const genAI = new GoogleGenerativeAI(apiKey);
  const maxRetries = 5;
  let lastError: any;

  const parts = [
    {
      fileData: {
        fileUri: fileUri,
        mimeType: fileMimeType,
      }
    },
    { text: "Bạn là một trợ lý ảo chuyên nghiệp. Nhiệm vụ duy nhất của bạn là cung cấp bản bóc băng (transcript) nguyên văn, chính xác từng từ một của file âm thanh/video đính kèm này bằng Tiếng Việt. Quan trọng: Hãy phân chia rõ ràng người nói dưới dạng 'Người nói A: ...' và 'Người nói B: ...'. Không tóm tắt, không giải thích, không bỏ sót thông tin. Chỉ xuất ra toàn bộ nội dung lời nói của cuộc hội thoại." }
  ];

  const availableModels = await getBestModelNames(apiKey);
  const errorLogs: string[] = [];

  for (const modelName of availableModels) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContentStream({
          contents: [{ role: "user", parts }],
        });
        
        let transcriptText = "";
        for await (const chunk of result.stream) {
          transcriptText += chunk.text();
        }
        
        if (!transcriptText || !transcriptText.trim()) {
          throw new Error("Gemini không nghe được âm thanh nào hoặc file audio bị hỏng/trống.");
        }

        // Check if Gemini explicitly refused
        const lowerText = transcriptText.toLowerCase();
        if (lowerText.includes("tôi không thể") && lowerText.includes("cung cấp")) {
           console.warn("Possible Gemini refusal:", transcriptText);
        }

        return transcriptText;
      } catch (error: any) {
        const fullMsg = error.message || "Lỗi không xác định";
        // Extract the HTTP status and actual message from GoogleGenerativeAI Error
        // Example: "[GoogleGenerativeAI Error]: Error fetching from https://...: [429 ] You exceeded..."
        let shortMsg = fullMsg;
        const statusMatch = fullMsg.match(/\[(\d{3})\s*\](.*)/);
        if (statusMatch) {
            shortMsg = `[${statusMatch[1]}] ${statusMatch[2].substring(0, 100)}`;
        } else {
            shortMsg = fullMsg.length > 100 ? fullMsg.substring(0, 100) + "..." : fullMsg;
        }

        errorLogs.push(`[${modelName}]: ${shortMsg}`);
        console.warn(`Model ${modelName} (Attempt ${attempt}) failed for transcription:`, error.message);
        lastError = error;
        
        // If it's a 429 (Quota), 404 (Not Found), or 400 (Bad Request/Token Limit), DO NOT retry this model, break the attempt loop and move to NEXT model
        if (fullMsg.includes('429') || fullMsg.includes('404') || fullMsg.includes('400')) {
           break; 
        }

        if (fullMsg.includes('503')) {
          if (attempt < 2) {
            await new Promise(r => setTimeout(r, 5000));
            continue;
          }
          break; // Move to next model after 2 failed 503 attempts
        }
        
        // Unhandled error
        break; // break loop and try next model
      }
    }
  }
  throw new Error(`Google AI từ chối toàn bộ model. Chi tiết lỗi: ${errorLogs.join(" | ")}. Vui lòng kiểm tra lại Quota của API Key trên AI Studio.`);
};


export const generateRecap = async (
  apiKey: string,
  type: "client" | "coach",
  transcript: string,
  fileUri?: string,
  fileMimeType?: string
): Promise<RecapResult> => {
  const genAI = new GoogleGenerativeAI(apiKey);
  const maxRetries = 3;
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

  const availableModels = await getBestModelNames(apiKey);
  const errorLogs: string[] = [];

  for (const modelName of availableModels) {
    for (let attempt = 1; attempt <= 2; attempt++) {
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
                      id: { type: SchemaType.NUMBER, description: "ID của trích dẫn (1, 2, 3...)" },
                      context: { type: SchemaType.STRING, description: "Đoạn trích dẫn dài, chi tiết lấy chính xác 100% từ transcript. Yêu cầu bốc đoạn hội thoại DÀI gấp 3-4 lần bình thường, có thể gộp nhiều câu nói ở các đoạn khác nhau nhưng liên quan mật thiết để người đọc hiểu rõ toàn bộ bối cảnh xung quanh ý đó. Bắt buộc phải là câu nói thật trong file." }
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
        const fullMsg = error.message || "Lỗi không xác định";
        let shortMsg = fullMsg;
        const statusMatch = fullMsg.match(/\[(\d{3})\s*\](.*)/);
        if (statusMatch) {
            shortMsg = `[${statusMatch[1]}] ${statusMatch[2].substring(0, 100)}`;
        } else {
            shortMsg = fullMsg.length > 100 ? fullMsg.substring(0, 100) + "..." : fullMsg;
        }

        errorLogs.push(`[${modelName}]: ${shortMsg}`);
        console.warn(`Model ${modelName} (Attempt ${attempt}) failed for recap:`, error.message);
        lastError = error;
        
        const isSyntaxError = error instanceof SyntaxError || fullMsg.includes("Unexpected token");
        
        if (fullMsg.includes('429') || fullMsg.includes('404') || fullMsg.includes('400')) {
           break; 
        }

        if (fullMsg.includes('503') || isSyntaxError) {
          if (attempt < 2) {
            await new Promise(r => setTimeout(r, 5000));
            continue;
          }
          break;
        }
        
        break;
      }
    }
  }

  throw new Error(`Google AI từ chối tạo Recap. Chi tiết lỗi: ${errorLogs.join(" | ")}`);
};
