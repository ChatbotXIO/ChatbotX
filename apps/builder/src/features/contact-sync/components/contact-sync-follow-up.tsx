"use client"

import type { ContactSyncFollowUpError } from "@chatbotx.io/database/partials"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { useMutation } from "@tanstack/react-query"
import { Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import type { z } from "zod"
import { orpc } from "@/lib/orpc/query"
import { useInvalidateContactSyncs } from "../hooks/use-invalidate-contact-syncs"
import type { contactSyncRunItemResource } from "../schema/public"

type RunItem = z.infer<typeof contactSyncRunItemResource>

/** Reasons a retry can fix; a superseded follow-up is started by a newer import. */
const RETRYABLE_ERRORS: ReadonlySet<ContactSyncFollowUpError> = new Set([
  "cancelled",
  "channelUnavailable",
  "workspaceUnavailable",
  "expired",
])

const ERROR_KEYS = {
  cancelled: "contactSync.followUp.cancelled",
  channelUnavailable: "contactSync.followUp.channelUnavailable",
  superseded: "contactSync.followUp.superseded",
  workspaceUnavailable: "contactSync.followUp.workspaceUnavailable",
  expired: "contactSync.followUp.expired",
} as const satisfies Record<ContactSyncFollowUpError, string>

/**
 * The history sync that follows a page's contacts import (connect import
 * only): waiting, started, or why it did not start, with a retry when a retry
 * can help and the page is still connected.
 */
export function ContactSyncFollowUp({
  workspaceId,
  item,
}: {
  workspaceId: string
  item: RunItem
}) {
  const t = useTranslations()
  const refresh = useInvalidateContactSyncs()
  const retry = useMutation(
    orpc.contactSyncAPIs.retryHistory.mutationOptions({
      onSuccess: ({ reopened }) => {
        // Nothing to reopen means a handoff already ran meanwhile; the refresh shows it.
        if (reopened) {
          toast.success(t("contactSync.followUp.retried"))
        }
        refresh()
      },
      onError: () => toast.error(t("contactSync.errors.generic")),
    }),
  )

  if (!item.followUpCoexist) {
    return null
  }

  const error = item.followUpError
  const text = error
    ? t(ERROR_KEYS[error])
    : t(
        item.followUpRunId
          ? "contactSync.followUp.linked"
          : "contactSync.followUp.pending",
      )
  const inboxId = item.inboxId
  const canRetry = error !== null && RETRYABLE_ERRORS.has(error) && inboxId

  return (
    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
      <span
        className={
          error ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"
        }
      >
        {t("contactSync.followUp.statusLine", { status: text })}
      </span>
      {canRetry && inboxId && (
        <Button
          disabled={retry.isPending}
          onClick={() => retry.mutate({ workspaceId, inboxId })}
          size="sm"
          variant="outline"
        >
          {retry.isPending && <Loader2Icon className="animate-spin" />}
          {t("contactSync.followUp.retry")}
        </Button>
      )}
    </div>
  )
}
