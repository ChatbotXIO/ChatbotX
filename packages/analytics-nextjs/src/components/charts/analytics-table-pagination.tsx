"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@chatbotx.io/ui/components/ui/select"
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react"
import { useTranslations } from "next-intl"

const PAGE_SIZE_OPTIONS = [10, 20, 30, 40, 50]

/**
 * The pager every analytics table card carries.
 *
 * Deliberately mirrors `DataTablePagination` (Contacts and every other
 * `useDataTable` table) control-for-control — rows-per-page select, page
 * indicator, first/prev/next/last — so the dashboard's tables behave the way
 * the rest of the product does. It cannot reuse that component: it takes a
 * TanStack `Table` instance, while these four tables are driven by the
 * analytics store and by local state, not by `useDataTable`. Four
 * `useDataTable` tables on one page would also collide on the shared
 * `page`/`perPage` URL params.
 *
 * Renders even for a single page: the four tables hold wildly different row
 * counts (45 days vs 8 distinct comments), and hiding the pager on the short
 * ones changed the card height and left the reader unsure whether a table was
 * paginated at all. The controls are disabled instead.
 */
export function AnalyticsTablePagination({
  page,
  pageCount,
  pageSize,
  total,
  loading,
  onPageChange,
  onPageSizeChange,
}: {
  page: number
  pageCount: number
  pageSize: number
  total: number
  loading: boolean
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
}) {
  const t = useTranslations()

  // An empty table still reads as page 1 of 1 rather than "1 / 0".
  const totalPages = Math.max(pageCount, 1)
  const canGoPrevious = page > 1 && !loading
  const canGoNext = page < totalPages && !loading

  return (
    <div className="flex w-full flex-col-reverse items-center justify-between gap-4 overflow-auto p-1 sm:flex-row sm:gap-8">
      <div className="flex-1 whitespace-nowrap text-muted-foreground text-sm">
        {t("analytics.pagination.totalRows", { total })}
      </div>
      <div className="flex flex-col-reverse items-center gap-4 sm:flex-row sm:gap-6 lg:gap-8">
        <div className="flex items-center space-x-2">
          <p className="whitespace-nowrap font-medium text-sm">
            {t("analytics.pagination.rowsPerPage")}
          </p>
          <Select
            onValueChange={(value) => onPageSizeChange(Number(value))}
            value={`${pageSize}`}
          >
            <SelectTrigger className="h-8 w-[4.5rem] [&[data-size]]:h-8">
              <SelectValue placeholder={pageSize} />
            </SelectTrigger>
            <SelectContent side="top">
              {PAGE_SIZE_OPTIONS.map((option) => (
                <SelectItem key={option} value={`${option}`}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-center font-medium text-sm">
          {t("analytics.pagination.pageOf", { page, pageCount: totalPages })}
        </div>
        <div className="flex items-center space-x-2">
          <Button
            aria-label={t("analytics.pagination.firstPage")}
            className="hidden size-8 lg:flex"
            disabled={!canGoPrevious}
            onClick={() => onPageChange(1)}
            size="icon"
            variant="outline"
          >
            <ChevronsLeft className="rtl:rotate-180" />
          </Button>
          <Button
            aria-label={t("analytics.pagination.previousPage")}
            className="size-8"
            disabled={!canGoPrevious}
            onClick={() => onPageChange(page - 1)}
            size="icon"
            variant="outline"
          >
            <ChevronLeft className="rtl:rotate-180" />
          </Button>
          <Button
            aria-label={t("analytics.pagination.nextPage")}
            className="size-8"
            disabled={!canGoNext}
            onClick={() => onPageChange(page + 1)}
            size="icon"
            variant="outline"
          >
            <ChevronRight className="rtl:rotate-180" />
          </Button>
          <Button
            aria-label={t("analytics.pagination.lastPage")}
            className="hidden size-8 lg:flex"
            disabled={!canGoNext}
            onClick={() => onPageChange(totalPages)}
            size="icon"
            variant="outline"
          >
            <ChevronsRight className="rtl:rotate-180" />
          </Button>
        </div>
      </div>
    </div>
  )
}
