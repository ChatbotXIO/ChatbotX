"use client"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@chatbotx.io/ui/components/ui/table"
import { useLocale, useTranslations } from "next-intl"
import { useMemo, useState } from "react"
import { useAnalysisStore } from "../../provider/analysis-store-context"
import { formatDateWithYear } from "../../utils/date-format"
import { AnalyticsTableCard } from "./analytics-table-card"

const DEFAULT_ROWS_PER_PAGE = 10

/**
 * Replies per day. Filtering and paging happen client-side on purpose: the
 * series is already bounded by the picked date range (a year is 365 rows), so
 * a round-trip per page would cost more than it saves.
 */
export function CommentAutomationRepliesTable() {
  const t = useTranslations()
  const locale = useLocale()
  const replyStats = useAnalysisStore(
    (state) => state.commentAutomationReplyStats,
  )

  const [keyword, setKeyword] = useState("")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_ROWS_PER_PAGE)

  const rows = useMemo(() => {
    const needle = keyword.trim().toLowerCase()
    if (!needle) {
      return replyStats
    }
    // Matched against both the raw ISO key and the localised label, so
    // "2026-03" and "Mar" both narrow the list.
    return replyStats.filter(
      (row) =>
        row.dateReport.toLowerCase().includes(needle) ||
        formatDateWithYear(new Date(row.dateReport), locale)
          .toLowerCase()
          .includes(needle),
    )
  }, [replyStats, keyword, locale])

  const pageCount = Math.ceil(rows.length / pageSize)
  const safePage = Math.min(page, Math.max(pageCount, 1))
  const visibleRows = rows.slice((safePage - 1) * pageSize, safePage * pageSize)

  return (
    <AnalyticsTableCard
      loading={false}
      onPageChange={setPage}
      onPageSizeChange={(nextPageSize) => {
        setPageSize(nextPageSize)
        setPage(1)
      }}
      page={safePage}
      pageCount={pageCount}
      pageSize={pageSize}
      search={{
        value: keyword,
        placeholder: t("analytics.searchByDate"),
        onChange: (value) => {
          setKeyword(value)
          setPage(1)
        },
      }}
      title={t("analytics.repliesByDate")}
      total={rows.length}
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("analytics.date")}</TableHead>
            <TableHead className="w-32">{t("analytics.total")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visibleRows.length > 0 ? (
            visibleRows.map((row) => (
              <TableRow key={row.dateReport}>
                <TableCell>
                  {formatDateWithYear(new Date(row.dateReport), locale)}
                </TableCell>
                <TableCell>{row.count}</TableCell>
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
