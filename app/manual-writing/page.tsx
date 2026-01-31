'use client';

import { Heading } from "@/components/ui/heading";
import Matrix from "@/components/ui/matrix";
import { useESP32 } from "@/hooks/useESP32";
import { PencilLine } from "lucide-react";
import { useRef } from "react";

export default function ManualWriting() {
    const { setArray } = useESP32();
    const MatrixTimerRef = useRef<NodeJS.Timeout | null>(null);

    const handleAutoSave = (data: number[][]) => {
        if (MatrixTimerRef.current) clearTimeout(MatrixTimerRef.current);

        MatrixTimerRef.current = setTimeout(async () => {
            setArray(data, { cycle: true });
            console.log("Manual writing sended:", data);
        }, 1000);
    };

    return (
        <div className="space-y-4">
            <Heading title="Manual Writing" description="You can write your own patterns here" Icon={<PencilLine size={42} />} />
            <div className="border-dashed border rounded p-2 mt-12">
                <Matrix onChange={handleAutoSave} />
            </div>
        </div>
    )
};