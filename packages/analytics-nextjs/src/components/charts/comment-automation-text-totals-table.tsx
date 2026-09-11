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
import { AnalyticsTableCard } from "./analytics-table-card"

/**
 * "User comments on this post" and "Bot replies to comments" are the same
 * table — a grouped text bucket and its count — differing only in title and
 * first-column label, so the markup lives here once.
 */
export function CommentAutomationTextTotalsTable({
  title,
  textColumnLabel,
  rows,
  page,
  pageCount,
  pageSize,
  total,
  loading,
  onPageChange,
  onPageSizeChange,
}: {
  title: string
  textColumnLabel: string
  rows: ListCommentAutomationTextTotalsResponse["data"]
  page: number
  pageCount: number
  pageSize: number
  total: number
  loading: boolean
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
}) {
  const t = useTranslations()

  return (
    <AnalyticsTableCard
      loading={loading}
      onPageChange={onPageChange}
      onPageSizeChange={onPageSizeChange}
      page={page}
      pageCount={pageCount}
      pageSize={pageSize}
      title={title}
      total={total}
    >
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
                <TableCell className="wrap-break-word whitespace-pre-wrap">
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
    </AnalyticsTableCard>
  )
}
