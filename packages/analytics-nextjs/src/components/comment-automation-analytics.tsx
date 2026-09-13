"use client"

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
  return (
    <AnalysisStoreProvider
      defaultSearchParams={defaultSearchParams}
      type="comment-automation"
    >
      {/* Deliberately unbounded: a successful reply is kept for the life of
          the automation, so every range down to `lifeTime` has real data
          behind it. Only FAILED rows are purged, and that window is spelled
          out on the Error Logs card itself — the one panel it applies to. */}
      <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
        <AnalysisFilterForm defaultPreset="last7" />
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
