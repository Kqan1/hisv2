'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Heading } from '@/components/ui/heading';
import { Input } from '@/components/ui/input';
import { BrainCircuit, Send, Loader2 } from 'lucide-react'; 
import Matrix from '@/components/ui/matrix'; 
import { cn } from '@/lib/utils'; 

interface Message {
    role: 'user' | 'assistant';
    content: string;
    matrix?: number[][];
    rows?: number;
    cols?: number;
    timestamp: Date;
}

export default function AITeacher() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!input.trim() || isLoading) return;

        const userMessage: Message = { 
            role: 'user', 
            content: input,
            timestamp: new Date()
        };
        setMessages((prev) => [...prev, userMessage]);
        setInput('');
        setIsLoading(true);

        try {
            const response = await fetch('/api/teacher', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages: [...messages, userMessage] }),
            });

            if (!response.ok) throw new Error('Failed to send message');

            const data = await response.json();
             
            // API returns 1D array. Need to convert to 2D for Matrix component.
            let matrix2D: number[][] | undefined = undefined;
            if (data.matrix && data.rows && data.cols) {
                const rows = data.rows;
                const cols = data.cols;
                matrix2D = [];
                for (let i = 0; i < rows; i++) {
                    matrix2D.push(data.matrix.slice(i * cols, (i + 1) * cols));
                }
            }

            const assistantMessage: Message = {
                role: 'assistant',
                content: data.message, 
                matrix: matrix2D,
                rows: data.rows,
                cols: data.cols,
                timestamp: new Date()
            };

            setMessages((prev) => [...prev, assistantMessage]);
        } catch (error) {
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="h-full flex flex-col space-y-4">
            <Heading 
                title="AI Teacher" 
                description="Chat with the AI teacher to learn new concepts." 
                Icon={<BrainCircuit className="size-8 text-primary" />} 
            />
            
            <div className="flex-1 flex flex-col space-y-4 min-h-0 bg-muted/20 p-4 rounded-lg border border-dashed">
                <div className="flex-1 overflow-y-auto space-y-6 pr-2">
                    {messages.length === 0 && (
                        <div className="text-center text-muted-foreground mt-10">
                            <BrainCircuit className="size-12 mx-auto mb-2 opacity-50" />
                            <p>Ask me to explain a concept or draw a shape!</p>
                        </div>
                    )}
                    
                    {messages.map((msg, index) => (
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
                                    {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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
                                    {msg.matrix && (
                                        <div className="mt-2 bg-muted/10 p-2 rounded overflow-x-auto"> 
                                            <div className="min-w-[200px] max-w-full pointer-events-none">
                                                <Matrix 
                                                    initialData={msg.matrix}
                                                    rows={10} 
                                                    cols={15}
                                                    editable={false}
                                                    disabled={true}
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                    
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