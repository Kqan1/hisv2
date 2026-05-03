'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Heading } from '@/components/ui/heading';
import { Input } from '@/components/ui/input';
import { BrainCircuit, Send, Loader2, Trash2, PlusIcon, ChevronLeft, TrashIcon } from 'lucide-react'; 
import Matrix from '@/components/ui/matrix'; 
import { cn } from '@/lib/utils'; 
import { useESP32 } from '@/hooks/useESP32';
import { useModel } from '@/components/providers/model-context';
import { toast } from 'sonner';

import { use } from 'react';
import { useRouter } from 'next/navigation';

interface Message {
    role: 'user' | 'assistant';
    content: string;
    matrix?: number[][];
    rows?: number;
    cols?: number;
    timestamp: string | Date;
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
                    
                    // Auto-load last matrix to hardware
                    const lastMsg = [...data.messages].reverse().find((m: any) => m.matrix || (typeof m.content === 'string' && m.content.includes('"matrix"')));
                    if (lastMsg) {
                        let mData = lastMsg.matrix;
                        if (!mData && typeof lastMsg.content === 'string' && lastMsg.content.includes('"matrix"')) {
                            try {
                                const parsed = JSON.parse(lastMsg.content);
                                if (parsed.matrix && Array.isArray(parsed.matrix) && !Array.isArray(parsed.matrix[0])) {
                                    const rows = parsed.rows || activeModel.rows;
                                    const cols = parsed.cols || activeModel.cols;
                                    mData = [];
                                    for (let i = 0; i < rows; i++) {
                                        mData.push(parsed.matrix.slice(i * cols, (i + 1) * cols));
                                    }
                                } else if (parsed.matrix) {
                                    mData = parsed.matrix;
                                }
                            } catch(e) {}
                        }
                        
                        if (mData && (!data.deviceModelId || data.deviceModelId === activeModel.id)) {
                            setArray(mData);
                            enableLoop(true);
                        }
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
        setIsLoading(true);

        try {
            const requestBody: any = { 
                messages: [...messages, userMessage], 
                rows: activeModel.rows, 
                cols: activeModel.cols,
                deviceModelId: activeModel.id
            };
            
            if (id !== 'new') {
                requestBody.chatId = id;
            }

            const response = await fetch('/api/teacher', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
            });

            if (!response.ok) throw new Error('Failed to send message');

            const data = await response.json();
            
            if (id === 'new' && data.chatId) {
                router.replace(`/ai-teacher/${data.chatId}`);
            }

            // API returns 1D array. Need to convert to 2D for Matrix component.
            let matrix2D: number[][] | undefined = undefined;
            if (data.matrix && data.rows && data.cols) {
                const rows = data.rows;
                const cols = data.cols;
                matrix2D = [];
                for (let i = 0; i < rows; i++) {
                    matrix2D.push(data.matrix.slice(i * cols, (i + 1) * cols));
                }
                setArray(matrix2D);
                enableLoop(true);
            }

            const assistantMessage: Message = {
                role: 'assistant',
                content: data.message, 
                matrix: matrix2D,
                rows: data.rows,
                cols: data.cols,
                timestamp: new Date().toISOString()
            };

            setMessages((prev) => [...prev, assistantMessage]);
        } catch (error) {
            console.error(error);
            toast.error('Failed to get response from AI Teacher');
        } finally {
            setIsLoading(false);
        }
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
                    
                    {messages.map((rawMsg, index) => {
                        let msg = { ...rawMsg };
                        // Auto-heal corrupted JSON strings in old messages
                        if (typeof msg.content === 'string' && msg.content.trim().startsWith('{') && msg.content.includes('"matrix"')) {
                            try {
                                const parsed = JSON.parse(msg.content);
                                if (parsed.matrix && parsed.message) {
                                    msg.content = parsed.message;
                                    // Convert 1D to 2D if needed
                                    if (Array.isArray(parsed.matrix) && !Array.isArray(parsed.matrix[0])) {
                                        const rows = parsed.rows || activeModel.rows;
                                        const cols = parsed.cols || activeModel.cols;
                                        const matrix2D = [];
                                        for (let i = 0; i < rows; i++) {
                                            matrix2D.push(parsed.matrix.slice(i * cols, (i + 1) * cols));
                                        }
                                        msg.matrix = matrix2D;
                                    } else {
                                        msg.matrix = parsed.matrix;
                                    }
                                }
                            } catch (e) {
                                // Ignore parse errors for healing
                            }
                        }

                        return (
                            <div
                                key={index}
                                className="flex flex-col gap-1"
                            >
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
                                        {msg.matrix && msg.matrix.length > 0 && (
                                            <div className="mt-2 bg-muted/10 p-2 rounded overflow-x-auto"> 
                                                <div className="min-w-[200px] max-w-full pointer-events-none">
                                                    <Matrix 
                                                        initialData={msg.matrix}
                                                        rows={activeModel.rows} 
                                                        cols={activeModel.cols}
                                                        editable={false}
                                                        disabled={true}
                                                    />
                                                </div>
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