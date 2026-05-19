"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Eye, EyeOff, ArrowRight } from "lucide-react";

export default function SetupPage() {
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const router = useRouter();

  const handleSaveAndStart = () => {
    // Basic validation logic can go here (e.g., checking if key is not empty)
    if (apiKey.trim()) {
      // Typically, you'd save to localStorage here:
      // localStorage.setItem("googleAIStudioKey", apiKey);
    }
    // Navigate to the workspace
    router.push("/workspace");
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-sm max-w-2xl w-full p-10 flex flex-col items-center">
        {/* Logo */}
        <div className="bg-primary w-16 h-16 rounded-2xl flex items-center justify-center mb-6 shadow-md">
          <Sparkles className="text-white w-8 h-8" />
        </div>
        
        <h1 className="text-4xl font-bold text-primary mb-2">CoachNote</h1>
        <p className="text-gray-500 mb-10">Vietnamese recaps in 5' - from recording to insights</p>

        {/* Steps */}
        <div className="flex items-center justify-between w-full max-w-md mb-12 relative">
          <div className="absolute top-5 left-10 right-10 h-0.5 bg-gray-200 -z-10"></div>
          
          <div className="flex flex-col items-center">
            <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center mb-2 z-10 text-primary">
              <span className="text-sm font-semibold">1</span>
            </div>
            <p className="text-xs font-semibold text-center">Step 1<br/>Connect API</p>
            <p className="text-[10px] text-gray-400 mt-1">(for transcript)</p>
          </div>
          
          <div className="flex flex-col items-center">
            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center mb-2 z-10 text-gray-400">
              <span className="text-sm font-semibold">2</span>
            </div>
            <p className="text-xs font-semibold text-center text-gray-400">Step 2<br/>Choose recap template</p>
            <p className="text-[10px] text-gray-400 mt-1">(for client/for coach)</p>
          </div>
          
          <div className="flex flex-col items-center">
            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center mb-2 z-10 text-gray-400">
              <span className="text-sm font-semibold">3</span>
            </div>
            <p className="text-xs font-semibold text-center text-gray-400">Step 3<br/>Edit & Export</p>
          </div>
        </div>

        {/* Form */}
        <div className="w-full max-w-md">
          <label className="block text-sm font-medium text-gray-600 mb-2">Google AI Studio API Key</label>
          <div className="relative mb-6">
            <input
              type={showKey ? "text" : "password"}
              className="w-full bg-surface border border-gray-200 rounded-lg px-4 py-3 pr-10 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              placeholder="Enter your API key here..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <button
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              onClick={() => setShowKey(!showKey)}
            >
              {showKey ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>

          <div className="mb-8">
            <p className="text-xs font-bold text-gray-500 mb-2 uppercase tracking-wider">How to get your key:</p>
            <ol className="text-xs text-gray-500 space-y-1.5 list-decimal pl-4">
              <li>Go to <a href="https://aistudio.google.com/" target="_blank" rel="noreferrer" className="underline hover:text-primary">https://aistudio.google.com/</a> and sign in.</li>
              <li>Select "Get API key" on the sidebar.</li>
              <li>Click "Create API key" → Create key → Copy key</li>
            </ol>
            <p className="text-[10px] text-gray-400 mt-3 italic">Your key is stored locally and never leaves your browser.</p>
          </div>

          <button 
            className="btn-primary w-full shadow-sm"
            onClick={handleSaveAndStart}
          >
            Save & Start <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    </main>
  );
}
