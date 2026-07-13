"use client"

import type {
  BroadcastSubaction,
  ChannelType,
} from "@chatbotx.io/database/partials"
import { useTranslations } from "next-intl"
import { memo, useCallback } from "react"
import {
  type StatsContactRow,
  StatsContactsDialog,
} from "@/features/common/components/stats-contacts-dialog"
import type { ContactFilterRequest } from "@/features/contacts/schemas/query"
import { client } from "@/lib/orpc/orpc"

type BroadcastAudiencePreviewDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  total: number
  channel: ChannelType
  subaction: BroadcastSubaction
  integrationWhatsappId?: string | null
  integrationMessengerId?: string | null
  contactFilter?: ContactFilterRequest["contactFilter"] | null
}

export const BroadcastAudiencePreviewDialog = memo(
  function BroadcastAudiencePreviewDialog({
    open,
    onOpenChange,
    workspaceId,
    total,
    channel,
    subaction,
    integrationWhatsappId,
    integrationMessengerId,
    contactFilter,
  }: BroadcastAudiencePreviewDialogProps) {
    const t = useTranslations()

    const fetchPage = useCallback(
      async (page: number, perPage: number): Promise<StatsContactRow[]> => {
        const result =
          await client.contactsAPIs.listContactInboxesAudiencePreviewAuthenticatedAPI(
            {
              workspaceId,
              page,
              perPage,
              channels: [channel],
              integrationWhatsappId: integrationWhatsappId ?? undefined,
              integrationMessengerId: integrationMessengerId ?? undefined,
              contactFilter: contactFilter ?? undefined,
              subaction,
            },
          )

        return result.data
      },
      [
        channel,
        contactFilter,
        integrationMessengerId,
        integrationWhatsappId,
        subaction,
        workspaceId,
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
        workspaceId={workspaceId}
      />
    )
  },
)
