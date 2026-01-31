"use client"

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import { Suspense } from 'react'
import { NotesFilter } from './NotesFilter'
import { NotesList, NotesToolbar } from './NotesList'
import { NotesSkeleton } from './NotesSkeleton'
import type { Prisma } from '@prisma/client'

type NoteWithMatrix = Prisma.NotesGetPayload<{ include: { pixelMatrix: true } }>

export function NotesPageClient() {
    const [deleteMode, setDeleteMode] = useState(false)
    const [notes, setNotes] = useState<NoteWithMatrix[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const searchParams = useSearchParams()

    const fetchNotes = useCallback(async () => {
        setIsLoading(true)
        setError(null)
        try {
            const sort = searchParams.get('sort') || 'createdAt-desc'
            const response = await fetch(`/api/notes?sort=${sort}`)
            const data = await response.json()

            if (!response.ok) {
                const message =
                    typeof data?.error === 'string'
                        ? data.error
                        : response.status === 503
                          ? 'Veritabanı zaman aşımına uğradı.'
                          : 'Notlar yüklenemedi.'
                throw new Error(message)
            }

            setNotes(data)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Bir hata oluştu.')
            console.error('Error fetching notes:', err)
        } finally {
            setIsLoading(false)
        }
    }, [searchParams])

    useEffect(() => {
        fetchNotes()
    }, [fetchNotes])

    useEffect(() => {
        const handleNotesUpdated = () => {
            fetchNotes()
        }
        
        window.addEventListener('notes-updated', handleNotesUpdated)
        return () => {
            window.removeEventListener('notes-updated', handleNotesUpdated)
        }
    }, [fetchNotes])

    if (isLoading) {
        return (
            <>
                <div className="border rounded-lg p-1 flex flex-wrap items-center justify-between gap-1 h-10.5">
                    <NotesToolbar deleteMode={deleteMode} setDeleteMode={setDeleteMode} />
                    <div className="flex items-center gap-1 h-full">
                        <Separator orientation="vertical" />
                        <Suspense fallback={<Button variant="outline" size="sm" disabled>Sırala...</Button>}>
                            <NotesFilter />
                        </Suspense>
                    </div>
                </div>
                <NotesSkeleton />
            </>
        )
    }

    if (error) {
        return (
            <>
                <div className="border rounded-lg p-1 flex flex-wrap items-center justify-between gap-1 h-10.5">
                    <NotesToolbar deleteMode={deleteMode} setDeleteMode={setDeleteMode} />
                    <div className="flex items-center gap-1 h-full">
                        <Separator orientation="vertical" />
                        <Suspense fallback={<Button variant="outline" size="sm" disabled>Sırala...</Button>}>
                            <NotesFilter />
                        </Suspense>
                    </div>
                </div>
                <div className="text-center text-destructive py-8 space-y-3">
                    <p>Hata: {error}</p>
                    <Button variant="outline" onClick={() => fetchNotes()}>
                        Yeniden dene
                    </Button>
                </div>
            </>
        )
    }

    return (
        <>
            <div className="border rounded-lg p-1 flex flex-wrap items-center justify-between gap-1 h-10.5">
                <NotesToolbar deleteMode={deleteMode} setDeleteMode={setDeleteMode} />
                <div className="flex items-center gap-1 h-full">
                    <Separator orientation="vertical" />
                    <Suspense fallback={<Button variant="outline" size="sm" disabled>Sırala...</Button>}>
                        <NotesFilter />
                    </Suspense>
                </div>
            </div>
            <NotesList notes={notes} deleteMode={deleteMode} />
        </>
    )
}
