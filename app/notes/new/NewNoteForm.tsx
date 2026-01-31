'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Matrix from '@/components/ui/matrix'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function NewNoteForm() {
    const router = useRouter()
    const [title, setTitle] = useState('')
    const [matrix, setMatrix] = useState<number[][]>(() =>
        Array(10)
            .fill(0)
            .map(() => Array(15).fill(0))
    )
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)
        if (!title.trim()) {
            setError('Title is required')
            return
        }
        setIsSubmitting(true)
        try {
            const res = await fetch('/api/notes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: title.trim(), matrix }),
            })
            const data = await res.json()
            if (!res.ok) {
                setError(data.error ?? 'Failed to create note')
                return
            }
            router.push(`/notes/${data.id}`)
        } catch {
            setError('Failed to create note')
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
                <label htmlFor="title" className="text-sm font-medium">
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
                        'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background',
                        'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                        'disabled:cursor-not-allowed disabled:opacity-50'
                    )}
                />
            </div>
            <div className="space-y-2">
                <label className="text-sm font-medium">Matrix</label>
                <div className="border rounded-lg p-2 min-h-[200px]">
                    <Matrix
                        initialData={matrix}
                        onChange={setMatrix}
                        editable
                    />
                </div>
            </div>
            {error && (
                <p className="text-sm text-destructive">{error}</p>
            )}
            <div className="flex gap-2">
                <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? 'Creating…' : 'Create note'}
                </Button>
                <Button
                    type="button"
                    variant="outline"
                    onClick={() => router.push('/notes')}
                    disabled={isSubmitting}
                >
                    Cancel
                </Button>
            </div>
        </form>
    )
}
