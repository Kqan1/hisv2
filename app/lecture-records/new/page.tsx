import { Heading } from "@/components/ui/heading";
import { FileVideoIcon } from "lucide-react";
import { NewLectureRecordForm } from "./NewLectureRecordForm";

export default function LectureRecordsNewPage() {
    return (
        <div className="space-y-4">
            <Heading
                title="New Lecture Record"
                description="Create a new animated lecture record"
                Icon={<FileVideoIcon className="size-6" />}
            />
            <NewLectureRecordForm />
        </div>
    );
}
