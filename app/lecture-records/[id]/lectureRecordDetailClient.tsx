"use client";

import { useState, useEffect, use, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Matrix from "@/components/ui/matrix";
import { Button } from "@/components/ui/button";
import { useESP32 } from "@/hooks/useESP32";
import { cn } from "@/lib/utils";
import { useModel } from "@/components/providers/model-context";
import { PlayIcon, SquareIcon, MessageSquareIcon, SendIcon, ChevronDownIcon, ChevronUpIcon, Loader2Icon, TriangleAlertIcon, BrainCircuit } from "lucide-react";
import { toast } from "sonner";
import { useAskAI } from '@/hooks/useAskAI';

type FrameWithMatrix = {
    id: string;
    lectureRecordId: string;
    deltaTime: number;
    createdAt: string;
    pixelMatrix: {
        id: string;
        matrix: any;
        createdAt: string;
        updatedAt: string;
    } | null;
};

type LectureRecordWithFrames = {
    id: string;
    title: string;
    deviceModelId: string;
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
    const { setArray, enableLoop } = useESP32();
    const { activeModel, models } = useModel();
    const [record, setRecord] = useState<LectureRecordWithFrames | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [editing, setEditing] = useState(false);
    const [title, setTitle] = useState("");
    const [saving, setSaving] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentFrameIndex, setCurrentFrameIndex] = useState(0);

    // Ask AI state
    type ChatMessage = { role: "user" | "ai"; content: string };
    const [chatOpen, setChatOpen] = useState(false);
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
    const [chatInput, setChatInput] = useState("");
    const [chatLoading, setChatLoading] = useState(false);
    const chatEndRef = useRef<HTMLDivElement>(null);

    const recordRef = useRef<LectureRecordWithFrames | null>(null);
    const currentFrameIndexRef = useRef(0);
    recordRef.current = record;
    currentFrameIndexRef.current = currentFrameIndex;

    // Ask AI Teacher shortcut (Space+F on tablet keyboard)
    const askAI = useAskAI({
        getContext: useCallback(() => {
            const rec = recordRef.current;
            const idx = currentFrameIndexRef.current;
            const frame = rec?.frames[idx];
            const matrix = frame?.pixelMatrix?.matrix as number[][] | undefined;
            return {
                matrix: matrix || null,
                description: `Lecture Record: "${rec?.title || ''}", Frame ${idx + 1} of ${rec?.frames.length || 0}`,
                source: 'Lecture Records',
            };
        }, []),
        enableHardwareKeyboard: true,
    });

    const scrollToBottom = useCallback(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, []);

    useEffect(() => {
        scrollToBottom();
    }, [chatMessages, scrollToBottom]);

    const handleAskAI = async () => {
        const question = chatInput.trim();
        if (!question || chatLoading) return;

        setChatMessages((prev) => [...prev, { role: "user", content: question }]);
        setChatInput("");
        setChatLoading(true);

        try {
            const res = await fetch(`/api/lecture-records/${id}/ask`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ question }),
            });
            const data = await res.json();
            if (!res.ok) {
                setChatMessages((prev) => [
                    ...prev,
                    { role: "ai", content: `Error: ${data.error || "Failed to get answer"}` },
                ]);
            } else {
                setChatMessages((prev) => [
                    ...prev,
                    { role: "ai", content: data.answer },
                ]);
            }
        } catch {
            setChatMessages((prev) => [
                ...prev,
                { role: "ai", content: "Error: Failed to connect to AI service." },
            ]);
        } finally {
            setChatLoading(false);
        }
    };

    useEffect(() => {
        if (!id) {
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
                if (!cancelled) {
                    const msg = err.message ?? "Failed to load record";
                    setError(msg);
                    toast.error(msg);
                }
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

                const blob = new Blob([bytes as BlobPart], { type: "audio/webm" });
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

        enableLoop(true).catch(() => {});

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
            enableLoop(false).catch(() => {});
        };
    }, [isPlaying, record, audioUrl, setArray, enableLoop]); // Removed currentFrameIndex from deps to avoid restart loop

    // Initial frame logic
    useEffect(() => {
        if (!record?.frames || record.frames.length === 0 || isPlaying) return;
        // Display the first frame or current frame when not playing
        const frame = record.frames[currentFrameIndex];

        if (frame?.pixelMatrix?.matrix && !isSending.current) {
            isSending.current = true;
            enableLoop(true).catch(() => {});
            setArray(frame.pixelMatrix.matrix as number[][], { cycle: false })
                .catch((err) =>
                    console.warn("Failed to send initial frame:", err),
                )
                .finally(() => {
                    isSending.current = false;
                });
        }
    }, [record, currentFrameIndex, isPlaying, setArray, enableLoop]);

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
                const msg = data.error ?? "Failed to update record";
                setError(msg);
                toast.error(msg);
                return;
            }
            // Update local state while keeping frames
            setRecord((prev) =>
                prev ? { ...prev, ...data, frames: prev.frames } : data,
            );
            setEditing(false);
        } catch {
            setError("Failed to update record");
            toast.error("Failed to update record");
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

    const isModelMismatch = record?.deviceModelId !== activeModel.id;
    const recordModel = models.find(m => m.id === record?.deviceModelId) || activeModel;

    if (isModelMismatch) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6">
                <div className="bg-destructive/10 p-6 rounded-full border border-destructive/20">
                    <TriangleAlertIcon className="size-16 text-destructive" />
                </div>
                <div className="space-y-2 max-w-md">
                    <h2 className="text-3xl font-bold tracking-tight text-destructive">Model Mismatch</h2>
                    <p className="text-muted-foreground text-lg">
                        This recording was created with <strong>{recordModel.name}</strong> model. 
                        To play it, please change your device model in Settings.
                    </p>
                </div>
                <Button
                    size="lg"
                    onClick={() => router.push("/lecture-records")}
                >
                    Back to records
                </Button>
            </div>
        );
    }

    const currentFrame =
        record.frames.length > 0
            ? record.frames[currentFrameIndex]
            : null;
    const matrixData =
        (currentFrame?.pixelMatrix?.matrix as number[][]) ??
        Array(recordModel.rows).fill(0).map(() => Array(recordModel.cols).fill(-1));

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
                    <Button
                        variant={askAI.isTriggering ? "secondary" : "outline"}
                        size="sm"
                        onClick={askAI.trigger}
                        disabled={askAI.isTriggering || !record.frames.length}
                        title="Ask AI Teacher about this frame (Space+F)"
                    >
                        {askAI.isTriggering ? (
                            <Loader2Icon className="size-4 mr-2 animate-spin" />
                        ) : (
                            <BrainCircuit className="size-4 mr-2" />
                        )}
                        Ask AI
                    </Button>
                </div>
                <div className="border-dashed border rounded-lg p-2 min-h-[200px]">
                    <Matrix
                        key="view"
                        initialData={matrixData}
                        rows={recordModel.rows}
                        cols={recordModel.cols}
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

            {/* Ask AI Section */}
            <div className="border rounded-lg overflow-hidden">
                <button
                    type="button"
                    onClick={() => setChatOpen(!chatOpen)}
                    className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                    <div className="flex items-center gap-2 font-medium text-sm">
                        <MessageSquareIcon className="size-4" />
                        Ask AI about this recording
                    </div>
                    {chatOpen ? (
                        <ChevronUpIcon className="size-4" />
                    ) : (
                        <ChevronDownIcon className="size-4" />
                    )}
                </button>

                {chatOpen && (
                    <div className="border-t">
                        {/* Chat messages */}
                        <div className="max-h-[300px] overflow-y-auto p-4 space-y-3">
                            {chatMessages.length === 0 && (
                                <p className="text-sm text-muted-foreground text-center py-4">
                                    Ask a question about this lecture recording...
                                </p>
                            )}
                            {chatMessages.map((msg, i) => (
                                <div
                                    key={i}
                                    className={cn(
                                        "flex",
                                        msg.role === "user" ? "justify-end" : "justify-start",
                                    )}
                                >
                                    <div
                                        className={cn(
                                            "max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap",
                                            msg.role === "user"
                                                ? "bg-primary text-primary-foreground"
                                                : "bg-muted",
                                        )}
                                    >
                                        {msg.content}
                                    </div>
                                </div>
                            ))}
                            {chatLoading && (
                                <div className="flex justify-start">
                                    <div className="bg-muted rounded-lg px-3 py-2 text-sm flex items-center gap-2">
                                        <Loader2Icon className="size-3 animate-spin" />
                                        Thinking...
                                    </div>
                                </div>
                            )}
                            <div ref={chatEndRef} />
                        </div>

                        {/* Chat input */}
                        <div className="border-t p-3 flex gap-2">
                            <input
                                value={chatInput}
                                onChange={(e) => setChatInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" && !e.shiftKey) {
                                        e.preventDefault();
                                        handleAskAI();
                                    }
                                }}
                                placeholder="Ask a question..."
                                disabled={chatLoading}
                                className={cn(
                                    "flex-1 h-9 rounded-md border border-input bg-background px-3 py-1 text-sm",
                                    "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                    "disabled:cursor-not-allowed disabled:opacity-50",
                                )}
                            />
                            <Button
                                size="sm"
                                onClick={handleAskAI}
                                disabled={chatLoading || !chatInput.trim()}
                            >
                                <SendIcon className="size-4" />
                            </Button>
                        </div>
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
