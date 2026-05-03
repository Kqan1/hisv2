'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { GeminiLiveService, type GeminiLiveState } from '@/services/gemini-live.service';
import { useESP32 } from '@/hooks/useESP32';

// ========================================================================
// TYPES
// ========================================================================

export interface TranscriptEntry {
  id: string;
  role: 'user' | 'model' | 'system';
  text: string;
  timestamp: Date;
}

export interface UseGeminiLiveReturn {
  /** Current connection state */
  state: GeminiLiveState;
  /** Whether the AI is currently speaking */
  isSpeaking: boolean;
  /** Conversation transcript */
  transcript: TranscriptEntry[];
  /** Current matrix being displayed */
  currentMatrix: number[][] | null;
  /** Set the transcript (for loading history) */
  setTranscript: React.Dispatch<React.SetStateAction<TranscriptEntry[]>>;
  /** Set the matrix (for loading history) */
  setCurrentMatrix: React.Dispatch<React.SetStateAction<number[][] | null>>;
  /** Start voice AI session */
  startSession: () => Promise<void>;
  /** End voice AI session */
  endSession: () => Promise<void>;
  /** Send a text message instead of voice */
  sendText: (text: string) => void;
  /** Error message if any */
  error: string | null;
  /** Audio level for visualization (0-1) */
  audioLevel: number;
}

// ========================================================================
// HOOK
// ========================================================================

export interface UseGeminiLiveProps {
  initialTranscript?: TranscriptEntry[];
  initialMatrix?: number[][] | null;
}

export function useGeminiLive({ initialTranscript = [], initialMatrix = null }: UseGeminiLiveProps = {}): UseGeminiLiveReturn {
  const [state, setState] = useState<GeminiLiveState>('idle');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>(initialTranscript);
  const [currentMatrix, setCurrentMatrix] = useState<number[][] | null>(initialMatrix);
  const [error, setError] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);

  const serviceRef = useRef<GeminiLiveService | null>(null);
  const { setArray, enableLoop, clear } = useESP32();

  // Accumulate partial transcripts from the model
  const pendingModelTranscriptRef = useRef<string>('');
  const modelTranscriptTimerRef = useRef<NodeJS.Timeout | null>(null);

  // ========================================================================
  // TOOL CALL HANDLER
  // ========================================================================

  const handleToolCall = useCallback(async (name: string, args: Record<string, unknown>): Promise<unknown> => {
    if (name === 'set_display') {
      const pixels = args.pixels as number[][];

      if (!pixels || !Array.isArray(pixels)) {
        throw new Error('Invalid pixels data');
      }

      // Validate dimensions
      if (pixels.length !== 10 || pixels.some(row => row.length !== 15)) {
        console.warn('[useGeminiLive] Invalid matrix dimensions, attempting to fix...');
        // Try to use what we got anyway
      }

      // Clamp values to -1/1
      const clamped = pixels.map(row =>
        row.map(v => (v >= 1 ? 1 : -1))
      );

      // Update local state
      setCurrentMatrix(clamped);

      // Send to ESP32
      try {
        await enableLoop(true);
        await setArray(clamped);

        // Add system message about drawing
        addTranscriptEntry('system', 'Drawing sent to display');
      } catch (err) {
        console.error('[useGeminiLive] ESP32 error:', err);
        addTranscriptEntry('system', 'Display not connected — preview shown locally');
      }

      return { result: 'Display updated successfully' };
    }

    if (name === 'clear_display') {
      const emptyMatrix = Array(10).fill(0).map(() => Array(15).fill(-1));
      setCurrentMatrix(emptyMatrix);

      try {
        await clear();
        addTranscriptEntry('system', 'Display cleared');
      } catch {
        addTranscriptEntry('system', 'Display not connected — cleared locally');
      }

      return { result: 'Display cleared successfully' };
    }

    throw new Error(`Unknown function: ${name}`);
  }, [setArray, enableLoop, clear]);

  // ========================================================================
  // TRANSCRIPT MANAGEMENT
  // ========================================================================

  const addTranscriptEntry = useCallback((role: 'user' | 'model' | 'system', text: string) => {
    if (!text.trim()) return;

    setTranscript(prev => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        role,
        text: text.trim(),
        timestamp: new Date(),
      },
    ]);
  }, []);

  // ========================================================================
  // SESSION MANAGEMENT
  // ========================================================================

  const startSession = useCallback(async () => {
    setError(null);

    const service = new GeminiLiveService({
      onStateChange: (newState) => {
        setState(newState);
        if (newState === 'connected') {
          addTranscriptEntry('system', 'Voice AI connected — start speaking!');
        }
      },
      onAudioData: (audioData) => {
        // Calculate simple audio level from PCM data
        const pcm16 = new Int16Array(audioData);
        let sum = 0;
        for (let i = 0; i < pcm16.length; i++) {
          sum += Math.abs(pcm16[i]);
        }
        const avg = sum / pcm16.length / 32768;
        setAudioLevel(Math.min(1, avg * 3)); // Amplify for visibility
      },
      onToolCall: handleToolCall,
      onTranscript: (text, role) => {
        if (role === 'model') {
          // Accumulate partial model transcripts and flush after a pause
          pendingModelTranscriptRef.current += text;
          if (modelTranscriptTimerRef.current) {
            clearTimeout(modelTranscriptTimerRef.current);
          }
          modelTranscriptTimerRef.current = setTimeout(() => {
            if (pendingModelTranscriptRef.current.trim()) {
              addTranscriptEntry('model', pendingModelTranscriptRef.current);
              pendingModelTranscriptRef.current = '';
            }
          }, 800);
        } else {
          addTranscriptEntry(role, text);
        }
      },
      onError: (err) => {
        setError(err);
      },
      onModelSpeaking: (speaking) => {
        setIsSpeaking(speaking);
        if (!speaking) {
          setAudioLevel(0);
        }
      },
    });

    serviceRef.current = service;
    await service.connect();
  }, [handleToolCall, addTranscriptEntry]);

  const endSession = useCallback(async () => {
    // Flush any pending model transcript
    if (pendingModelTranscriptRef.current.trim()) {
      addTranscriptEntry('model', pendingModelTranscriptRef.current);
      pendingModelTranscriptRef.current = '';
    }
    if (modelTranscriptTimerRef.current) {
      clearTimeout(modelTranscriptTimerRef.current);
    }

    if (serviceRef.current) {
      await serviceRef.current.disconnect();
      serviceRef.current = null;
    }
    setIsSpeaking(false);
    setAudioLevel(0);
    addTranscriptEntry('system', 'Session ended');
  }, [addTranscriptEntry]);

  const sendText = useCallback((text: string) => {
    if (serviceRef.current) {
      serviceRef.current.sendText(text);
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (serviceRef.current) {
        serviceRef.current.disconnect();
      }
    };
  }, []);

  return {
    state,
    isSpeaking,
    transcript,
    setTranscript,
    currentMatrix,
    setCurrentMatrix,
    startSession,
    endSession,
    sendText,
    error,
    audioLevel,
  };
}
