'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, buttonVariants } from '@/components/ui/button';
import { Heading } from '@/components/ui/heading';
import { BrainCircuit, PlusIcon, MessageSquare, Trash2, XIcon, TrashIcon } from 'lucide-react';
import { ChatSession } from '@/lib/ai-teacher-store';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Separator } from '@/components/ui/separator';
import { SortButton } from '@/components/ui/sortButton';
import { Badge } from '@/components/ui/badge';
import { useModel } from '@/components/providers/model-context';

function AITeacherToolbar({
    deleteMode,
    setDeleteMode,
    handleNewChat,
    isLoading
}: {
    deleteMode: boolean;
    setDeleteMode: (value: boolean) => void;
    handleNewChat: () => void;
    isLoading: boolean;
}) {
    return (
        <div className="flex items-center gap-1 h-full">
            <Button
                variant="outline"
                size="icon-sm"
                onClick={handleNewChat}
                disabled={isLoading}
                aria-label="New chat"
            >
                <PlusIcon size={16} />
            </Button>
            {deleteMode ? (
                <Button
                    variant="outline"
                    size="icon-sm"
                    onClick={() => setDeleteMode(false)}
                    aria-label="Cancel delete mode"
                >
                    <XIcon size={16} />
                </Button>
            ) : (
                <Button
                    variant="destructive"
                    size="icon-sm"
                    onClick={() => setDeleteMode(true)}
                    aria-label="Delete chats"
                >
                    <TrashIcon size={16} />
                </Button>
            )}
        </div>
    );
}

function AITeacherListContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [chats, setChats] = useState<ChatSession[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [deleteMode, setDeleteMode] = useState(false);
    const { models } = useModel();

    const sortParam = searchParams.get('sort') || 'createdAt-desc';

    const fetchChats = () => {
        fetch('/api/teacher/chats')
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data)) {
                    setChats(data.filter(c => c.messages && c.messages.length > 0));
                }
            })
            .catch(err => console.error(err))
            .finally(() => setIsLoading(false));
    };

    useEffect(() => {
        fetchChats();
    }, []);

    const handleNewChat = () => {
        router.push(`/ai-teacher/new`);
    };

    const handleDeleteChat = async (e: React.MouseEvent, id: string) => {
        e.preventDefault();
        e.stopPropagation();
        
        try {
            await fetch(`/api/teacher/chats/${id}`, { method: 'DELETE' });
            setChats(prev => prev.filter(c => c.id !== id));
            toast.success("Chat deleted");
        } catch (error) {
            toast.error("Failed to delete chat");
        }
    };

    const sortedChats = [...chats].sort((a, b) => {
        switch (sortParam) {
            case 'title-asc':
                return a.title.localeCompare(b.title);
            case 'title-desc':
                return b.title.localeCompare(a.title);
            case 'createdAt-asc':
                return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
            case 'createdAt-desc':
                return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
            case 'updatedAt-asc':
                return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
            case 'updatedAt-desc':
                return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
            default:
                return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        }
    });

    const toolbar = (
        <div className="border rounded-lg p-1 flex flex-wrap items-center justify-between gap-1 h-10.5">
            <AITeacherToolbar 
                deleteMode={deleteMode} 
                setDeleteMode={setDeleteMode} 
                handleNewChat={handleNewChat} 
                isLoading={isLoading} 
            />
            <div className="flex items-center gap-1 h-full">
                <Separator orientation="vertical" />
                <Suspense fallback={<Button variant="outline" size="sm" disabled>Sırala...</Button>}>
                    <SortButton pathname="/ai-teacher" />
                </Suspense>
            </div>
        </div>
    );

    return (
        <div className="space-y-6 min-h-screen">
            <Heading 
                title="AI Teacher Chats" 
                description="Your previous conversations with the AI Teacher" 
                Icon={<BrainCircuit className="size-8 text-primary" />} 
                hideBackButton={true}
            />
            {toolbar}

            {isLoading ? (
                <div className="space-y-4">
                    <div className="h-20 w-full rounded-md bg-muted animate-pulse" />
                    <div className="h-20 w-full rounded-md bg-muted animate-pulse" />
                </div>
            ) : sortedChats.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-6 mt-16 text-muted-foreground">
                    <MessageSquare size={100} className="opacity-20" />
                    <p className="text-xl font-medium">No chats yet. Start a new conversation!</p>
                </div>
            ) : (
                <div className="flex flex-col gap-2">
                    {sortedChats.map(chat => {
                        const chatModelId = chat.deviceModelId;
                        const recordModel = models.find(m => m.id === chatModelId);

                        if (deleteMode) {
                            return (
                                <div
                                    key={chat.id}
                                    tabIndex={0}
                                    role="button"
                                    aria-label={`Delete chat: ${chat.title}`}
                                    className={cn(
                                        buttonVariants({ variant: "outline" }),
                                        "h-auto flex items-center p-3 gap-3 w-full text-left relative cursor-pointer group"
                                    )}
                                    onClick={(e) => handleDeleteChat(e, chat.id)}
                                >
                                    <div className="absolute inset-0 bg-destructive/20 border-2 border-destructive rounded-lg flex items-center justify-center z-10 opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity">
                                        <div className="bg-destructive text-destructive-foreground rounded-full p-2">
                                            <Trash2 size={20} />
                                        </div>
                                    </div>
                                    <MessageSquare className="size-5 shrink-0 text-primary" />
                                    <div className="flex flex-col flex-1 min-w-0">
                                        <h3 className="font-semibold truncate">{chat.title}</h3>
                                        <div className="flex items-center gap-2">
                                            <p className="text-xs text-muted-foreground">
                                                {chat.messages.length} messages
                                            </p>
                                            <span className="text-muted-foreground/30">•</span>
                                            <small className="text-[10px] text-muted-foreground uppercase font-mono">
                                                {new Date(chat.updatedAt).toLocaleDateString()} {new Date(chat.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </small>
                                        </div>
                                    </div>
                                    {recordModel && (
                                        <Badge variant="secondary" className="text-[10px] uppercase font-mono shrink-0">
                                            {recordModel.name}
                                        </Badge>
                                    )}
                                </div>
                            );
                        }

                        return (
                            <Link 
                                key={chat.id} 
                                href={`/ai-teacher/${chat.id}`}
                                className={cn(
                                    buttonVariants({ variant: 'outline' }),
                                    'h-auto flex items-center p-3 gap-3 w-full text-left'
                                )}
                            >
                                <MessageSquare className="size-5 shrink-0 text-primary" />
                                <div className="flex flex-col flex-1 min-w-0">
                                    <h3 className="font-semibold truncate">{chat.title}</h3>
                                    <div className="flex items-center gap-2">
                                        <p className="text-xs text-muted-foreground">
                                            {chat.messages.length} messages
                                        </p>
                                        <span className="text-muted-foreground/30">•</span>
                                        <small className="text-[10px] text-muted-foreground uppercase font-mono">
                                            {new Date(chat.updatedAt).toLocaleDateString()} {new Date(chat.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </small>
                                    </div>
                                </div>
                                {recordModel && (
                                    <Badge variant="secondary" className="text-[10px] uppercase font-mono shrink-0">
                                        {recordModel.name}
                                    </Badge>
                                )}
                            </Link>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

export default function AITeacherList() {
    return (
        <Suspense fallback={<div className="p-4">Loading...</div>}>
            <AITeacherListContent />
        </Suspense>
    );
}
