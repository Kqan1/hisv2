import { Heading } from '@/components/ui/heading';
import { BookOpenIcon } from 'lucide-react';

export default function LectureRecords() {
    return (
        <div className="space-y-4">
            <Heading title="Lecture Records" description="You can view your lecture records here" Icon={<BookOpenIcon className="size-6" />} />
        </div>
    );
};