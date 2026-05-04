'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useESP32 } from '@/hooks/useESP32';

type TTSStatus = 'idle' | 'loading' | 'playing' | 'error';

interface UseTTSOptions {
    /** Function that returns the current text to speak */
    getText: () => string | null;
    /**
     * Whether to auto-connect to the tablet's hardware keyboard (WebSocket port 81)
     * for Space+A combo detection.
     * Set to false if the page already has its own port 81 WebSocket
     * and will call `toggle()` directly from its own handler.
     */
    enableHardwareKeyboard?: boolean;
}

/**
 * Hook for Text-to-Speech via ElevenLabs.
 * 
 * Activation combo (tablet hardware keyboard via WebSocket port 81):
 *   1. Press and hold Space on the tablet
 *   2. Press A while Space is held
 *   3. Release A while Space is still held → triggers TTS
 */
export function useTTS({ getText, enableHardwareKeyboard = true }: UseTTSOptions) {
    const [status, setStatus] = useState<TTSStatus>('idle');
    const [isConnected, setIsConnected] = useState(false);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const abortRef = useRef<AbortController | null>(null);
    const { getIp } = useESP32();
    const wsRef = useRef<WebSocket | null>(null);
    const statusRef = useRef<TTSStatus>('idle');

    // Combo tracking state (for hardware keyboard)
    const hwComboRef = useRef<{
        spaceHeld: boolean;
        aPressed: boolean;
    }>({ spaceHeld: false, aPressed: false });

    // Use ref for toggle to avoid stale closure in WebSocket handler
    const toggleRef = useRef<() => void>(() => {});

    // Speak text via TTS API
    const speak = useCallback(async () => {
        // Ignore if already loading or playing — prevents overlap on spam
        if (statusRef.current === 'loading' || statusRef.current === 'playing') return;

        const text = getText();
        if (!text || text.trim().length === 0) {
            toast.info('No text content to read');
            return;
        }

        setStatus('loading');
        statusRef.current = 'loading';
        toast.info('🔊 Reading text aloud...');

        const controller = new AbortController();
        abortRef.current = controller;

        try {
            const response = await fetch('/api/tts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: text.trim() }),
                signal: controller.signal,
            });

            if (!response.ok) {
                throw new Error(`TTS request failed: ${response.status}`);
            }

            const audioBlob = await response.blob();
            const audioUrl = URL.createObjectURL(audioBlob);
            const audio = new Audio(audioUrl);
            audioRef.current = audio;

            audio.onplay = () => {
                setStatus('playing');
                statusRef.current = 'playing';
            };
            audio.onended = () => {
                setStatus('idle');
                statusRef.current = 'idle';
                URL.revokeObjectURL(audioUrl);
                audioRef.current = null;
            };
            audio.onerror = () => {
                setStatus('error');
                statusRef.current = 'error';
                URL.revokeObjectURL(audioUrl);
                audioRef.current = null;
                toast.error('Failed to play audio');
            };

            await audio.play();
        } catch (err: any) {
            if (err.name === 'AbortError') {
                setStatus('idle');
                statusRef.current = 'idle';
                return;
            }
            console.error('[TTS] Error:', err);
            setStatus('error');
            statusRef.current = 'error';
            toast.error('Failed to generate speech');
        }
    }, [getText]);

    // Stop currently playing audio — instant cut
    const stop = useCallback(() => {
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
            audioRef.current = null;
        }
        if (abortRef.current) {
            abortRef.current.abort();
            abortRef.current = null;
        }
        setStatus('idle');
        statusRef.current = 'idle';
    }, []);

    // Toggle: if playing/loading → stop. If idle → speak.
    // Spam-safe: speak() already checks statusRef so rapid triggers are ignored.
    const toggle = useCallback(() => {
        if (statusRef.current === 'playing' || statusRef.current === 'loading') {
            stop();
        } else {
            speak();
        }
    }, [speak, stop]);

    // Keep toggle ref up to date
    toggleRef.current = toggle;

    // ================================================================
    // HARDWARE KEYBOARD: Auto-connect to WebSocket port 81
    // Detects Space+A combo from the tablet's physical keyboard
    // ================================================================
    useEffect(() => {
        if (!enableHardwareKeyboard) return;

        const esp32Ip = getIp();
        let ws: WebSocket | null = null;
        let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

        function connect() {
            try {
                ws = new WebSocket(`ws://${esp32Ip}:81/`);
                ws.onopen = () => setIsConnected(true);
                ws.onclose = () => {
                    setIsConnected(false);
                    hwComboRef.current = { spaceHeld: false, aPressed: false };
                    // Auto-reconnect after 3 seconds
                    reconnectTimeout = setTimeout(connect, 3000);
                };
                ws.onerror = () => setIsConnected(false);

                ws.onmessage = (e) => {
                    try {
                        const msg = JSON.parse(e.data);
                        if (msg.type !== 'keystate') return;

                        const spacebar = Boolean(msg.spacebar);
                        const aKey = Boolean(msg.keys & 1); // bit 0 = A key
                        const combo = hwComboRef.current;

                        if (spacebar && !combo.spaceHeld) {
                            combo.spaceHeld = true;
                            combo.aPressed = false;
                        }

                        if (!spacebar) {
                            combo.spaceHeld = false;
                            combo.aPressed = false;
                            return;
                        }

                        // Space is held
                        if (aKey && !combo.aPressed) {
                            combo.aPressed = true;
                        }

                        if (!aKey && combo.aPressed && combo.spaceHeld) {
                            // A released while Space is still held → TRIGGER TTS
                            combo.aPressed = false;
                            toggleRef.current();
                        }
                    } catch { /* ignore */ }
                };

                wsRef.current = ws;
            } catch {
                setIsConnected(false);
            }
        }

        connect();

        return () => {
            if (reconnectTimeout) clearTimeout(reconnectTimeout);
            ws?.close();
            wsRef.current = null;
            setIsConnected(false);
        };
    }, [enableHardwareKeyboard]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            audioRef.current?.pause();
            abortRef.current?.abort();
        };
    }, []);

    return {
        status,
        isConnected,
        speak,
        stop,
        toggle,
    };
}

/**
 * Helper: detect Space+A combo from a WebSocket keystate message.
 * Use this in pages that already have their own port 81 WebSocket
 * (like the PDF viewer) to avoid duplicate connections.
 * 
 * Usage:
 *   const ttsCombo = useRef(createTTSComboTracker());
 *   // In your WS onmessage:
 *   if (ttsCombo.current.process(msg)) { tts.toggle(); }
 */
export function createTTSComboTracker() {
    let spaceHeld = false;
    let aPressed = false;

    return {
        /**
         * Process a keystate message. Returns true if TTS should be triggered.
         */
        process(msg: { type: string; spacebar?: boolean; keys?: number }): boolean {
            if (msg.type !== 'keystate') return false;

            const spacebar = Boolean(msg.spacebar);
            const aKey = Boolean((msg.keys ?? 0) & 1);

            if (spacebar && !spaceHeld) {
                spaceHeld = true;
                aPressed = false;
            }

            if (!spacebar) {
                spaceHeld = false;
                aPressed = false;
                return false;
            }

            if (aKey && !aPressed) {
                aPressed = true;
            }

            if (!aKey && aPressed && spaceHeld) {
                aPressed = false;
                return true; // TRIGGER
            }

            return false;
        },

        reset() {
            spaceHeld = false;
            aPressed = false;
        }
    };
}
