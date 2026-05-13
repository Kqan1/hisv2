'use client'

import { useState, useEffect, use, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Matrix from '@/components/ui/matrix'
import { Button } from '@/components/ui/button'
import { useESP32 } from '@/hooks/useESP32'
import { cn } from '@/lib/utils'
import { useModel } from '@/components/providers/model-context'
import { toast } from 'sonner'
import { TriangleAlertIcon, ChevronLeft, ChevronRight, Plus, Trash2, MonitorUp, BrainCircuit, Loader2, Keyboard } from 'lucide-react'
import { useAskAI } from '@/hooks/useAskAI'
import { BRAILLE_MAP, CELL_WIDTH, CELL_HEIGHT } from '@/lib/braille'
import { getESP32Service } from '@/services/esp32.service'

type NotePage = {
    id: string
    matrix: number[][]
    createdAt: string
    updatedAt: string
}

type NoteWithMatrix = {
    id: string
    title: string
    deviceModelId: string
    createdAt: string
    updatedAt: string
    pages: NotePage[]
}

function formatNoteDate(createdAt: Date | string): string {
    const date = typeof createdAt === 'string' ? new Date(createdAt) : createdAt
    return date.toLocaleDateString('en-US').replace(/\//g, '-')
}

export function NoteDetailClient({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params)
    const router = useRouter()
    const { setArray, enableLoop } = useESP32()
    const { activeModel, models } = useModel()
    const [note, setNote] = useState<NoteWithMatrix | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [editing, setEditing] = useState(false)
    const [title, setTitle] = useState('')
    const [pages, setPages] = useState<NotePage[]>([])
    const [activePageIndex, setActivePageIndex] = useState(0)
    const [saving, setSaving] = useState(false)
    const [isDisplaying, setIsDisplaying] = useState(false)

    const pagesRef = useRef<NotePage[]>([])
    const activePageIndexRef = useRef(0)
    const titleRef = useRef('')
    pagesRef.current = pages
    activePageIndexRef.current = activePageIndex
    titleRef.current = title

    // ── Braille Typing Mode ──
    const [brailleTyping, setBrailleTyping] = useState(false)
    const brailleTypingRef = useRef(false)
    brailleTypingRef.current = brailleTyping
    const brailleCursorRef = useRef({ col: 0, line: 0 })

    const CHAR_GAP = 1
    const LINE_GAP = 1
    const charStep = CELL_WIDTH + CHAR_GAP
    const lineStep = CELL_HEIGHT + LINE_GAP

    useEffect(() => {
        if (!brailleTyping) return
        const service = getESP32Service()

        const maxCharsPerLine = Math.floor((activeModel.cols + CHAR_GAP) / charStep)
        const maxLinesPerPage = Math.floor((activeModel.rows + LINE_GAP) / lineStep)

        // Helper: ensure we're on a page with room, or create one
        const ensureRoom = () => {
            const cursor = brailleCursorRef.current
            if (cursor.line < maxLinesPerPage) return

            // Page is full — add a new page
            const currentPages = pagesRef.current
            const newPage: NotePage = {
                id: `temp-${Date.now()}`,
                matrix: Array(activeModel.rows).fill(0).map(() => Array(activeModel.cols).fill(-1)),
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            }
            const newPages = [...currentPages, newPage]
            // Update refs immediately so handler reads correct data
            pagesRef.current = newPages
            activePageIndexRef.current = newPages.length - 1
            // Trigger React re-render
            setPages(newPages)
            setActivePageIndex(newPages.length - 1)
            cursor.col = 0
            cursor.line = 0
        }

        const handler = (msg: any) => {
            if (msg.type !== 'letter' || !msg.letter) return
            if (!brailleTypingRef.current) return
            if (service.navActive || document.body.hasAttribute('data-tablet-nav')) return

            const currentPages = pagesRef.current
            const idx = activePageIndexRef.current
            const page = currentPages[idx]
            if (!page?.matrix) return

            const cursor = brailleCursorRef.current
            const letter = msg.letter.toLowerCase()

            // Handle backspace
            if (letter === '\b' || letter === 'backspace') {
                if (cursor.col > 0) {
                    cursor.col--
                } else if (cursor.line > 0) {
                    cursor.line--
                    cursor.col = maxCharsPerLine - 1
                } else {
                    return
                }
                const newMatrix = page.matrix.map(r => [...r])
                const pixelCol = cursor.col * charStep
                const pixelRow = cursor.line * lineStep
                for (let dr = 0; dr < CELL_HEIGHT; dr++) {
                    for (let dc = 0; dc < CELL_WIDTH; dc++) {
                        const r = pixelRow + dr
                        const c = pixelCol + dc
                        if (r < activeModel.rows && c < activeModel.cols) {
                            newMatrix[r][c] = -1
                        }
                    }
                }
                const newPages = [...currentPages]
                newPages[idx] = { ...page, matrix: newMatrix, updatedAt: new Date().toISOString() }
                setPages(newPages)
                return
            }

            // Handle space
            if (letter === ' ' || letter === 'space') {
                cursor.col++
                if (cursor.col >= maxCharsPerLine) {
                    cursor.col = 0
                    cursor.line++
                }
                ensureRoom()
                return
            }

            // Handle enter
            if (letter === '\n' || letter === 'enter') {
                cursor.col = 0
                cursor.line++
                ensureRoom()
                return
            }

            // Look up braille dots
            const dots = BRAILLE_MAP[letter]
            if (!dots) return

            // Wrap if needed
            if (cursor.col >= maxCharsPerLine) {
                cursor.col = 0
                cursor.line++
            }
            ensureRoom()

            // Re-read page after possible new page creation
            const latestPages = pagesRef.current
            const latestIdx = activePageIndexRef.current
            const latestPage = latestPages[latestIdx]
            if (!latestPage?.matrix) return

            // Stamp braille cell onto matrix
            const newMatrix = latestPage.matrix.map(r => [...r])
            const pixelCol = cursor.col * charStep
            const pixelRow = cursor.line * lineStep
            const positions = [
                [pixelRow + 0, pixelCol + 0, dots[0]],
                [pixelRow + 1, pixelCol + 0, dots[1]],
                [pixelRow + 2, pixelCol + 0, dots[2]],
                [pixelRow + 0, pixelCol + 1, dots[3]],
                [pixelRow + 1, pixelCol + 1, dots[4]],
                [pixelRow + 2, pixelCol + 1, dots[5]],
            ]
            for (const [r, c, val] of positions) {
                if (r < activeModel.rows && c < activeModel.cols) {
                    newMatrix[r][c] = val === 1 ? 1 : -1
                }
            }

            const newPages = [...latestPages]
            newPages[latestIdx] = { ...latestPage, matrix: newMatrix, updatedAt: new Date().toISOString() }
            setPages(newPages)
            cursor.col++
        }

        const unsub = service.onLetterMessage(handler)
        return () => unsub()
    }, [brailleTyping, activeModel.rows, activeModel.cols, charStep, lineStep])

    // Ask AI Teacher shortcut (Space+F on tablet keyboard)
    const askAI = useAskAI({
        getContext: useCallback(() => {
            const p = pagesRef.current[activePageIndexRef.current]
            return {
                matrix: p?.matrix || null,
                description: `Note: "${titleRef.current}", Page ${activePageIndexRef.current + 1} of ${pagesRef.current.length}`,
                source: 'Notes',
            }
        }, []),
        enableHardwareKeyboard: true,
    })

    useEffect(() => {
        let cancelled = false
        setLoading(true)
        setError(null)
        fetch(`/api/notes/${id}`)
            .then((res) => {
                if (!res.ok) throw new Error(res.status === 404 ? 'Note not found' : 'Failed to load note')
                return res.json()
            })
            .then((data: NoteWithMatrix) => {
                if (!cancelled) {
                    setNote(data)
                    setTitle(data.title)
                    setPages(data.pages || [])
                    setActivePageIndex(0)
                }
            })
            .catch((err) => {
                if (!cancelled) {
                    const msg = err.message ?? 'Failed to load note'
                    setError(msg)
                    toast.error(msg)
                }
            })
            .finally(() => {
                if (!cancelled) setLoading(false)
            })
        return () => {
            cancelled = true
        }
    }, [id])

    // Auto-sync active matrix to ESP32 only if display mode is active
    useEffect(() => {
        if (!isDisplaying) return
        const activePage = pages[activePageIndex]
        if (!activePage?.matrix) return
        const m = activePage.matrix
        if (!Array.isArray(m) || m.length !== activeModel.rows || (m[0] && m[0].length !== activeModel.cols)) return
        setArray(m, { cycle: true })
    }, [activePageIndex, pages, setArray, activeModel, isDisplaying])

    const handleSendToTablet = async () => {
        if (isDisplaying) {
            setIsDisplaying(false)
            try {
                // Set all pixels to -1
                const emptyMatrix = Array(activeModel.rows).fill(0).map(() => Array(activeModel.cols).fill(-1))
                await enableLoop(true)
                await setArray(emptyMatrix, { cycle: false })
                
                // Wait for 1 second to firmly clear the screen before turning off loop
                setTimeout(() => {
                    enableLoop(false).catch(() => {})
                }, 1000)
                
                toast.success("Turned off display")
            } catch (e) {
                toast.error("Failed to turn off display")
            }
        } else {
            const activePage = pages[activePageIndex]
            if (!activePage?.matrix) return
            const m = activePage.matrix
            if (!Array.isArray(m) || m.length !== activeModel.rows || (m[0] && m[0].length !== activeModel.cols)) {
                toast.error("Invalid matrix format for current model")
                return
            }
            
            setIsDisplaying(true)
            try {
                await enableLoop(true)
                await setArray(m, { cycle: false })
                toast.success("Sent to tablet!")
            } catch (e) {
                setIsDisplaying(false)
                toast.error("Failed to send to tablet")
            }
        }
    }

    const handleSave = async () => {
        if (!note) return
        setSaving(true)
        setError(null)
        try {
            const res = await fetch(`/api/notes/${note.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: title.trim(), pages }),
            })
            const data = await res.json()
            if (!res.ok) {
                const msg = data.error ?? 'Failed to update note'
                setError(msg)
                toast.error(msg)
                return
            }
            setNote(data)
            setPages(data.pages)
            setEditing(false)
            toast.success('Note saved successfully')
        } catch {
            setError('Failed to update note')
            toast.error('Failed to update note')
        } finally {
            setSaving(false)
        }
    }

    const addPage = () => {
        const newPage: NotePage = {
            id: `temp-${Date.now()}`,
            matrix: Array(activeModel.rows).fill(0).map(() => Array(activeModel.cols).fill(-1)),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        }
        setPages([...pages, newPage])
        setActivePageIndex(pages.length)
    }

    const deletePage = (index: number) => {
        if (pages.length <= 1) {
            toast.error("At least one page is required")
            return
        }
        const newPages = pages.filter((_, i) => i !== index)
        setPages(newPages)
        if (activePageIndex >= newPages.length) {
            setActivePageIndex(newPages.length - 1)
        }
    }

    const updateActiveMatrix = (newMatrix: number[][]) => {
        // Reset braille cursor if matrix was cleared
        if (brailleTypingRef.current && newMatrix.every(row => row.every(cell => cell === -1))) {
            brailleCursorRef.current = { col: 0, line: 0 }
        }

        const newPages = [...pages]
        newPages[activePageIndex] = {
            ...newPages[activePageIndex],
            matrix: newMatrix,
            updatedAt: new Date().toISOString()
        }
        setPages(newPages)
    }

    if (loading) {
        return (
            <div className="space-y-4">
                <div className="h-10 w-48 rounded-md bg-muted animate-pulse" />
                <div className="border rounded-lg p-4 min-h-[200px] bg-muted/30 animate-pulse" />
            </div>
        )
    }

    if (error || !note) {
        return (
            <div className="space-y-4">
                <p className="text-destructive">{error ?? 'Note not found'}</p>
                <Button variant="outline" onClick={() => router.push('/notes')}>
                    Back to notes
                </Button>
            </div>
        )
    }

    const isModelMismatch = note.deviceModelId !== activeModel.id
    const recordModel = models.find(m => m.id === note.deviceModelId) || activeModel

    if (isModelMismatch) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6">
                <div className="bg-destructive/10 p-6 rounded-full border border-destructive/20">
                    <TriangleAlertIcon className="size-16 text-destructive" />
                </div>
                <div className="space-y-2 max-w-md">
                    <h2 className="text-3xl font-bold tracking-tight text-destructive">Model Mismatch</h2>
                    <p className="text-muted-foreground text-lg">
                        This note was created with <strong>{recordModel.name}</strong> model. 
                        To view or edit it, please change your device model in Settings.
                    </p>
                </div>
                <Button
                    size="lg"
                    onClick={() => router.push("/notes")}
                >
                    Back to notes
                </Button>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div className="space-y-2 flex-1">
                    {editing ? (
                        <input
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="Title"
                            maxLength={255}
                            className={cn(
                                'flex h-12 w-full rounded-md border border-input bg-background px-4 py-2 text-xl font-bold',
                                'ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
                            )}
                        />
                    ) : (
                        <h2 className="text-3xl font-bold tracking-tight">{note.title}</h2>
                    )}
                    <div className="flex items-center gap-2">
                        <small className="text-sm text-muted-foreground font-medium">
                            Created: {formatNoteDate(note.createdAt)}
                        </small>
                        <span className="text-muted-foreground/30">•</span>
                        <small className="text-sm text-muted-foreground font-medium">
                            {pages.length} Pages
                        </small>
                    </div>
                </div>

                <div className="flex gap-1.5 shrink-0">
                    {!editing && (
                        <>
                            <Button 
                                size="icon-sm" 
                                variant={isDisplaying ? "secondary" : "default"} 
                                onClick={handleSendToTablet}
                                title={isDisplaying ? "Hide Display" : "Send to Display"}
                                aria-label={isDisplaying ? "Hide Display" : "Send to Display"}
                            >
                                <MonitorUp size={16} />
                            </Button>
                            <Button
                                size="icon-sm"
                                variant={brailleTyping ? "secondary" : "outline"}
                                onClick={() => {
                                    const next = !brailleTyping
                                    setBrailleTyping(next)
                                    if (next) {
                                        brailleCursorRef.current = { col: 0, line: 0 }
                                        if (!editing) setEditing(true)
                                        if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
                                        toast.success('Braille typing ON — type on tablet keyboard')
                                    } else {
                                        toast.success('Braille typing OFF')
                                    }
                                }}
                                title={brailleTyping ? 'Braille Typing: ON' : 'Braille Typing: OFF'}
                                aria-label={brailleTyping ? 'Disable braille typing' : 'Enable braille typing'}
                            >
                                <Keyboard size={16} />
                            </Button>
                            <Button
                                size="icon-sm"
                                variant={askAI.isTriggering ? "secondary" : "outline"}
                                onClick={askAI.trigger}
                                disabled={askAI.isTriggering}
                                title="Ask AI Teacher (Space+F)"
                                aria-label="Ask AI Teacher"
                            >
                                {askAI.isTriggering ? (
                                    <Loader2 size={16} className="animate-spin" />
                                ) : (
                                    <BrainCircuit size={16} />
                                )}
                            </Button>
                        </>
                    )}
                    {editing ? (
                        <>
                            <Button size="sm" onClick={handleSave} disabled={saving}>
                                {saving ? 'Saving…' : 'Save'}
                            </Button>
                            <Button
                                size="icon-sm"
                                variant="outline"
                                onClick={() => {
                                    setEditing(false)
                                    setTitle(note.title)
                                    setPages(note.pages || [])
                                    setActivePageIndex(0)
                                }}
                                disabled={saving}
                                title="Cancel editing"
                            >
                                ✕
                            </Button>
                        </>
                    ) : (
                        <Button size="icon-sm" variant="outline" onClick={() => setEditing(true)} title="Edit Note">
                            ✎
                        </Button>
                    )}
                </div>
            </div>

            <div className="space-y-4">
                <div className="flex items-center justify-between bg-muted/30 p-2 rounded-xl border border-border/50">
                    <div className="flex items-center gap-2">
                        <Button 
                            variant="ghost" 
                            size="icon-sm" 
                            onClick={() => setActivePageIndex(prev => Math.max(0, prev - 1))}
                            disabled={activePageIndex === 0}
                            aria-label="Previous page"
                        >
                            <ChevronLeft className="size-5" />
                        </Button>
                        <div className="flex items-center gap-1.5 px-2 overflow-x-auto max-w-[200px] md:max-w-md no-scrollbar">
                            {pages.map((_, i) => (
                                <button
                                    key={i}
                                    onClick={() => setActivePageIndex(i)}
                                    aria-label={`Page ${i + 1}`}
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
                            variant="ghost" 
                            size="icon-sm" 
                            onClick={() => setActivePageIndex(prev => Math.min(pages.length - 1, prev + 1))}
                            disabled={activePageIndex === pages.length - 1}
                            aria-label="Next page"
                        >
                            <ChevronRight className="size-5" />
                        </Button>
                    </div>

                    {editing && (
                        <div className="flex items-center gap-2">
                            <Button 
                                variant="secondary" 
                                size="sm" 
                                className="h-8 px-3 rounded-lg font-bold"
                                onClick={addPage}
                            >
                                <Plus className="size-4 mr-1.5" /> New Page
                            </Button>
                            <Button 
                                variant="destructive" 
                                size="icon-sm" 
                                className="size-8 rounded-lg"
                                onClick={() => deletePage(activePageIndex)}
                                disabled={pages.length <= 1}
                                aria-label="Delete this page"
                            >
                                <Trash2 className="size-4" />
                            </Button>
                        </div>
                    )}
                </div>

                <div className="relative group w-full">
                    <div className="absolute inset-0 bg-primary/5 rounded-2xl -m-2 -z-10 group-hover:bg-primary/10 transition-colors" />
                    <div className="bg-background border rounded-2xl p-4 shadow-xl ring-1 ring-border/50 overflow-x-auto w-full">
                        <div className="w-full max-w-2xl mx-auto min-w-[280px]">
                            <Matrix
                                key={`${editing}-${activePageIndex}`}
                                initialData={pages[activePageIndex]?.matrix}
                                rows={recordModel.rows}
                                cols={recordModel.cols}
                                onChange={updateActiveMatrix}
                                editable={editing}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {error && <p className="text-sm text-destructive font-medium bg-destructive/10 p-3 rounded-lg border border-destructive/20">{error}</p>}
        </div>
    )
}
