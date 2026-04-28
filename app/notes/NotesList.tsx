import { useState } from 'react'
import { TrashIcon, XIcon, PlusIcon } from 'lucide-react'
import { NoteWithMatrix } from '@/lib/notes-store'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { useModel } from '@/components/providers/model-context'
import { buttonVariants } from '@/components/ui/button'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

function formatNoteDate(createdAt: Date | string): string {
    const date = typeof createdAt === 'string' ? new Date(createdAt) : createdAt
    return date.toLocaleDateString('en-US').replace(/\//g, '-')
}

interface NotesListProps {
    notes: NoteWithMatrix[]
    deleteMode: boolean
}

export function NotesList({ notes, deleteMode }: NotesListProps) {
    const [deletingId, setDeletingId] = useState<string | null>(null)

    const handleDelete = async (noteId: string) => {
        if (deletingId) return

        setDeletingId(noteId)
        try {
            const response = await fetch(`/api/notes/${noteId}`, {
                method: 'DELETE',
            })

            if (response.ok) {
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
        <div className="flex flex-col gap-2">
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
    const { models, activeModel } = useModel()
    const recordModel = models.find(m => m.id === (noteData as any).deviceModelId) || activeModel

    if (deleteMode) {
        return (
            <div
                className={cn(
                    buttonVariants({ variant: 'outline' }),
                    'size-full flex flex-col items-stretch p-3 text-left relative cursor-pointer',
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
                <div className="flex justify-between items-start w-full gap-2">
                    <div className="flex flex-col gap-1.5">
                        <h3 className="text-lg font-bold leading-none">{noteData.title}</h3>
                        <small className="text-sm text-muted-foreground">
                            created at: {formatNoteDate(noteData.createdAt)}
                        </small>
                    </div>
                    <Badge variant="secondary" className="text-[10px] uppercase font-mono shrink-0">
                        {recordModel.name}
                    </Badge>
                </div>
            </div>
        )
    }

    return (
        <Link
            href={`/notes/${noteData.id}`}
            className={cn(
                buttonVariants({ variant: 'outline' }),
                'size-full flex flex-col items-stretch p-3 text-left'
            )}
        >
            <div className="flex justify-between items-start w-full gap-2">
                <div className="flex flex-col gap-1.5">
                    <h3 className="text-lg font-bold leading-none">{noteData.title}</h3>
                    <small className="text-sm text-muted-foreground">
                        created at: {formatNoteDate(noteData.createdAt)}
                    </small>
                </div>
                <Badge variant="secondary" className="text-[10px] uppercase font-mono shrink-0">
                    {recordModel.name}
                </Badge>
            </div>
        </Link>
    )
}

