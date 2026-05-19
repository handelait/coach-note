import { clientPrompt } from "./clientPrompt";
import { coachPrompt } from "./coachPrompt";

export const getPromptTemplate = (type: "client" | "coach", transcript: string) => {
  const basePrompt = type === "client" ? clientPrompt : coachPrompt;
  const today = new Date().toLocaleDateString('vi-VN');
  const transcriptContent = transcript.trim() || "[Nội dung hội thoại đã được cung cấp qua file Audio/Video đính kèm]";
  return basePrompt
    .replace("{{TRANSCRIPT}}", transcriptContent)
    .replace(/\{\{CURRENT_DATE\}\}/g, today);
};
