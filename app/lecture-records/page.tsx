import { LectureRecordsPageClient } from '@/app/lecture-records/LectureRecordsPageClient';
import { Heading } from '@/components/ui/heading';
import { BookOpenIcon } from 'lucide-react'
import { Suspense } from 'react';

export const dynamic = 'force-dynamic';

export default function LectureRecords() {
    return (
        <div className="space-y-4">
            <Heading title="Lecture Records" description="You can view your lecture records here" Icon={<BookOpenIcon className="size-6" />} />
            <Suspense fallback={<div>Loading...</div>}>
                <LectureRecordsPageClient />
            </Suspense>
        </div>
    );
};