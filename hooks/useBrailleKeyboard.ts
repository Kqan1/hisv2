import { useState, useRef, useEffect } from "react";
import { useESP32 } from "@/hooks/useESP32";
import { BRAILLE_MAP } from "@/lib/braille";

export type KeyState = {
    keys: number;
    spacebar: boolean;
    dots: number[];
};

export function useBrailleKeyboard() {
    const { onKeyMessage, offKeyMessage } = useESP32();
    const [typedText, setTypedText] = useState("");
    const [keyState, setKeyState] = useState<KeyState>({ keys: 0, spacebar: false, dots: [0, 0, 0, 0, 0, 0, 0, 0] });

    const accumulatedDotsRef = useRef<number[]>([0, 0, 0, 0, 0, 0, 0, 0]);
    const isTypingRef = useRef(false);
    const spacebarPressedRef = useRef(false);

    useEffect(() => {
        const handler = (msg: any) => {
            if (msg.type === 'keystate') {
                // Update live visualization
                setKeyState({ keys: msg.keys, spacebar: msg.spacebar, dots: msg.dots });

                // Accumulate dots while any key is pressed
                if (msg.keys > 0) {
                    isTypingRef.current = true;
                    accumulatedDotsRef.current = accumulatedDotsRef.current.map((val, i) => val | msg.dots[i]);
                } else if (msg.keys === 0 && isTypingRef.current) {
                    // All keys released, process the completed chord
                    isTypingRef.current = false;
                    const dots = accumulatedDotsRef.current;
                    // msg.dots maps to [dot1, dot2, dot3, dot7, dot4, dot5, dot6, dot8]
                    const charDots = [dots[0], dots[1], dots[2], dots[4], dots[5], dots[6]]; 
                    
                    const hasCharDots = charDots.some(d => d === 1);
                    const isBackspace = dots[3] === 1; // dot 7
                    const isEnter = dots[7] === 1; // dot 8

                    if (hasCharDots) {
                        let foundChar = null;
                        for (const [char, mapDots] of Object.entries(BRAILLE_MAP)) {
                            // Match 1-character definitions and exclude digits to avoid unwanted number indicators
                            if (char.length === 1 && 
                                !/^[0-9]$/.test(char) &&
                                mapDots[0] === charDots[0] &&
                                mapDots[1] === charDots[1] &&
                                mapDots[2] === charDots[2] &&
                                mapDots[3] === charDots[3] &&
                                mapDots[4] === charDots[4] &&
                                mapDots[5] === charDots[5]
                            ) {
                                foundChar = char;
                                break;
                            }
                        }
                        if (foundChar) {
                            setTypedText(prev => prev + foundChar);
                        } else {
                            // Map any unknown combination directly to a Unicode Braille Character
                            const offset = (charDots[0] << 0) |
                                        (charDots[1] << 1) |
                                        (charDots[2] << 2) |
                                        (charDots[3] << 3) |
                                        (charDots[4] << 4) |
                                        (charDots[5] << 5);
                            const brailleChar = String.fromCharCode(0x2800 + offset);
                            setTypedText(prev => prev + brailleChar);
                        }
                    } else if (isBackspace) {
                        setTypedText(prev => prev.slice(0, -1));
                    } else if (isEnter) {
                        setTypedText(prev => prev + '\n');
                    }

                    // Reset for next chord
                    accumulatedDotsRef.current = [0, 0, 0, 0, 0, 0, 0, 0];
                }

                // Handle spacebar (trigger on release to avoid continuous spaces)
                if (msg.spacebar) {
                    spacebarPressedRef.current = true;
                } else if (!msg.spacebar && spacebarPressedRef.current) {
                    spacebarPressedRef.current = false;
                    setTypedText(prev => prev + ' ');
                }
            }
        };
        
        onKeyMessage(handler);
        return () => { offKeyMessage(handler); };
    }, [onKeyMessage, offKeyMessage]);

    return { typedText, setTypedText, keyState };
}
