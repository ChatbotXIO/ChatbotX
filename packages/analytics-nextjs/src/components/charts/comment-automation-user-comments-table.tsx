"use client"

import { useTranslations } from "next-intl"
import { useAnalysisStore } from "../../provider/analysis-store-context"
import { CommentAutomationTextTotalsTable } from "./comment-automation-text-totals-table"

export function CommentAutomationUserCommentsTable() {
  const t = useTranslations()

  const rows = useAnalysisStore((state) => state.commentAutomationUserComments)
  const page = useAnalysisStore(
    (state) => state.commentAutomationUserCommentsPage,
  )
  const pageCount = useAnalysisStore(
    (state) => state.commentAutomationUserCommentsPageCount,
  )
  const loading = useAnalysisStore((state) => state.loading)
  const setPage = useAnalysisStore(
    (state) => state.setCommentAutomationUserCommentsPage,
  )

  return (
    <CommentAutomationTextTotalsTable
      loading={loading}
      onPageChange={setPage}
      page={page}
      pageCount={pageCount}
      rows={rows}
      textColumnLabel={t("analytics.comment")}
      title={t("analytics.userCommentsOnThisPost")}
    />
  )
}
