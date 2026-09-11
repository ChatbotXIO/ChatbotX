"use client"

import { useTranslations } from "next-intl"
import { memo, useCallback } from "react"
import {
  type StatsContactRow,
  StatsContactsDialog,
} from "@/features/common/components/stats-contacts-dialog"
import { addContactTagAction } from "@/features/contacts/actions/add-contact-tag.action"
import { bulkTagStatsContactsAction } from "@/features/contacts/actions/bulk-tag-stats-contacts.action"
import { client } from "@/lib/orpc/orpc"
import type { CommentAutomationStatField } from "./comment-automation-stats-cell"

const eventTypeToLabel: Record<CommentAutomationStatField, string> = {
  "message:sent": "sent",
  "message:delivered": "delivered",
  "message:seen": "seen",
  "flow:clicked": "clicked",
  "message:failed": "failed",
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  automationId: string
  eventType: CommentAutomationStatField
  total: number
}

/**
 * Facebook and Instagram share this dialog and the procedure behind it: both
 * list pages read the same `FBCommentAutomation` table, discriminated by its
 * `type` column, so there is nothing channel-specific to branch on here.
 */
export const CommentAutomationContactsDialog = memo(
  function CommentAutomationContactsDialog({
    open,
    onOpenChange,
    workspaceId,
    automationId,
    eventType,
    total,
  }: Props) {
    const t = useTranslations()

    const fetchPage = useCallback(
      async (page: number, perPage: number): Promise<StatsContactRow[]> => {
        const result =
          await client.fbCommentsAPI.privateListCommentAutomationContactsAPI({
            workspaceId,
            automationId,
            eventType,
            total,
            page,
            perPage,
          })

        return result.data
      },
      [automationId, eventType, total, workspaceId],
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
          source: "commentAutomation",
          automationId,
          eventType,
          excludedContactIds,
          tags,
        })
        if (result?.serverError || result?.validationErrors) {
          throw new Error(result.serverError ?? t("messages.unknownError"))
        }
      },
      [automationId, eventType, t, workspaceId],
    )

    return (
      <StatsContactsDialog
        fetchPage={fetchPage}
        i18nNamespace="commentAutomation"
        onBulkTag={onBulkTag}
        onManualTag={onManualTag}
        onOpenChange={onOpenChange}
        open={open}
        showErrors={eventType === "message:failed"}
        title={t(`commentAutomation.stats.${eventTypeToLabel[eventType]}`)}
        total={total}
        workspaceId={workspaceId}
      />
    )
  },
)
