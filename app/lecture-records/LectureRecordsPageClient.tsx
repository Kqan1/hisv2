"use client";

import LectureRecordsList, { LectureRecordsToolbar } from "@/app/lecture-records/LectureRecordsList";
import { LectureRecordsSkeleton } from "@/app/lecture-records/LectureRecordsSkeleton";
import { Button } from "@/components/ui/button";
import { SortButton } from "@/components/ui/sortButton";
import { Prisma } from "@prisma/client";
import { Separator } from "@radix-ui/react-separator";
import { Ghost } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";

type RecordsType = Prisma.LectureRecordGetPayload<{ include: { frames: { include: { pixelMatrix: true } }, _count: true } }>

export function LectureRecordsPageClient() {
    const [deleteMode, setDeleteMode] = useState<boolean>(false)
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [records, setRecords] = useState<RecordsType[]>([])
    const searchParams = useSearchParams()

    const fetchRecords = useCallback(async () => {
        setIsLoading(true)
        setError(null)
        try {
            const sort = searchParams.get('sort') || 'createdAt-desc'
            const response = await fetch(`/api/lecture-records?sort=${sort}`)
            const data = await response.json()

            if (!response.ok) {
                const message =
                    typeof data?.error === 'string'
                        ? data.error
                        : response.status === 503
                            ? 'Veritabanı zaman aşımına uğradı.'
                            : 'Notlar yüklenemedi.'
                throw new Error(message)
            };

            setRecords(data.data)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Bir hata oluştu.')
            console.error('Error fetching records:', err)
        } finally {
            setIsLoading(false)
        }
    }, [searchParams])

    useEffect(() => {
        fetchRecords()
    }, [fetchRecords])

    useEffect(() => {
        const handleRecordsUpdated = () => {
            fetchRecords()
        }
        
        window.addEventListener('records-updated', handleRecordsUpdated)
        return () => {
            window.removeEventListener('records-updated', handleRecordsUpdated)
        }
    }, [fetchRecords])

    console.log("records page client: ",records)

    if (isLoading) {
        return (
            <>
                <div className="border rounded-lg p-1 flex flex-wrap items-center justify-between gap-1 h-10.5">
                    <LectureRecordsToolbar deleteMode={deleteMode} setDeleteMode={setDeleteMode} />
                    <div className="flex items-center gap-1 h-full">
                        <Separator orientation="vertical" />
                        <Suspense fallback={<Button variant="outline" size="sm" disabled>Sırala...</Button>}>
                            <SortButton pathname="/lecture-records" />
                        </Suspense>
                    </div>
                </div>
                <LectureRecordsSkeleton />
            </>
        )
    }

    if (error) {
        return (
            <>
                <div className="border rounded-lg p-1 flex flex-wrap items-center justify-between gap-1 h-10.5">
                    <LectureRecordsToolbar deleteMode={deleteMode} setDeleteMode={setDeleteMode} />
                    <div className="flex items-center gap-1 h-full">
                        <Separator orientation="vertical" />
                        <Suspense fallback={<Button variant="outline" size="sm" disabled>Sırala...</Button>}>
                            <SortButton pathname="/lecture-records" />
                        </Suspense>
                    </div>
                </div>
                <div className="text-center text-destructive py-8 space-y-3">
                    <p>Hata: {error}</p>
                    <Button variant="outline" onClick={() => fetchRecords()}>
                        Retry
                    </Button>
                </div>
            </>
        )
    }

    return (
        <>
            <div className="border rounded-lg p-1 flex flex-wrap items-center justify-between gap-1 h-10.5">
                <LectureRecordsToolbar deleteMode={deleteMode} setDeleteMode={setDeleteMode} />
                <div className="flex items-center gap-1 h-full">
                    <Separator orientation="vertical" />
                    <Suspense fallback={<Button variant="outline" size="sm" disabled>Sırala...</Button>}>
                        <SortButton pathname="/lecture-records" />
                    </Suspense>
                </div>
            </div>
            { records.length <= 0 ? 
                <div className="flex flex-col items-center justify-center gap-6 mt-16"><Ghost size={100} /><p className="text-4xl font-bold text-center">There is nothing to see here</p></div> : 
                <LectureRecordsList records={records} deleteMode={deleteMode} />
            }
        </>
    )
};