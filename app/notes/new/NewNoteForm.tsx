'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Matrix from '@/components/ui/matrix'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useModel } from '@/components/providers/model-context'
import { toast } from 'sonner'
import { ChevronLeft, ChevronRight, Plus, Trash2, Keyboard } from 'lucide-react'
import { BRAILLE_MAP, CELL_WIDTH, CELL_HEIGHT } from '@/lib/braille'
import { getESP32Service } from '@/services/esp32.service'

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

    useEffect(() => {
        setMatrices([
            Array(activeModel.rows)
                .fill(0)
                .map(() => Array(activeModel.cols).fill(-1))
        ])
        setActivePageIndex(0)
    }, [activeModel.rows, activeModel.cols])

    const [isSubmitting, setIsSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Braille typing state
    const [brailleTyping, setBrailleTyping] = useState(false)
    const brailleTypingRef = useRef(false)
    brailleTypingRef.current = brailleTyping
    const brailleCursorRef = useRef({ col: 0, line: 0 })
    const matricesRef = useRef(matrices)
    matricesRef.current = matrices
    const activePageIndexRef = useRef(activePageIndex)
    activePageIndexRef.current = activePageIndex

    const CHAR_GAP = 1
    const LINE_GAP = 1
    const charStep = CELL_WIDTH + CHAR_GAP
    const lineStep = CELL_HEIGHT + LINE_GAP

    useEffect(() => {
        if (!brailleTyping) return
        const service = getESP32Service()

        const maxCharsPerLine = Math.floor((activeModel.cols + CHAR_GAP) / charStep)
        const maxLinesPerPage = Math.floor((activeModel.rows + LINE_GAP) / lineStep)

        // Helper: create new page when current is full
        const ensureRoom = () => {
            const cursor = brailleCursorRef.current
            if (cursor.line < maxLinesPerPage) return
            const currentMatrices = matricesRef.current
            const newMatrix = Array(activeModel.rows).fill(0).map(() => Array(activeModel.cols).fill(-1))
            const next = [...currentMatrices, newMatrix]
            // Update refs immediately so handler reads correct data
            matricesRef.current = next
            activePageIndexRef.current = next.length - 1
            // Trigger React re-render
            setMatrices(next)
            setActivePageIndex(next.length - 1)
            cursor.col = 0
            cursor.line = 0
        }

        const handler = (msg: any) => {
            if (msg.type !== 'letter' || !msg.letter) return
            if (!brailleTypingRef.current) return
            if (service.navActive || document.body.hasAttribute('data-tablet-nav')) return

            const currentMatrices = matricesRef.current
            const idx = activePageIndexRef.current
            const matrix = currentMatrices[idx]
            if (!matrix) return

            const cursor = brailleCursorRef.current
            const letter = msg.letter.toLowerCase()

            // Backspace
            if (letter === '\b' || letter === 'backspace') {
                if (cursor.col > 0) {
                    cursor.col--
                } else if (cursor.line > 0) {
                    cursor.line--
                    cursor.col = maxCharsPerLine - 1
                } else return
                const newMatrix = matrix.map(r => [...r])
                const px = cursor.col * charStep
                const py = cursor.line * lineStep
                for (let dr = 0; dr < CELL_HEIGHT; dr++)
                    for (let dc = 0; dc < CELL_WIDTH; dc++)
                        if (py + dr < activeModel.rows && px + dc < activeModel.cols)
                            newMatrix[py + dr][px + dc] = -1
                const next = [...currentMatrices]
                next[idx] = newMatrix
                setMatrices(next)
                return
            }

            // Space
            if (letter === ' ' || letter === 'space') {
                cursor.col++
                if (cursor.col >= maxCharsPerLine) { cursor.col = 0; cursor.line++ }
                ensureRoom()
                return
            }

            // Enter
            if (letter === '\n' || letter === 'enter') {
                cursor.col = 0; cursor.line++
                ensureRoom()
                return
            }

            const dots = BRAILLE_MAP[letter]
            if (!dots) return

            if (cursor.col >= maxCharsPerLine) {
                cursor.col = 0; cursor.line++
            }
            ensureRoom()

            // Re-read after possible page creation
            const latestMatrices = matricesRef.current
            const latestIdx = activePageIndexRef.current
            const latestMatrix = latestMatrices[latestIdx]
            if (!latestMatrix) return

            const newMatrix = latestMatrix.map(r => [...r])
            const px = cursor.col * charStep
            const py = cursor.line * lineStep
            const positions = [
                [py, px, dots[0]], [py + 1, px, dots[1]], [py + 2, px, dots[2]],
                [py, px + 1, dots[3]], [py + 1, px + 1, dots[4]], [py + 2, px + 1, dots[5]],
            ]
            for (const [r, c, val] of positions)
                if (r < activeModel.rows && c < activeModel.cols)
                    newMatrix[r][c] = val === 1 ? 1 : -1
            const next = [...latestMatrices]
            next[latestIdx] = newMatrix
            setMatrices(next)
            cursor.col++
        }

        const unsub = service.onLetterMessage(handler)
        return () => unsub()
    }, [brailleTyping, activeModel.rows, activeModel.cols, charStep, lineStep])

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
        // Reset braille cursor if matrix was cleared
        if (brailleTypingRef.current && newMatrix.every(row => row.every(cell => cell === -1))) {
            brailleCursorRef.current = { col: 0, line: 0 }
        }
        const newMatrices = [...matrices]
        newMatrices[activePageIndex] = newMatrix
        setMatrices(newMatrices)
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
                            size="icon-sm"
                            variant={brailleTyping ? "secondary" : "outline"}
                            className="size-8 rounded-lg"
                            onClick={() => {
                                const next = !brailleTyping
                                setBrailleTyping(next)
                                if (next) {
                                    brailleCursorRef.current = { col: 0, line: 0 }
                                    // Blur any focused input so useTabletNav doesn't also type
                                    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
                                    toast.success('Braille typing ON')
                                } else {
                                    toast.success('Braille typing OFF')
                                }
                            }}
                            title={brailleTyping ? 'Braille Typing: ON' : 'Braille Typing: OFF'}
                            aria-label={brailleTyping ? 'Disable braille typing' : 'Enable braille typing'}
                        >
                            <Keyboard className="size-4" />
                        </Button>
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
