import { Skeleton } from '@/components/ui/skeleton'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function LectureRecordsSkeleton() {
    return (
        <div className="grid grid-cols-2 grid-rows-auto gap-2">
            {Array.from({ length: 6 }).map((_, index) => (
                <div
                    key={index}
                    className={cn(
                        buttonVariants({ variant: 'outline' }),
                        'size-full aspect-square flex flex-col items-stretch p-3 pb-28! text-left'
                    )}
                >
                    <Skeleton className="h-6 w-3/4 mb-2" />
                    <Skeleton className="h-4 w-1/2 mb-2" />
                    <div className="flex-1 min-h-0 mt-2">
                        <Skeleton className="w-full h-full" />
                    </div>
                </div>
            ))}
        </div>
    )
}
