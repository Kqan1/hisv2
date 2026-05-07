'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Matrix from '@/components/ui/matrix'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useModel } from '@/components/providers/model-context'
import { toast } from 'sonner'
import { ChevronLeft, ChevronRight, Plus, Trash2, Keyboard } from 'lucide-react'
import { useBrailleKeyboard } from '@/hooks/useBrailleKeyboard'
import { BrailleKeyboardState } from '@/components/ui/braille-keyboard-state'
import { textToBraillePages } from '@/lib/braille'

export function NewNoteForm() {
    const router = useRouter()
    const { activeModel } = useModel()
    const [title, setTitle] = useState('')
    const [matrices, setMatrices] = useState<number[][][]>([
        Array(activeModel.rows)
            .fill(0)
            .map(() => Array(activeModel.cols).fill(-1))
    ])
    const [activePageIndex, setActivePageIndex] = useState(0)
    
    const { typedText, setTypedText, keyState } = useBrailleKeyboard()
    const isTypingUpdateRef = useRef(false)
    const isManualEditRef = useRef(false)

    useEffect(() => {
        setMatrices([
            Array(activeModel.rows)
                .fill(0)
                .map(() => Array(activeModel.cols).fill(-1))
        ])
        setActivePageIndex(0)
        isManualEditRef.current = true;
        setTypedText("")
    }, [activeModel.rows, activeModel.cols, setTypedText])

    useEffect(() => {
        if (!typedText) {
            if (isManualEditRef.current) {
                isManualEditRef.current = false;
                return;
            }
            // User backspaced until empty
            isTypingUpdateRef.current = true;
            setMatrices([
                Array(activeModel.rows)
                    .fill(0)
                    .map(() => Array(activeModel.cols).fill(-1))
            ]);
            setActivePageIndex(0);
            return;
        }
        const pages = textToBraillePages(typedText, activeModel.rows, activeModel.cols);
        if (pages.length > 0) {
            isTypingUpdateRef.current = true;
            setMatrices(pages);
            setActivePageIndex(pages.length - 1);
        }
    }, [typedText, activeModel.rows, activeModel.cols]);

    const [isSubmitting, setIsSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const addPage = () => {
        setMatrices([...matrices, Array(activeModel.rows).fill(0).map(() => Array(activeModel.cols).fill(-1))])
        setActivePageIndex(matrices.length)
    }

    const deletePage = (index: number) => {
        if (matrices.length <= 1) return
        const newMatrices = matrices.filter((_, i) => i !== index)
        setMatrices(newMatrices)
        if (activePageIndex >= newMatrices.length) {
            setActivePageIndex(newMatrices.length - 1)
        }
    }

    const updateActiveMatrix = (newMatrix: number[][]) => {
        const newMatrices = [...matrices]
        newMatrices[activePageIndex] = newMatrix
        setMatrices(newMatrices)
        if (!isTypingUpdateRef.current) {
            isManualEditRef.current = true;
            setTypedText("") // Clear typed text if manual edit
        }
        isTypingUpdateRef.current = false;
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)
        if (!title.trim()) {
            setError('Title is required')
            toast.error('Title is required')
            return
        }
        setIsSubmitting(true)
        try {
            const res = await fetch('/api/notes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    title: title.trim(), 
                    matrices,
                    deviceModelId: activeModel.id
                }),
            })
            const data = await res.json()
            if (!res.ok) {
                const msg = data.error ?? 'Failed to create note'
                setError(msg)
                toast.error(msg)
                return
            }
            toast.success('Note created successfully')
            router.push(`/notes/${data.id}`)
        } catch {
            setError('Failed to create note')
            toast.error('Failed to create note')
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
                <label htmlFor="title" className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                    Title
                </label>
                <input
                    id="title"
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Note title"
                    maxLength={255}
                    className={cn(
                        'flex h-12 w-full rounded-xl border border-input bg-background px-4 py-2 text-lg font-semibold ring-offset-background transition-all',
                        'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                        'disabled:cursor-not-allowed disabled:opacity-50'
                    )}
                />
            </div>

            <div className="space-y-4">
                <div className="flex items-center justify-between bg-muted/30 p-2 rounded-xl border border-border/50">
                    <div className="flex items-center gap-2">
                        <Button 
                            type="button"
                            variant="ghost" 
                            size="icon-sm" 
                            onClick={() => setActivePageIndex(prev => Math.max(0, prev - 1))}
                            disabled={activePageIndex === 0}
                        >
                            <ChevronLeft className="size-5" />
                        </Button>
                        <div className="flex items-center gap-1.5 px-2 overflow-x-auto max-w-[200px] md:max-w-md no-scrollbar">
                            {matrices.map((_, i) => (
                                <button
                                    key={i}
                                    type="button"
                                    onClick={() => setActivePageIndex(i)}
                                    className={cn(
                                        "size-8 rounded-lg text-xs font-bold transition-all flex items-center justify-center shrink-0",
                                        activePageIndex === i 
                                            ? "bg-primary text-primary-foreground shadow-lg scale-110" 
                                            : "bg-background text-muted-foreground hover:bg-muted"
                                    )}
                                >
                                    {i + 1}
                                </button>
                            ))}
                        </div>
                        <Button 
                            type="button"
                            variant="ghost" 
                            size="icon-sm" 
                            onClick={() => setActivePageIndex(prev => Math.min(matrices.length - 1, prev + 1))}
                            disabled={activePageIndex === matrices.length - 1}
                        >
                            <ChevronRight className="size-5" />
                        </Button>
                    </div>

                    <div className="flex items-center gap-2">
                        <Button 
                            type="button"
                            variant="secondary" 
                            size="sm" 
                            className="h-8 px-3 rounded-lg font-bold"
                            onClick={addPage}
                        >
                            <Plus className="size-4 mr-1.5" /> New Page
                        </Button>
                        <Button 
                            type="button"
                            variant="destructive" 
                            size="icon-sm" 
                            className="size-8 rounded-lg"
                            onClick={() => deletePage(activePageIndex)}
                            disabled={matrices.length <= 1}
                        >
                            <Trash2 className="size-4" />
                        </Button>
                    </div>
                </div>

                <div className="bg-background border rounded-2xl p-6 shadow-xl ring-1 ring-border/50">
                    <div className="flex justify-center w-full max-w-2xl mx-auto">
                        <Matrix
                            key={activePageIndex}
                            initialData={matrices[activePageIndex]}
                            rows={activeModel.rows}
                            cols={activeModel.cols}
                            onChange={updateActiveMatrix}
                            editable
                        />
                    </div>
                </div>
            </div>

            <BrailleKeyboardState 
                typedText={typedText} 
                keyState={keyState} 
                onClearText={() => setTypedText("")} 
            />

            {error && (
                <p className="text-sm text-destructive font-medium bg-destructive/10 p-3 rounded-lg border border-destructive/20">{error}</p>
            )}

            <div className="flex gap-3 pt-4">
                <Button type="submit" size="lg" className="min-w-[140px] font-bold" disabled={isSubmitting}>
                    {isSubmitting ? 'Creating…' : 'Create Note'}
                </Button>
                <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    onClick={() => router.push('/notes')}
                    disabled={isSubmitting}
                >
                    Cancel
                </Button>
            </div>
        </form>
    )
}
