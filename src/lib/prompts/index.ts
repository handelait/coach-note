import { clientPrompt } from "./clientPrompt";
import { coachPrompt } from "./coachPrompt";

export const getPromptTemplate = (type: "client" | "coach", transcript: string) => {
  const basePrompt = type === "client" ? clientPrompt : coachPrompt;
  const today = new Date().toLocaleDateString('vi-VN');
  const transcriptContent = transcript.trim() || `
[CHÚ Ý QUAN TRỌNG: KHÔNG CÓ TRANSCRIPT DẠNG VĂN BẢN]
Vui lòng BẮT BUỘC nghe toàn bộ nội dung của FILE AUDIO/VIDEO đính kèm trong tin nhắn này.
FILE ÂM THANH ĐÍNH KÈM CHÍNH LÀ "TRANSCRIPT GỐC". 
Tất cả các trích dẫn nguyên văn bắt buộc phải được chuyển ngữ trực tiếp từ lời nói trong file âm thanh này thành văn bản thật chính xác.`;
  return basePrompt
    .replace("{{TRANSCRIPT}}", transcriptContent)
    .replace(/\{\{CURRENT_DATE\}\}/g, today);
};
