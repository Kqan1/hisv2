import LectureRecordDetailClient from "./lectureRecordDetailClient";
import { Heading } from "@/components/ui/heading";
import { BookOpenIcon } from "lucide-react";

export default function LectureRecordDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    return (
        <div className="space-y-4">
            <Heading
                title="Lecture Record"
                description="View and edit your lecture record"
                Icon={<BookOpenIcon className="size-6" />}
            />
            <LectureRecordDetailClient params={params} />
        </div>
    );
}
