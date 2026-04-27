'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import Matrix from '@/components/ui/matrix'
import { Button } from '@/components/ui/button'
import { useESP32 } from '@/hooks/useESP32'
import { cn } from '@/lib/utils'
import { useModel } from '@/components/providers/model-context'
import { toast } from 'sonner'
import { TriangleAlertIcon } from 'lucide-react'

type NoteWithMatrix = {
    id: number
    title: string
    deviceModelId: string
    createdAt: string
    updatedAt: string
    pixelMatrix: {
        id: number
        matrix: number[][]
        createdAt: string
        updatedAt: string
    } | null
}

function formatNoteDate(createdAt: Date | string): string {
    const date = typeof createdAt === 'string' ? new Date(createdAt) : createdAt
    return date.toLocaleDateString('en-US').replace(/\//g, '-')
}

export function NoteDetailClient({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params)
    const router = useRouter()
    const { setArray } = useESP32()
    const { activeModel, models } = useModel()
    const [note, setNote] = useState<NoteWithMatrix | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [editing, setEditing] = useState(false)
    const [title, setTitle] = useState('')
    const [matrix, setMatrix] = useState<number[][]>([])
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        const noteId = parseInt(id, 10)
        if (Number.isNaN(noteId)) {
            setError('Invalid note ID')
            setLoading(false)
            return
        }
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
                    const m = data.pixelMatrix?.matrix
                    setMatrix(Array.isArray(m) ? m : [])
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

    // Send matrix to ESP32 when note is loaded
    useEffect(() => {
        if (!note?.pixelMatrix?.matrix) return
        const m = note.pixelMatrix.matrix as number[][]
        if (!Array.isArray(m) || m.length !== activeModel.rows || (m[0] && m[0].length !== activeModel.cols)) return
        setArray(m, { cycle: true })
    }, [note?.id, setArray])

    const handleSave = async () => {
        if (!note) return
        setSaving(true)
        setError(null)
        try {
            const res = await fetch(`/api/notes/${note.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: title.trim(), matrix }),
            })
            const data = await res.json()
            if (!res.ok) {
                const msg = data.error ?? 'Failed to update note'
                setError(msg)
                toast.error(msg)
                return
            }
            setNote(data)
            setEditing(false)
        } catch {
            setError('Failed to update note')
            toast.error('Failed to update note')
        } finally {
            setSaving(false)
        }
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

    const matrixData = (note.pixelMatrix?.matrix as number[][]) ?? matrix

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
                            'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-semibold',
                            'ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
                        )}
                    />
                ) : (
                    <h2 className="text-2xl font-bold">{note.title}</h2>
                )}
                <small className="text-sm text-muted-foreground">
                    created at: {formatNoteDate(note.pixelMatrix?.createdAt ?? note.createdAt)}
                </small>
            </div>

            <div className="space-y-2">
                <div className="border-dashed border rounded-lg p-2 min-h-[200px]">
                    <Matrix
                        key={editing ? 'edit' : 'view'}
                        initialData={editing ? matrix : matrixData}
                        rows={recordModel.rows}
                        cols={recordModel.cols}
                        onChange={setMatrix}
                        editable={editing}
                    />
                </div>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex gap-2">
                {editing ? (
                    <>
                        <Button onClick={handleSave} disabled={saving}>
                            {saving ? 'Saving…' : 'Save'}
                        </Button>
                        <Button
                            variant="outline"
                            onClick={() => {
                                setEditing(false)
                                setTitle(note.title)
                                setMatrix((note.pixelMatrix?.matrix as number[][]) ?? [])
                            }}
                            disabled={saving}
                        >
                            Cancel
                        </Button>
                    </>
                ) : (
                    <Button variant="outline" onClick={() => setEditing(true)}>
                        Edit
                    </Button>
                )}
                <Button variant="ghost" onClick={() => router.push('/notes')}>
                    Back to notes
                </Button>
            </div>
        </div>
    )
}
