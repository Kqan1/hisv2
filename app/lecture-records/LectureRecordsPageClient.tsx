"use client";

import LectureRecordsList, { LectureRecordsToolbar } from "@/app/lecture-records/LectureRecordsList";
import { LectureRecordsSkeleton } from "@/app/lecture-records/LectureRecordsSkeleton";
import { Button } from "@/components/ui/button";
import { SortButton } from "@/components/ui/sortButton";
import { LectureRecordSummary } from "@/lib/lecture-records-store";
import { Separator } from "@/components/ui/separator";
import { Ghost, ChevronLeft, ChevronRight } from "lucide-react";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

type RecordsType = LectureRecordSummary;

export function LectureRecordsPageClient() {
    const [deleteMode, setDeleteMode] = useState<boolean>(false)
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [records, setRecords] = useState<RecordsType[]>([])
    const [pagination, setPagination] = useState({
        total: 0,
        page: 1,
        pageSize: 10,
        totalPages: 0
    })
    
    const searchParams = useSearchParams()
    const router = useRouter()
    const page = parseInt(searchParams.get('page') || '1')

    const fetchRecords = useCallback(async () => {
        setIsLoading(true)
        setError(null)
        try {
            const response = await fetch(`/api/lecture-records?page=${page}`)
            const data = await response.json()

            if (!response.ok) {
                throw new Error(data?.error || 'Kayıtlar yüklenemedi.')
            }

            setRecords(data.data)
            setPagination(data.pagination)
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Bir hata oluştu.'
            setError(msg)
            toast.error(msg)
            console.error('Error fetching records:', err)
        } finally {
            setIsLoading(false)
        }
    }, [page])

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

    const handlePageChange = (newPage: number) => {
        const params = new URLSearchParams(searchParams.toString())
        params.set('page', newPage.toString())
        router.push(`/lecture-records?${params.toString()}`)
    }

    const toolbar = (
        <div className="border rounded-lg p-1 flex flex-wrap items-center justify-between gap-1 h-10.5">
            <LectureRecordsToolbar deleteMode={deleteMode} setDeleteMode={setDeleteMode} />
            <div className="flex items-center gap-1 h-full">
                <Separator orientation="vertical" />
                <Suspense fallback={<Button variant="outline" size="sm" disabled>Sırala...</Button>}>
                    <SortButton pathname="/lecture-records" />
                </Suspense>
            </div>
        </div>
    )

    if (isLoading) {
        return (
            <>
                {toolbar}
                <LectureRecordsSkeleton />
            </>
        )
    }

    if (error) {
        return (
            <>
                {toolbar}
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
        <div className="flex flex-col gap-6">
            {toolbar}
            
            { records.length <= 0 ? 
                <div className="flex flex-col items-center justify-center gap-6 mt-16"><Ghost className="stroke-muted-foreground" size={100} /><p className="text-4xl font-bold text-center text-muted-foreground">There is nothing to see here</p></div> : 
                <>
                    <LectureRecordsList records={records} deleteMode={deleteMode} />
                    
                    {pagination.totalPages > 1 && (
                        <div className="flex items-center justify-center gap-4 py-4">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handlePageChange(pagination.page - 1)}
                                disabled={pagination.page <= 1}
                            >
                                <ChevronLeft className="w-4 h-4 mr-1" /> Previous
                            </Button>
                            <span className="text-sm font-medium">
                                Page {pagination.page} of {pagination.totalPages}
                            </span>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handlePageChange(pagination.page + 1)}
                                disabled={pagination.page >= pagination.totalPages}
                            >
                                Next <ChevronRight className="w-4 h-4 ml-1" />
                            </Button>
                        </div>
                    )}
                </>
            }
        </div>
    )
};