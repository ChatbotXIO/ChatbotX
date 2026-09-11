"use client"

import { COMMENT_AUTOMATION_RETENTION_DAYS } from "@chatbotx.io/analytics/schemas"
import { useTranslations } from "next-intl"
import type { AnalysisStoreProviderProps } from "../provider/analysis-store-context"
import { AnalysisStoreProvider } from "../provider/analysis-store-context"
import { CommentAutomationBotRepliesTable } from "./charts/comment-automation-bot-replies-table"
import { CommentAutomationErrorLogsTable } from "./charts/comment-automation-error-logs-table"
import { CommentAutomationRepliesChart } from "./charts/comment-automation-replies-chart"
import { CommentAutomationRepliesTable } from "./charts/comment-automation-replies-table"
import { CommentAutomationUserCommentsTable } from "./charts/comment-automation-user-comments-table"
import AnalysisFilterForm from "./filter-form"

export function CommentAutomationAnalytics({
  defaultSearchParams,
}: {
  defaultSearchParams: AnalysisStoreProviderProps["defaultSearchParams"]
}) {
  const t = useTranslations()

  return (
    <AnalysisStoreProvider
      defaultSearchParams={defaultSearchParams}
      type="comment-automation"
    >
      {/* The filter is capped at the retention window and the cap is spelled
          out next to it: rows older than that are purged, and every chart
          zero-fills, so an unbounded range would draw a flat line that reads as
          "this automation never replied" instead of "that data is gone". */}
      <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
        <p className="text-muted-foreground text-xs">
          {t("analytics.retentionNotice", {
            days: COMMENT_AUTOMATION_RETENTION_DAYS,
          })}
        </p>
        <AnalysisFilterForm
          defaultPreset="last7"
          maxRangeDays={COMMENT_AUTOMATION_RETENTION_DAYS}
        />
      </div>

      <div className="flex flex-col gap-6">
        <CommentAutomationRepliesChart />
        <CommentAutomationRepliesTable />
        <CommentAutomationUserCommentsTable />
        <CommentAutomationBotRepliesTable />
        <CommentAutomationErrorLogsTable />
      </div>
    </AnalysisStoreProvider>
  )
}
