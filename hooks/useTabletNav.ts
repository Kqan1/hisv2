'use client';

import { useEffect, useRef, useCallback } from 'react';
import { getESP32Service } from '@/services/esp32.service';

/**
 * Tablet Navigation Mode
 * 
 * Toggle: Space + ; (semicolon, bit 7) on the tablet keyboard
 * 
 * When active, the tablet keys are remapped:
 *   D (bit 2) → Tab (next focusable element)
 *   F (bit 3) → Shift+Tab (previous focusable element)
 *   J (bit 4) → Enter / activate focused element
 *   K (bit 5) → Escape / blur
 * 
 * Visual: White focus ring on the focused element (via [data-tablet-nav] on body)
 * Audio: Browser SpeechSynthesis announces the focused element's label
 */

// Focusable element selector
const FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
].join(', ');

function getFocusableElements(): HTMLElement[] {
    return Array.from(document.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
        .filter(el => {
            // Must be visible
            const style = getComputedStyle(el);
            return style.display !== 'none' 
                && style.visibility !== 'hidden' 
                && style.opacity !== '0'
                && el.offsetParent !== null;
        });
}

function getElementLabel(el: HTMLElement): string {
    // 1. Explicit aria-label (best)
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel;

    // 2. aria-labelledby
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
        const labelEl = document.getElementById(labelledBy);
        if (labelEl?.textContent) return labelEl.textContent.trim();
    }

    // 3. title attribute
    const title = el.getAttribute('title');
    if (title) return title;

    // 4. For inputs, use placeholder or associated label
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        const placeholder = el.getAttribute('placeholder');
        if (placeholder) return `${placeholder} input`;
        const label = el.closest('label')?.textContent?.trim();
        if (label) return label;
        const id = el.id;
        if (id) {
            const assocLabel = document.querySelector<HTMLLabelElement>(`label[for="${id}"]`);
            if (assocLabel?.textContent) return assocLabel.textContent.trim();
        }
        return 'Text input';
    }

    // 5. Direct text content — only own text nodes, ignore SVGs and nested elements with their own labels
    const directText = Array.from(el.childNodes)
        .filter(n => n.nodeType === Node.TEXT_NODE)
        .map(n => n.textContent?.trim())
        .filter(Boolean)
        .join(' ')
        .trim();

    if (directText && directText.length > 0 && directText.length <= 80) {
        // Add element type context
        const tag = el.tagName.toLowerCase();
        if (tag === 'a') return `${directText}, link`;
        if (tag === 'button' || el.getAttribute('role') === 'button') return directText;
        return directText;
    }

    // 6. Full textContent as fallback (cleaned up)
    const fullText = el.textContent?.trim().replace(/\s+/g, ' ');
    if (fullText && fullText.length > 0 && fullText.length <= 60) {
        return fullText;
    }
    if (fullText && fullText.length > 60) {
        return fullText.substring(0, 57) + '...';
    }

    // 7. Element type fallback
    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute('role');
    if (role) return role;
    if (tag === 'button') return 'Button';
    if (tag === 'a') return 'Link';
    return tag;
}

// Pre-load voices — they load asynchronously in most browsers
let cachedVoices: SpeechSynthesisVoice[] = [];
let speechPrimed = false;

function loadVoices() {
    if (!('speechSynthesis' in window)) return;
    cachedVoices = window.speechSynthesis.getVoices();
}

/** Prime SpeechSynthesis on first user gesture (click/touch/keydown).
 *  Browsers block programmatic speech until a real user interaction occurs. */
function primeSpeech() {
    if (speechPrimed || !('speechSynthesis' in window)) return;
    speechPrimed = true;
    const silent = new SpeechSynthesisUtterance('');
    silent.volume = 0;
    window.speechSynthesis.speak(silent);
    // Remove all priming listeners
    window.removeEventListener('click', primeSpeech);
    window.removeEventListener('touchstart', primeSpeech);
    window.removeEventListener('keydown', primeSpeech);
}

if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    loadVoices();
    window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
    // Attach priming to first user gesture
    window.addEventListener('click', primeSpeech, { once: false });
    window.addEventListener('touchstart', primeSpeech, { once: false });
    window.addEventListener('keydown', primeSpeech, { once: false });
}

function announce(text: string) {
    if (!('speechSynthesis' in window)) return;

    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.1;
    utterance.pitch = 1;
    utterance.volume = 1;

    // Use English voice if available
    if (cachedVoices.length === 0) loadVoices(); // retry if empty
    const enVoice = cachedVoices.find(v => v.lang.startsWith('en'));
    if (enVoice) utterance.voice = enVoice;

    window.speechSynthesis.speak(utterance);
}

/**
 * Global hook that enables tablet keyboard → browser navigation.
 * Mount once in the root Providers component.
 */
export function useTabletNav() {
    const navActiveRef = useRef(false);
    const toggleComboRef = useRef({ spaceHeld: false, semiPressed: false });
    const prevKeysRef = useRef(0);

    const setNavActive = useCallback((active: boolean) => {
        navActiveRef.current = active;
        if (active) {
            document.body.setAttribute('data-tablet-nav', '');
            announce('Navigation mode on');
        } else {
            document.body.removeAttribute('data-tablet-nav');
            // Remove focus ring
            if (document.activeElement instanceof HTMLElement) {
                document.activeElement.blur();
            }
            announce('Navigation mode off');
        }
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const service = getESP32Service();

        const handler = (msg: any) => {
            if (msg.type !== 'keystate') return;

            const keys = msg.keys as number;
            const spacebar = Boolean(msg.spacebar);
            const prevKeys = prevKeysRef.current;
            const combo = toggleComboRef.current;

            // ── Toggle detection: Space + ; (bit 7) ──
            if (spacebar && !combo.spaceHeld) {
                combo.spaceHeld = true;
                combo.semiPressed = false;
            }
            if (!spacebar) {
                combo.spaceHeld = false;
                combo.semiPressed = false;
            }

            if (spacebar) {
                const semiKey = Boolean(keys & 128); // bit 7 = ;
                if (semiKey && !combo.semiPressed) {
                    combo.semiPressed = true;
                }
                if (!semiKey && combo.semiPressed && combo.spaceHeld) {
                    // ; released while Space held → toggle
                    combo.semiPressed = false;
                    setNavActive(!navActiveRef.current);
                    prevKeysRef.current = keys;
                    return; // Don't process other keys on toggle frame
                }
            }

            // ── Navigation keys (only when nav mode is active AND Space is NOT held) ──
            if (navActiveRef.current && !spacebar) {
                const dPressed = (keys & 4) && !(prevKeys & 4);   // bit 2 = D → Tab
                const fPressed = (keys & 8) && !(prevKeys & 8);   // bit 3 = F → Shift+Tab
                const jPressed = (keys & 16) && !(prevKeys & 16); // bit 4 = J → Enter
                const kPressed = (keys & 32) && !(prevKeys & 32); // bit 5 = K → Escape

                if (dPressed || fPressed) {
                    const elements = getFocusableElements();
                    if (elements.length === 0) {
                        prevKeysRef.current = keys;
                        return;
                    }

                    const currentIndex = elements.indexOf(document.activeElement as HTMLElement);
                    let nextIndex: number;

                    if (dPressed) {
                        // Tab forward
                        nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % elements.length;
                    } else {
                        // Shift+Tab backward
                        nextIndex = currentIndex <= 0 ? elements.length - 1 : currentIndex - 1;
                    }

                    const target = elements[nextIndex];
                    target.focus({ preventScroll: false });
                    target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });

                    // Announce
                    const label = getElementLabel(target);
                    announce(label);
                }

                if (jPressed) {
                    // Enter / activate
                    const active = document.activeElement as HTMLElement;
                    if (active && active !== document.body) {
                        active.click();
                        announce('Activated');
                    }
                }

                if (kPressed) {
                    // Escape / blur
                    if (document.activeElement instanceof HTMLElement) {
                        document.activeElement.blur();
                    }
                    announce('Deselected');
                }
            }

            prevKeysRef.current = keys;
        };

        const unsub = service.onKeyMessage(handler);
        return () => { unsub(); };
    }, [setNavActive]);
}
