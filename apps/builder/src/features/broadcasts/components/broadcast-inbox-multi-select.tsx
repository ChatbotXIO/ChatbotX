"use client"

import type { ChannelType } from "@chatbotx.io/database/partials"
import { MultiSelectField } from "@chatbotx.io/ui/components/form/multi-select-field"
import { inboxStatuses } from "@chatbotx.io/utils/conversation"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import { useInboxStore } from "@/features/inboxes/provider/inbox-store-context"

// Per-channel wording for the page picker; a channel without an entry falls
// back to the generic inbox label.
const inboxFieldLabelKeys = {
  whatsapp: "fields.whatsappChannels.label",
  messenger: "fields.messengerChannels.label",
} as const satisfies Partial<Record<ChannelType, string>>

const FALLBACK_LABEL_KEY = "fields.inbox.label"

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
  const inboxes = useInboxStore((state) => state.inboxes)

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

  const labelKey =
    channel in inboxFieldLabelKeys
      ? inboxFieldLabelKeys[channel as keyof typeof inboxFieldLabelKeys]
      : FALLBACK_LABEL_KEY

  return (
    <MultiSelectField
      label={t(labelKey)}
      name={name}
      options={options}
      placeholder={t("actions.pleaseSelect")}
      required={true}
    />
  )
}
