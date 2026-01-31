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

export type SortValue =
  | "title-asc"
  | "title-desc"
  | "createdAt-asc"
  | "createdAt-desc"
  | "updatedAt-asc"
  | "updatedAt-desc"

const SORT_OPTIONS: { value: SortValue; label: string; icon: React.ReactNode }[] = [
  { value: "title-asc", label: "Title (A-Z)", icon: <ArrowDownAZ className="size-4" /> },
  { value: "title-desc", label: "Title(Z-A)", icon: <ArrowUpAZ className="size-4" /> },
  { value: "createdAt-desc", label: "Created at (most recent)", icon: <Calendar className="size-4" /> },
  { value: "createdAt-asc", label: "Created at (oldest)", icon: <Calendar className="size-4" /> },
  { value: "updatedAt-desc", label: "Updated at (most recent)", icon: <CalendarClock className="size-4" /> },
  { value: "updatedAt-asc", label: "Updated at (recent)", icon: <CalendarClock className="size-4" /> },
]

const DEFAULT_SORT: SortValue = "createdAt-desc"

function getSortLabel(value: SortValue | null): string {
  if (!value) return SORT_OPTIONS.find((o) => o.value === DEFAULT_SORT)?.label ?? "Sırala"
  return SORT_OPTIONS.find((o) => o.value === value)?.label ?? "Sırala"
}

export function NotesFilter() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const currentSort = (searchParams.get("sort") as SortValue | null) ?? DEFAULT_SORT

  function setSort(value: SortValue) {
    const params = new URLSearchParams(searchParams.toString())
    params.set("sort", value)
    router.push(`/notes?${params.toString()}`)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          {getSortLabel(currentSort)}
          <ChevronDown className="size-4 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Sort by</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => setSort("title-asc")}>
          <ArrowDownAZ className="size-4 mr-2" />
          Title (A-Z)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setSort("title-desc")}>
          <ArrowUpAZ className="size-4 mr-2" />
          Title (Z-A)
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => setSort("createdAt-desc")}>
          <Calendar className="size-4 mr-2" />
          Created at (most recent)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setSort("createdAt-asc")}>
          <Calendar className="size-4 mr-2" />
          Created at (oldest)
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => setSort("updatedAt-desc")}>
          <CalendarClock className="size-4 mr-2" />
          Updated at (most recent)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setSort("updatedAt-asc")}>
          <CalendarClock className="size-4 mr-2" />
          Updated at (oldest)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
