'use client';

import { Heading } from "@/components/ui/heading";
import { BrailleKeyboardState } from "@/components/ui/braille-keyboard-state";
import Matrix from "@/components/ui/matrix";
import { useESP32 } from "@/hooks/useESP32";
import { useBrailleKeyboard } from "@/hooks/useBrailleKeyboard";
import { useModel } from "@/components/providers/model-context";
import { PencilLine } from "lucide-react";
import { useRef, useState, useEffect } from "react";
import { textToBraillePages } from "@/lib/braille";

export default function ManualWriting() {
    const { setArray, enableLoop } = useESP32();
    const { activeModel } = useModel();
    const MatrixTimerRef = useRef<NodeJS.Timeout | null>(null);
    const lastDataRef = useRef<number[][] | null>(null);
    const [matrixData, setMatrixData] = useState<number[][]>();

    const { typedText, setTypedText, keyState } = useBrailleKeyboard();

    const handleAutoSave = (data: number[][]) => {
        lastDataRef.current = data;
        if (MatrixTimerRef.current) clearTimeout(MatrixTimerRef.current);

        MatrixTimerRef.current = setTimeout(async () => {
            setArray(data);
            console.log("Manual writing sended:", data);
        }, 1000);
    };

    useEffect(() => {
        enableLoop(true);
    }, [enableLoop]);

    const isManualEditRef = useRef(false);

    useEffect(() => {
        if (typedText) {
            const pages = textToBraillePages(typedText, activeModel.rows, activeModel.cols);
            if (pages.length > 0) {
                const currentPage = pages[pages.length - 1]; // get the last page
                setMatrixData(currentPage);
                handleAutoSave(currentPage);
            }
        } else {
            if (isManualEditRef.current) {
                isManualEditRef.current = false;
                return;
            }
            // When text is fully cleared (e.g., deleting the first/last character), clear the matrix too
            const emptyPage = Array(activeModel.rows).fill(0).map(() => Array(activeModel.cols).fill(-1));
            setMatrixData(emptyPage);
            handleAutoSave(emptyPage);
        }
    }, [typedText, activeModel]);

    const handleMatrixChange = (data: number[][]) => {
        // If user manually draws or clears, we reset the typed text so it doesn't overwrite unexpectedly later
        isManualEditRef.current = true;
        setTypedText("");
        handleAutoSave(data);
    };

    return (
        <div className="space-y-4">
            <Heading title="Manual Writing" description="You can write your own patterns or use your keyboard here" Icon={<PencilLine size={42} />} />
            
            <BrailleKeyboardState 
                typedText={typedText} 
                keyState={keyState} 
                onClearText={() => setTypedText("")} 
            />

            <div className="border-dashed border rounded p-2 mt-4">
                <Matrix initialData={matrixData} onChange={handleMatrixChange} />
            </div>
        </div>
    )
};