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
  const [apiKey, setApiKey] = useState("");
  const [driveLink, setDriveLink] = useState("");
  
  useEffect(() => {
    const savedKey = localStorage.getItem("coachnote_api_key");
    if (savedKey) setApiKey(savedKey);
  }, []);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [result, setResult] = useState<RecapResult | null>(null);
  const [error, setError] = useState("");
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

    setError("");
    setIsProcessing(true);
    setProgress(5);
    setResult(null);
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

        setLoadingStatus("Đang kéo file từ Drive đẩy lên Gemini (Tốc độ phụ thuộc băng thông, vui lòng không tắt trang)...");
        setProgress(15);

        let attempt = 0;
        let jobData;

        while (attempt < 2) {
            attempt++;
            if (attempt === 2) {
                setLoadingStatus("Máy chủ phụ đang khởi động (Cold Start). Đang tự động kết nối lại...");
            }

            const startRes = await fetch('/api/drive-to-gemini', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'start', fileId, apiKey: testKey })
            });
            
            if (!startRes.ok) {
               if (startRes.status === 504 && attempt === 1) {
                   // Render is waking up, wait 3 seconds and retry
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

            jobData = await startRes.json();
            if (jobData.status === 'error') throw new Error(jobData.error || "Có lỗi xảy ra khi xử lý file");
            break;
        }
        
        setLoadingStatus("Đang chờ Gemini xử lý âm thanh/video (Có thể mất 1-5 phút)...");
        setProgress(40);
        await waitForFileProcessing(testKey, jobData.name);
        
        fileUri = jobData.uri;
        fileMimeType = jobData.mimeType;

      } else if (selectedFile) {
        setLoadingStatus("Đang tải file lên Gemini (Tùy thuộc mạng của bạn)...");
        setProgress(15);
        const { uri, name, mimeType } = await uploadFileToGemini(testKey, selectedFile);
        
        setLoadingStatus("Đang chờ Gemini xử lý (Có thể mất 1-3 phút)...");
        setProgress(40);
        await waitForFileProcessing(testKey, name);
        
        fileUri = uri;
        fileMimeType = mimeType;
      }
      
      setLoadingStatus("Đang nhờ Gemini bóc băng âm thanh (Transcribing)...");
      setProgress(50);
      
      let finalTranscript = "";
      try {
        finalTranscript = await generateTranscript(testKey, fileUri, fileMimeType!);
      } catch (err: any) {
        throw new Error("Lỗi khi bóc băng: " + err.message);
      }
      
      setLoadingStatus("Đang bắt đầu phân tích Recap từ bản bóc băng...");
      setProgress(60);

      // Phase 2: Generate Content
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

  return (
    <div className="flex h-screen bg-surface overflow-hidden">
      {/* Sidebar */}
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
            
            {/* Drive Link Input */}
            <div>
              <label className="block text-xs font-bold text-accent-hover mb-1.5">1. Dán Link Google Drive (Bất kỳ ai cũng có thể xem)</label>
              <input 
                type="text" 
                value={driveLink}
                onChange={(e) => {
                  setDriveLink(e.target.value);
                  setSelectedFile(null); // Clear file if link is pasted
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

            {/* File Upload Section */}
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
                      setDriveLink(""); // Clear link if file is selected
                      setError("");
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
            disabled={isProcessing}
          >
            <span className="text-xl leading-none">✨</span> Generate Recap
          </button>
        </div>
      </aside>

      {/* Main Content (Editor) */}
      <main className="flex-1 flex flex-col items-center py-8 overflow-y-auto px-4 relative" onClick={handleEditorClick}>
        <div className="w-full max-w-[900px] flex flex-col gap-4">
          
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-2 flex items-center gap-1">
            <button className="p-2 hover:bg-surface rounded-md text-gray-600 transition-colors"><Undo className="w-4 h-4" /></button>
            <button className="p-2 hover:bg-surface rounded-md text-gray-600 transition-colors"><Redo className="w-4 h-4" /></button>
            <div className="w-px h-6 bg-gray-200 mx-2" />
            <div className="flex items-center gap-1 hover:bg-surface px-3 py-1.5 rounded-md cursor-pointer text-sm text-gray-600 transition-colors">
              <span>Normal Text</span>
              <ChevronDown className="w-3 h-3" />
            </div>
            <div className="w-px h-6 bg-gray-200 mx-2" />
            <button className="p-2 hover:bg-surface rounded-md text-gray-800 font-bold transition-colors"><Bold className="w-4 h-4" /></button>
            <button className="p-2 hover:bg-surface rounded-md text-gray-800 transition-colors"><Italic className="w-4 h-4" /></button>
            <button className="p-2 hover:bg-surface rounded-md text-gray-800 transition-colors"><Underline className="w-4 h-4" /></button>
            <div className="w-px h-6 bg-gray-200 mx-2" />
            <button className="p-2 hover:bg-surface rounded-md text-gray-600 transition-colors"><List className="w-4 h-4" /></button>
            <button className="p-2 hover:bg-surface rounded-md text-gray-600 transition-colors"><ListOrdered className="w-4 h-4" /></button>
            <button className="p-2 hover:bg-surface rounded-md text-gray-600 transition-colors"><LinkIcon className="w-4 h-4" /></button>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 min-h-[700px] relative pb-32">
            {!result && !isProcessing && (
              <div className="flex items-center justify-center h-full text-gray-400 italic">
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
                  {result.paragraphs.map((p, index) => (
                    <div className="relative group/block" key={index}>
                      <div 
                        className="prose prose-base max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0 prose-headings:!font-bold prose-headings:!text-[#333333] prose-h1:!text-[21px] prose-h2:!text-[21px] prose-h3:!text-[21px] outline-none focus:bg-gray-50 transition-colors rounded p-1"
                        contentEditable="true"
                        suppressContentEditableWarning
                        dangerouslySetInnerHTML={renderHTML(p.text as string)} 
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {result && (
              <div className="absolute bottom-10 right-12 flex gap-3 mt-10">
                <button 
                  onClick={handleCopy}
                  className={"px-5 py-2.5 rounded-full border border-gray-200 bg-white text-sm font-semibold hover:bg-surface flex items-center gap-2 shadow-sm transition-colors " + (isCopied ? 'text-green-600' : 'text-gray-700')}
                >
                  {isCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {isCopied ? "Copied!" : "Copy"}
                </button>
                <button 
                  onClick={handleExportDocx}
                  disabled={isExporting}
                  className={"px-5 py-2.5 rounded-full border border-gray-200 text-sm font-semibold hover:bg-surface flex items-center gap-2 shadow-sm transition-colors " + (isExporting ? 'bg-gray-50 text-gray-400 cursor-wait' : 'bg-white text-gray-700')}
                >
                  <FileText className="w-4 h-4" /> 
                  {isExporting ? "Exporting..." : "Export .docx"}
                </button>
              </div>
            )}
          </div>
        </div>
        
        {/* Floating Citation Popup */}
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
