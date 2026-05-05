"use client";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PlusIcon, TrashIcon, XIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useModel } from "@/components/providers/model-context";
import Link from "next/link";
import { useState } from "react";

import { LectureRecordSummary } from "@/lib/lecture-records-store";
type RecordsType = LectureRecordSummary;

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
                aria-label="New lecture record"
            >
                <PlusIcon size={16} />
            </Link>
            {deleteMode ? (
                <Button
                    variant="outline"
                    size="icon-sm"
                    onClick={() => setDeleteMode(false)}
                    aria-label="Cancel delete mode"
                >
                    <XIcon size={16} />
                </Button>
            ) : (
                <Button
                    variant="destructive"
                    size="icon-sm"
                    onClick={() => setDeleteMode(true)}
                    aria-label="Delete records"
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
    const { models, activeModel } = useModel();
    const recordModel = models.find(m => m.id === RecordData.deviceModelId) || activeModel;

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
                <div className="flex justify-between items-start w-full gap-2">
                    <div className="flex flex-col gap-1.5">
                        <h3 className="text-lg font-bold leading-none">
                            {RecordData.title}
                        </h3>
                        <small className="text-sm text-muted-foreground">
                            created at: {formatRecordDate(RecordData.createdAt)}
                        </small>
                    </div>
                    <Badge variant="secondary" className="text-[10px] uppercase font-mono shrink-0">
                        {recordModel.name}
                    </Badge>
                </div>
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
            <div className="flex justify-between items-start w-full gap-2">
                <div className="flex flex-col gap-1.5">
                    <h3 className="text-lg font-bold leading-none">
                        {RecordData.title}
                    </h3>
                    <small className="text-sm text-muted-foreground">
                        created at: {formatRecordDate(RecordData.createdAt)}
                    </small>
                </div>
                <Badge variant="secondary" className="text-[10px] uppercase font-mono shrink-0">
                    {recordModel.name}
                </Badge>
            </div>
        </Link>
    );
}

export default function LectureRecordsList({
    records,
    deleteMode = false,
}: LectureRecordsListProps) {
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const handleDelete = async (recordId: string) => {
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
