"use client"

import type {
  BroadcastEventType,
  ListBroadcastContactsRequest,
  ListBroadcastContactsResponse,
} from "@chatbotx.io/analytics/schemas"
import ky from "ky"
import { useTranslations } from "next-intl"
import { memo, useCallback } from "react"
import {
  type StatsContactRow,
  StatsContactsDialog,
} from "@/features/common/components/stats-contacts-dialog"
import { addContactTagAction } from "@/features/contacts/actions/add-contact-tag.action"
import { bulkTagStatsContactsAction } from "@/features/contacts/actions/bulk-tag-stats-contacts.action"

const eventTypeToLabel: Record<BroadcastEventType, string> = {
  "message:sent": "sent",
  "message:delivered": "delivered",
  "message:seen": "seen",
  "message:failed": "failed",
  "message:received": "received",
  "flow:clicked": "clicked",
  "flow:ref": "ref",
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  broadcastId: string
  eventType: BroadcastEventType
  total: number
}

export const BroadcastContactsDialog = memo(function BroadcastContactsDialog({
  open,
  onOpenChange,
  workspaceId,
  broadcastId,
  eventType,
  total,
}: Props) {
  const t = useTranslations()

  const fetchPage = useCallback(
    async (page: number, perPage: number): Promise<StatsContactRow[]> => {
      const result = await ky
        .get<ListBroadcastContactsRequest>(
          `/api/workspaces/${workspaceId}/broadcasts/${broadcastId}/contacts`,
          {
            searchParams: {
              eventType,
              total,
              page,
              perPage,
            },
          },
        )
        .json<ListBroadcastContactsResponse>()

      return result.data
    },
    [broadcastId, eventType, total, workspaceId],
  )

  const onManualTag = useCallback(
    async (contactIds: string[], tags: string[]) => {
      const result = await addContactTagAction.bind(
        null,
        workspaceId,
      )({
        ids: contactIds,
        tags,
      })
      if (result?.serverError || result?.validationErrors) {
        throw new Error(result.serverError ?? t("messages.unknownError"))
      }
    },
    [t, workspaceId],
  )

  const onBulkTag = useCallback(
    async (excludedContactIds: string[], tags: string[]) => {
      const result = await bulkTagStatsContactsAction.bind(
        null,
        workspaceId,
      )({
        source: "broadcast",
        broadcastId,
        eventType,
        excludedContactIds,
        tags,
      })
      if (result?.serverError || result?.validationErrors) {
        throw new Error(result.serverError ?? t("messages.unknownError"))
      }
    },
    [broadcastId, eventType, t, workspaceId],
  )

  return (
    <StatsContactsDialog
      fetchPage={fetchPage}
      i18nNamespace="broadcasts"
      onBulkTag={onBulkTag}
      onManualTag={onManualTag}
      onOpenChange={onOpenChange}
      open={open}
      showErrors={eventType === "message:failed"}
      title={t(`broadcasts.stats.${eventTypeToLabel[eventType]}`)}
      total={total}
      workspaceId={workspaceId}
    />
  )
})
