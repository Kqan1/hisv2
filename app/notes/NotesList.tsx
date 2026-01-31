"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { TrashIcon, XIcon, PlusIcon } from 'lucide-react'
import type { Prisma } from '@prisma/client'
import Matrix from '@/components/ui/matrix'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

type NoteWithMatrix = Prisma.NotesGetPayload<{ include: { pixelMatrix: true } }>

function formatNoteDate(createdAt: Date | string): string {
    const date = typeof createdAt === 'string' ? new Date(createdAt) : createdAt
    return date.toLocaleDateString('en-US').replace(/\//g, '-')
}

interface NotesListProps {
    notes: NoteWithMatrix[]
    deleteMode: boolean
}

export function NotesList({ notes, deleteMode }: NotesListProps) {
    const [deletingId, setDeletingId] = useState<number | null>(null)
    const router = useRouter()

    const handleDelete = async (noteId: number) => {
        if (deletingId) return // Zaten bir silme işlemi devam ediyor

        setDeletingId(noteId)
        try {
            const response = await fetch(`/api/notes/${noteId}`, {
                method: 'DELETE',
            })

            if (response.ok) {
                // Parent component'e bildirmek için event gönder
                window.dispatchEvent(new CustomEvent('notes-updated'))
            } else {
                console.error('Failed to delete note')
            }
        } catch (error) {
            console.error('Error deleting note:', error)
        } finally {
            setDeletingId(null)
        }
    }

    return (
        <div className="grid grid-cols-2 grid-rows-auto gap-2">
            {notes.map((note) => (
                <NoteCard
                    key={note.id}
                    noteData={note}
                    deleteMode={deleteMode}
                    isDeleting={deletingId === note.id}
                    onDelete={() => handleDelete(note.id)}
                />
            ))}
        </div>
    )
}

export function NotesToolbar({ deleteMode, setDeleteMode }: { deleteMode: boolean; setDeleteMode: (value: boolean) => void }) {
    return (
        <div className="flex items-center gap-1 h-full">
            <Link href="/notes/new" className={buttonVariants({ variant: "outline", size: "icon-sm" })}>
                <PlusIcon size={16} />
            </Link>
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
    )
}

interface NoteCardProps {
    noteData: NoteWithMatrix
    deleteMode: boolean
    isDeleting: boolean
    onDelete: () => void
}

function NoteCard({ noteData, deleteMode, isDeleting, onDelete }: NoteCardProps) {
    const [isHovered, setIsHovered] = useState(false)

    if (deleteMode) {
        return (
            <div
                className={cn(
                    buttonVariants({ variant: 'outline' }),
                    'size-full aspect-square flex flex-col items-stretch p-3 pb-28! text-left relative cursor-pointer',
                    isDeleting && 'opacity-50'
                )}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
                onClick={onDelete}
            >
                {isHovered && (
                    <div className="absolute inset-0 bg-destructive/20 border-2 border-destructive rounded-lg flex items-center justify-center z-10">
                        <div className="bg-destructive text-destructive-foreground rounded-full p-3">
                            <TrashIcon size={24} />
                        </div>
                    </div>
                )}
                <h3 className="text-lg font-bold leading-none">{noteData.title}</h3>
                <small className="text-sm text-muted-foreground">
                    created at: {formatNoteDate(noteData.pixelMatrix.createdAt)}
                </small>
                <div className="flex-1 min-h-0 mt-2">
                    <Matrix editable={false} initialData={noteData.pixelMatrix.matrix as number[][]} />
                </div>
            </div>
        )
    }

    return (
        <Link
            href={`/notes/${noteData.id}`}
            className={cn(
                buttonVariants({ variant: 'outline' }),
                'size-full aspect-square flex flex-col items-stretch p-3 pb-28! text-left'
            )}
        >
            <h3 className="text-lg font-bold leading-none">{noteData.title}</h3>
            <small className="text-sm text-muted-foreground">
                created at: {formatNoteDate(noteData.pixelMatrix.createdAt)}
            </small>
            <div className="flex-1 min-h-0 mt-2">
                <Matrix editable={false} initialData={noteData.pixelMatrix.matrix as number[][]} />
            </div>
        </Link>
    )
}
