"use client"

import { orderedTemplateChannels } from "@chatbotx.io/database/partials"
import type { MultiSelectOption } from "@chatbotx.io/ui/components/ui/sersavan/multi-select"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import {
  getChannelIcon,
  INBOX_ICON_CONFIG,
} from "@/features/inboxes/components/inbox-icon"

/** The channel multi-select's options: every template channel in the fixed order, with its brand icon and name. */
export function useChannelOptions(): MultiSelectOption[] {
  const t = useTranslations()
  return useMemo(
    () =>
      orderedTemplateChannels.map((channel) => ({
        value: channel,
        label: t(INBOX_ICON_CONFIG[channel].defaultLabelKey),
        icon: getChannelIcon(channel),
      })),
    [t],
  )
}
