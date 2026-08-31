"use client"

import {
  hasEmptyProfileName,
  hasOnDemandProfileApi,
} from "@chatbotx.io/business"
import type { ChannelType } from "@chatbotx.io/database/partials"
import { useAction } from "next-safe-action/hooks"
import { useEffect, useRef } from "react"
import type {
  ConversationContactInboxResource,
  ListConversationItemResource,
} from "@/features/conversations/schema/resource"
import { useChatStore } from "../../chat/store/chat-store-provider"
import { refreshContactProfileAction } from "../actions/refresh-contact-profile.action"
import type { GetContactResponse } from "../schema/query"

export type SetContactData = (
  updater: (prev: GetContactResponse | null) => GetContactResponse | null,
) => void

export type UseAutoRefreshContactProfileProps = {
  workspaceId: string
  conversation: ListConversationItemResource | null | undefined
  setContactData: SetContactData
}

/**
 * Among the contact's on-demand-capable inboxes (the channels
 * `hasOnDemandProfileApi` says the builder can fetch a profile from), the
 * one with the most recent `lastMessageAt` — the "newest capable inbox" half
 * of the worker's `resolveMessengerUserContext`
 * (apps/worker/src/integration/handlers/messenger-context.ts). No fallback:
 * only this inbox is ever attempted.
 */
const selectOnDemandInbox = (
  contactInboxes: readonly ConversationContactInboxResource[],
): ConversationContactInboxResource | undefined =>
  contactInboxes
    .filter((contactInbox) =>
      hasOnDemandProfileApi(contactInbox.channel as ChannelType),
    )
    .toSorted(
      (a, b) =>
        new Date(b.lastMessageAt ?? 0).getTime() -
        new Date(a.lastMessageAt ?? 0).getTime(),
    )[0]

/**
 * Fires `refreshContactProfileAction` at most once per `contactId` per mount
 * of the owning component (`ContactInboxPanel`) for a nameless contact whose
 * conversation has an on-demand-capable inbox. Silent — no toast on any
 * outcome; a `failed`/`unavailable` result never triggers a retry on another
 * inbox, and switching back to an already-attempted conversation while
 * mounted does not re-fire (only a remount resets the attempted set).
 */
export function useAutoRefreshContactProfile(
  props: UseAutoRefreshContactProfileProps,
): void {
  const { workspaceId, conversation, setContactData } = props
  const attemptedContactIds = useRef<Set<string>>(new Set())
  const updateContact = useChatStore((state) => state.updateContact)

  const contactId = conversation?.contactId ?? ""

  const { execute } = useAction(
    refreshContactProfileAction.bind(null, workspaceId, contactId),
    {
      onSuccess: ({ data }) => {
        if (data?.status !== "updated") {
          return
        }
        updateContact(contactId, data.contact)
        setContactData((prev) => prev && { ...prev, ...data.contact })
      },
    },
  )

  // `execute` is rebuilt every render from the current workspaceId/contactId
  // — depending on it would refire this effect on every render. The
  // `attemptedContactIds` guard below is what actually prevents duplicate
  // attempts, independent of the effect's own re-run cadence.
  // biome-ignore lint/correctness/useExhaustiveDependencies: execute intentionally excluded, see comment above
  useEffect(() => {
    if (!(conversation?.contact && conversation.contactId)) {
      return
    }
    if (attemptedContactIds.current.has(conversation.contactId)) {
      return
    }
    if (!hasEmptyProfileName(conversation.contact)) {
      return
    }

    const contactInbox = selectOnDemandInbox(conversation.contactInboxes)
    if (!contactInbox) {
      return
    }

    attemptedContactIds.current.add(conversation.contactId)
    execute({ contactInboxId: contactInbox.id })
  }, [conversation])
}
