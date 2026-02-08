"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ArrowDownAZ, ArrowUpAZ, Calendar, CalendarClock, ChevronDown } from "lucide-react"

export interface SortOption<T extends string = string> {
    value: T
    label: string
    icon?: React.ReactNode
    separatorAfter?: boolean
}

export interface SortFilterProps<T extends string = string> {
    pathname: string
    options?: SortOption<T>[]
    defaultSort?: T
    paramName?: string
    buttonLabel?: string
    menuLabel?: string
    buttonVariant?: "default" | "outline" | "ghost" | "link" | "destructive" | "secondary"
    buttonSize?: "default" | "sm" | "lg" | "icon"
    align?: "start" | "center" | "end"
    className?: string
}

// Default sort options that work for most cases
const DEFAULT_SORT_OPTIONS: SortOption[] = [
    { 
        value: "title-asc", 
        label: "Title (A-Z)", 
        icon: <ArrowDownAZ className="size-4" />,
        separatorAfter: false
    },
    { 
        value: "title-desc", 
        label: "Title (Z-A)", 
        icon: <ArrowUpAZ className="size-4" />,
        separatorAfter: true
    },
    { 
        value: "createdAt-desc", 
        label: "Created (Newest)", 
        icon: <Calendar className="size-4" />,
        separatorAfter: false
    },
    { 
        value: "createdAt-asc", 
        label: "Created (Oldest)", 
        icon: <Calendar className="size-4" />,
        separatorAfter: true
    },
    { 
        value: "updatedAt-desc", 
        label: "Updated (Newest)", 
        icon: <CalendarClock className="size-4" />,
        separatorAfter: false
    },
    { 
        value: "updatedAt-asc", 
        label: "Updated (Oldest)", 
        icon: <CalendarClock className="size-4" />,
        separatorAfter: false
    },
]

export function SortButton<T extends string = string>({
    pathname,
    options = DEFAULT_SORT_OPTIONS as SortOption<T>[],
    defaultSort = (options?.[0]?.value ?? "createdAt-desc") as T,
    paramName = "sort",
    buttonLabel,
    menuLabel = "Sort by",
    buttonVariant = "outline",
    buttonSize = "sm",
    align = "end",
    className,
}: SortFilterProps<T>) {
    const router = useRouter()
    const searchParams = useSearchParams()
    const currentSort = (searchParams.get(paramName) as T | null) ?? defaultSort

    function getSortLabel(value: T | null): string {
        if (!value) return options.find((o) => o.value === defaultSort)?.label ?? buttonLabel ?? "Sort"
        return options.find((o) => o.value === value)?.label ?? buttonLabel ?? "Sort"
    }

    function setSort(value: T) {
        const params = new URLSearchParams(searchParams.toString())
        params.set(paramName, value)
        router.push(`${pathname}?${params.toString()}`)
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant={buttonVariant} size={buttonSize} className={className}>
                    {getSortLabel(currentSort)}
                    <ChevronDown className="size-4 opacity-50" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align={align} className="w-56">
                <DropdownMenuLabel>{menuLabel}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {options.map((option, index) => (
                    <div key={option.value}>
                        <DropdownMenuItem onClick={() => setSort(option.value)}>
                            {option.icon && <span className="mr-2">{option.icon}</span>}
                            {option.label}
                        </DropdownMenuItem>
                        {option.separatorAfter && index < options.length - 1 && <DropdownMenuSeparator />}
                    </div>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    )
}