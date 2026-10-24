"use client"

import type {
  BroadcastSubaction,
  ChannelType,
} from "@chatbotx.io/database/partials"
import { useFormatter, useTranslations } from "next-intl"
import { memo, useCallback } from "react"
import {
  type StatsContactRow,
  StatsContactsDialog,
} from "@/features/common/components/stats-contacts-dialog"
import type { ContactFilterRequest } from "@/features/contacts/schema/query"
import { client } from "@/lib/orpc/orpc"

type BroadcastAudiencePreviewDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  total: number
  /** `total` is a lower bound (a bounded count hit its cap). */
  totalCapped?: boolean
  channel: ChannelType
  subaction: BroadcastSubaction
  inboxIds?: string[]
  integrationWhatsappId?: string | null
  integrationMessengerId?: string | null
  contactFilter?: ContactFilterRequest["contactFilter"] | null
  /**
   * 1-based inclusive audience window (see `broadcast-send-limit-fields.tsx`).
   * Only the preview dialog needs the server-side offset — the receivers
   * count and the confirm dialog use the already-windowed total instead.
   */
  audienceRangeStart?: number | null
  audienceRangeEnd?: number | null
}

export const BroadcastAudiencePreviewDialog = memo(
  function BroadcastAudiencePreviewDialog({
    open,
    onOpenChange,
    workspaceId,
    total,
    totalCapped = false,
    channel,
    subaction,
    inboxIds,
    integrationWhatsappId,
    integrationMessengerId,
    contactFilter,
    audienceRangeStart,
    audienceRangeEnd,
  }: BroadcastAudiencePreviewDialogProps) {
    const t = useTranslations()
    const formatter = useFormatter()
    // A capped total reads "N+", and a window past the cap has no bound: "?".
    let totalLabel: string | undefined
    if (totalCapped) {
      totalLabel = total > 0 ? `${formatter.number(total)}+` : "?"
    }

    const fetchPage = useCallback(
      async (page: number, perPage: number): Promise<StatsContactRow[]> => {
        const result =
          await client.contactsAPIs.listContactInboxesAudiencePreviewAuthenticatedAPI(
            {
              workspaceId,
              page,
              perPage,
              channels: [channel],
              inboxIds,
              integrationWhatsappId: integrationWhatsappId ?? undefined,
              integrationMessengerId: integrationMessengerId ?? undefined,
              contactFilter: contactFilter ?? undefined,
              subaction,
              audienceRangeStart: audienceRangeStart ?? undefined,
              audienceRangeEnd: audienceRangeEnd ?? undefined,
            },
          )

        return result.data
      },
      [
        channel,
        contactFilter,
        inboxIds,
        integrationMessengerId,
        integrationWhatsappId,
        subaction,
        workspaceId,
        audienceRangeStart,
        audienceRangeEnd,
      ],
    )

    return (
      <StatsContactsDialog
        fetchPage={fetchPage}
        i18nNamespace="broadcasts"
        onOpenChange={onOpenChange}
        open={open}
        title={t("broadcasts.stats.receivers")}
        total={total}
        totalLabel={totalLabel}
        workspaceId={workspaceId}
      />
    )
  },
)
