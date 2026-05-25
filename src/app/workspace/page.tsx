"use client";

import { useState, useRef, useEffect } from "react";
import { 
  UploadCloud, 
  Search, 
  Copy, 
  Check,
  FileText, 
  Undo, 
  Redo, 
  Bold, 
  Italic, 
  Underline, 
  List, 
  ListOrdered, 
  Link as LinkIcon,
  ChevronDown,
  AlertCircle,
  X
} from "lucide-react";
import { uploadFileToGemini, generateRecap, RecapResult, waitForFileProcessing, generateTranscript } from '@/lib/ai/gemini';
import { marked } from "marked";

export default function WorkspacePage() {
  const [activeTab, setActiveTab] = useState<"client" | "coach">("client");
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [loadingStatus, setLoadingStatus] = useState<string>("");
  const [fullTranscript, setFullTranscript] = useState<string>("");
  const [apiKey, setApiKey] = useState("");
  const [driveLink, setDriveLink] = useState("");
  
  useEffect(() => {
    const savedKey = localStorage.getItem("coachnote_api_key");
    if (savedKey) setApiKey(savedKey);
  }, []);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [result, setResult] = useState<RecapResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeCitationId, setActiveCitationId] = useState<number | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  
  const editorRef = useRef<HTMLDivElement>(null);

  const handleChangeKey = async () => {
    const newKey = prompt("Vui lòng nhập Google AI Studio API key MỚI của bạn:");
    if (!newKey) return;
    
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${newKey}`);
      if (!res.ok) throw new Error();
      
      setApiKey(newKey);
      localStorage.setItem("coachnote_api_key", newKey);
      alert("Đã cập nhật và xác thực API Key thành công!");
    } catch {
      alert("API Key không hợp lệ hoặc đã bị khóa. Vui lòng kiểm tra lại.");
    }
  };

  const handleGenerate = async () => {
    if (!selectedFile && !driveLink.trim()) {
      setError("Vui lòng tải lên File Audio/Video hoặc dán link Google Drive.");
      return;
    }

    let testKey = apiKey;
    if (!testKey) {
      const inputKey = prompt("Vui lòng nhập Google AI Studio API key để bắt đầu:");
      if (!inputKey) {
        setError("Vui lòng cung cấp API Key để sử dụng ứng dụng.");
        return;
      }
      
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${inputKey}`);
        if (!res.ok) throw new Error();
        setApiKey(inputKey);
        localStorage.setItem("coachnote_api_key", inputKey);
        testKey = inputKey;
      } catch {
        setError("API Key không hợp lệ hoặc đã bị khóa. Hãy tạo Key mới trên AI Studio.");
        return;
      }
    }

    setError(null);
    setIsProcessing(true);
    setResult(null);
    setFullTranscript("");
    setProgress(5);
    setActiveCitationId(null);
    setIsCopied(false);

    try {
      
      let fileUri = undefined;
      let fileMimeType = undefined;
      
      // Phase 1: Upload and Process File
      if (driveLink.trim()) {
        const match = driveLink.match(new RegExp("/d/([a-zA-Z0-9_-]+)")) || driveLink.match(new RegExp("id=([a-zA-Z0-9_-]+)"));
        if (!match) throw new Error("Link Google Drive không hợp lệ. Hãy copy đúng link chia sẻ từ Google Drive.");
        const fileId = match[1];

        setLoadingStatus("Đang tải dữ liệu (Vui lòng không tắt trang)...");
        setProgress(15);

        let attempt = 0;
        let jobData;
        let jobId = "";

        while (attempt < 2) {
            attempt++;
            if (attempt === 2) {
                setLoadingStatus("Hệ thống đang khởi động. Đang tự động kết nối lại...");
            }

            const startRes = await fetch('/api/drive-to-gemini', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'start', fileId, apiKey: testKey })
            });
            
            if (!startRes.ok) {
               if (startRes.status === 504 && attempt === 1) {
                   await new Promise(r => setTimeout(r, 3000));
                   continue;
               }
               
               let errText = await startRes.text();
               try {
                  const errJson = JSON.parse(errText);
                  errText = errJson.error || errJson.message || errText;
               } catch {}
               throw new Error(errText || "Lỗi khi kết nối hệ thống bóc tách.");
            }

            const startData = await startRes.json();
            jobId = startData.jobId;
            break;
        }

        if (!jobId) throw new Error("Máy chủ Thợ Phụ không phản hồi. Vui lòng thử lại sau.");
        
        setLoadingStatus("Đang xử lý dữ liệu (Vui lòng đợi 1-3 phút, không tắt trang)...");
        
        while (true) {
            await new Promise(r => setTimeout(r, 5000));
            
            const statusRes = await fetch('/api/drive-to-gemini', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'status', jobId })
            });

            if (!statusRes.ok) continue;

            const jobStatusData = await statusRes.json();
            if (jobStatusData.status === 'error') throw new Error(jobStatusData.error || "Có lỗi xảy ra trong quá trình xử lý");
            
            if (jobStatusData.status === 'completed') {
                fileUri = jobStatusData.data.uri;
                fileMimeType = jobStatusData.data.mimeType;
                
                setLoadingStatus("Đang đồng bộ dữ liệu âm thanh...");
                setProgress(40);
                await waitForFileProcessing(testKey, jobStatusData.data.name);
                break;
            }
        }

      } else if (selectedFile) {
        setLoadingStatus("Đang tải file lên hệ thống (Tùy thuộc tốc độ mạng)...");
        setProgress(15);
        const { uri, name, mimeType } = await uploadFileToGemini(testKey, selectedFile);
        
        setLoadingStatus("Đang đồng bộ dữ liệu âm thanh (Có thể mất 1-3 phút)...");
        setProgress(40);
        await waitForFileProcessing(testKey, name);
        
        fileUri = uri;
        fileMimeType = mimeType;
      }
      
      setLoadingStatus("Đang bóc băng âm thanh...");
      setProgress(50);
      
      let finalTranscript = "";
      try {
        finalTranscript = await generateTranscript(testKey, fileUri, fileMimeType!);
        setFullTranscript(finalTranscript);
      } catch (err: any) {
        throw new Error("Lỗi khi bóc băng: " + err.message);
      }
      
      setLoadingStatus("Đang xuất recap phân tích...");
      setProgress(60);

      const progressInterval = setInterval(() => {
        setProgress((prev) => (prev < 90 ? prev + 5 : prev));
      }, 1000);

      try {
        const recapData = await generateRecap(testKey, activeTab, finalTranscript);
        clearInterval(progressInterval);
        setResult(recapData);
        setProgress(100);
        setLoadingStatus("Hoàn thành!");
      } catch (genError: any) {
        clearInterval(progressInterval);
        throw genError;
      }
    } catch (err: any) {
      setError(err.message || "An error occurred.");
    } finally {
      setIsProcessing(false);
    }
  };

  const renderHTML = (markdown: string) => {
    const processedMarkdown = markdown.replace(
      /\[\[(\d+)\]\]/g, 
      '<button class="citation-btn inline-flex items-center justify-center w-[18px] h-[18px] mx-1 mb-[2px] rounded-full bg-accent text-primary hover:bg-primary hover:text-white transition-colors cursor-pointer align-middle shadow-sm" data-citation-id="$1" contenteditable="false" title="View Source Transcript"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="pointer-events-none"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg></button>'
    );
    return { __html: marked.parse(processedMarkdown, { breaks: true }) };
  };

  const handleEditorClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const citationBtn = target.closest('.citation-btn');
    
    if (citationBtn) {
      e.preventDefault();
      const idStr = citationBtn.getAttribute('data-citation-id');
      if (idStr) {
        const id = Number(idStr);
        setActiveCitationId(activeCitationId === id ? null : id);
      }
    } else {
      setActiveCitationId(null);
    }
  };

  const handleCopy = async () => {
    if (!editorRef.current) return;
    
    try {
      const clone = editorRef.current.cloneNode(true) as HTMLDivElement;
      
      const buttons = clone.querySelectorAll('.citation-btn');
      buttons.forEach(btn => btn.remove());
      
      const htmlContent = clone.innerHTML;
      const textContent = clone.innerText;
      
      const clipboardItem = new ClipboardItem({
        "text/html": new Blob([htmlContent], { type: "text/html" }),
        "text/plain": new Blob([textContent], { type: "text/plain" }),
      });
      
      await navigator.clipboard.write([clipboardItem]);
      
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy rich text:", err);
      if (editorRef.current) {
        navigator.clipboard.writeText(editorRef.current.innerText);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
      }
    }
  };

  const [isExporting, setIsExporting] = useState(false);

  const handleExportDocx = async () => {
    if (!editorRef.current || !result) return;
    
    setIsExporting(true);
    try {
      const clone = editorRef.current.cloneNode(true) as HTMLDivElement;
      
      const buttons = clone.querySelectorAll('.citation-btn');
      buttons.forEach(btn => btn.remove());
      
      const h1Node = clone.querySelector('h1');
      if (h1Node) h1Node.remove();

      const htmlContent = clone.innerHTML;

      const response = await fetch('/api/export-docx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html: htmlContent, title: result.title }),
      });

      if (!response.ok) throw new Error("Export failed");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.title + ".docx";
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

    } catch (err) {
      console.error("Export error:", err);
      alert("Lỗi khi xuất file .docx. Vui lòng thử lại.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportTranscript = async () => {
    if (!fullTranscript) return;
    setIsExporting(true);
    try {
      const htmlContent = fullTranscript
        .split('\\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .map(line => `<p>${line}</p>`)
        .join('');

      const response = await fetch('/api/export-docx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html: htmlContent, title: "Transcript Bóc Băng" }),
      });

      if (!response.ok) throw new Error("Export failed");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = "CoachNote_Transcript.docx";
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error("Export transcript error:", err);
      alert("Lỗi khi xuất file transcript .docx. Vui lòng thử lại.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="flex h-screen bg-surface overflow-hidden">
      <aside className="w-[340px] bg-white border-r border-gray-200 flex flex-col h-full z-10 shadow-sm relative shrink-0">
        <div className="p-6 pb-2 border-b border-gray-100 flex justify-between items-center">
          <h1 className="text-xl font-bold text-primary flex items-center gap-2">
            CoachNote
          </h1>
          <button onClick={handleChangeKey} className="text-[10px] font-semibold text-gray-400 hover:text-primary transition-colors uppercase tracking-wider">
            Đổi API Key
          </button>
        </div>

        <div className="p-6 flex-1 overflow-y-auto flex flex-col gap-6 custom-scrollbar">
          <div className="flex flex-col gap-4">
            <h2 className="text-sm font-semibold text-primary">Nguồn Dữ Liệu</h2>
            
            <div>
              <label className="block text-xs font-bold text-accent-hover mb-1.5">1. Dán Link Google Drive (Bất kỳ ai cũng có thể xem)</label>
              <input 
                type="text" 
                value={driveLink}
                onChange={(e) => {
                  setDriveLink(e.target.value);
                  setSelectedFile(null);
                }}
                placeholder="https://drive.google.com/file/d/..." 
                className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:border-primary focus:outline-none transition-colors shadow-sm"
              />
            </div>

            <div className="flex items-center gap-2 my-1">
              <div className="h-px bg-gray-200 flex-1"></div>
              <span className="text-[10px] text-gray-400 font-semibold uppercase">HOẶC</span>
              <div className="h-px bg-gray-200 flex-1"></div>
            </div>

            <div>
              <label className="block text-xs font-bold text-accent-hover mb-1.5">2. Tải lên từ máy tính</label>
              <label className="flex flex-col items-center justify-center w-full h-24 bg-surface border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors relative overflow-hidden">
                <div className="flex flex-col items-center justify-center p-3 text-center z-10">
                  <UploadCloud className="w-5 h-5 text-primary mb-1.5" />
                  <p className="text-[11px] text-gray-500 font-medium px-2 leading-tight">
                    {selectedFile ? (
                      <span className="text-primary font-bold">{selectedFile.name}</span>
                    ) : (
                      "Click để tải lên (.mp3, .mp4, .wav...)"
                    )}
                  </p>
                </div>
                {selectedFile && (
                  <div className="absolute inset-0 bg-primary/5 z-0" />
                )}
                <input 
                  type="file" 
                  accept="audio/*,video/*" 
                  className="hidden" 
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      if (file.size > 2 * 1024 * 1024 * 1024) {
                        setError("File quá lớn. Vui lòng chọn file dưới 2GB.");
                        return;
                      }
                      setSelectedFile(file);
                      setDriveLink("");
                      setError(null);
                    }
                  }} 
                />
              </label>
              {selectedFile && (
                <button 
                  onClick={() => setSelectedFile(null)}
                  className="text-[10px] text-red-500 mt-1 hover:underline w-full text-right"
                >
                  Gỡ bỏ file
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-primary">Mục Tiêu Recap</h2>
            <div 
              className={"border rounded-xl p-4 cursor-pointer transition-colors " + (activeTab === 'client' ? 'border-primary bg-primary/5' : 'border-gray-200 hover:border-primary/50')}
              onClick={() => setActiveTab('client')}
            >
              <div className="flex items-center gap-3 mb-1">
                <div className={"w-4 h-4 rounded-full border-2 flex items-center justify-center " + (activeTab === 'client' ? 'border-primary' : 'border-gray-300')}>
                  {activeTab === 'client' && <div className="w-2 h-2 rounded-full bg-primary" />}
                </div>
                <h3 className="text-sm font-bold text-primary">Transformative Recap (Cho Coachee)</h3>
              </div>
            </div>
            <div 
              className={"border rounded-xl p-4 cursor-pointer transition-colors " + (activeTab === 'coach' ? 'border-primary bg-primary/5' : 'border-gray-200 hover:border-primary/50')}
              onClick={() => setActiveTab('coach')}
            >
              <div className="flex items-center gap-3 mb-1">
                <div className={"w-4 h-4 rounded-full border-2 flex items-center justify-center " + (activeTab === 'coach' ? 'border-primary' : 'border-gray-300')}>
                  {activeTab === 'coach' && <div className="w-2 h-2 rounded-full bg-primary" />}
                </div>
                <h3 className="text-sm font-bold text-primary">Insightful Recap (Cho Coach)</h3>
              </div>
            </div>
          </div>
          
          {error && (
            <div className="text-xs text-red-500 flex items-start gap-1 p-3 bg-red-50 rounded-lg">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="p-6 bg-white border-t border-gray-100">
          {isProcessing && (
            <div className="mb-4">
              <div className="flex justify-between text-[11px] font-semibold text-primary mb-1">
                <span className="truncate pr-2">{loadingStatus || "Đang xử lý..."}</span>
                <span>{progress}%</span>
              </div>
              <div className="h-1 bg-surface rounded-full overflow-hidden">
                <div 
                  className="h-full bg-primary transition-all duration-300 ease-out" 
                  style={{ width: progress + "%" }}
                />
              </div>
            </div>
          )}
          <button 
            className={"w-full py-3.5 rounded-lg font-bold flex items-center justify-center gap-2 transition-colors " + (isProcessing ? 'bg-surface text-gray-400 cursor-not-allowed' : 'bg-accent hover:bg-accent-hover text-primary')}
            onClick={handleGenerate}
            disabled={isProcessing || (!driveLink && !selectedFile)}
          >
            {isProcessing ? (
              "Đang xử lý..."
            ) : (
              <><span className="text-xl leading-none">✨</span> Generate Recap</>
            )}
          </button>
          <p className="text-xs text-gray-400 text-center mt-3 flex items-center justify-center gap-1.5">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
            Tệp tin được xử lý ẩn danh và xóa vĩnh viễn sau khi hoàn tất.
          </p>
        </div>
      </aside>

      <main className="flex-1 flex flex-col items-center py-8 overflow-y-auto px-4 relative" onClick={handleEditorClick}>
        <div className="w-full max-w-[900px] flex flex-col gap-4">
          
          {result && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-2 flex items-center gap-2 justify-center">
              <button 
                onClick={handleExportTranscript}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-surface rounded-md transition-colors"
              >
                <FileText className="w-3.5 h-3.5" />
                Tải Transcript
              </button>
              <button 
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-surface rounded-md transition-colors"
              >
                {isCopied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                {isCopied ? "Đã chép" : "Chép Recap"}
              </button>
              <button 
                onClick={handleExportDocx}
                disabled={isExporting}
                className={"flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors " + (isExporting ? 'text-gray-400 cursor-wait bg-gray-50' : 'text-gray-600 hover:bg-surface')}
              >
                <FileText className="w-3.5 h-3.5" />
                {isExporting ? "Đang xuất..." : "Tải DOCX"}
              </button>
            </div>
          )}

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 min-h-[700px] relative">
            {!result && !isProcessing && (
              <div className="flex items-center justify-center h-[500px] text-gray-400 italic">
                Your generated recap will appear here...
              </div>
            )}
            
            {result && (
              <div ref={editorRef} className="outline-none">
                <h1 
                  className="text-2xl font-bold text-primary mb-8 outline-none" 
                  contentEditable="true"
                  suppressContentEditableWarning
                >
                  {result.title}
                </h1>
                
                <div className="space-y-6 text-[16px] leading-[1.6] text-[#333333]">
                  {result.paragraphs.map((p, idx) => (
                    <div 
                      key={idx} 
                      className={`animate-in fade-in slide-in-from-bottom-2 duration-700 fill-mode-both`}
                      style={{ animationDelay: `${idx * 200}ms` }}
                    >
                      <div 
                        className="prose prose-base max-w-none prose-p:my-1 outline-none"
                        contentEditable="true"
                        suppressContentEditableWarning
                        dangerouslySetInnerHTML={renderHTML(p.text as string)} 
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        
        {activeCitationId !== null && result && (
          <div className="fixed bottom-10 right-10 w-[450px] bg-[#2A2A2A] text-white p-6 rounded-2xl shadow-2xl z-[100] animate-in slide-in-from-bottom-8 duration-300 border border-gray-700">
            <div className="flex justify-between items-center mb-4 border-b border-gray-700 pb-3">
              <h5 className="text-xs uppercase font-bold text-accent font-sans tracking-wider flex items-center gap-2">
                <Search className="w-3.5 h-3.5" />
                Original Context
              </h5>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveCitationId(null);
                }} 
                className="text-gray-400 hover:text-white bg-white/5 p-1 rounded-md transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="font-roboto-mono text-[13px] leading-relaxed text-gray-200 whitespace-pre-wrap max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
              {result.citations?.find(c => c.id === activeCitationId)?.context || "Context not found."}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
