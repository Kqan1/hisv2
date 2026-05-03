'use client';

import { useState, useEffect, use, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Matrix from '@/components/ui/matrix';
import { Button } from '@/components/ui/button';
import { Heading } from '@/components/ui/heading';
import { useESP32 } from '@/hooks/useESP32';
import { useModel } from '@/components/providers/model-context';
import { ESP32_CONFIG } from '@/lib/config';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
    FileText,
    ChevronLeft,
    ChevronRight,
    MonitorUp,
    TriangleAlertIcon,
    Keyboard,
    Volume2,
    VolumeX,
    Loader2,
    BrainCircuit,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { PdfConversion } from '@/lib/pdf-store';
import { useTTS, createTTSComboTracker } from '@/hooks/useTTS';
import { useAskAI, createAskAIComboTracker } from '@/hooks/useAskAI';

export default function PdfDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();
    const { setArray, enableLoop } = useESP32();
    const { activeModel, models } = useModel();
    const [conversion, setConversion] = useState<PdfConversion | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activePageIndex, setActivePageIndex] = useState(0);
    const [isDisplaying, setIsDisplaying] = useState(false);
    const [keyboardConnected, setKeyboardConnected] = useState(false);
    const keyWsRef = useRef<WebSocket | null>(null);
    const prevKeysRef = useRef<number>(0);
    const conversionRef = useRef<PdfConversion | null>(null);
    const activePageIndexRef = useRef(0);

    // Keep refs in sync for the TTS getText callback
    conversionRef.current = conversion;
    activePageIndexRef.current = activePageIndex;

    // TTS hook — hardware keyboard combo handled in our own WS handler below
    const tts = useTTS({
        getText: useCallback(() => {
            const conv = conversionRef.current;
            const idx = activePageIndexRef.current;
            if (!conv || !conv.pages[idx]) return null;
            return conv.pages[idx].textContent || conv.pages[idx].label || null;
        }, []),
        enableHardwareKeyboard: false, // we detect Space+A in our existing WS below
    });
    const ttsToggleRef = useRef(tts.toggle);
    ttsToggleRef.current = tts.toggle;
    const ttsComboRef = useRef(createTTSComboTracker());

    // Ask AI hook — hardware keyboard combo handled in our own WS handler below
    const askAI = useAskAI({
        getContext: useCallback(() => {
            const conv = conversionRef.current;
            const idx = activePageIndexRef.current;
            const page = conv?.pages[idx];
            return {
                matrix: page?.matrix || null,
                description: page?.textContent || page?.label || null,
                source: 'PDF to Braille',
            };
        }, []),
        enableHardwareKeyboard: false,
    });
    const askAITriggerRef = useRef(askAI.trigger);
    askAITriggerRef.current = askAI.trigger;
    const askAIComboRef = useRef(createAskAIComboTracker());

    // Fetch conversion data
    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);

        fetch(`/api/pdf/conversions/${id}`)
            .then((res) => {
                if (!res.ok) throw new Error(res.status === 404 ? 'Conversion not found' : 'Failed to load');
                return res.json();
            })
            .then((data: PdfConversion) => {
                if (!cancelled) {
                    setConversion(data);
                }
            })
            .catch((err) => {
                if (!cancelled) {
                    setError(err.message);
                    toast.error(err.message);
                }
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => { cancelled = true; };
    }, [id]);

    // Stop TTS when page changes — instant cut so next page is ready
    useEffect(() => {
        tts.stop();
    }, [activePageIndex]); // eslint-disable-line react-hooks/exhaustive-deps

    // Keyboard WebSocket for A/S navigation (port 81)
    const connectKeyboard = useCallback(() => {
        if (keyWsRef.current?.readyState === WebSocket.OPEN) return;

        const esp32Ip = ESP32_CONFIG.ip;
        try {
            const ws = new WebSocket(`ws://${esp32Ip}:81/`);
            ws.onopen = () => setKeyboardConnected(true);
            ws.onclose = () => setKeyboardConnected(false);
            ws.onerror = () => setKeyboardConnected(false);
            ws.onmessage = (e) => {
                try {
                    const msg = JSON.parse(e.data);
                    if (msg.type === 'keystate') {
                        const keys = msg.keys as number;
                        const prevKeys = prevKeysRef.current;
                        const spacebar = Boolean(msg.spacebar);

                        // TTS combo detection: Space+A
                        if (ttsComboRef.current.process(msg)) {
                            ttsToggleRef.current();
                        }

                        // Ask AI combo detection: Space+F
                        if (askAIComboRef.current.process(msg)) {
                            askAITriggerRef.current();
                        }

                        // A/S page navigation (only when Space is NOT held)
                        if (!spacebar) {
                            const aPressed = (keys & 1) && !(prevKeys & 1);
                            const sPressed = (keys & 2) && !(prevKeys & 2);

                            if (aPressed) {
                                setActivePageIndex(prev => Math.max(0, prev - 1));
                            }
                            if (sPressed) {
                                setActivePageIndex(prev => {
                                    if (!conversion) return prev;
                                    return Math.min(conversion.pages.length - 1, prev + 1);
                                });
                            }
                        }

                        prevKeysRef.current = keys;
                    }
                } catch { /* ignore */ }
            };
            keyWsRef.current = ws;
        } catch {
            setKeyboardConnected(false);
        }
    }, [conversion]);

    // Also listen for browser keyboard A/S as fallback
    useEffect(() => {
        const handleKeyDown = (e: globalThis.KeyboardEvent) => {
            if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') {
                e.preventDefault();
                setActivePageIndex(prev => Math.max(0, prev - 1));
            } else if (e.key === 's' || e.key === 'S' || e.key === 'ArrowRight') {
                e.preventDefault();
                if (!conversion) return;
                setActivePageIndex(prev => Math.min(conversion.pages.length - 1, prev + 1));
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [conversion]);

    // Cleanup WebSocket on unmount
    useEffect(() => {
        return () => {
            keyWsRef.current?.close();
        };
    }, []);

    // Auto-sync to ESP32 when display is toggled on
    useEffect(() => {
        if (!isDisplaying || !conversion) return;
        const page = conversion.pages[activePageIndex];
        if (!page?.matrix) return;
        setArray(page.matrix, { cycle: true });
    }, [activePageIndex, isDisplaying, conversion, setArray]);

    // Display toggle handler
    const handleDisplayToggle = async () => {
        if (isDisplaying) {
            setIsDisplaying(false);
            try {
                const emptyMatrix = Array.from({ length: activeModel.rows }, () =>
                    Array(activeModel.cols).fill(-1)
                );
                await enableLoop(true);
                await setArray(emptyMatrix, { cycle: false });
                setTimeout(() => {
                    enableLoop(false).catch(() => {});
                }, 1000);
                toast.success("Display turned off");
            } catch {
                toast.error("Failed to turn off display");
            }
        } else {
            if (!conversion) return;
            const page = conversion.pages[activePageIndex];
            if (!page?.matrix) return;

            setIsDisplaying(true);
            try {
                await enableLoop(true);
                await setArray(page.matrix, { cycle: false });
                toast.success("Sent to tablet!");
            } catch {
                setIsDisplaying(false);
                toast.error("Failed to send to tablet");
            }
        }
    };

    // Loading state
    if (loading) {
        return (
            <div className="space-y-4">
                <Heading
                    title="PDF to Matrix"
                    description="Loading..."
                    Icon={<FileText className="size-8 text-primary" />}
                    hideBackButton={true}
                />
                <div className="h-10 w-48 rounded-md bg-muted animate-pulse" />
                <div className="border rounded-lg p-4 min-h-[200px] bg-muted/30 animate-pulse" />
            </div>
        );
    }

    // Error state
    if (error || !conversion) {
        return (
            <div className="space-y-4">
                <Heading
                    title="PDF to Matrix"
                    description="Error"
                    Icon={<FileText className="size-8 text-primary" />}
                    hideBackButton={true}
                />
                <p className="text-destructive">{error ?? 'Conversion not found'}</p>
                <Button variant="outline" onClick={() => router.push('/pdf')}>
                    Back to conversions
                </Button>
            </div>
        );
    }

    // Model mismatch
    const isModelMismatch = conversion.deviceModelId !== activeModel.id;
    const recordModel = models.find(m => m.id === conversion.deviceModelId) || activeModel;

    if (isModelMismatch) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6">
                <div className="bg-destructive/10 p-6 rounded-full border border-destructive/20">
                    <TriangleAlertIcon className="size-16 text-destructive" />
                </div>
                <div className="space-y-2 max-w-md">
                    <h2 className="text-3xl font-bold tracking-tight text-destructive">Model Mismatch</h2>
                    <p className="text-muted-foreground text-lg">
                        This conversion was created with <strong>{recordModel.name}</strong> model.
                        To view it, please change your device model in Settings.
                    </p>
                </div>
                <Button size="lg" onClick={() => router.push("/pdf")}>
                    Back to conversions
                </Button>
            </div>
        );
    }

    const currentPage = conversion.pages[activePageIndex];
    const totalPages = conversion.pages.length;

    return (
        <div className="space-y-4">
            <Heading
                title="PDF to Matrix"
                description={conversion.title}
                Icon={<FileText className="size-8 text-primary" />}
                hideBackButton={true}
            />

            {/* Toolbar */}
            <div className="border rounded-lg p-1 flex flex-wrap items-center justify-between gap-1 h-10.5">
                <div className="flex items-center gap-1">
                    <Button
                        variant="outline"
                        size="icon-sm"
                        onClick={() => router.push('/pdf')}
                        title="All conversions"
                    >
                        <ChevronLeft size={16} />
                    </Button>
                </div>
                <div className="flex items-center gap-1">
                    <Button
                        size="icon-sm"
                        variant={isDisplaying ? "secondary" : "default"}
                        onClick={handleDisplayToggle}
                        title={isDisplaying ? "Hide display" : "Send to display"}
                    >
                        <MonitorUp size={16} />
                    </Button>
                    <Button
                        size="icon-sm"
                        variant={tts.status === 'playing' || tts.status === 'loading' ? "secondary" : "outline"}
                        onClick={tts.toggle}
                        disabled={!currentPage?.textContent && !currentPage?.label}
                        title={tts.status === 'playing' ? 'Stop reading (Space+A)' : 'Read aloud (Space+A)'}
                    >
                        {tts.status === 'loading' ? (
                            <Loader2 size={16} className="animate-spin" />
                        ) : tts.status === 'playing' ? (
                            <VolumeX size={16} />
                        ) : (
                            <Volume2 size={16} />
                        )}
                    </Button>
                    <Button
                        size="icon-sm"
                        variant={askAI.isTriggering ? "secondary" : "outline"}
                        onClick={askAI.trigger}
                        disabled={askAI.isTriggering}
                        title="Ask AI Teacher (Space+F)"
                    >
                        {askAI.isTriggering ? (
                            <Loader2 size={16} className="animate-spin" />
                        ) : (
                            <BrainCircuit size={16} />
                        )}
                    </Button>
                    <Button
                        size="icon-sm"
                        variant={keyboardConnected ? "secondary" : "outline"}
                        onClick={keyboardConnected ? () => { keyWsRef.current?.close(); } : connectKeyboard}
                        title={keyboardConnected ? "Keyboard connected" : "Connect keyboard"}
                    >
                        <Keyboard size={16} />
                    </Button>
                </div>
            </div>

            {/* Page navigator — compact for many pages */}
            <div className="flex items-center justify-between bg-muted/30 p-2 rounded-xl border border-border/50">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setActivePageIndex(prev => Math.max(0, prev - 1))}
                        disabled={activePageIndex === 0}
                        className="shrink-0"
                    >
                        <ChevronLeft className="size-5" />
                    </Button>

                    {/* Slider-style page selector for many pages */}
                    {totalPages <= 10 ? (
                        <div className="flex items-center gap-1 flex-wrap justify-center flex-1 min-w-0">
                            {conversion.pages.map((_, i) => (
                                <button
                                    key={i}
                                    onClick={() => setActivePageIndex(i)}
                                    className={cn(
                                        "size-7 rounded-md text-xs font-bold transition-all flex items-center justify-center shrink-0",
                                        activePageIndex === i
                                            ? "bg-primary text-primary-foreground shadow-md"
                                            : "bg-background text-muted-foreground hover:bg-muted"
                                    )}
                                >
                                    {i + 1}
                                </button>
                            ))}
                        </div>
                    ) : (
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                            <input
                                type="range"
                                min={0}
                                max={totalPages - 1}
                                value={activePageIndex}
                                onChange={e => setActivePageIndex(parseInt(e.target.value))}
                                className="flex-1 min-w-0 h-2 accent-primary cursor-pointer"
                            />
                        </div>
                    )}

                    <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setActivePageIndex(prev => Math.min(totalPages - 1, prev + 1))}
                        disabled={activePageIndex === totalPages - 1}
                        className="shrink-0"
                    >
                        <ChevronRight className="size-5" />
                    </Button>
                </div>
                <div className="text-sm text-muted-foreground font-mono shrink-0 ml-2 tabular-nums">
                    {activePageIndex + 1}/{totalPages}
                </div>
            </div>

            {/* Page type badge + label */}
            {currentPage && (
                <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={
                        currentPage.type === 'braille' ? 'default' :
                        currentPage.type === 'image' ? 'secondary' :
                        'outline'
                    }>
                        {currentPage.type === 'braille' ? '⠿ Braille' :
                         currentPage.type === 'image' ? '🖼 Image' :
                         '📝 Summary'}
                    </Badge>
                    {currentPage.label && (
                        <span className="text-sm text-muted-foreground">{currentPage.label}</span>
                    )}
                </div>
            )}

            {/* Matrix display */}
            <div className="relative group w-full">
                <div className="absolute inset-0 bg-primary/5 rounded-2xl -m-2 -z-10 group-hover:bg-primary/10 transition-colors" />
                <div className="bg-background border rounded-2xl p-4 shadow-xl ring-1 ring-border/50 overflow-x-auto w-full">
                    <div className="w-full max-w-2xl mx-auto min-w-[280px]">
                        <Matrix
                            key={activePageIndex}
                            initialData={currentPage?.matrix}
                            rows={recordModel.rows}
                            cols={recordModel.cols}
                            editable={false}
                        />
                    </div>
                </div>
            </div>

            {/* Text content readback */}
            {currentPage?.textContent && (
                <div className="border rounded-xl bg-muted/20 p-4 space-y-2">
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            {currentPage.type === 'image' ? 'Image Description' : 'Text Content'}
                        </span>
                    </div>
                    <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap">
                        {currentPage.textContent}
                    </p>
                </div>
            )}

            {/* Keyboard hint */}
            <p className="text-xs text-muted-foreground text-center">
                Use <kbd className="px-1.5 py-0.5 rounded border bg-muted text-[10px] font-mono">A</kbd> / <kbd className="px-1.5 py-0.5 rounded border bg-muted text-[10px] font-mono">←</kbd> and <kbd className="px-1.5 py-0.5 rounded border bg-muted text-[10px] font-mono">S</kbd> / <kbd className="px-1.5 py-0.5 rounded border bg-muted text-[10px] font-mono">→</kbd> to navigate pages
            </p>
        </div>
    );
}
