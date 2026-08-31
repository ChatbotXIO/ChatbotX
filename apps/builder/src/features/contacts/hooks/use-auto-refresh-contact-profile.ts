"use client"

import {
  hasEmptyProfileName,
  hasOnDemandProfileApi,
} from "@chatbotx.io/business"
import type { ChannelType } from "@chatbotx.io/database/partials"
import { type RefObject, useEffect, useRef } from "react"
import type {
  ConversationContactInboxResource,
  ListConversationItemResource,
} from "@/features/conversations/schema/resource"
import { useChatStore } from "../../chat/store/chat-store-provider"
import { refreshContactProfileAction } from "../actions/refresh-contact-profile.action"
import type { GetContactResponse } from "../schema/query"
import type { ContactResource } from "../schema/resource"

export type SetContactData = (
  updater: (prev: GetContactResponse | null) => GetContactResponse | null,
) => void

export type UseAutoRefreshContactProfileProps = {
  workspaceId: string
  conversation: ListConversationItemResource | null | undefined
  setContactData: SetContactData
  /**
   * Called right after the panel-local patch, with the contactId that was
   * updated — lets the panel re-fetch the canonical contact from the server
   * so its `contactData` converges even if an earlier `getContact` request
   * (fired when the panel first opened) resolves AFTER this patch and would
   * otherwise overwrite it with stale data. The immediate `setContactData`
   * patch above is kept for instant UI feedback; this is a convergence
   * guarantee, not a replacement for it.
   */
  onProfileUpdated?: (contactId: string) => void
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

type RefreshTarget = {
  contactId: string
  contactInboxId: string
}

/**
 * Whether `conversation` is eligible for an auto-refresh attempt: a nameless
 * contact with an on-demand-capable inbox, and if so, which inbox
 * (`selectOnDemandInbox`'s newest-capable-inbox pick). Pure — does not
 * consult `attemptedContactIds`; the effect still gates on that itself.
 */
const selectRefreshTarget = (
  conversation: ListConversationItemResource | null | undefined,
): RefreshTarget | null => {
  if (!(conversation?.contact && conversation.contactId)) {
    return null
  }
  if (!hasEmptyProfileName(conversation.contact)) {
    return null
  }
  const contactInbox = selectOnDemandInbox(conversation.contactInboxes)
  if (!contactInbox) {
    return null
  }
  return { contactId: conversation.contactId, contactInboxId: contactInbox.id }
}

type ApplyRefreshResultDeps = {
  isMountedRef: RefObject<boolean>
  activeContactIdRef: RefObject<string | null>
  updateContact: (contactId: string, data: Partial<ContactResource>) => void
  setContactData: SetContactData
  onProfileUpdated?: (contactId: string) => void
}

/**
 * Applies a settled `refreshContactProfileAction` result: the store patch
 * runs for any resolved contactId (the store is keyed by id, independent of
 * what the panel currently shows); the panel-local patch and convergence
 * callback only run while the panel is STILL showing this contact — an
 * operator may have switched away before this attempt resolved. `isMounted`
 * and `activeContactId` are read from the refs at call time, never captured,
 * so they reflect state as of when the promise actually settles.
 */
const applyRefreshResult = (
  contactId: string,
  result: Awaited<ReturnType<typeof refreshContactProfileAction>>,
  {
    isMountedRef,
    activeContactIdRef,
    updateContact,
    setContactData,
    onProfileUpdated,
  }: ApplyRefreshResultDeps,
) => {
  if (!isMountedRef.current) {
    return
  }
  if (result?.data?.status !== "updated") {
    return
  }
  const { contact: updatedContact } = result.data
  updateContact(contactId, updatedContact)
  if (activeContactIdRef.current === contactId) {
    setContactData((prev) => prev && { ...prev, ...updatedContact })
    onProfileUpdated?.(contactId)
  }
}

/**
 * Fires `refreshContactProfileAction` at most once per `contactId` per mount
 * for a nameless contact whose conversation has an on-demand-capable inbox.
 * Silent — no toast, no retry on another inbox, no re-fire on switching back
 * to an already-attempted conversation (only a remount resets that).
 *
 * The action is called directly rather than through `useAction`, so each
 * attempt gets its own promise/closure and applies its result independent of
 * any other attempt's order — `useAction` is scoped to one bound action and
 * would let a later attempt silently drop an earlier one's result.
 * `isMountedRef` guards against applying a result after unmount;
 * `activeContactIdRef` guards the panel-local patch against a stale contact
 * resolving after the panel has switched to another one.
 */
export function useAutoRefreshContactProfile(
  props: UseAutoRefreshContactProfileProps,
): void {
  const { workspaceId, conversation, setContactData, onProfileUpdated } = props
  const attemptedContactIds = useRef<Set<string>>(new Set())
  const updateContact = useChatStore((state) => state.updateContact)
  const isMountedRef = useRef(true)
  const activeContactIdRef = useRef<string | null>(null)

  // Re-arm on setup, not just clean up on teardown: React (with
  // reactStrictMode, apps/builder/next.config.ts) double-invokes effects in
  // dev — setup, cleanup, setup — on initial mount. A cleanup-only effect
  // would set this to `false` on the first cleanup and never set it back to
  // `true`, silently disabling every `.then()` below for the component's
  // entire lifetime in `next dev` (production is single-invoke and
  // unaffected, but this must not ship either way).
  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  useEffect(() => {
    // Track which contact the panel is currently showing regardless of
    // eligibility — a later-resolving attempt for a PREVIOUS contact must
    // never patch `setContactData` once the panel has moved on.
    activeContactIdRef.current = conversation?.contactId ?? null

    const target = selectRefreshTarget(conversation)
    if (!target) {
      return
    }
    const { contactId, contactInboxId } = target
    if (attemptedContactIds.current.has(contactId)) {
      return
    }
    attemptedContactIds.current.add(contactId)

    refreshContactProfileAction(workspaceId, contactId, { contactInboxId })
      .then((result) =>
        applyRefreshResult(contactId, result, {
          isMountedRef,
          activeContactIdRef,
          updateContact,
          setContactData,
          onProfileUpdated,
        }),
      )
      .catch(() => undefined) // transport failure (network/RSC) — silent, no state update, no retry
  }, [
    conversation,
    workspaceId,
    updateContact,
    setContactData,
    onProfileUpdated,
  ])
}
