'use client';

import { useState, useEffect, Suspense, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, buttonVariants } from '@/components/ui/button';
import { Heading } from '@/components/ui/heading';
import { FileText, PlusIcon, Trash2, XIcon, TrashIcon, Upload, Loader2 } from 'lucide-react';
import type { PdfConversion } from '@/lib/pdf-store';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Separator } from '@/components/ui/separator';
import { SortButton } from '@/components/ui/sortButton';
import { Badge } from '@/components/ui/badge';
import { useModel } from '@/components/providers/model-context';

function PdfToolbar({
    deleteMode,
    setDeleteMode,
    handleUpload,
    isUploading
}: {
    deleteMode: boolean;
    setDeleteMode: (value: boolean) => void;
    handleUpload: () => void;
    isUploading: boolean;
}) {
    return (
        <div className="flex items-center gap-1 h-full">
            <Button
                variant="outline"
                size="icon-sm"
                onClick={handleUpload}
                disabled={isUploading}
            >
                {isUploading ? <Loader2 size={16} className="animate-spin" /> : <PlusIcon size={16} />}
            </Button>
            {deleteMode ? (
                <Button
                    variant="outline"
                    size="icon-sm"
                    onClick={() => setDeleteMode(false)}
                >
                    <XIcon size={16} />
                </Button>
            ) : (
                <Button
                    variant="destructive"
                    size="icon-sm"
                    onClick={() => setDeleteMode(true)}
                >
                    <TrashIcon size={16} />
                </Button>
            )}
        </div>
    );
}

function PdfListContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [conversions, setConversions] = useState<PdfConversion[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [deleteMode, setDeleteMode] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const { activeModel, models } = useModel();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const sortParam = searchParams.get('sort') || 'createdAt-desc';

    const fetchConversions = () => {
        fetch('/api/pdf/conversions')
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data)) {
                    setConversions(data);
                }
            })
            .catch(err => console.error(err))
            .finally(() => setIsLoading(false));
    };

    useEffect(() => {
        fetchConversions();
    }, []);

    const handleUpload = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.name.toLowerCase().endsWith('.pdf')) {
            toast.error('Please select a PDF file');
            return;
        }

        setIsUploading(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('deviceModelId', activeModel.id);

            const res = await fetch('/api/pdf/conversions', {
                method: 'POST',
                body: formData,
            });

            const data = await res.json();

            if (!res.ok) {
                toast.error(data.error || 'Upload failed');
                return;
            }

            toast.success(`PDF processed! ${data.pageCount} pages generated.`);
            router.push(`/pdf/${data.id}`);
        } catch (error) {
            toast.error('Failed to upload PDF');
        } finally {
            setIsUploading(false);
            // Reset file input
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleDelete = async (e: React.MouseEvent, id: string) => {
        e.preventDefault();
        e.stopPropagation();

        try {
            await fetch(`/api/pdf/conversions/${id}`, { method: 'DELETE' });
            setConversions(prev => prev.filter(c => c.id !== id));
            toast.success("Conversion deleted");
        } catch (error) {
            toast.error("Failed to delete conversion");
        }
    };

    const sortedConversions = [...conversions].sort((a, b) => {
        switch (sortParam) {
            case 'title-asc':
                return a.title.localeCompare(b.title);
            case 'title-desc':
                return b.title.localeCompare(a.title);
            case 'createdAt-asc':
                return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
            case 'createdAt-desc':
                return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
            default:
                return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        }
    });

    const toolbar = (
        <div className="border rounded-lg p-1 flex flex-wrap items-center justify-between gap-1 h-10.5">
            <PdfToolbar
                deleteMode={deleteMode}
                setDeleteMode={setDeleteMode}
                handleUpload={handleUpload}
                isUploading={isUploading}
            />
            <div className="flex items-center gap-1 h-full">
                <Separator orientation="vertical" />
                <Suspense fallback={<Button variant="outline" size="sm" disabled>Sort...</Button>}>
                    <SortButton pathname="/pdf" />
                </Suspense>
            </div>
        </div>
    );

    return (
        <div className="space-y-6 min-h-screen">
            <Heading
                title="PDF to Matrix"
                description="Convert PDF documents to braille matrix pages"
                Icon={<FileText className="size-8 text-primary" />}
                hideBackButton={true}
            />
            {toolbar}

            {/* Hidden file input */}
            <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={handleFileChange}
            />

            {isUploading && (
                <div className="flex flex-col items-center justify-center gap-4 mt-8 p-8 border border-dashed rounded-xl">
                    <Loader2 size={48} className="animate-spin text-primary" />
                    <p className="text-lg font-medium text-muted-foreground">Processing PDF...</p>
                    <p className="text-sm text-muted-foreground">Extracting text and generating braille pages</p>
                </div>
            )}

            {!isUploading && isLoading ? (
                <div className="space-y-4">
                    <div className="h-20 w-full rounded-md bg-muted animate-pulse" />
                    <div className="h-20 w-full rounded-md bg-muted animate-pulse" />
                </div>
            ) : !isUploading && sortedConversions.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-6 mt-16 text-muted-foreground">
                    <FileText size={100} className="opacity-20" />
                    <p className="text-xl font-medium">No conversions yet. Upload a PDF to get started!</p>
                    <Button size="lg" onClick={handleUpload}>
                        <Upload className="mr-2 size-5" />
                        Upload PDF
                    </Button>
                </div>
            ) : !isUploading && (
                <div className="flex flex-col gap-2">
                    {sortedConversions.map(conv => {
                        const recordModel = models.find(m => m.id === conv.deviceModelId);

                        if (deleteMode) {
                            return (
                                <div
                                    key={conv.id}
                                    className={cn(
                                        buttonVariants({ variant: "outline" }),
                                        "h-auto flex items-center p-3 gap-3 w-full text-left relative cursor-pointer group"
                                    )}
                                    onClick={(e) => handleDelete(e, conv.id)}
                                >
                                    <div className="absolute inset-0 bg-destructive/20 border-2 border-destructive rounded-lg flex items-center justify-center z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <div className="bg-destructive text-destructive-foreground rounded-full p-2">
                                            <Trash2 size={20} />
                                        </div>
                                    </div>
                                    <FileText className="size-5 shrink-0 text-primary" />
                                    <div className="flex flex-col flex-1 min-w-0">
                                        <h3 className="font-semibold truncate">{conv.title}</h3>
                                        <div className="flex items-center gap-2">
                                            <p className="text-xs text-muted-foreground">
                                                {conv.pages.length} pages
                                            </p>
                                            <span className="text-muted-foreground/30">•</span>
                                            <small className="text-[10px] text-muted-foreground uppercase font-mono">
                                                {new Date(conv.createdAt).toLocaleDateString()} {new Date(conv.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </small>
                                        </div>
                                    </div>
                                    <Badge
                                        variant={conv.status === 'done' ? 'secondary' : conv.status === 'error' ? 'destructive' : 'outline'}
                                        className="text-[10px] uppercase font-mono shrink-0"
                                    >
                                        {conv.status}
                                    </Badge>
                                </div>
                            );
                        }

                        return (
                            <Link
                                key={conv.id}
                                href={`/pdf/${conv.id}`}
                                className={cn(
                                    buttonVariants({ variant: 'outline' }),
                                    'h-auto flex items-center p-3 gap-3 w-full text-left'
                                )}
                            >
                                <FileText className="size-5 shrink-0 text-primary" />
                                <div className="flex flex-col flex-1 min-w-0">
                                    <h3 className="font-semibold truncate">{conv.title}</h3>
                                    <div className="flex items-center gap-2">
                                        <p className="text-xs text-muted-foreground">
                                            {conv.pages.length} pages
                                        </p>
                                        <span className="text-muted-foreground/30">•</span>
                                        <small className="text-[10px] text-muted-foreground uppercase font-mono">
                                            {new Date(conv.createdAt).toLocaleDateString()} {new Date(conv.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </small>
                                    </div>
                                </div>
                                {recordModel && (
                                    <Badge variant="secondary" className="text-[10px] uppercase font-mono shrink-0">
                                        {recordModel.name}
                                    </Badge>
                                )}
                                <Badge
                                    variant={conv.status === 'done' ? 'secondary' : conv.status === 'error' ? 'destructive' : 'outline'}
                                    className="text-[10px] uppercase font-mono shrink-0"
                                >
                                    {conv.status}
                                </Badge>
                            </Link>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

export default function PdfPage() {
    return (
        <Suspense fallback={<div className="p-4">Loading...</div>}>
            <PdfListContent />
        </Suspense>
    );
}