import React, { useEffect, useRef, useState } from 'react';
import { getLiveClient, decodeAudioData, encodeAudio, decodeAudio } from '../services/gemini';
import { LiveServerMessage, Modality } from '@google/genai';
import { Mic, MicOff, X, Loader2, Radio } from 'lucide-react';

interface VoiceAgentProps {
  isOpen: boolean;
  onClose: () => void;
  contextSummary: string;
}

export const VoiceAgent: React.FC<VoiceAgentProps> = ({ isOpen, onClose, contextSummary }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [status, setStatus] = useState("Initializing...");
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Audio Refs
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sessionRef = useRef<any>(null);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  const cleanup = () => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (sessionRef.current) {
      sessionRef.current.close();
      sessionRef.current = null;
    }
    if (outputAudioContextRef.current) {
      outputAudioContextRef.current.close();
      outputAudioContextRef.current = null;
    }
    if (inputAudioContextRef.current) {
      inputAudioContextRef.current.close();
      inputAudioContextRef.current = null;
    }
    setIsConnected(false);
  };

  useEffect(() => {
    if (!isOpen) {
      cleanup();
      return;
    }

    const initSession = async () => {
      try {
        setStatus("Requesting permissions...");
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;

        setStatus("Connecting to Gemini...");
        const inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
        const outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        
        inputAudioContextRef.current = inputAudioContext;
        outputAudioContextRef.current = outputAudioContext;
        
        const outputNode = outputAudioContext.createGain();
        outputNode.connect(outputAudioContext.destination);

        const liveClient = getLiveClient();
        
        // Ensure context isn't cut off too aggressively. 
        // Increasing limit to 25k chars (Gemini Live has large context window)
        const safeContext = contextSummary.slice(0, 25000);
        
        const systemInstruction = `You are a helpful voice assistant for a research paper database. 
        
        CONTEXT DATABASE:
        ${safeContext}
        
        INSTRUCTIONS:
        1. Answer questions specifically using the information in the CONTEXT DATABASE above.
        2. If the user asks about the "database" or "papers", refer to the content above.
        3. Keep answers concise, spoken-style, and conversational.
        4. If the context is empty, say "I don't have any papers loaded right now."`;

        const sessionPromise = liveClient.connect({
          model: 'gemini-2.5-flash-native-audio-preview-09-2025',
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
            },
            systemInstruction: systemInstruction,
          },
          callbacks: {
            onopen: () => {
              console.log("Session opened");
              setIsConnected(true);
              setStatus("Listening...");
              
              // Setup Audio Input Pipeline
              const source = inputAudioContext.createMediaStreamSource(stream);
              sourceRef.current = source;
              
              const processor = inputAudioContext.createScriptProcessor(4096, 1, 1);
              processorRef.current = processor;

              processor.onaudioprocess = (e) => {
                 if (isMuted) return;
                 
                 const inputData = e.inputBuffer.getChannelData(0);
                 // Create PCM Blob (16-bit little endian)
                 const l = inputData.length;
                 const int16 = new Int16Array(l);
                 for (let i = 0; i < l; i++) {
                   int16[i] = inputData[i] * 32768;
                 }
                 const pcmData = encodeAudio(new Uint8Array(int16.buffer));
                 
                 sessionPromise.then(session => {
                    session.sendRealtimeInput({
                        media: {
                            mimeType: 'audio/pcm;rate=16000',
                            data: pcmData
                        }
                    });
                 });
              };

              source.connect(processor);
              processor.connect(inputAudioContext.destination);
            },
            onmessage: async (message: LiveServerMessage) => {
              const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
              
              if (base64Audio) {
                 const ctx = outputAudioContextRef.current;
                 if (!ctx) return;

                 nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
                 
                 const audioBuffer = await decodeAudioData(
                   decodeAudio(base64Audio),
                   ctx,
                   24000,
                   1
                 );

                 const source = ctx.createBufferSource();
                 source.buffer = audioBuffer;
                 source.connect(outputNode);
                 
                 source.addEventListener('ended', () => {
                    sourcesRef.current.delete(source);
                 });
                 
                 source.start(nextStartTimeRef.current);
                 nextStartTimeRef.current += audioBuffer.duration;
                 sourcesRef.current.add(source);
              }
              
              if (message.serverContent?.interrupted) {
                 sourcesRef.current.forEach(s => s.stop());
                 sourcesRef.current.clear();
                 nextStartTimeRef.current = 0;
              }
            },
            onclose: () => {
                console.log("Session closed");
                setIsConnected(false);
            },
            onerror: (err) => {
                console.error(err);
                setStatus("Error occurred");
            }
          }
        });
        
        sessionRef.current = sessionPromise;

      } catch (err) {
        console.error("Failed to init voice agent", err);
        setStatus("Failed to connect microphone");
      }
    };

    initSession();

    return () => cleanup();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, contextSummary]); 

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="glass-panel w-full max-w-md rounded-2xl p-8 flex flex-col items-center relative border-t border-white/10 shadow-2xl shadow-indigo-500/20">
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-zinc-400 hover:text-white transition-colors"
        >
          <X size={24} />
        </button>

        <div className="mb-8 mt-4 relative">
          {isConnected ? (
             <div className="relative">
                <div className="absolute inset-0 bg-indigo-500 blur-xl opacity-40 animate-pulse rounded-full"></div>
                <div className="w-32 h-32 bg-zinc-900 rounded-full border border-indigo-500/30 flex items-center justify-center relative z-10">
                    <Radio className="w-12 h-12 text-indigo-400 animate-pulse" />
                </div>
             </div>
          ) : (
             <div className="w-32 h-32 bg-zinc-900 rounded-full border border-zinc-700 flex items-center justify-center animate-spin">
                <Loader2 className="w-10 h-10 text-zinc-500" />
             </div>
          )}
        </div>

        <h2 className="text-2xl font-light text-white mb-2 tracking-wide">
          {isConnected ? "NeurPaper Voice" : "Connecting..."}
        </h2>
        <p className="text-zinc-400 text-sm mb-8 font-mono uppercase tracking-wider">{status}</p>

        <div className="flex gap-6">
          <button
            onClick={() => setIsMuted(!isMuted)}
            className={`p-4 rounded-full transition-all duration-300 ${
              isMuted ? 'bg-red-500/20 text-red-400 border border-red-500/50' : 'bg-zinc-800 text-white hover:bg-zinc-700 border border-zinc-700'
            }`}
          >
            {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
          </button>
        </div>
      </div>
    </div>
  );
};