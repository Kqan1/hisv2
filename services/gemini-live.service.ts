'use client';

import { GoogleGenAI, Modality } from '@google/genai';
import type { Session, LiveServerMessage, FunctionCall } from '@google/genai';

// ========================================================================
// TYPES
// ========================================================================

export type GeminiLiveState = 'idle' | 'connecting' | 'connected' | 'error';

export interface GeminiLiveCallbacks {
  onStateChange: (state: GeminiLiveState) => void;
  onAudioData: (audioData: ArrayBuffer) => void;
  onToolCall: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  onTranscript: (text: string, role: 'user' | 'model') => void;
  onError: (error: string) => void;
  onModelSpeaking: (speaking: boolean) => void;
}

// ========================================================================
// SYSTEM PROMPT
// ========================================================================

const SYSTEM_PROMPT = `You are a creative drawing assistant controlling a 15×10 electromagnetic flip-dot display.

DISPLAY SPECIFICATIONS:
- The display has 10 rows and 15 columns (150 total pixels)
- Each pixel can be: 1 (raised/visible), -1 (lowered/hidden)
- You MUST always provide a complete 10-row × 15-column matrix

WHEN ASKED TO DRAW:
1. Generate a 10×15 pixel matrix as a 2D array
2. Call the set_display function with the full pixel array
3. Be creative and artistic within this low-resolution constraint
4. Describe what you drew after calling the function

WHEN ASKED TO CLEAR:
- Call the clear_display function

IMPORTANT RULES:
- Always use the set_display function to draw - never just describe pixels
- The matrix must be exactly 10 rows × 15 columns
- Use 1 for raised (visible) pixels and -1 for lowered (hidden) pixels
- Think of it like pixel art - be creative with the limited resolution
- You can draw letters, shapes, patterns, emojis, simple icons, etc.

Be friendly, enthusiastic, and creative. You're an artist working with a unique electromagnetic canvas!`;

// ========================================================================
// FUNCTION DECLARATIONS
// ========================================================================

const TOOL_DECLARATIONS = [
  {
    functionDeclarations: [
      {
        name: 'set_display',
        description: 'Draw a pattern on the 15x10 electromagnetic flip-dot display by setting the pixel matrix. The matrix must be exactly 10 rows by 15 columns.',
        parameters: {
          type: 'OBJECT' as const,
          properties: {
            pixels: {
              type: 'ARRAY' as const,
              description: 'A 10-element array where each element is a 15-element array of pixel values. Use 1 for raised (visible) pixels and -1 for lowered (hidden) pixels.',
              items: {
                type: 'ARRAY' as const,
                items: {
                  type: 'INTEGER' as const,
                  description: 'Pixel value: 1 = raised (visible), -1 = lowered (hidden)',
                },
              },
            },
          },
          required: ['pixels'],
        },
      },
      {
        name: 'clear_display',
        description: 'Clear the display by setting all pixels to the lowered/hidden state (-1).',
      },
    ],
  },
];

// ========================================================================
// AUDIO PROCESSING UTILITIES
// ========================================================================

/**
 * Convert Float32 audio samples to 16-bit PCM
 */
function float32ToPcm16(float32Array: Float32Array): ArrayBuffer {
  const pcm16 = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return pcm16.buffer;
}

/**
 * Downsample audio from source sample rate to target sample rate
 */
function downsample(buffer: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return buffer;
  const ratio = fromRate / toRate;
  const newLength = Math.round(buffer.length / ratio);
  const result = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    const index = Math.round(i * ratio);
    result[i] = buffer[Math.min(index, buffer.length - 1)];
  }
  return result;
}

// ========================================================================
// GEMINI LIVE SERVICE
// ========================================================================

export class GeminiLiveService {
  private session: Session | null = null;
  private mediaStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private playbackContext: AudioContext | null = null;
  private state: GeminiLiveState = 'idle';
  private callbacks: GeminiLiveCallbacks;
  private audioQueue: ArrayBuffer[] = [];
  private isPlayingAudio = false;
  private scriptProcessor: ScriptProcessorNode | null = null;

  constructor(callbacks: GeminiLiveCallbacks) {
    this.callbacks = callbacks;
  }

  getState(): GeminiLiveState {
    return this.state;
  }

  private setState(state: GeminiLiveState) {
    this.state = state;
    this.callbacks.onStateChange(state);
  }

  // ========================================================================
  // CONNECTION
  // ========================================================================

  async connect(): Promise<void> {
    if (this.state === 'connected' || this.state === 'connecting') return;

    this.setState('connecting');

    try {
      // 1. Get ephemeral token from our server
      const tokenRes = await fetch('/api/gemini-token', { method: 'POST' });
      if (!tokenRes.ok) {
        throw new Error('Failed to get ephemeral token');
      }
      const { token } = await tokenRes.json();

      // 2. Create client with ephemeral token
      const ai = new GoogleGenAI({
        apiKey: token,
        httpOptions: { apiVersion: 'v1alpha' },
      });

      // 3. Connect to Gemini Live
      this.session = await ai.live.connect({
        model: 'gemini-3.1-flash-live-preview',
        callbacks: {
          onopen: () => {
            console.log('[GeminiLive] Session opened');
            this.setState('connected');
          },
          onmessage: (message: LiveServerMessage) => {
            this.handleServerMessage(message);
          },
          onerror: (e: ErrorEvent) => {
            console.error('[GeminiLive] Error:', e.message);
            this.callbacks.onError(e.message);
          },
          onclose: (e: CloseEvent) => {
            console.log('[GeminiLive] Session closed. Code:', e.code, 'Reason:', e.reason);
            this.setState('idle');
          },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: SYSTEM_PROMPT,
          tools: TOOL_DECLARATIONS,
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
      });

      // 4. Start microphone capture
      await this.startMicrophone();

    } catch (error) {
      console.error('[GeminiLive] Connection failed:', error);
      this.callbacks.onError(error instanceof Error ? error.message : 'Connection failed');
      this.setState('error');
    }
  }

  async disconnect(): Promise<void> {
    this.stopMicrophone();
    this.stopPlayback();

    if (this.session) {
      try {
        this.session.conn.close();
      } catch {
        // ignore close errors
      }
      this.session = null;
    }

    this.setState('idle');
  }

  // ========================================================================
  // MICROPHONE INPUT
  // ========================================================================

  private async startMicrophone(): Promise<void> {
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      this.audioContext = new AudioContext({ sampleRate: 16000 });
      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);

      // Use ScriptProcessorNode for compatibility (AudioWorklet requires served files)
      const bufferSize = 4096;
      this.scriptProcessor = this.audioContext.createScriptProcessor(bufferSize, 1, 1);

      this.scriptProcessor.onaudioprocess = (event: AudioProcessingEvent) => {
        if (!this.session || this.state !== 'connected') return;

        const inputData = event.inputBuffer.getChannelData(0);

        // Downsample if needed (browser may not support 16kHz natively)
        const targetRate = 16000;
        const downsampledData = downsample(inputData, this.audioContext!.sampleRate, targetRate);

        // Convert to PCM16
        const pcmData = float32ToPcm16(downsampledData);

        // Convert to base64
        const base64 = arrayBufferToBase64(pcmData);

        // Send to Gemini
        try {
          this.session.sendRealtimeInput({
            audio: {
              data: base64,
              mimeType: 'audio/pcm;rate=16000',
            },
          });
        } catch (err) {
          // Session might have closed
          console.warn('[GeminiLive] Error sending audio:', err);
        }
      };

      this.sourceNode.connect(this.scriptProcessor);
      this.scriptProcessor.connect(this.audioContext.destination);

      console.log('[GeminiLive] Microphone started');
    } catch (error) {
      console.error('[GeminiLive] Microphone error:', error);
      this.callbacks.onError('Microphone access denied');
    }
  }

  private stopMicrophone(): void {
    if (this.scriptProcessor) {
      this.scriptProcessor.disconnect();
      this.scriptProcessor = null;
    }
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
  }

  // ========================================================================
  // SERVER MESSAGE HANDLING
  // ========================================================================

  private handleServerMessage(message: LiveServerMessage): void {
    // Handle audio data
    if (message.data) {
      const audioBytes = base64ToArrayBuffer(message.data);
      this.queueAudio(audioBytes);
    }

    // Handle transcripts
    if (message.serverContent?.modelTurn?.parts) {
      for (const part of message.serverContent.modelTurn.parts) {
        if (part.text) {
          this.callbacks.onTranscript(part.text, 'model');
        }
      }
    }

    // Handle input transcript (user speech-to-text)
    if (message.serverContent?.inputTranscription?.text) {
      this.callbacks.onTranscript(message.serverContent.inputTranscription.text, 'user');
    }

    // Handle output transcript (model speech-to-text)
    if (message.serverContent?.outputTranscription?.text) {
      this.callbacks.onTranscript(message.serverContent.outputTranscription.text, 'model');
    }

    // Handle tool calls
    if (message.toolCall?.functionCalls) {
      this.handleToolCalls(message.toolCall.functionCalls);
    }

    // Handle turn complete
    if (message.serverContent?.turnComplete) {
      this.callbacks.onModelSpeaking(false);
    }
  }

  private async handleToolCalls(functionCalls: FunctionCall[]): Promise<void> {
    const responses = [];

    for (const fc of functionCalls) {
      console.log(`[GeminiLive] Tool call: ${fc.name}`, fc.args);

      try {
        const result = await this.callbacks.onToolCall(fc.name, fc.args as Record<string, unknown>);
        responses.push({
          id: fc.id!,
          name: fc.name,
          response: { result: result ?? 'ok' },
        });
      } catch (error) {
        console.error(`[GeminiLive] Tool call error for ${fc.name}:`, error);
        responses.push({
          id: fc.id!,
          name: fc.name,
          response: { error: String(error) },
        });
      }
    }

    // Send tool responses back to Gemini
    if (this.session && responses.length > 0) {
      try {
        this.session.sendToolResponse({
          functionResponses: responses,
        });
      } catch (error) {
        console.error('[GeminiLive] Error sending tool response:', error);
      }
    }
  }

  // ========================================================================
  // AUDIO PLAYBACK
  // ========================================================================

  private queueAudio(audioData: ArrayBuffer): void {
    this.audioQueue.push(audioData);
    this.callbacks.onModelSpeaking(true);
    if (!this.isPlayingAudio) {
      this.playNextAudio();
    }
  }

  private async playNextAudio(): Promise<void> {
    if (this.audioQueue.length === 0) {
      this.isPlayingAudio = false;
      return;
    }

    this.isPlayingAudio = true;

    // Collect all queued audio into one buffer for smoother playback
    const totalLength = this.audioQueue.reduce((sum, buf) => sum + buf.byteLength, 0);
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    for (const buf of this.audioQueue) {
      combined.set(new Uint8Array(buf), offset);
      offset += buf.byteLength;
    }
    this.audioQueue = [];

    try {
      if (!this.playbackContext) {
        this.playbackContext = new AudioContext({ sampleRate: 24000 });
      }

      // Convert PCM16 to Float32
      const pcm16 = new Int16Array(combined.buffer, combined.byteOffset, combined.byteLength / 2);
      const float32 = new Float32Array(pcm16.length);
      for (let i = 0; i < pcm16.length; i++) {
        float32[i] = pcm16[i] / 32768;
      }

      const audioBuffer = this.playbackContext.createBuffer(1, float32.length, 24000);
      audioBuffer.getChannelData(0).set(float32);

      const source = this.playbackContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.playbackContext.destination);

      source.onended = () => {
        this.playNextAudio();
      };

      source.start();

      // Emit audio data for visualizer
      this.callbacks.onAudioData(combined.buffer);

    } catch (error) {
      console.error('[GeminiLive] Audio playback error:', error);
      this.isPlayingAudio = false;
    }
  }

  private stopPlayback(): void {
    this.audioQueue = [];
    this.isPlayingAudio = false;
    if (this.playbackContext) {
      this.playbackContext.close();
      this.playbackContext = null;
    }
  }

  // ========================================================================
  // TEXT INPUT (alternative to voice)
  // ========================================================================

  sendText(text: string): void {
    if (!this.session || this.state !== 'connected') return;

    this.session.sendClientContent({
      turns: text,
    });

    this.callbacks.onTranscript(text, 'user');
  }
}

// ========================================================================
// HELPERS
// ========================================================================

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
