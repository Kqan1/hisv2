"use client";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Prisma } from "@prisma/client";
import { PlusIcon, TrashIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

type RecordsType = Prisma.LectureRecordGetPayload<{
    include: { frames: { include: { pixelMatrix: true } }; _count: true };
}>;

function formatRecordDate(createdAt: Date | string): string {
    const date =
        typeof createdAt === "string" ? new Date(createdAt) : createdAt;
    return date.toLocaleDateString("en-US").replace(/\//g, "-");
}

interface LectureRecordsListProps {
    records: RecordsType[];
    deleteMode: boolean;
}

export function LectureRecordsToolbar({
    deleteMode,
    setDeleteMode,
}: {
    deleteMode: boolean;
    setDeleteMode: (value: boolean) => void;
}) {
    return (
        <div className="flex items-center gap-1 h-full">
            <Link
                href="/lecture-records/new"
                className={buttonVariants({
                    variant: "outline",
                    size: "icon-sm",
                })}
            >
                <PlusIcon size={16} />
            </Link>
            {deleteMode ? (
                <Button
                    variant="outline"
                    size="icon-sm"
                    onClick={() => setDeleteMode(false)}
                >
                    <XIcon size={16} />
                </Button>
            ) : (
                <Button
                    variant="destructive"
                    size="icon-sm"
                    onClick={() => setDeleteMode(true)}
                >
                    <TrashIcon size={16} />
                </Button>
            )}
        </div>
    );
}

interface LectureRecordCardProps {
    RecordData: RecordsType;
    deleteMode: boolean;
    isDeleting: boolean;
    onDelete: () => void;
}

function LectureRecordCard({
    RecordData,
    deleteMode,
    isDeleting,
    onDelete,
}: LectureRecordCardProps) {
    const [isHovered, setIsHovered] = useState(false);

    if (deleteMode) {
        return (
            <div
                className={cn(
                    buttonVariants({ variant: "outline" }),
                    "size-full flex flex-col items-stretch p-3 text-left relative cursor-pointer",
                    isDeleting && "opacity-50",
                )}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
                onClick={onDelete}
            >
                {isHovered && (
                    <div className="absolute inset-0 bg-destructive/20 border-2 border-destructive rounded-lg flex items-center justify-center z-10">
                        <div className="bg-destructive text-destructive-foreground rounded-full p-3">
                            <TrashIcon size={24} />
                        </div>
                    </div>
                )}
                <h3 className="text-lg font-bold leading-none">
                    {RecordData.title}
                </h3>
                <small className="text-sm text-muted-foreground">
                    created at: {formatRecordDate(RecordData.createdAt)}
                </small>
            </div>
        );
    }

    return (
        <Link
            href={`/lecture-records/${RecordData.id}`}
            className={cn(
                buttonVariants({ variant: "outline" }),
                "size-full flex flex-col items-stretch p-3 text-left",
            )}
        >
            <h3 className="text-lg font-bold leading-none">
                {RecordData.title}
            </h3>
            <small className="text-sm text-muted-foreground">
                created at: {formatRecordDate(RecordData.createdAt)}
            </small>
        </Link>
    );
}

export default function LectureRecordsList({
    records,
    deleteMode = false,
}: LectureRecordsListProps) {
    const [deletingId, setDeletingId] = useState<number | null>(null);

    const handleDelete = async (recordId: number) => {
        if (deletingId) return; // Zaten bir silme işlemi devam ediyor

        setDeletingId(recordId);
        try {
            const response = await fetch(`/api/lecture-records/${recordId}`, {
                method: "DELETE",
            });

            if (response.ok) {
                // Parent component'e bildirmek için event gönder
                window.dispatchEvent(new CustomEvent("records-updated"));
            } else {
                console.error("Failed to delete record");
            }
        } catch (error) {
            console.error("Error deleting record:", error);
        } finally {
            setDeletingId(null);
        }
    };

    return (
        <div className="flex flex-col gap-2">
            {records.map((data) => (
                <LectureRecordCard
                    key={data.id}
                    RecordData={data}
                    deleteMode={deleteMode}
                    isDeleting={deletingId === data.id}
                    onDelete={() => handleDelete(data.id)}
                />
            ))}
        </div>
    );
}

// TODO: API AYARLANACAK, YENİ EKLEME SAYFASI YAPILACAK.
