import { Heading } from '@/components/ui/heading'
import { NotebookIcon } from 'lucide-react'
import { NotesPageClient } from './NotesPageClient';

export const dynamic = 'force-dynamic';

export default function Notes() {
    return (
        <div className="space-y-4 min-h-screen">
            <Heading title="Notes" description="You can write your notes here" Icon={<NotebookIcon size={42} />} />
            <NotesPageClient />
        </div>
    );
}
