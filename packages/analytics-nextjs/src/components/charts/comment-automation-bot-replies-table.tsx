"use client"

import { useTranslations } from "next-intl"
import { useAnalysisStore } from "../../provider/analysis-store-context"
import { CommentAutomationTextTotalsTable } from "./comment-automation-text-totals-table"

export function CommentAutomationBotRepliesTable() {
  const t = useTranslations()

  const rows = useAnalysisStore((state) => state.commentAutomationBotReplies)
  const page = useAnalysisStore(
    (state) => state.commentAutomationBotRepliesPage,
  )
  const pageCount = useAnalysisStore(
    (state) => state.commentAutomationBotRepliesPageCount,
  )
  const pageSize = useAnalysisStore(
    (state) => state.commentAutomationBotRepliesPerPage,
  )
  const total = useAnalysisStore(
    (state) => state.commentAutomationBotRepliesTotal,
  )
  const loading = useAnalysisStore((state) => state.loading)
  const setPage = useAnalysisStore(
    (state) => state.setCommentAutomationBotRepliesPage,
  )
  const setPageSize = useAnalysisStore(
    (state) => state.setCommentAutomationBotRepliesPerPage,
  )

  return (
    <CommentAutomationTextTotalsTable
      loading={loading}
      onPageChange={setPage}
      onPageSizeChange={setPageSize}
      page={page}
      pageCount={pageCount}
      pageSize={pageSize}
      rows={rows}
      textColumnLabel={t("analytics.message")}
      title={t("analytics.botRepliesToComments")}
      total={total}
    />
  )
}
