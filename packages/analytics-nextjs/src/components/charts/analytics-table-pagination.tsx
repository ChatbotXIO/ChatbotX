"use client"

import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@chatbotx.io/ui/components/ui/pagination"

/**
 * The prev/next pager the analytics panels share. Extracted from
 * `reflink-contacts-table`, which grew the same block inline — the comment
 * automation dashboard alone renders four of these.
 */
export function AnalyticsTablePagination({
  page,
  pageCount,
  loading,
  onPageChange,
}: {
  page: number
  pageCount: number
  loading: boolean
  onPageChange: (page: number) => void
}) {
  if (pageCount <= 1) {
    return null
  }

  const previousDisabled = page <= 1 || loading
  const nextDisabled = page >= pageCount || loading
  const disabledClassName = "pointer-events-none opacity-50"

  return (
    <Pagination className="justify-end">
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious
            aria-disabled={previousDisabled}
            className={previousDisabled ? disabledClassName : "cursor-pointer"}
            onClick={() => onPageChange(page - 1)}
          />
        </PaginationItem>
        <PaginationItem>
          <span className="flex items-center px-2 text-sm">
            {page} / {pageCount}
          </span>
        </PaginationItem>
        <PaginationItem>
          <PaginationNext
            aria-disabled={nextDisabled}
            className={nextDisabled ? disabledClassName : "cursor-pointer"}
            onClick={() => onPageChange(page + 1)}
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  )
}
