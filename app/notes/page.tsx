import { Heading } from '@/components/ui/heading'
import { NotebookIcon } from 'lucide-react'
import { NotesPageClient } from './NotesPageClient';

export default function Notes() {
    return (
        <div className="space-y-4">
            <Heading title="Notes" description="You can write your notes here" Icon={<NotebookIcon size={42} />} />
            <NotesPageClient />
        </div>
    );
}
