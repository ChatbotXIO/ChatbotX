"use client"

import {
  hasEmptyProfileName,
  hasOnDemandProfileApi,
} from "@chatbotx.io/business"
import type { ChannelType } from "@chatbotx.io/database/partials"
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
 *
 * The action is called directly (`refreshContactProfileAction(workspaceId,
 * contactId, input)`) rather than through `useAction` — a single `useAction`
 * instance is scoped to ONE bound action, so reusing it as `contactId`
 * changes within a mount would let next-safe-action's own
 * newer-request-wins tracking silently drop an EARLIER attempt's result once
 * a LATER attempt starts (e.g. contact A's refresh is still in flight when
 * the operator switches to contact B — A's `updated` result, already
 * persisted server-side, would never reach the UI). Calling the action
 * directly gives each attempt its own promise and its own closure over
 * `contactId`/`setContactData`, so every attempt's result is applied
 * whenever IT resolves, independent of any other attempt's order or
 * in-flight state. `isMountedRef` guards against applying a result that
 * resolves after the owning component has unmounted.
 */
export function useAutoRefreshContactProfile(
  props: UseAutoRefreshContactProfileProps,
): void {
  const { workspaceId, conversation, setContactData } = props
  const attemptedContactIds = useRef<Set<string>>(new Set())
  const updateContact = useChatStore((state) => state.updateContact)
  const isMountedRef = useRef(true)

  useEffect(
    () => () => {
      isMountedRef.current = false
    },
    [],
  )

  useEffect(() => {
    if (!(conversation?.contact && conversation.contactId)) {
      return
    }
    const { contactId, contact } = conversation
    if (attemptedContactIds.current.has(contactId)) {
      return
    }
    if (!hasEmptyProfileName(contact)) {
      return
    }

    const contactInbox = selectOnDemandInbox(conversation.contactInboxes)
    if (!contactInbox) {
      return
    }

    attemptedContactIds.current.add(contactId)

    refreshContactProfileAction(workspaceId, contactId, {
      contactInboxId: contactInbox.id,
    }).then((result) => {
      if (!isMountedRef.current) {
        return
      }
      if (result?.data?.status !== "updated") {
        return
      }
      const { contact: updatedContact } = result.data
      updateContact(contactId, updatedContact)
      setContactData((prev) => prev && { ...prev, ...updatedContact })
    })
  }, [conversation, workspaceId, updateContact, setContactData])
}
