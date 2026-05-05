'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useESP32 } from '@/hooks/useESP32';

interface AskAIContext {
    /** The matrix currently on display (2D array) */
    matrix?: number[][] | null;
    /** Text content / description of what's on screen */
    description?: string | null;
    /** Source page name (e.g., "PDF to Braille", "Notes", "Lecture Record") */
    source?: string;
    /** Device model ID (e.g., "amc-1", "amc-3") — used for badge in chat list */
    deviceModelId?: string;
}

interface UseAskAIOptions {
    /** Function that returns the current display context */
    getContext: () => AskAIContext;
    /**
     * Whether to listen for the hardware keyboard Space+F combo.
     * Uses the singleton keyboard WebSocket from ESP32Service (port 81).
     */
    enableHardwareKeyboard?: boolean;
}

/**
 * Hook for the "Ask AI Teacher" shortcut.
 * 
 * Activation combo (tablet hardware keyboard via singleton WebSocket port 81):
 *   1. Press and hold Space on the tablet
 *   2. Press F while Space is held
 *   3. Release F while Space is still held → triggers Ask AI
 * 
 * Creates a new AI Teacher chat with the current display context.
 */
export function useAskAI({ getContext, enableHardwareKeyboard = true }: UseAskAIOptions) {
    const router = useRouter();
    const [isTriggering, setIsTriggering] = useState(false);
    const { onKeyMessage, offKeyMessage } = useESP32();
    const triggerRef = useRef<() => void>(() => {});

    // Combo tracking for hardware keyboard
    const comboRef = useRef<{
        spaceHeld: boolean;
        fPressed: boolean;
    }>({ spaceHeld: false, fPressed: false });

    const trigger = useCallback(async () => {
        if (isTriggering) return;
        setIsTriggering(true);
        toast.info('🧠 Opening AI Teacher...');

        try {
            const ctx = getContext();
            
            // Build the initial message describing what's on screen
            let messageContent = '📋 **Context from ';
            messageContent += ctx.source || 'the app';
            messageContent += ':**\n\n';

            if (ctx.description) {
                messageContent += ctx.description + '\n\n';
            }

            if (ctx.matrix) {
                // Flatten the matrix to a visual representation
                const visual = ctx.matrix.map(row => 
                    row.map(c => c === 1 ? '●' : '○').join('')
                ).join('\n');
                messageContent += '**Display content:**\n```\n' + visual + '\n```\n\n';
            }

            messageContent += 'Please explain what is shown on the display and help me understand this content.';

            // Create a new chat with the context message as the first user message
            const chatRes = await fetch('/api/teacher/chats', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: `Ask AI: ${ctx.source || 'Display Content'}`,
                    messages: [{
                        role: 'user',
                        content: messageContent,
                        timestamp: new Date().toISOString(),
                    }],
                    deviceModelId: ctx.deviceModelId,
                }),
            });

            if (!chatRes.ok) {
                throw new Error('Failed to create chat');
            }

            const chat = await chatRes.json();
            
            // Navigate to the new chat
            router.push(`/ai-teacher/${chat.id}`);
        } catch (err) {
            console.error('[AskAI] Error:', err);
            toast.error('Failed to open AI Teacher');
        } finally {
            setIsTriggering(false);
        }
    }, [getContext, isTriggering, router]);

    // Keep trigger ref up to date
    triggerRef.current = trigger;

    // ================================================================
    // HARDWARE KEYBOARD: Subscribe to singleton keyboard WebSocket
    // Detects Space+F combo from the tablet's physical keyboard
    // F key = bit 3 (index 3 in key array: A=0, S=1, D=2, F=3)
    // ================================================================
    useEffect(() => {
        if (!enableHardwareKeyboard) return;

        const handler = (msg: any) => {
            if (msg.type !== 'keystate') return;

            const spacebar = Boolean(msg.spacebar);
            const fKey = Boolean(msg.keys & 8); // bit 3 = F key
            const combo = comboRef.current;

            if (spacebar && !combo.spaceHeld) {
                combo.spaceHeld = true;
                combo.fPressed = false;
            }

            if (!spacebar) {
                combo.spaceHeld = false;
                combo.fPressed = false;
                return;
            }

            // Space is held
            if (fKey && !combo.fPressed) {
                combo.fPressed = true;
            }

            if (!fKey && combo.fPressed && combo.spaceHeld) {
                // F released while Space is still held → TRIGGER
                combo.fPressed = false;
                triggerRef.current();
            }
        };

        onKeyMessage(handler);
        return () => { offKeyMessage(handler); };
    }, [enableHardwareKeyboard, onKeyMessage, offKeyMessage]);

    return {
        trigger,
        isTriggering,
    };
}

/**
 * Helper: detect Space+F combo from a WebSocket keystate message.
 * Use this in pages that already have their own port 81 WebSocket.
 * 
 * Usage:
 *   const askAICombo = useRef(createAskAIComboTracker());
 *   // In your WS onmessage:
 *   if (askAICombo.current.process(msg)) { askAI.trigger(); }
 */
export function createAskAIComboTracker() {
    let spaceHeld = false;
    let fPressed = false;

    return {
        process(msg: { type: string; spacebar?: boolean; keys?: number }): boolean {
            if (msg.type !== 'keystate') return false;

            const spacebar = Boolean(msg.spacebar);
            const fKey = Boolean((msg.keys ?? 0) & 8); // bit 3 = F key

            if (spacebar && !spaceHeld) {
                spaceHeld = true;
                fPressed = false;
            }

            if (!spacebar) {
                spaceHeld = false;
                fPressed = false;
                return false;
            }

            if (fKey && !fPressed) {
                fPressed = true;
            }

            if (!fKey && fPressed && spaceHeld) {
                fPressed = false;
                return true; // TRIGGER
            }

            return false;
        },

        reset() {
            spaceHeld = false;
            fPressed = false;
        }
    };
}
