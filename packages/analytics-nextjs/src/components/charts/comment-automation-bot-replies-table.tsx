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
  const loading = useAnalysisStore((state) => state.loading)
  const setPage = useAnalysisStore(
    (state) => state.setCommentAutomationBotRepliesPage,
  )

  return (
    <CommentAutomationTextTotalsTable
      loading={loading}
      onPageChange={setPage}
      page={page}
      pageCount={pageCount}
      rows={rows}
      textColumnLabel={t("analytics.message")}
      title={t("analytics.botRepliesToComments")}
    />
  )
}
