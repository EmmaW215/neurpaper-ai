import React, { useState, useEffect, useRef } from 'react';
import { AppMode, Paper, ProcessingLog, ChatMessage, TrainingMetric } from './types';
import { generateArxivPapers, chatWithKnowledgeBase } from './services/gemini';
import { VoiceAgent } from './components/VoiceAgent';
import { Button, Input, Card, Badge } from './components/UI';
import { 
  Upload, Link as LinkIcon, Search, FileText, Cpu, 
  MessageSquare, Mic, Activity, CheckCircle2, ArrowRight,
  BrainCircuit, Send, Loader2
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { GenerateContentResponse } from '@google/genai';

// Mock Training Data Generator
const generateTrainingData = (points: number) => {
  const data: TrainingMetric[] = [];
  let loss = 2.5;
  let accuracy = 0.1;
  for (let i = 0; i < points; i++) {
    loss = Math.max(0.1, loss * 0.95 + (Math.random() * 0.1 - 0.05));
    accuracy = Math.min(0.99, accuracy * 1.05 + (Math.random() * 0.02));
    data.push({ epoch: i + 1, loss, accuracy });
  }
  return data;
};

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>(AppMode.INGEST);
  const [topic, setTopic] = useState('LLM Optimizations');
  const [paperCount, setPaperCount] = useState(3);
  const [papers, setPapers] = useState<Paper[]>([]);
  const [logs, setLogs] = useState<ProcessingLog[]>([]);
  const [trainingData, setTrainingData] = useState<TrainingMetric[]>([]);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [isVoiceOpen, setIsVoiceOpen] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<string | null>(null);
  
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, isChatLoading]);

  // --- LOGIC: Ingestion & Processing ---

  const handleArxivScrape = async () => {
    try {
      setMode(AppMode.PROCESSING);
      addLog("Connecting to arXiv API...", "active");
      
      // Fetch papers via Gemini (simulated scraping)
      const fetchedPapers = await generateArxivPapers(topic, paperCount);
      
      if (fetchedPapers.length === 0) {
          addLog("No papers found or parsing error.", "pending");
          // Don't crash, just allow retry
          setTimeout(() => setMode(AppMode.INGEST), 2000);
          return;
      }

      setPapers(fetchedPapers);
      
      addLog(`Successfully retrieved ${fetchedPapers.length} papers.`, "completed");
      
      // Start simulated pipeline
      await runPipeline(fetchedPapers);
      
    } catch (error) {
      console.error(error);
      addLog("Failed to fetch papers.", "pending");
      setTimeout(() => setMode(AppMode.INGEST), 2000);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadedFile(file.name);
      // For demo, we just simulate this triggering the pipeline with a "Generic Paper"
      setMode(AppMode.PROCESSING);
      const mockPaper: Paper = {
        title: file.name,
        authors: ["User Upload"],
        year: new Date().getFullYear().toString(),
        summary: "Content extracted from user uploaded file. The file contains detailed research on neural network architectures.",
        highlights: ["User provided content", "Analysis extracted successfully", "Ready for query"],
        link: "#"
      };
      setPapers([mockPaper]);
      runPipeline([mockPaper]);
    }
  };

  const addLog = (step: string, status: 'active' | 'completed' | 'pending') => {
    setLogs(prev => [...prev, { step, status }]);
  };

  const runPipeline = async (currentPapers: Paper[]) => {
    // 1. PDF Parsing / Extraction
    await wait(1500);
    addLog("Converting PDF/Audio to Text...", "completed");

    // 2. RAG Pipeline
    await wait(1000);
    addLog("Chunking text and generating embeddings...", "active");
    await wait(2000);
    addLog("Indexing vectors into vector database...", "completed");

    // 3. LoRA Training Simulation
    addLog("Initializing LoRA/SFT Model Training...", "active");
    
    // Animate chart
    for (let i = 0; i < 10; i++) {
      await wait(500);
      setTrainingData(generateTrainingData(i + 1));
    }
    
    addLog("Fine-tuning completed. Loss: 0.14", "completed");
    addLog("System ready for query.", "completed");
    
    await wait(1000);
    setMode(AppMode.DASHBOARD);
  };

  const wait = (ms: number) => new Promise(res => setTimeout(res, ms));

  // --- LOGIC: Chat ---

  const handleSendMessage = async () => {
    if (!chatInput.trim()) return;
    
    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', text: chatInput };
    setChatHistory(prev => [...prev, userMsg]);
    setChatInput('');
    setIsChatLoading(true);

    try {
      // Construct context from papers
      const context = papers.map(p => 
        `Title: ${p.title}\nSummary: ${p.summary}\nHighlights: ${p.highlights.join('; ')}`
      ).join('\n\n');

      // Prepare history for API
      const apiHistory = chatHistory.map(msg => ({
        role: msg.role,
        parts: [{ text: msg.text }]
      }));

      const streamResult = await chatWithKnowledgeBase(apiHistory, userMsg.text, context);
      
      let fullResponse = "";
      const botMsgId = (Date.now() + 1).toString();
      
      // Optimistic update for streaming
      setChatHistory(prev => [...prev, { id: botMsgId, role: 'model', text: '', isThinking: true }]);

      for await (const chunk of streamResult) {
        const content = (chunk as GenerateContentResponse).text || "";
        fullResponse += content;
        
        setChatHistory(prev => prev.map(msg => 
            msg.id === botMsgId 
            ? { ...msg, text: fullResponse, isThinking: false } 
            : msg
        ));
      }

    } catch (error) {
      console.error("Chat Error", error);
      setChatHistory(prev => [...prev, { id: Date.now().toString(), role: 'model', text: "Sorry, I encountered an error." }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  // --- RENDER HELPERS ---

  const renderIngest = () => (
    <div className="max-w-4xl mx-auto pt-12 px-4">
      <div className="text-center mb-16">
        <h1 className="text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-400 mb-6">
          NeurPaper AI
        </h1>
        <p className="text-xl text-zinc-400 max-w-2xl mx-auto">
          Your multimodal research assistant. Ingest papers, audio, or video. 
          Train a personalized LoRA adapter. Chat with your knowledge base.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left: Upload */}
        <Card className="h-full flex flex-col gap-6 hover:border-indigo-500/30 transition-colors">
          <div className="flex items-center gap-3 text-indigo-400 mb-2">
            <Upload size={24} />
            <h2 className="text-xl font-semibold text-white">Direct Upload</h2>
          </div>
          <div className="flex-1 border-2 border-dashed border-zinc-800 rounded-xl bg-zinc-950/30 flex flex-col items-center justify-center p-8 group hover:border-indigo-500/50 transition-all cursor-pointer relative">
            <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={handleFileUpload} accept=".pdf,.mp4,.mp3" />
            <div className="w-16 h-16 bg-zinc-900 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <FileText className="text-zinc-500 group-hover:text-indigo-400" />
            </div>
            <p className="text-zinc-400 font-medium">Drop PDF or MP4 here</p>
            <p className="text-zinc-600 text-sm mt-2">or click to browse</p>
          </div>
          <div className="flex gap-2">
            <Input placeholder="Paste YouTube URL..." />
            <Button variant="secondary"><LinkIcon size={18} /></Button>
          </div>
        </Card>

        {/* Right: Scraper */}
        <Card className="h-full flex flex-col gap-6 hover:border-indigo-500/30 transition-colors">
          <div className="flex items-center gap-3 text-purple-400 mb-2">
            <Search size={24} />
            <h2 className="text-xl font-semibold text-white">arXiv Scraper</h2>
          </div>
          <div className="space-y-4 flex-1">
            <div>
              <label className="block text-sm text-zinc-400 mb-2">Research Topic</label>
              <Input 
                value={topic} 
                onChange={(e) => setTopic(e.target.value)} 
                placeholder="e.g. Attention Mechanisms" 
              />
            </div>
            <div>
              <label className="block text-sm text-zinc-400 mb-2">Number of Papers</label>
              <div className="flex gap-4">
                {[1, 3, 5].map(num => (
                  <button
                    key={num}
                    onClick={() => setPaperCount(num)}
                    className={`flex-1 py-3 rounded-lg font-medium border transition-all ${
                      paperCount === num 
                      ? 'bg-purple-500/20 border-purple-500 text-purple-300' 
                      : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:bg-zinc-800'
                    }`}
                  >
                    {num} Papers
                  </button>
                ))}
              </div>
            </div>
          </div>
          <Button onClick={handleArxivScrape} className="w-full py-4 text-lg bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 border-0">
             Start Ingestion & Training
             <ArrowRight size={20} />
          </Button>
        </Card>
      </div>
    </div>
  );

  const renderProcessing = () => (
    <div className="max-w-3xl mx-auto pt-20 px-4">
      <Card>
        <div className="flex items-center justify-between mb-8 border-b border-white/5 pb-6">
          <h2 className="text-2xl font-bold flex items-center gap-3">
            <Cpu className="text-indigo-400 animate-pulse" />
            System Pipeline
          </h2>
          <Badge color="bg-indigo-500/20 text-indigo-400">Running</Badge>
        </div>

        <div className="space-y-6 mb-8">
          {logs.map((log, i) => (
            <div key={i} className="flex items-center gap-4 animate-in fade-in slide-in-from-left-2 duration-500">
              {log.status === 'completed' ? (
                <CheckCircle2 className="text-green-400 w-5 h-5 shrink-0" />
              ) : log.status === 'pending' ? (
                <div className="w-5 h-5 rounded-full border-2 border-red-500 flex items-center justify-center text-[10px] text-red-500 font-bold">!</div>
              ) : (
                <Loader2 className="text-indigo-400 w-5 h-5 shrink-0 animate-spin" />
              )}
              <span className={`${log.status === 'completed' ? 'text-zinc-300' : 'text-indigo-200'} font-mono text-sm`}>
                {log.step}
              </span>
            </div>
          ))}
        </div>

        {trainingData.length > 0 && (
          <div className="h-64 w-full mt-8 bg-zinc-900/30 rounded-xl border border-zinc-800 p-4">
             <p className="text-xs text-zinc-500 mb-4 font-mono uppercase">Training Loss (LoRA Adapter)</p>
             <ResponsiveContainer width="100%" height="100%">
               <LineChart data={trainingData}>
                 <Line type="monotone" dataKey="loss" stroke="#818cf8" strokeWidth={2} dot={false} />
                 <XAxis hide />
                 <YAxis hide domain={['auto', 'auto']} />
                 <Tooltip 
                   contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a' }}
                   itemStyle={{ color: '#818cf8' }}
                 />
               </LineChart>
             </ResponsiveContainer>
          </div>
        )}
      </Card>
    </div>
  );

  const renderDashboard = () => (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar / Papers List */}
      <div className="w-[400px] bg-zinc-900 border-r border-zinc-800 flex flex-col">
        <div className="p-6 border-b border-zinc-800">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <BrainCircuit className="text-indigo-400" />
            Knowledge Base
          </h2>
          <p className="text-xs text-zinc-500 mt-1">{papers.length} papers indexed</p>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {papers.map((paper, idx) => (
            <div key={idx} className="bg-zinc-950/50 border border-zinc-800 rounded-lg p-4 hover:border-indigo-500/30 transition-all group">
              <h3 className="font-medium text-zinc-200 leading-tight mb-2 group-hover:text-indigo-300 transition-colors">
                {paper.title}
              </h3>
              <div className="flex gap-2 text-xs text-zinc-500 mb-3">
                <span>{paper.year}</span>
                <span>•</span>
                <span>{paper.authors[0]} et al.</span>
              </div>
              <p className="text-sm text-zinc-400 line-clamp-3 mb-3 leading-relaxed">
                {paper.summary}
              </p>
              <div className="flex flex-wrap gap-2">
                 {paper.highlights.slice(0,2).map((h, i) => (
                   <span key={i} className="text-[10px] bg-zinc-900 text-zinc-500 px-2 py-1 rounded border border-zinc-800">
                     {h.slice(0, 30)}...
                   </span>
                 ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col bg-zinc-950 relative">
        {/* Header */}
        <div className="h-16 border-b border-zinc-800 flex items-center justify-between px-6 bg-zinc-900/50 backdrop-blur-sm">
           <div className="flex items-center gap-3">
              <Activity className="text-green-500 w-4 h-4" />
              <span className="text-sm font-mono text-zinc-400">Model: NeurPaper-LoRA-7B (Simulated)</span>
           </div>
           <Button 
             variant="primary" 
             className="rounded-full px-6 bg-gradient-to-r from-rose-500 to-orange-500 hover:from-rose-600 hover:to-orange-600 border-0"
             onClick={() => setIsVoiceOpen(true)}
           >
             <Mic size={18} />
             Start Voice Agent
           </Button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {chatHistory.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-zinc-500 opacity-50">
              <BrainCircuit size={64} strokeWidth={1} className="mb-4" />
              <p>Ask me anything about the ingested papers.</p>
            </div>
          )}
          {chatHistory.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-2xl p-5 ${
                msg.role === 'user' 
                ? 'bg-indigo-600 text-white' 
                : 'bg-zinc-900 border border-zinc-800 text-zinc-200'
              }`}>
                <div className="prose prose-invert prose-sm">
                  {msg.isThinking ? (
                    <span className="flex items-center gap-2 text-zinc-400">
                      <Loader2 className="animate-spin w-4 h-4" /> Thinking...
                    </span>
                  ) : (
                    msg.text.split('\n').map((line, i) => (
                      <p key={i} className="mb-2 last:mb-0">{line}</p>
                    ))
                  )}
                </div>
              </div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        {/* Input */}
        <div className="p-6 bg-zinc-900 border-t border-zinc-800">
          <div className="flex gap-4 max-w-4xl mx-auto">
            <div className="flex-1 relative">
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder="Ask a complex question demanding step-wise reasoning..."
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-4 pr-12 py-4 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all text-zinc-200 placeholder-zinc-600"
                disabled={isChatLoading}
              />
              <Button 
                className="absolute right-2 top-2 bottom-2 aspect-square !p-0 rounded-lg bg-zinc-800 hover:bg-indigo-600 text-zinc-400 hover:text-white"
                onClick={handleSendMessage}
                disabled={isChatLoading}
              >
                {isChatLoading ? <Loader2 className="animate-spin" size={20} /> : <Send size={20} />}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Voice Modal */}
      <VoiceAgent 
        isOpen={isVoiceOpen} 
        onClose={() => setIsVoiceOpen(false)} 
        contextSummary={papers.map(p => `Title: ${p.title}. Summary: ${p.summary}. Key Points: ${p.highlights.join(', ')}`).join('\n\n')}
      />
    </div>
  );

  return (
    <div className="min-h-screen bg-black text-zinc-100 font-sans selection:bg-indigo-500/30">
      {mode === AppMode.INGEST && renderIngest()}
      {mode === AppMode.PROCESSING && renderProcessing()}
      {mode === AppMode.DASHBOARD && renderDashboard()}
    </div>
  );
};

export default App;