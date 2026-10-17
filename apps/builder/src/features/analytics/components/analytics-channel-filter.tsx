"use client"

import {
  AnalysisChannelFilter,
  type AnalysisFilterOption,
} from "@chatbotx.io/analytics-nextjs/components/channel-filter"
import type { MultiSelectOption } from "@chatbotx.io/ui/components/ui/sersavan/multi-select"
import { cn } from "@chatbotx.io/ui/lib/utils"
import type { ChannelType } from "@chatbotx.io/utils/channel"
import { INBOX_ICON_CONFIG } from "@/features/inboxes/components/inbox-icon"

type ChannelIcon = NonNullable<MultiSelectOption["icon"]>

const channelIcons = new Map<ChannelType, ChannelIcon>()

/** Brand icon of a channel as a MultiSelect option icon, built once per channel. */
function getChannelIcon(channel: ChannelType): ChannelIcon {
  const config = INBOX_ICON_CONFIG[channel]
  const cached = channelIcons.get(channel)
  if (cached) {
    return cached
  }
  const { Icon, fill, iconClassName } = config
  const ChannelIcon: ChannelIcon = ({ className }) => (
    <Icon
      className={cn(className, iconClassName)}
      {...(fill !== undefined && { fill })}
    />
  )
  channelIcons.set(channel, ChannelIcon)
  return ChannelIcon
}

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
