"use client"

import type { ListCommentAutomationTextTotalsResponse } from "@chatbotx.io/analytics"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@chatbotx.io/ui/components/ui/table"
import { useTranslations } from "next-intl"
import { AnalyticsTablePagination } from "./analytics-table-pagination"

/**
 * "User comments on this post" and "Bot replies to comments" are the same
 * table — a grouped text bucket and its count — differing only in heading and
 * first-column label, so the markup lives here once.
 */
export function CommentAutomationTextTotalsTable({
  title,
  textColumnLabel,
  rows,
  page,
  pageCount,
  loading,
  onPageChange,
}: {
  title: string
  textColumnLabel: string
  rows: ListCommentAutomationTextTotalsResponse["data"]
  page: number
  pageCount: number
  loading: boolean
  onPageChange: (page: number) => void
}) {
  const t = useTranslations()

  return (
    <div className="flex flex-col gap-2">
      <h3 className="font-medium text-sm">{title}</h3>

      <div className="overflow-hidden rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{textColumnLabel}</TableHead>
              <TableHead className="w-32">{t("analytics.total")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length > 0 ? (
              rows.map((row) => (
                <TableRow key={row.text}>
                  <TableCell className="whitespace-pre-wrap break-words">
                    {row.text}
                  </TableCell>
                  <TableCell>{row.total}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell className="h-24 text-center" colSpan={2}>
                  {t("analytics.noResults")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <AnalyticsTablePagination
        loading={loading}
        onPageChange={onPageChange}
        page={page}
        pageCount={pageCount}
      />
    </div>
  )
}
