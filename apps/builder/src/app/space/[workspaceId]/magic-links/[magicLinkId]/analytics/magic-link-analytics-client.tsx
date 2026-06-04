"use client"

import { MagicLinkAnalytics } from "@chatbotx.io/analytics-nextjs/components/magic-link-analytics"

export function MagicLinkAnalyticsClient({
  workspaceId,
  linkId,
  linkName,
}: {
  workspaceId: string
  linkId: string
  linkName: string
}) {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  return (
    <MagicLinkAnalytics
      defaultSearchParams={{ workspaceId, linkId, timezone, linkName }}
    />
  )
}
