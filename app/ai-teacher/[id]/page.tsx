'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Heading } from '@/components/ui/heading';
import { Input } from '@/components/ui/input';
import { BrainCircuit, Send, Loader2, PlusIcon, ChevronLeft, ChevronRight, TrashIcon, Volume2, VolumeX, Image, Type as TypeIcon, Monitor } from 'lucide-react'; 
import Matrix from '@/components/ui/matrix'; 
import { cn } from '@/lib/utils'; 
import { useESP32 } from '@/hooks/useESP32';
import { useModel } from '@/components/providers/model-context';
import { toast } from 'sonner';
import { useTTS } from '@/hooks/useTTS';
import { textToBraillePages } from '@/lib/braille';

import { use } from 'react';
import { useRouter } from 'next/navigation';

interface TeacherPage {
    type: 'graphic' | 'braille';
    label: string;
    matrix?: number[][];
    text?: string;
}

interface Message {
    role: 'user' | 'assistant';
    content: string;
    pages?: TeacherPage[];
    matrix?: number[][];  // LEGACY
    rows?: number;
    cols?: number;
    timestamp: string | Date;
}

/**
 * Expand a message's pages into flat display pages.
 * - graphic pages → one display page each
 * - braille pages → N display pages via textToBraillePages()
 */
function expandPages(msg: Message, rows: number, cols: number): { matrix: number[][]; label: string; text?: string; type: string }[] {
    const result: { matrix: number[][]; label: string; text?: string; type: string }[] = [];

    // New multi-page format
    if (msg.pages && msg.pages.length > 0) {
        for (const page of msg.pages) {
            if (page.type === 'graphic' && page.matrix) {
                result.push({ matrix: page.matrix, label: page.label, type: 'graphic' });
            } else if (page.type === 'braille' && page.text) {
                const braillePages = textToBraillePages(page.text, rows, cols);
                for (let i = 0; i < braillePages.length; i++) {
                    result.push({
                        matrix: braillePages[i],
                        label: braillePages.length > 1 ? `${page.label} (${i + 1}/${braillePages.length})` : page.label,
                        text: page.text,
                        type: 'braille',
                    });
                }
            }
        }
    }

    // LEGACY: single matrix field
    if (result.length === 0 && msg.matrix && msg.matrix.length > 0) {
        result.push({ matrix: msg.matrix, label: 'Display', type: 'graphic' });
    }

    return result;
}

export default function AITeacherChat({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [deviceModelId, setDeviceModelId] = useState<string | undefined>(undefined);
    const { setArray, enableLoop } = useESP32();
    const { activeModel } = useModel();
    const messagesRef = useRef<Message[]>([]);
    messagesRef.current = messages;

    // Track current page index per message (by message index)
    const [pageIndices, setPageIndices] = useState<Record<number, number>>({});

    // TTS: reads the latest assistant message via tablet keyboard Space+A
    const tts = useTTS({
        getText: useCallback(() => {
            const msgs = messagesRef.current;
            const lastAssistant = [...msgs].reverse().find(m => m.role === 'assistant');
            return lastAssistant?.content || null;
        }, []),
        enableHardwareKeyboard: true,
    });

    // Per-message TTS: speak a specific message's content
    const speakText = useCallback(async (text: string) => {
        if (tts.status === 'playing' || tts.status === 'loading') {
            tts.stop();
            return;
        }
        try {
            const response = await fetch('/api/tts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: text.trim() }),
            });
            if (!response.ok) throw new Error('TTS failed');
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const audio = new Audio(url);
            audio.onended = () => URL.revokeObjectURL(url);
            await audio.play();
        } catch {
            // silent fail
        }
    }, [tts]);

    const autoSubmittedRef = useRef(false);
    const sendToAIRef = useRef<((msgs: Message[], chatId: string) => Promise<void>) | null>(null);

    useEffect(() => {
        if (id === 'new') return;
        
        fetch(`/api/teacher/chats/${id}`)
            .then(res => {
                if (res.status === 404) router.push('/ai-teacher');
                return res.json();
            })
            .then(data => {
                if (data && data.messages) {
                    setMessages(data.messages);
                    if (data.deviceModelId) {
                        setDeviceModelId(data.deviceModelId);
                    }
                    
                    // Auto-load last assistant's first page to hardware
                    const lastMsg = [...data.messages].reverse().find((m: Message) => m.pages || m.matrix);
                    if (lastMsg && (!data.deviceModelId || data.deviceModelId === activeModel.id)) {
                        const pages = expandPages(lastMsg, activeModel.rows, activeModel.cols);
                        if (pages.length > 0) {
                            setArray(pages[0].matrix);
                            enableLoop(true);
                        }
                    }

                    // Auto-submit: if last message is from user and no assistant response yet
                    const msgs = data.messages as Message[];
                    if (msgs.length > 0 && msgs[msgs.length - 1].role === 'user' && !autoSubmittedRef.current) {
                        autoSubmittedRef.current = true;
                        setTimeout(() => {
                            sendToAIRef.current?.(msgs, id);
                        }, 100);
                    }
                }
            })
            .catch(err => console.error("Failed to load chat history", err));
    }, [id, router, activeModel.id, activeModel.rows, activeModel.cols, setArray, enableLoop]);

    // Clear hardware matrix on unmount
    useEffect(() => {
        return () => {
            setArray(Array(activeModel.rows).fill(0).map(() => Array(activeModel.cols).fill(-1)));
            enableLoop(false);
        };
    }, [activeModel.rows, activeModel.cols, setArray, enableLoop]);

    const isModelMismatch = deviceModelId && deviceModelId !== activeModel.id;

    // Debounced hardware send — prevents flooding ESP32 when spamming page nav
    const sendTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const sendPageToHardware = useCallback((matrix: number[][]) => {
        if (sendTimerRef.current) clearTimeout(sendTimerRef.current);
        sendTimerRef.current = setTimeout(() => {
            setArray(matrix);
            enableLoop(true);
        }, 150);
    }, [setArray, enableLoop]);

    // Core function to send messages to the AI and process the response
    const sendToAI = useCallback(async (allMessages: Message[], chatId: string) => {
        setIsLoading(true);

        try {
            const requestBody: any = { 
                messages: allMessages, 
                rows: activeModel.rows, 
                cols: activeModel.cols,
                deviceModelId: activeModel.id,
                chatId,
            };

            const response = await fetch('/api/teacher', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
            });

            if (!response.ok) throw new Error('Failed to send message');

            const data = await response.json();
            
            if (chatId === 'new' && data.chatId) {
                router.replace(`/ai-teacher/${data.chatId}`);
            }

            const assistantMessage: Message = {
                role: 'assistant',
                content: data.message, 
                pages: data.pages,
                rows: data.rows,
                cols: data.cols,
                timestamp: new Date().toISOString()
            };

            setMessages((prev) => {
                const newMessages = [...prev, assistantMessage];
                // Send first page to hardware
                const pages = expandPages(assistantMessage, activeModel.rows, activeModel.cols);
                if (pages.length > 0) {
                    sendPageToHardware(pages[0].matrix);
                }
                return newMessages;
            });
        } catch (error) {
            console.error(error);
            toast.error('Failed to get response from AI Teacher');
        } finally {
            setIsLoading(false);
        }
    }, [activeModel.rows, activeModel.cols, activeModel.id, router, sendPageToHardware]);

    // Keep the ref in sync so auto-submit can call sendToAI
    sendToAIRef.current = sendToAI;

    const handleSubmit = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!input.trim() || isLoading) return;

        const userMessage: Message = { 
            role: 'user', 
            content: input,
            timestamp: new Date().toISOString()
        };
        setMessages((prev) => [...prev, userMessage]);
        setInput('');

        const chatId = id !== 'new' ? id : 'new';
        await sendToAI([...messages, userMessage], chatId);
    };

    if (isModelMismatch) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center p-8 bg-card rounded-lg border">
                <BrainCircuit className="size-16 text-muted-foreground/50" />
                <h2 className="text-xl font-semibold">Model Mismatch</h2>
                <p className="text-muted-foreground max-w-md">
                    This AI Teacher chat was created using a different hardware model. Please switch to the correct model to view this chat.
                </p>
                <div className="flex gap-2 mt-4">
                    <Button onClick={() => router.push('/ai-teacher')} variant="outline">
                        <ChevronLeft className="size-4 mr-2" />
                        Back to Chats
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col space-y-4">
            <div className="flex items-center justify-between">
                <Heading 
                    title="AI Teacher" 
                    description="Chat with the AI teacher to learn new concepts." 
                    Icon={<BrainCircuit className="size-8 text-primary" />} 
                    hideBackButton={true}
                />
            </div>
            
            <div className="border rounded-lg p-1 flex flex-wrap items-center justify-between gap-1 h-10.5">
                <div className="flex items-center gap-1 h-full">
                    <Button 
                        variant="outline" 
                        size="icon-sm" 
                        onClick={() => router.push('/ai-teacher')}
                        title="All Chats"
                    >
                        <ChevronLeft size={16} />
                    </Button>
                </div>
                <div className="flex items-center gap-1 h-full">
                    <Button 
                        variant="outline"
                        size="icon-sm" 
                        onClick={() => router.push('/ai-teacher/new')} 
                        disabled={isLoading} 
                        title="New Chat"
                    >
                        <PlusIcon size={16} /> 
                    </Button>
                    {id !== 'new' && (
                        <Button 
                            variant="destructive" 
                            size="icon-sm" 
                            onClick={async () => {
                                try {
                                    await fetch(`/api/teacher/chats/${id}`, { method: 'DELETE' });
                                    toast.success("Chat deleted");
                                    router.push('/ai-teacher');
                                } catch (error) {
                                    toast.error("Failed to delete chat");
                                }
                            }}
                            disabled={isLoading}
                            title="Delete Chat"
                        >
                            <TrashIcon size={16} />
                        </Button>
                    )}
                    <Button
                        size="icon-sm"
                        variant={tts.status === 'playing' || tts.status === 'loading' ? "secondary" : "outline"}
                        onClick={tts.toggle}
                        disabled={messages.filter(m => m.role === 'assistant').length === 0}
                        title={tts.status === 'playing' ? 'Stop reading' : 'Read last response'}
                    >
                        {tts.status === 'loading' ? (
                            <Loader2 size={16} className="animate-spin" />
                        ) : tts.status === 'playing' ? (
                            <VolumeX size={16} />
                        ) : (
                            <Volume2 size={16} />
                        )}
                    </Button>
                </div>
            </div>
            
            <div className="flex-1 flex flex-col space-y-4 min-h-0 bg-muted/20 p-4 rounded-lg border border-dashed">
                <div className="flex-1 overflow-y-auto space-y-6 pr-2">
                    {messages.length === 0 && (
                        <div className="text-center text-muted-foreground mt-10">
                            <BrainCircuit className="size-12 mx-auto mb-2 opacity-50" />
                            <p>Ask me to explain a concept or draw a shape!</p>
                        </div>
                    )}
                    
                    {messages.map((rawMsg, msgIndex) => {
                        let msg = { ...rawMsg };
                        // Auto-heal corrupted JSON strings in old messages
                        if (typeof msg.content === 'string' && msg.content.trim().startsWith('{') && msg.content.includes('"matrix"')) {
                            try {
                                const parsed = JSON.parse(msg.content);
                                if (parsed.matrix && parsed.message) {
                                    msg.content = parsed.message;
                                    if (Array.isArray(parsed.matrix) && !Array.isArray(parsed.matrix[0])) {
                                        const r = parsed.rows || activeModel.rows;
                                        const c = parsed.cols || activeModel.cols;
                                        const matrix2D = [];
                                        for (let i = 0; i < r; i++) {
                                            matrix2D.push(parsed.matrix.slice(i * c, (i + 1) * c));
                                        }
                                        msg.matrix = matrix2D;
                                    } else {
                                        msg.matrix = parsed.matrix;
                                    }
                                }
                            } catch (e) { /* ignore */ }
                        }

                        // Expand pages for this message
                        const displayPages = expandPages(msg, activeModel.rows, activeModel.cols);
                        const currentPageIdx = pageIndices[msgIndex] || 0;
                        const currentPage = displayPages[currentPageIdx];
                        const hasPages = displayPages.length > 0;

                        return (
                            <div key={msgIndex} className="flex flex-col gap-1">
                                <div className={cn(
                                    "flex items-center gap-2 text-xs text-muted-foreground",
                                    msg.role === 'user' ? "flex-row-reverse" : "flex-row"
                                )}>
                                    <span className="font-semibold text-foreground">
                                        {msg.role === 'user' ? "You" : "Teacher"}
                                    </span>
                                    <span>
                                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </div>
                                
                                <div className={cn(
                                    "flex w-full",
                                    msg.role === 'user' ? "justify-end" : "justify-start"
                                )}>
                                    <div className={cn(
                                        "rounded-lg p-3 max-w-[85%] text-sm",
                                        msg.role === 'user' 
                                            ? "bg-primary text-primary-foreground" 
                                            : "bg-card border shadow-sm"
                                    )}>
                                        <p className="mb-2 whitespace-pre-wrap">{msg.content}</p>

                                        {/* Action buttons for assistant messages */}
                                        {msg.role === 'assistant' && (
                                            <div className="flex items-center gap-1 mb-2">
                                                {hasPages && currentPage && (
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                                                        onClick={() => sendPageToHardware(currentPage.matrix)}
                                                        title="Send to display"
                                                    >
                                                        <Monitor size={13} />
                                                        Display
                                                    </Button>
                                                )}
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                                                    onClick={() => speakText(msg.content)}
                                                    title="Read aloud"
                                                >
                                                    <Volume2 size={13} />
                                                    Read
                                                </Button>
                                            </div>
                                        )}
                                        
                                        {/* Multi-page display */}
                                        {hasPages && currentPage && (
                                            <div className="mt-2 space-y-2">
                                                {/* Page navigation */}
                                                {displayPages.length > 1 && (
                                                    <div className="flex items-center justify-between gap-2">
                                                        <Button
                                                            variant="outline"
                                                            size="icon-sm"
                                                            disabled={currentPageIdx === 0}
                                                            onClick={() => {
                                                                const newIdx = currentPageIdx - 1;
                                                                setPageIndices(prev => ({ ...prev, [msgIndex]: newIdx }));
                                                                sendPageToHardware(displayPages[newIdx].matrix);
                                                            }}
                                                        >
                                                            <ChevronLeft size={14} />
                                                        </Button>
                                                        
                                                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                                            {currentPage.type === 'graphic' ? (
                                                                <Image size={12} />
                                                            ) : (
                                                                <TypeIcon size={12} />
                                                            )}
                                                            <span className="font-medium">{currentPage.label}</span>
                                                            <span className="text-muted-foreground/60">
                                                                {currentPageIdx + 1}/{displayPages.length}
                                                            </span>
                                                        </div>

                                                        <Button
                                                            variant="outline"
                                                            size="icon-sm"
                                                            disabled={currentPageIdx === displayPages.length - 1}
                                                            onClick={() => {
                                                                const newIdx = currentPageIdx + 1;
                                                                setPageIndices(prev => ({ ...prev, [msgIndex]: newIdx }));
                                                                sendPageToHardware(displayPages[newIdx].matrix);
                                                            }}
                                                        >
                                                            <ChevronRight size={14} />
                                                        </Button>
                                                    </div>
                                                )}

                                                {/* Single page label */}
                                                {displayPages.length === 1 && (
                                                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground justify-center">
                                                        {currentPage.type === 'graphic' ? (
                                                            <Image size={12} />
                                                        ) : (
                                                            <TypeIcon size={12} />
                                                        )}
                                                        <span>{currentPage.label}</span>
                                                    </div>
                                                )}

                                                {/* Matrix preview */}
                                                <div className="bg-muted/10 p-2 rounded overflow-x-auto">
                                                    <div className="min-w-[200px] max-w-full pointer-events-none">
                                                        <Matrix 
                                                            initialData={currentPage.matrix}
                                                            rows={activeModel.rows} 
                                                            cols={activeModel.cols}
                                                            editable={false}
                                                            disabled={true}
                                                        />
                                                    </div>
                                                </div>

                                                {/* Braille text content */}
                                                {currentPage.type === 'braille' && currentPage.text && (
                                                    <div className="bg-muted/30 rounded px-2 py-1.5 text-xs text-muted-foreground italic border border-dashed">
                                                        {currentPage.text}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    
                    {isLoading && (
                         <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span className="font-semibold text-foreground">Teacher</span>
                                <span>Thinking...</span>
                            </div>
                            <div className="bg-card border shadow-sm rounded-lg p-3 w-fit">
                                <Loader2 className="size-4 animate-spin" />
                            </div>
                         </div>
                    )}
                </div>

                <form onSubmit={handleSubmit} className="flex items-center gap-2 pt-2 border-t">
                    <Input 
                        placeholder="Ask the AI teacher a question..." 
                        className="flex-1 bg-background" 
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        disabled={isLoading}
                    />
                    <Button type="submit" size="icon" disabled={isLoading || !input.trim()}>
                        <Send className="size-4" />
                    </Button>
                </form>
            </div>
        </div>
    );
}