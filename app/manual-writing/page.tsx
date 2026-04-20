'use client';

import { Heading } from "@/components/ui/heading";
import Matrix from "@/components/ui/matrix";
import { useESP32 } from "@/hooks/useESP32";
import { PencilLine, Repeat } from "lucide-react";
import { useRef, useState, useEffect } from "react";
import { Toggle } from "@/components/ui/toggle";

export default function ManualWriting() {
    const { setArray, enableLoop } = useESP32();
    const MatrixTimerRef = useRef<NodeJS.Timeout | null>(null);
    const [autoLoop, setAutoLoop] = useState(true);
    const lastDataRef = useRef<number[][] | null>(null);

    const handleAutoSave = (data: number[][]) => {
        lastDataRef.current = data;
        if (MatrixTimerRef.current) clearTimeout(MatrixTimerRef.current);

        MatrixTimerRef.current = setTimeout(async () => {
            setArray(data);
            console.log("Manual writing sended:", data);
        }, 1000);
    };

    useEffect(() => {
        enableLoop(autoLoop);
    }, [autoLoop, enableLoop]);

    return (
        <div className="space-y-4">
            <Heading title="Manual Writing" description="You can write your own patterns here" Icon={<PencilLine size={42} />} />
            <div className="flex justify-end">
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
                <Matrix onChange={handleAutoSave} />
            </div>
        </div>
    )
};