"use client";

import { useState, useEffect, use, useRef } from "react";
import { useRouter } from "next/navigation";
import Matrix from "@/components/ui/matrix";
import { Button } from "@/components/ui/button";
import { useESP32 } from "@/hooks/useESP32";
import { cn } from "@/lib/utils";
import { PlayIcon, SquareIcon } from "lucide-react";

type FrameWithMatrix = {
    id: number;
    lectureRecordId: number;
    deltaTime: number;
    createdAt: string;
    pixelMatrix: {
        id: number;
        matrix: any;
        createdAt: string;
        updatedAt: string;
    } | null;
};

type LectureRecordWithFrames = {
    id: number;
    title: string;
    audioPath: string | null;
    audioData: any; // Buffer or base64 string
    createdAt: string;
    updatedAt: string;
    frames: FrameWithMatrix[];
};

function formatRecordDate(createdAt: Date | string): string {
    const date =
        typeof createdAt === "string" ? new Date(createdAt) : createdAt;
    return date.toLocaleDateString("en-US").replace(/\//g, "-");
}

export default function LectureRecordDetailClient({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = use(params);
    const router = useRouter();
    const { setArray } = useESP32();
    const [record, setRecord] = useState<LectureRecordWithFrames | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [editing, setEditing] = useState(false);
    const [title, setTitle] = useState("");
    const [saving, setSaving] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentFrameIndex, setCurrentFrameIndex] = useState(0);

    useEffect(() => {
        const recordId = parseInt(id, 10);
        if (Number.isNaN(recordId)) {
            setError("Invalid record ID");
            setLoading(false);
            return;
        }
        let cancelled = false;
        setLoading(true);
        setError(null);
        fetch(`/api/lecture-records/${id}`)
            .then((res) => {
                if (!res.ok)
                    throw new Error(
                        res.status === 404
                            ? "Record not found"
                            : "Failed to load record",
                    );
                return res.json();
            })
            .then((data: LectureRecordWithFrames) => {
                if (!cancelled) {
                    setRecord(data);
                    setTitle(data.title);
                }
            })
            .catch((err) => {
                if (!cancelled)
                    setError(err.message ?? "Failed to load record");
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [id]);

    // Playback logic
    const isSending = useRef(false);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [audioUrl, setAudioUrl] = useState<string | null>(null);

    // Prepare audio URL
    useEffect(() => {
        if (record?.audioPath) {
            setAudioUrl(record.audioPath);
            return;
        }

        if (record?.audioData) {
            try {
                let bytes: Uint8Array;
                if (typeof record.audioData === "string") {
                    // Base64 string
                    const binaryString = window.atob(record.audioData);
                    const len = binaryString.length;
                    bytes = new Uint8Array(len);
                    for (let i = 0; i < len; i++) {
                        bytes[i] = binaryString.charCodeAt(i);
                    }
                } else if (record.audioData.data) {
                    // Buffer object { type: 'Buffer', data: [...] }
                    bytes = new Uint8Array(record.audioData.data);
                } else {
                    bytes = new Uint8Array(record.audioData);
                }

                const blob = new Blob([bytes], { type: "audio/webm" });
                const url = URL.createObjectURL(blob);
                setAudioUrl(url);
                return () => URL.revokeObjectURL(url);
            } catch (e) {
                console.error("Failed to process audio data", e);
            }
        }
    }, [record]);

    useEffect(() => {
        if (!isPlaying || !record?.frames || record.frames.length === 0) {
            if (!isPlaying && audioRef.current) {
                audioRef.current.pause();
            }
            return;
        }

        // If we have audio, play it
        if (audioUrl && audioRef.current) {
            audioRef.current
                .play()
                .catch((e) => console.error("Audio play failed", e));
        }

        let frameIndex = currentFrameIndex;
        // If audio exists, sync to audio time.
        // If not, use system time.
        const startTime = Date.now() - (record.frames[frameIndex] ? record.frames[frameIndex].deltaTime : 0);
        
        // If we are restarting from end or 0, we should ensure audio is explicitly set to correct time?
        // If currentFrameIndex is 0, audio should be at 0.
        if (frameIndex === 0 && audioRef.current) {
            audioRef.current.currentTime = 0;
        } else if (audioRef.current) {
            // If resuming from middle, ensure audio matches frame time?
            // frame.deltaTime is roughly the audio time.
            const frameTime = record.frames[frameIndex]?.deltaTime || 0;
            if (Math.abs(audioRef.current.currentTime * 1000 - frameTime) > 100) {
                audioRef.current.currentTime = frameTime / 1000;
            }
        }

        let animationId: number;

        const playNextFrame = async () => {
             if (!record.frames) return;

            let elapsed = 0;
            if (audioUrl && audioRef.current) {
                elapsed = audioRef.current.currentTime * 1000;
                if (audioRef.current.ended) {
                     setIsPlaying(false);
                     setCurrentFrameIndex(record.frames.length - 1); // Go to last frame
                     isSending.current = false;
                     return;
                }
            } else {
                elapsed = Date.now() - startTime;
            }

            // Find the frame that should be displayed at this time
            // Optimization: search from current frameIndex
            let nextIndex = frameIndex;
            while (
                nextIndex < record.frames.length - 1 &&
                record.frames[nextIndex + 1].deltaTime <= elapsed
            ) {
                nextIndex++;
            }
            
            frameIndex = nextIndex;

            if (frameIndex < record.frames.length) {
                // Update UI immediately (only if changed to avoid renders?)
                // Actually `setCurrentFrameIndex` causes re-render only if value changes.
                setCurrentFrameIndex(frameIndex);

                const frame = record.frames[frameIndex];

                // Attempt to sync with ESP32 in a fire-and-forget manner
                if (frame.pixelMatrix?.matrix && !isSending.current) {
                    isSending.current = true;
                    setArray(frame.pixelMatrix.matrix as number[][], {
                        cycle: false,
                    })
                        .catch(() => {})
                        .finally(() => {
                            isSending.current = false;
                        });
                }
            }

            if (frameIndex >= record.frames.length - 1 && (!audioUrl || (audioUrl && audioRef.current?.ended))) {
                // If audio is present, we wait for 'ended' event or check logic above.
                // If no audio, stop when last frame reached.
                if (!audioUrl) {
                    setIsPlaying(false);
                    setCurrentFrameIndex(record.frames.length - 1);
                    isSending.current = false;
                } else if (audioRef.current?.ended) {
                     // Handled above.
                } else {
                     animationId = requestAnimationFrame(playNextFrame);
                }
            } else {
                animationId = requestAnimationFrame(playNextFrame);
            }
        };

        animationId = requestAnimationFrame(playNextFrame);

        return () => {
            cancelAnimationFrame(animationId);
            if (audioRef.current) {
                audioRef.current.pause();
            }
        };
    }, [isPlaying, record, audioUrl, setArray]); // Removed currentFrameIndex from deps to avoid restart loop

    // Initial frame logic
    useEffect(() => {
        if (!record?.frames || record.frames.length === 0 || isPlaying) return;
        // Display the first frame or current frame when not playing
        const frame = record.frames[currentFrameIndex];

        if (frame?.pixelMatrix?.matrix && !isSending.current) {
            isSending.current = true;
            setArray(frame.pixelMatrix.matrix as number[][], { cycle: false })
                .catch((err) =>
                    console.warn("Failed to send initial frame:", err),
                )
                .finally(() => {
                    isSending.current = false;
                });
        }
    }, [record, currentFrameIndex, isPlaying, setArray]);

    const handleSave = async () => {
        if (!record) return;
        setSaving(true);
        setError(null);
        try {
            const res = await fetch(`/api/lecture-records/${record.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title: title.trim() }),
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data.error ?? "Failed to update record");
                return;
            }
            // Update local state while keeping frames
            setRecord((prev) =>
                prev ? { ...prev, ...data, frames: prev.frames } : data,
            );
            setEditing(false);
        } catch {
            setError("Failed to update record");
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="space-y-4">
                <div className="h-10 w-48 rounded-md bg-muted animate-pulse" />
                <div className="border rounded-lg p-4 min-h-[200px] bg-muted/30 animate-pulse" />
            </div>
        );
    }

    if (error || !record) {
        return (
            <div className="space-y-4">
                <p className="text-destructive">
                    {error ?? "Record not found"}
                </p>
                <Button
                    variant="outline"
                    onClick={() => router.push("/lecture-records")}
                >
                    Back to records
                </Button>
            </div>
        );
    }

    const currentFrame =
        record.frames && record.frames.length > 0
            ? record.frames[currentFrameIndex]
            : null;
    const matrixData =
        (currentFrame?.pixelMatrix?.matrix as number[][]) ??
        Array(10).fill(Array(15).fill(0));

    return (
        <div className="space-y-4">
            <div className="space-y-2">
                {editing ? (
                    <input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Title"
                        maxLength={255}
                        className={cn(
                            "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-semibold",
                            "ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                        )}
                    />
                ) : (
                    <h2 className="text-2xl font-bold">{record.title}</h2>
                )}
                <audio ref={audioRef} src={audioUrl || undefined} className="hidden" />
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>
                        created at: {formatRecordDate(record.createdAt)}
                    </span>
                    <span>•</span>
                    <span>{record.frames.length} frames</span>
                </div>
            </div>

            <div className="space-y-2">
                <div className="flex justify-end gap-2 mb-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setIsPlaying(!isPlaying)}
                        disabled={!record.frames.length}
                    >
                        {isPlaying ? (
                            <SquareIcon className="size-4 mr-2" />
                        ) : (
                            <PlayIcon className="size-4 mr-2" />
                        )}
                        {isPlaying ? "Stop" : "Play"}
                    </Button>
                </div>
                <div className="border-dashed border rounded-lg p-2 min-h-[200px]">
                    <Matrix
                        key="view"
                        initialData={matrixData}
                        onChange={() => {}}
                        editable={false}
                    />
                </div>
                {/* Progress bar could go here */}
                {currentFrame && (
                    <div className="text-center text-xs text-muted-foreground">
                        Frame: {currentFrameIndex + 1} / {record.frames.length}{" "}
                        (Time: {currentFrame.deltaTime}ms)
                    </div>
                )}
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex gap-2">
                {editing ? (
                    <>
                        <Button onClick={handleSave} disabled={saving}>
                            {saving ? "Saving…" : "Save"}
                        </Button>
                        <Button
                            variant="outline"
                            onClick={() => {
                                setEditing(false);
                                setTitle(record.title);
                            }}
                            disabled={saving}
                        >
                            Cancel
                        </Button>
                    </>
                ) : (
                    <Button variant="outline" onClick={() => setEditing(true)}>
                        Edit Title
                    </Button>
                )}
                <Button
                    variant="ghost"
                    onClick={() => router.push("/lecture-records")}
                >
                    Back to records
                </Button>
            </div>
        </div>
    );
}
