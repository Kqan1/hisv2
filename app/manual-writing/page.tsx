'use client';

import { Heading } from "@/components/ui/heading";
import Matrix from "@/components/ui/matrix";
import { useESP32 } from "@/hooks/useESP32";
import { PencilLine, Repeat, Keyboard } from "lucide-react";
import { useRef, useState, useEffect, useCallback } from "react";
import { Toggle } from "@/components/ui/toggle";
import { useModel } from "@/components/providers/model-context";
import { BRAILLE_MAP, CELL_WIDTH, CELL_HEIGHT } from "@/lib/braille";
import { getESP32Service } from "@/services/esp32.service";
import { toast } from "sonner";

export default function ManualWriting() {
    const { setArray, enableLoop } = useESP32();
    const { activeModel } = useModel();
    const MatrixTimerRef = useRef<NodeJS.Timeout | null>(null);
    const [autoLoop, setAutoLoop] = useState(true);
    const lastDataRef = useRef<number[][] | null>(null);

    // Braille typing state
    const [brailleTyping, setBrailleTyping] = useState(false);
    const brailleTypingRef = useRef(false);
    brailleTypingRef.current = brailleTyping;
    const brailleCursorRef = useRef({ col: 0, line: 0 });
    const [matrixData, setMatrixData] = useState<number[][]>(
        () => Array.from({ length: activeModel.rows }, () => Array(activeModel.cols).fill(-1))
    );
    const matrixDataRef = useRef<number[][]>(matrixData);
    matrixDataRef.current = matrixData;

    const CHAR_GAP = 1;
    const LINE_GAP = 1;
    const charStep = CELL_WIDTH + CHAR_GAP;
    const lineStep = CELL_HEIGHT + LINE_GAP;

    const handleAutoSave = useCallback((data: number[][]) => {
        lastDataRef.current = data;
        matrixDataRef.current = data;
        setMatrixData(data);

        // Reset braille cursor if matrix was cleared
        if (brailleTypingRef.current && data.every(row => row.every(cell => cell === -1))) {
            brailleCursorRef.current = { col: 0, line: 0 };
        }

        if (MatrixTimerRef.current) clearTimeout(MatrixTimerRef.current);

        MatrixTimerRef.current = setTimeout(async () => {
            setArray(data);
        }, 1000);
    }, [setArray]);

    useEffect(() => {
        enableLoop(autoLoop);
    }, [autoLoop, enableLoop]);

    // Braille typing handler
    useEffect(() => {
        if (!brailleTyping) return;
        const service = getESP32Service();

        const maxCharsPerLine = Math.floor((activeModel.cols + CHAR_GAP) / charStep);
        const maxLinesPerPage = Math.floor((activeModel.rows + LINE_GAP) / lineStep);

        const handler = (msg: any) => {
            if (msg.type !== 'letter' || !msg.letter) return;
            if (!brailleTypingRef.current) return;
            if (service.navActive || document.body.hasAttribute('data-tablet-nav')) return;

            const current = matrixDataRef.current;
            if (!current) return;

            const cursor = brailleCursorRef.current;
            const letter = msg.letter.toLowerCase();

            // Handle backspace
            if (letter === '\b' || letter === 'backspace') {
                if (cursor.col > 0) {
                    cursor.col--;
                } else if (cursor.line > 0) {
                    cursor.line--;
                    cursor.col = maxCharsPerLine - 1;
                } else {
                    return;
                }
                const newMatrix = current.map(r => [...r]);
                const pixelCol = cursor.col * charStep;
                const pixelRow = cursor.line * lineStep;
                for (let dr = 0; dr < CELL_HEIGHT; dr++) {
                    for (let dc = 0; dc < CELL_WIDTH; dc++) {
                        const r = pixelRow + dr;
                        const c = pixelCol + dc;
                        if (r < activeModel.rows && c < activeModel.cols) {
                            newMatrix[r][c] = -1;
                        }
                    }
                }
                handleAutoSave(newMatrix);
                return;
            }

            // Handle space
            if (letter === ' ' || letter === 'space') {
                cursor.col++;
                if (cursor.col >= maxCharsPerLine) {
                    cursor.col = 0;
                    cursor.line++;
                    if (cursor.line >= maxLinesPerPage) cursor.line = maxLinesPerPage - 1;
                }
                return;
            }

            // Handle enter
            if (letter === '\n' || letter === 'enter') {
                cursor.col = 0;
                cursor.line++;
                if (cursor.line >= maxLinesPerPage) cursor.line = maxLinesPerPage - 1;
                return;
            }

            // Look up braille dots
            const dots = BRAILLE_MAP[letter];
            if (!dots) return;

            // Wrap if needed
            if (cursor.col >= maxCharsPerLine) {
                cursor.col = 0;
                cursor.line++;
                if (cursor.line >= maxLinesPerPage) return;
            }

            // Stamp braille cell
            const newMatrix = current.map(r => [...r]);
            const pixelCol = cursor.col * charStep;
            const pixelRow = cursor.line * lineStep;
            const positions = [
                [pixelRow + 0, pixelCol + 0, dots[0]],
                [pixelRow + 1, pixelCol + 0, dots[1]],
                [pixelRow + 2, pixelCol + 0, dots[2]],
                [pixelRow + 0, pixelCol + 1, dots[3]],
                [pixelRow + 1, pixelCol + 1, dots[4]],
                [pixelRow + 2, pixelCol + 1, dots[5]],
            ];
            for (const [r, c, val] of positions) {
                if (r < activeModel.rows && c < activeModel.cols) {
                    newMatrix[r][c] = val === 1 ? 1 : -1;
                }
            }
            handleAutoSave(newMatrix);
            cursor.col++;
        };

        const unsub = service.onLetterMessage(handler);
        return () => unsub();
    }, [brailleTyping, activeModel.rows, activeModel.cols, charStep, lineStep, handleAutoSave]);

    return (
        <div className="space-y-4">
            <Heading title="Manual Writing" description="You can write your own patterns here" Icon={<PencilLine size={42} />} />
            <div className="flex justify-end gap-2">
                <Toggle
                    pressed={brailleTyping}
                    onPressedChange={(next) => {
                        setBrailleTyping(next);
                        if (next) {
                            brailleCursorRef.current = { col: 0, line: 0 };
                            toast.success('Braille typing ON — type on tablet keyboard');
                        } else {
                            toast.success('Braille typing OFF');
                        }
                    }}
                    variant="outline"
                    className="gap-2"
                    aria-label={brailleTyping ? 'Disable braille typing' : 'Enable braille typing'}
                >
                    <Keyboard size={16} className={brailleTyping ? "text-green-500" : "text-muted-foreground"} />
                    Braille: {brailleTyping ? "On" : "Off"}
                </Toggle>
                <Toggle 
                    pressed={autoLoop} 
                    onPressedChange={setAutoLoop} 
                    variant="outline" 
                    className="gap-2"
                >
                    <Repeat size={16} className={autoLoop ? "text-green-500" : "text-muted-foreground"} />
                    Auto Loop: {autoLoop ? "On" : "Off"}
                </Toggle>
            </div>
            <div className="border-dashed border rounded p-2">
                <Matrix
                    key={brailleTyping ? 'braille' : 'draw'}
                    initialData={matrixData}
                    onChange={handleAutoSave}
                    editable
                />
            </div>
        </div>
    )
};