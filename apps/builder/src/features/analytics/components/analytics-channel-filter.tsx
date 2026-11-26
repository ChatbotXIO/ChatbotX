"use client"

import {
  AnalysisChannelFilter,
  type AnalysisFilterOption,
} from "@chatbotx.io/analytics-nextjs/components/channel-filter"
import { getChannelIcon } from "@/features/inboxes/components/inbox-icon"

/** The analytics Channel / Inbox filter with the builder's channel icons. */
export function AnalyticsChannelFilter({
  options,
}: {
  options: AnalysisFilterOption[]
}) {
  if (options.length === 0) {
    return null
  }

  return (
    <AnalysisChannelFilter getChannelIcon={getChannelIcon} options={options} />
  )
}
