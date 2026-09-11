"use client"

import { CommentAutomationAnalytics } from "@chatbotx.io/analytics-nextjs/components/comment-automation-analytics"

/**
 * Client shell for the per-automation analytics dashboard, shared by the
 * Facebook and Instagram routes — both feed the same `FBCommentAutomation`
 * table, so there is one page.
 *
 * Its only job beyond mounting the dashboard is reading the browser timezone:
 * a server component cannot, and every stat is bucketed by the viewer's
 * calendar day. Mirrors `reflink-analytics-client.tsx`.
 */
export function CommentAutomationAnalyticsClient({
  workspaceId,
  automationId,
  automationName,
}: {
  workspaceId: string
  automationId: string
  automationName: string
}) {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  return (
    <CommentAutomationAnalytics
      defaultSearchParams={{
        workspaceId,
        automationId,
        automationName,
        timezone,
      }}
    />
  )
}
