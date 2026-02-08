"use client";

import { useState, useEffect, useRef } from "react";
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
    // Audio recording state
    const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const [audioBase64, setAudioBase64] = useState<string | null>(null);

    // Initialize MediaRecorder
    useEffect(() => {
        if (typeof window === "undefined") return;
        
        navigator.mediaDevices.getUserMedia({ audio: true })
            .then(stream => {
                const recorder = new MediaRecorder(stream);
                recorder.ondataavailable = (e) => {
                    if (e.data.size > 0) {
                        audioChunksRef.current.push(e.data);
                    }
                };
                setMediaRecorder(recorder);
            })
            .catch(err => {
                console.error("Error accessing microphone:", err);
                setError("Microphone access denied or not available.");
            });
    }, []);

    const getAudioBase64 = (): Promise<string | null> => {
        return new Promise((resolve) => {
            const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
            if (blob.size === 0) {
                resolve(null);
                return;
            }
            const reader = new FileReader();
            reader.readAsDataURL(blob);
            reader.onloadend = () => {
                const base64String = reader.result as string;
                const base64Data = base64String.split(',')[1];
                resolve(base64Data);
            };
            reader.onerror = () => resolve(null);
        });
    };

    const stopRecording = (): Promise<string | null> => {
        return new Promise((resolve) => {
            if (!mediaRecorder || mediaRecorder.state === "inactive") {
                // If already stopped, return what we have in chunks
                // But we need to make sure chunks are processed?
                // If we stopped previously, `audioBase64` state should hold it if we set it.
                // But here we rely on chunks ref. 
                // Let's just process chunks ref.
                getAudioBase64().then(resolve);
                return;
            }

            mediaRecorder.onstop = () => {
                getAudioBase64().then(data => {
                    setAudioBase64(data); // Sync state for UI
                    resolve(data);
                });
            };
            mediaRecorder.stop();
        });
    };

    // Recording state
    const [isRecording, setIsRecording] = useState(false);
    const [recordingStartTime, setRecordingStartTime] = useState<number>(0);

    const handleStartRecording = () => {
        setIsRecording(true);
        if (frames.length > 0 && confirm("Clear existing frames to start new recording?")) {
            setFrames([]);
            audioChunksRef.current = [];
            setAudioBase64(null);
        } else if (frames.length === 0) {
             audioChunksRef.current = [];
             setAudioBase64(null);
        }
        
        if (mediaRecorder && mediaRecorder.state === "inactive") {
            mediaRecorder.start();
        }

        setRecordingStartTime(Date.now());
        setFrames([{ matrix: currentMatrix, deltaTime: 0 }]);
    };

    const handleStopRecording = async () => {
        setIsRecording(false);
        await stopRecording();
    };

    const handleMatrixChange = (newMatrix: number[][]) => {
        setCurrentMatrix(newMatrix);
        
        // ... (rest of logic same) ...
        let activeRecording = isRecording;
        let activeStartTime = recordingStartTime;

        if (!isRecording && frames.length === 0) {
            setIsRecording(true);
            activeRecording = true;
            const now = Date.now();
            setRecordingStartTime(now);
            activeStartTime = now;
            setFrames([{ matrix: currentMatrix, deltaTime: 0 }]);
            
            // Start audio recording
            if (mediaRecorder && mediaRecorder.state === "inactive") {
                audioChunksRef.current = []; // Clear previous chunks
                setAudioBase64(null);
                mediaRecorder.start();
            }
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
        
        // Ensure recording is stopped and data is captured
        let finalAudioData = audioBase64;
        if (isRecording) {
             setIsRecording(false);
             finalAudioData = await stopRecording();
        } else if (!finalAudioData && audioChunksRef.current.length > 0) {
             // If stopped but state not updated (rare), or if we jus rely on chunks
             finalAudioData = await getAudioBase64();
        }

        if (frames.length === 0) {
            const initialFrame = { matrix: currentMatrix, deltaTime: 0 };
            setFrames([initialFrame]);
        }

        const framesToSave = frames.length > 0 ? frames : [{ matrix: currentMatrix, deltaTime: 0 }];

        setIsSubmitting(true);
        try {
            const body = {
                title: title.trim(),
                frames: framesToSave,
                audioData: finalAudioData // Use the captured data
            };
            
            console.log("Submitting record with audio length:", finalAudioData?.length);

            const res = await fetch("/api/lecture-records", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data.error ?? "Failed to create record");
                return;
            }
            router.push(`/lecture-records/${data.id}`);
        } catch (err) {
             console.error(err);
            setError("Failed to create record");
        } finally {
            setIsSubmitting(false);
        }
    };

    const clearFrames = () => {
        if (confirm("Are you sure you want to clear all recorded frames?")) {
            setFrames([]);
            audioChunksRef.current = [];
            setAudioBase64(null);
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
