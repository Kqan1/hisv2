import Link from 'next/link'
import { fontMono } from '@/utils/fonts'
import { Button } from '@/components/ui/button'

export default function NotFound() {
    return (
        <div className="space-y-6 flex flex-col items-center justify-center min-h-[50vh] text-center">
            <div className="flex items-center justify-center gap-3">
                <h1 className={`text-8xl font-bold tracking-tight ${fontMono.className}`}>404</h1>
            </div>
            <div className="space-y-1">
                <h2 className="text-xl font-semibold">Page not found</h2>
                <p className="text-sm text-muted-foreground max-w-sm">
                    The page you are looking for does not exist or has been moved.
                </p>
            </div>
            <Button asChild>
                <Link href="/">Back to home</Link>
            </Button>
        </div>
    )
}
