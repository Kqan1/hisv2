import { Heading } from '@/components/ui/heading'
import { FilePlus2 } from 'lucide-react'
import { NewNoteForm } from './NewNoteForm'

export default function NewNote() {
    return (
        <div className="space-y-4">
            <Heading
                title="New note"
                description="Add a title and draw your note"
                Icon={<FilePlus2 size={42} />}
            />
            <NewNoteForm />
        </div>
    )
}
