import { Heading } from '@/components/ui/heading'
import { FileText } from 'lucide-react'

export default function PDF() {
    return (
        <div className="space-y-4">
            <Heading title="PDF to Matrix" description="You can convert your PDF to matrix here" Icon={<FileText className="size-6" />} />
            <div className="border-dashed border rounded p-2 flex flex-col items-center justify-center aspect-square gap-4">
                <FileText className="size-16" />
                <p className="text-xl text-center text-muted-foreground">Drag and drop your PDF here or click to upload</p>
            </div>
        </div>
    );
};