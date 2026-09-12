import type { ListInboxesResponse } from "@chatbotx.io/business"
import { sipProvisioningStatuses } from "@chatbotx.io/database/partials"
import { useMemo } from "react"
import { useInboxStore } from "@/features/inboxes/provider/inbox-store-context"

type InboxListItem = ListInboxesResponse["data"][number]
type ContactInboxRef = { inboxId: string }

/**
 * Inbox ids whose WhatsApp number has SIP calling fully enabled (* `sipProvisioningStatus === "enabled"`). Derived from the inbox list the
 * inbox page already loads — no extra query per conversation.
 */
export const selectCallingEnabledInboxIds = (
  inboxes: readonly InboxListItem[],
): ReadonlySet<string> =>
  new Set(
    inboxes
      .filter(
        (inbox) =>
          inbox.integrationWhatsapp?.sipProvisioningStatus ===
          sipProvisioningStatuses.enum.enabled,
      )
      .map((inbox) => inbox.id),
  )

/** True when at least one of the conversation's contact inboxes can place SIP calls. */
export const isCallingAvailableForConversation = (
  contactInboxes: readonly ContactInboxRef[] | undefined,
  callingEnabledInboxIds: ReadonlySet<string>,
): boolean =>
  contactInboxes?.some((contactInbox) =>
    callingEnabledInboxIds.has(contactInbox.inboxId),
  ) ?? false

export const useCallingEnabledInboxIds = (): ReadonlySet<string> => {
  const inboxes = useInboxStore((state) => state.inboxes)
  return useMemo(() => selectCallingEnabledInboxIds(inboxes), [inboxes])
}
