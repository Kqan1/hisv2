import { Heading } from '@/components/ui/heading'
import { FileText } from 'lucide-react'
import { NoteDetailClient } from './NoteDetailClient'

export default function NoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
    return (
        <div className="space-y-4">
            <Heading
                title="Note"
                description="View and edit your note"
                Icon={<FileText size={42} />}
            />
            <NoteDetailClient params={params} />
        </div>
    )
}
