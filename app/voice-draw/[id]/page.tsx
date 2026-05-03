'use client';

import { useState, useRef, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { useGeminiLive, type TranscriptEntry } from '@/hooks/useGeminiLive';
import Matrix from '@/components/ui/matrix';
import { Button } from '@/components/ui/button';
import { Heading } from '@/components/ui/heading';
import {
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  Send,
  Volume2,
  Sparkles,
  Bot,
  User,
  Info,
  ChevronLeft,
} from 'lucide-react';

// ========================================================================
// MAIN PAGE
// ========================================================================

export default function VoiceDrawSession({ params }: { params: Promise<{ id: string }> }) {
  const { id: paramId } = use(params);
  const router = useRouter();
  const [chatId, setChatId] = useState(paramId);
  const [isLoaded, setIsLoaded] = useState(paramId === 'new');

  const {
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
  } = useGeminiLive();

  const [textInput, setTextInput] = useState('');
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const isConnecting = state === 'connecting';
  const isConnected = state === 'connected';

  // Load chat
  useEffect(() => {
    if (chatId !== 'new') {
      fetch(`/api/voice-draw/chats/${chatId}`)
        .then(res => {
          if (res.status === 404) router.push('/voice-draw');
          return res.json();
        })
        .then(data => {
          if (data && !data.error) {
            if (data.transcript) setTranscript(data.transcript);
            if (data.matrix) setCurrentMatrix(data.matrix);
          }
          setIsLoaded(true);
        })
        .catch(console.error);
    }
  }, [chatId, router, setTranscript, setCurrentMatrix]);

  // Save chat
  useEffect(() => {
    if (!isLoaded) return;
    if (transcript.length === 0 && chatId === 'new') return; // Don't save empty new chat

    const timeout = setTimeout(() => {
      if (chatId === 'new') {
        fetch('/api/voice-draw/chats', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transcript, matrix: currentMatrix })
        }).then(res => res.json()).then(data => {
          if (data.id) {
            setChatId(data.id);
            // Replace URL without triggering Next.js unmount
            window.history.replaceState(null, '', `/voice-draw/${data.id}`);
          }
        });
      } else {
        fetch(`/api/voice-draw/chats/${chatId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transcript, matrix: currentMatrix })
        });
      }
    }, 1000);

    return () => clearTimeout(timeout);
  }, [transcript, currentMatrix, chatId, isLoaded]);

  // Auto-scroll transcript
  useEffect(() => {
    if (transcript.length > 0) {
      transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [transcript]);

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!textInput.trim()) return;
    sendText(textInput);
    setTextInput('');
  };

  if (!isLoaded) {
    return <div className="p-8 text-center text-muted-foreground">Loading session...</div>;
  }

  return (
    <div className="voice-draw-page">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <Heading
            title="Voice AI Teacher"
            description="Control the display with your voice."
            Icon={<Sparkles className="size-8 text-primary" />}
            hideBackButton={true}
          />
        </div>

        {/* Toolbar */}
        <div className="border rounded-lg p-1 flex flex-wrap items-center gap-1 h-10.5 mb-2">
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => router.push('/voice-draw')}
            title="All Voice AI Teacher Sessions"
          >
            <ChevronLeft size={16} />
          </Button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="vd-error">
          <span>⚠️ {error}</span>
          <button onClick={() => { }} className="vd-error-dismiss">✕</button>
        </div>
      )}

      {/* Main Content */}
      <div className="vd-content">

        {/* Top: Mic + Visualizer */}
        <div className="vd-control-panel">
          {/* Mic Orb Button */}
          <button
            className="vd-orb-container"
            onClick={isConnected ? endSession : startSession}
            disabled={isConnecting}
            aria-label={isConnected ? "End AI Teacher" : "Start AI Teacher"}
          >
            <div
              className={`vd-orb ${isConnected ? 'vd-orb--active' : ''} ${isSpeaking ? 'vd-orb--speaking' : ''}`}
              style={{
                '--audio-level': audioLevel,
              } as React.CSSProperties}
            >
              {/* Animated rings */}
              <div className="vd-orb__ring vd-orb__ring--1" />
              <div className="vd-orb__ring vd-orb__ring--2" />
              <div className="vd-orb__ring vd-orb__ring--3" />

              {/* Center icon */}
              <div className="vd-orb__center">
                {isSpeaking ? (
                  <Volume2 size={32} className="vd-orb__icon" />
                ) : isConnected ? (
                  <Mic size={32} className="vd-orb__icon" />
                ) : (
                  <MicOff size={32} className="vd-orb__icon" />
                )}
              </div>
            </div>

            {/* Status text */}
            <p className="vd-status-text">
              {isConnecting ? 'Connecting...' :
                isSpeaking ? 'AI is speaking...' :
                  isConnected ? 'Tap to end session' :
                    'Tap to Start AI Teacher'}
            </p>
          </button>

          {/* Text input fallback */}
          {isConnected && (
            <form onSubmit={handleTextSubmit} className="vd-text-input">
              <input
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder="Or type a command..."
                className="vd-text-field"
              />
              <Button
                type="submit"
                size="icon"
                variant="ghost"
                disabled={!textInput.trim()}
              >
                <Send size={18} />
              </Button>
            </form>
          )}
        </div>

        {/* Middle: Matrix Preview */}
        <div className="vd-matrix-section">
          <h3 className="vd-section-title">
            <Sparkles size={16} />
            Display Preview
          </h3>
          <div className="vd-matrix-wrapper">
            <Matrix
              initialData={currentMatrix ?? undefined}
              editable={false}
              rows={10}
              cols={15}
            />
          </div>
        </div>

        {/* Bottom: Transcript */}
        <div className="vd-transcript-section">
          <h3 className="vd-section-title">
            <Bot size={16} />
            Conversation
          </h3>
          <div className="vd-transcript">
            {transcript.length === 0 ? (
              <div className="vd-transcript-empty">
                <Info size={20} />
                <p>Start a session and say something like:</p>
                <div className="vd-suggestions">
                  <span className="vd-suggestion">&quot;Draw a heart&quot;</span>
                  <span className="vd-suggestion">&quot;Write the letter A&quot;</span>
                  <span className="vd-suggestion">&quot;Draw a smiley face&quot;</span>
                  <span className="vd-suggestion">&quot;Make a checkerboard pattern&quot;</span>
                </div>
              </div>
            ) : (
              transcript.map((entry) => (
                <TranscriptBubble key={entry.id} entry={entry} />
              ))
            )}
            <div ref={transcriptEndRef} />
          </div>
        </div>
      </div>

      <style jsx>{`
        .voice-draw-page {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          min-height: calc(100vh - 8rem);
        }

        .vd-error {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.75rem 1rem;
          border-radius: 0.75rem;
          background: hsl(0 72% 51% / 0.1);
          border: 1px solid hsl(0 72% 51% / 0.3);
          color: hsl(0 72% 51%);
          font-size: 0.875rem;
        }
        .vd-error-dismiss {
          background: none;
          border: none;
          color: inherit;
          cursor: pointer;
          padding: 0.25rem;
        }

        .vd-content {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
          flex: 1;
        }

        /* ================================ */
        /* Control Panel (Top)              */
        /* ================================ */

        .vd-control-panel {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1.5rem;
          padding: 2rem 1rem;
          border-radius: 1rem;
          background: linear-gradient(
            145deg,
            hsl(0 0% 10% / 0.6),
            hsl(0 0% 5% / 0.4)
          );
          border: 1px solid hsl(0 0% 20% / 0.5);
          backdrop-filter: blur(12px);
          max-width: 600px;
          margin: 0 auto;
          width: 100%;
        }

        :global([data-theme="light"]) .vd-control-panel,
        :global(.light) .vd-control-panel {
          background: linear-gradient(
            145deg,
            hsl(0 0% 96%),
            hsl(0 0% 94%)
          );
          border: 1px solid hsl(0 0% 85%);
        }

        /* ================================ */
        /* Orb Visualizer                   */
        /* ================================ */

        .vd-orb-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1rem;
          background: none;
          border: none;
          padding: 0;
          cursor: pointer;
          outline: none;
        }

        .vd-orb-container:disabled {
          cursor: not-allowed;
          opacity: 0.7;
        }

        .vd-orb {
          position: relative;
          width: 140px;
          height: 140px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .vd-orb__ring {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          border: 2px solid hsl(0 0% 50% / 0.2);
          transition: all 0.3s ease;
        }

        .vd-orb--active .vd-orb__ring {
          border-color: hsl(0 0% 100% / 0.4);
          animation: vd-pulse 2s ease-in-out infinite;
        }

        .vd-orb--speaking .vd-orb__ring--1 {
          border-color: hsl(0 0% 100% / 0.6);
          transform: scale(calc(1 + var(--audio-level) * 0.3));
          animation: none;
        }
        .vd-orb--speaking .vd-orb__ring--2 {
          border-color: hsl(0 0% 100% / 0.4);
          transform: scale(calc(1 + var(--audio-level) * 0.5));
          animation: none;
        }
        .vd-orb--speaking .vd-orb__ring--3 {
          border-color: hsl(0 0% 100% / 0.2);
          transform: scale(calc(1 + var(--audio-level) * 0.7));
          animation: none;
        }

        .vd-orb__ring--1 { animation-delay: 0s; }
        .vd-orb__ring--2 { animation-delay: 0.4s; inset: -8px; }
        .vd-orb__ring--3 { animation-delay: 0.8s; inset: -16px; }

        @keyframes vd-pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.08); opacity: 0.6; }
        }

        .vd-orb__center {
          width: 80px;
          height: 80px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, hsl(0 0% 25%), hsl(0 0% 10%));
          box-shadow: 
            0 0 30px hsl(0 0% 50% / 0.2),
            inset 0 0 20px hsl(0 0% 100% / 0.1);
          transition: all 0.3s ease;
        }

        .vd-orb--active .vd-orb__center {
          box-shadow: 
            0 0 40px hsl(0 0% 100% / 0.3),
            inset 0 0 20px hsl(0 0% 100% / 0.2);
        }

        .vd-orb--speaking .vd-orb__center {
          background: linear-gradient(135deg, hsl(0 0% 40%), hsl(0 0% 20%));
          box-shadow: 
            0 0 50px hsl(0 0% 100% / 0.5),
            inset 0 0 20px hsl(0 0% 100% / 0.4);
        }

        .vd-orb__icon {
          color: white;
          filter: drop-shadow(0 0 4px rgba(255,255,255,0.5));
        }

        .vd-status-text {
          font-size: 0.875rem;
          color: hsl(0 0% 60%);
          text-align: center;
          font-weight: 500;
        }

        /* ================================ */
        /* Text Input                       */
        /* ================================ */

        .vd-text-input {
          display: flex;
          gap: 0.5rem;
          width: 100%;
          padding: 0.5rem;
          border-radius: 0.75rem;
          background: hsl(0 0% 15% / 0.5);
          border: 1px solid hsl(0 0% 25% / 0.5);
        }

        :global([data-theme="light"]) .vd-text-input,
        :global(.light) .vd-text-input {
          background: hsl(0 0% 96%);
          border: 1px solid hsl(0 0% 85%);
        }

        .vd-text-field {
          flex: 1;
          background: transparent;
          border: none;
          outline: none;
          color: inherit;
          font-size: 0.875rem;
          padding: 0.25rem 0.5rem;
        }
        .vd-text-field::placeholder {
          color: hsl(0 0% 45%);
        }

        /* ================================ */
        /* Display Panel (Middle/Bottom)    */
        /* ================================ */

        .vd-display-panel {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .vd-section-title {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.875rem;
          font-weight: 600;
          color: hsl(0 0% 60%);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 0.5rem;
        }

        /* ================================ */
        /* Matrix Preview                   */
        /* ================================ */

        .vd-matrix-section {
          padding: 1rem;
          border-radius: 1rem;
          border: 1px dashed hsl(0 0% 25% / 0.5);
          background: hsl(0 0% 8% / 0.3);
        }

        :global([data-theme="light"]) .vd-matrix-section,
        :global(.light) .vd-matrix-section {
          background: hsl(0 0% 97%);
          border-color: hsl(0 0% 85%);
        }

        .vd-matrix-wrapper {
          border-radius: 0.5rem;
          overflow: hidden;
        }

        /* ================================ */
        /* Transcript                       */
        /* ================================ */

        .vd-transcript-section {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-height: 200px;
        }

        .vd-transcript {
          flex: 1;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          padding: 0.75rem;
          border-radius: 0.75rem;
          background: hsl(0 0% 8% / 0.3);
          border: 1px solid hsl(0 0% 20% / 0.3);
          max-height: 400px;
        }

        :global([data-theme="light"]) .vd-transcript,
        :global(.light) .vd-transcript {
          background: hsl(0 0% 97%);
          border-color: hsl(0 0% 88%);
        }

        .vd-transcript-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.75rem;
          padding: 2rem 1rem;
          text-align: center;
          color: hsl(0 0% 45%);
        }
        .vd-transcript-empty p {
          font-size: 0.875rem;
        }

        .vd-suggestions {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 0.5rem;
          margin-top: 0.25rem;
        }

        .vd-suggestion {
          font-size: 0.75rem;
          padding: 0.375rem 0.75rem;
          border-radius: 2rem;
          background: hsl(0 0% 30% / 0.2);
          border: 1px solid hsl(0 0% 30% / 0.3);
          color: hsl(0 0% 70%);
        }

        /* ================================ */
        /* Transcript Bubble                */
        /* ================================ */

        .vd-bubble {
          display: flex;
          gap: 0.5rem;
          padding: 0.5rem 0.75rem;
          border-radius: 0.75rem;
          font-size: 0.875rem;
          line-height: 1.4;
          animation: vd-fadeIn 0.2s ease;
        }

        @keyframes vd-fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .vd-bubble--user {
          background: hsl(0 0% 20% / 0.3);
          border: 1px solid hsl(0 0% 30% / 0.4);
          margin-left: 1.5rem;
        }

        .vd-bubble--model {
          background: hsl(0 0% 10% / 0.3);
          border: 1px solid hsl(0 0% 20% / 0.4);
          margin-right: 1.5rem;
        }

        .vd-bubble--system {
          background: hsl(0 0% 15% / 0.3);
          border: 1px solid hsl(0 0% 25% / 0.4);
          font-size: 0.8rem;
          color: hsl(0 0% 60%);
          justify-content: center;
        }

        .vd-bubble__icon {
          flex-shrink: 0;
          margin-top: 0.125rem;
          color: hsl(0 0% 55%);
        }

        .vd-bubble--model .vd-bubble__icon {
          color: hsl(0 0% 70%);
        }

        .vd-bubble__text {
          flex: 1;
        }
      `}</style>
    </div>
  );
}

// ========================================================================
// TRANSCRIPT BUBBLE COMPONENT
// ========================================================================

function TranscriptBubble({ entry }: { entry: TranscriptEntry }) {
  const getIcon = () => {
    switch (entry.role) {
      case 'user': return <User size={16} />;
      case 'model': return <Bot size={16} />;
      case 'system': return null;
    }
  };

  return (
    <div className={`vd-bubble vd-bubble--${entry.role}`}>
      {entry.role !== 'system' && (
        <span className="vd-bubble__icon">{getIcon()}</span>
      )}
      <span className="vd-bubble__text">{entry.text}</span>
    </div>
  );
}
