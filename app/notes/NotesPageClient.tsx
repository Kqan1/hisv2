"use client"

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import { Suspense } from 'react'
import { NotesList, NotesToolbar } from './NotesList'
import { NotesSkeleton } from './NotesSkeleton'
import { NoteWithMatrix } from '@/lib/notes-store'
import { SortButton } from '@/components/ui/sortButton'
import { Ghost, ChevronLeft, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'

export function NotesPageClient() {
    const [deleteMode, setDeleteMode] = useState(false)
    const [notes, setNotes] = useState<NoteWithMatrix[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [pagination, setPagination] = useState({
        total: 0,
        page: 1,
        pageSize: 10,
        totalPages: 0
    })
    
    const searchParams = useSearchParams()
    const router = useRouter()
    const page = parseInt(searchParams.get('page') || '1')

    const fetchNotes = useCallback(async () => {
        setIsLoading(true)
        setError(null)
        try {
            const response = await fetch(`/api/notes?page=${page}`)
            const data = await response.json()

            if (!response.ok) {
                throw new Error(data?.error || 'Notlar yüklenemedi.')
            }

            setNotes(data.data)
            setPagination(data.pagination)
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Bir hata oluştu.'
            setError(msg)
            toast.error(msg)
            console.error('Error fetching notes:', err)
        } finally {
            setIsLoading(false)
        }
    }, [page])

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

    const handlePageChange = (newPage: number) => {
        const params = new URLSearchParams(searchParams.toString())
        params.set('page', newPage.toString())
        router.push(`/notes?${params.toString()}`)
    }

    const toolbar = (
        <div className="border rounded-lg p-1 flex flex-wrap items-center justify-between gap-1 h-10.5">
            <NotesToolbar deleteMode={deleteMode} setDeleteMode={setDeleteMode} />
            <div className="flex items-center gap-1 h-full">
                <Separator orientation="vertical" />
                <Suspense fallback={<Button variant="outline" size="sm" disabled>Sırala...</Button>}>
                    <SortButton pathname="/notes" />
                </Suspense>
            </div>
        </div>
    )

    if (isLoading) {
        return (
            <>
                {toolbar}
                <NotesSkeleton />
            </>
        )
    }

    if (error) {
        return (
            <>
                {toolbar}
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
        <div className="flex flex-col gap-6">
            {toolbar}
            
            { notes.length <= 0 ? 
                <div className="flex flex-col items-center justify-center gap-6 mt-16"><Ghost className="stroke-muted-foreground" size={100} /><p className="text-4xl font-bold text-center text-muted-foreground">There is nothing to see here</p></div> : 
                <>
                    <NotesList notes={notes} deleteMode={deleteMode} />
                    
                    {pagination.totalPages > 1 && (
                        <div className="flex items-center justify-center gap-4 py-4">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handlePageChange(pagination.page - 1)}
                                disabled={pagination.page <= 1}
                            >
                                <ChevronLeft className="w-4 h-4 mr-1" /> Previous
                            </Button>
                            <span className="text-sm font-medium">
                                Page {pagination.page} of {pagination.totalPages}
                            </span>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handlePageChange(pagination.page + 1)}
                                disabled={pagination.page >= pagination.totalPages}
                            >
                                Next <ChevronRight className="w-4 h-4 ml-1" />
                            </Button>
                        </div>
                    )}
                </>
            }
        </div>
    )
}
