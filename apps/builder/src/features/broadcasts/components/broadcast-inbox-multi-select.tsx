"use client"

import type { ChannelType } from "@chatbotx.io/database/partials"
import { MultiSelectField } from "@chatbotx.io/ui/components/form/multi-select-field"
import { inboxStatuses } from "@chatbotx.io/utils/conversation"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import { useInboxList } from "@/features/inboxes/provider/inbox-hook"
import { resolveBroadcastInboxLabelKey } from "../lib/broadcast-inbox-label"

type BroadcastInboxMultiSelectProps = {
  channel: ChannelType
  /** Form path of the selected inbox ids. */
  name?: string
}

/** Picks the pages (inboxes) a broadcast sends from, limited to one channel. */
export function BroadcastInboxMultiSelect({
  channel,
  name = "inboxIds",
}: BroadcastInboxMultiSelectProps) {
  const t = useTranslations()
  const inboxes = useInboxList()

  const options = useMemo(
    () =>
      inboxes
        .filter(
          (inbox) =>
            inbox.channel === channel &&
            inbox.status === inboxStatuses.enum.connected,
        )
        .map((inbox) => ({ label: inbox.name, value: inbox.id })),
    [inboxes, channel],
  )

  return (
    <MultiSelectField
      label={t(resolveBroadcastInboxLabelKey(channel))}
      name={name}
      options={options}
      placeholder={t("actions.pleaseSelect")}
      required={true}
    />
  )
}
