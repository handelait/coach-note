import { clientPrompt } from "./clientPrompt";
import { coachPrompt } from "./coachPrompt";

export const getPromptTemplate = (type: "client" | "coach", transcript: string) => {
  const basePrompt = type === "client" ? clientPrompt : coachPrompt;
  const today = new Date().toLocaleDateString('vi-VN');
  const transcriptContent = transcript.trim() || "[Bản bóc băng không có sẵn]";
  return basePrompt
    .replace("{{TRANSCRIPT}}", transcriptContent)
    .replace(/\{\{CURRENT_DATE\}\}/g, today);
};
