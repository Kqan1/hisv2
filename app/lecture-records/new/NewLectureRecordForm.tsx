"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Matrix from "@/components/ui/matrix";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SquareIcon, XIcon } from "lucide-react";
import { useESP32 } from "@/hooks/useESP32";

type FrameData = {
    matrix: number[][];
    deltaTime: number;
};

const EMPTY_MATRIX = Array(10)
    .fill(0)
    .map(() => Array(15).fill(0));

export function NewLectureRecordForm() {
    const router = useRouter();
    const { setArray } = useESP32();
    const [title, setTitle] = useState("");
    const [currentMatrix, setCurrentMatrix] =
        useState<number[][]>(EMPTY_MATRIX);
    const [frames, setFrames] = useState<FrameData[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // Recording state
    const [isRecording, setIsRecording] = useState(false);
    const [recordingStartTime, setRecordingStartTime] = useState<number>(0);

    const handleStartRecording = () => {
        setIsRecording(true);
        if (
            frames.length > 0 &&
            confirm("Clear existing frames to start new recording?")
        ) {
            setFrames([]);
        }
        setRecordingStartTime(Date.now());
        setFrames([{ matrix: currentMatrix, deltaTime: 0 }]);
    };

    const handleStopRecording = () => {
        setIsRecording(false);
    };

    const handleMatrixChange = (newMatrix: number[][]) => {
        setCurrentMatrix(newMatrix);

        let activeRecording = isRecording;
        let activeStartTime = recordingStartTime;

        if (!isRecording && frames.length === 0) {
            setIsRecording(true);
            activeRecording = true;
            const now = Date.now();
            setRecordingStartTime(now);
            activeStartTime = now;
            setFrames([{ matrix: currentMatrix, deltaTime: 0 }]);
        }

        if (activeRecording) {
            const now = Date.now();
            const deltaTime = now - activeStartTime;
            setFrames((prev) => [...prev, { matrix: newMatrix, deltaTime }]);
            setArray(newMatrix, { cycle: false }).catch(() => {});
        } else {
            setArray(newMatrix, { cycle: false }).catch(() => {});
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        if (!title.trim()) {
            setError("Title is required");
            return;
        }
        if (frames.length === 0) {
            // Allow saving with just one frame (current state) if frames is empty?
            // Or force adding at least one?
            // Let's add the current state as the first frame if empty
            const initialFrame = { matrix: currentMatrix, deltaTime: 0 };
            setFrames([initialFrame]);
            // We can't use the state updater directly here effectively for the next lines,
            // so we'll use a local var
        }

        const framesToSave =
            frames.length > 0
                ? frames
                : [{ matrix: currentMatrix, deltaTime: 0 }];

        setIsSubmitting(true);
        try {
            const res = await fetch("/api/lecture-records", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: title.trim(),
                    frames: framesToSave,
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data.error ?? "Failed to create record");
                return;
            }
            router.push(`/lecture-records/${data.id}`);
        } catch {
            setError("Failed to create record");
        } finally {
            setIsSubmitting(false);
        }
    };

    const clearFrames = () => {
        if (confirm("Are you sure you want to clear all recorded frames?")) {
            setFrames([]);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
                <label htmlFor="title" className="text-sm font-medium">
                    Title
                </label>
                <input
                    id="title"
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Record title"
                    maxLength={255}
                    className={cn(
                        "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background",
                        "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                        "disabled:cursor-not-allowed disabled:opacity-50",
                    )}
                />
            </div>

            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">
                        Frames ({frames.length})
                        {isRecording && (
                            <span className="ml-2 text-red-500 animate-pulse">
                                ● Recording...
                            </span>
                        )}
                    </label>
                    <div className="flex gap-2">
                        <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            onClick={clearFrames}
                            disabled={frames.length === 0 || isRecording}
                        >
                            <XIcon className="size-4 mr-2" />
                            Clear
                        </Button>
                    </div>
                </div>

                <div className="border rounded-lg p-2 min-h-[300px] flex flex-col gap-4">
                    <div className="flex justify-center">
                        <Matrix
                            key="editing"
                            initialData={currentMatrix}
                            onChange={(m) => handleMatrixChange(m)}
                            editable={true}
                        />
                    </div>

                    <div className="flex justify-center gap-4">
                        {!isRecording ? (
                            <Button
                                type="button"
                                onClick={handleStartRecording}
                                variant="secondary"
                                className="w-48"
                            >
                                <div className="size-3 rounded-full bg-red-500 mr-2" />
                                Start Recording
                            </Button>
                        ) : (
                            <Button
                                type="button"
                                onClick={handleStopRecording}
                                variant="destructive"
                                className="w-48 animate-pulse"
                            >
                                <SquareIcon className="size-3 mr-2" />
                                Stop Recording
                            </Button>
                        )}
                    </div>
                </div>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex gap-2">
                <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? "Creating…" : "Create Record"}
                </Button>
                <Button
                    type="button"
                    variant="outline"
                    onClick={() => router.push("/lecture-records")}
                    disabled={isSubmitting}
                >
                    Cancel
                </Button>
            </div>
        </form>
    );
}
