"use client"

import { getWhatsappCallPermissionReply } from "@chatbotx.io/sdk"
import { useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef } from "react"
import type { RealtimeHandlerMap } from "@/features/realtime/types"
import { useWorkspaceRealtimeEvents } from "@/features/realtime/use-workspace-realtime-events"
import { useWorkspaceId } from "@/hooks/routing"
import { createBoundedSeenSet } from "@/lib/bounded-seen-set"
import { useConversationIdParam } from "../conversations/hooks/use-conversation-id-param"
import { outboundCallModeQueryKeys } from "../integration-whatsapp/calling/voip/outbound-call-mode-query-key"
import { useWhatsappVoipCallStore } from "../integration-whatsapp/calling/voip/voip-call-store"
import type { MessageResourceWithRelations } from "../messages/schema/resource"
import { useChatStore } from "./store/chat-store-provider"

/** Cap for the bubble-to-top dedupe set below — see its comment. */
const SEEN_WHATSAPP_CALL_IDS_CAPACITY = 500

/**
 * The chat subscriber: registers exactly the chat events this component
 * handled while it owned the workspace socket, now against the single
 * socket owned by `WorkspaceRealtimeProvider`
 * (`app/space/[workspaceId]/layout.tsx`). Logic moved verbatim, no event
 * added or removed.
 */
export function ChatRealtime() {
  const workspaceId = useWorkspaceId()
  const queryClient = useQueryClient()
  const invalidateOutboundCallMode = (conversationId: string) =>
    queryClient.invalidateQueries({
      queryKey: outboundCallModeQueryKeys.conversation(
        workspaceId,
        conversationId,
      ),
    })

  const {
    handleNewMessage,
    markMessagesDeleted,
    markMessageFailed,
    assignMessageCommentId,
    updateMessageText,
    updateMessageContentAttributes,
    updateContact,
    updateConversations,
    bubbleConversationToTop,
    openConversation,
  } = useChatStore((state) => state)
  const conversationIdParam = useConversationIdParam()

  // Bubble-to-top on a newly ringing call — a pure zustand subscription to
  // the voip store's `ringingCalls` basket, independent of which event (a
  // live `whatsappCallTransportIncoming` broadcast, or the resume-on-mount
  // fetch in `useWhatsappVoipCall`) put the entry there. Bubbles once per
  // `whatsappCallId` the FIRST time this component observes it in the
  // basket (including entries already present at mount — e.g. a resumed
  // ring that arrived before the inbox was opened), never again for the
  // same id.
  //
  // `seenWhatsappCallIdsRef` is a ref that OUTLIVES a single effect
  // invocation on purpose: under React Strict Mode (dev only), this
  // effect's setup/cleanup/setup runs twice on mount. A set declared
  // INSIDE the effect body would be recreated empty on the second
  // synthetic setup, re-bubbling every entry already bubbled by the first
  // (torn-down) setup. Keeping the set in a ref means both synthetic
  // setups share the same "already bubbled" memory, so nothing is ever
  // bubbled twice.
  //
  // Bounded (not a plain `Set`): this component stays mounted for the
  // entire inbox session, and every ringing call — answered, missed,
  // resumed — adds one more id that would otherwise never be forgotten.
  // `SEEN_WHATSAPP_CALL_IDS_CAPACITY` is far larger than any realistic
  // number of calls ringing within one session, so eviction only ever
  // discards ids old enough that a duplicate bubble for them is moot.
  const seenWhatsappCallIdsRef = useRef(
    createBoundedSeenSet<string>(SEEN_WHATSAPP_CALL_IDS_CAPACITY),
  )
  // `bubbleRingingConversationRef` holds the LATEST bubble callback,
  // refreshed by a small effect below rather than an Effect Event
  // (`useEffectEvent`): the zustand `subscribe` callback the ring-tracking
  // effect registers fires from the STORE, not from React's effect commit
  // phase — an arbitrary `setState` on `useWhatsappVoipCallStore` can
  // happen at any time, including outside any React render/effect. React's
  // own guidance restricts Effect Events to calls made synchronously from
  // inside an Effect; a store subscription callback is exactly the kind of
  // "called from outside an Effect" site that guidance warns about, so a
  // ref updated by its own effect is used instead.
  const bubbleRingingConversationRef = useRef((conversationId: string) =>
    bubbleConversationToTop(workspaceId, conversationId).catch(() => undefined),
  )
  useEffect(() => {
    bubbleRingingConversationRef.current = (conversationId: string) =>
      bubbleConversationToTop(workspaceId, conversationId).catch(
        () => undefined,
      )
  }, [workspaceId, bubbleConversationToTop])

  useEffect(() => {
    const bubbleNewEntries = (
      ringingCalls: ReturnType<
        typeof useWhatsappVoipCallStore.getState
      >["ringingCalls"],
    ) => {
      for (const ringingCall of ringingCalls) {
        if (seenWhatsappCallIdsRef.current.has(ringingCall.whatsappCallId)) {
          continue
        }
        seenWhatsappCallIdsRef.current.add(ringingCall.whatsappCallId)
        bubbleRingingConversationRef.current(ringingCall.conversationId)
      }
    }

    bubbleNewEntries(useWhatsappVoipCallStore.getState().ringingCalls)
    return useWhatsappVoipCallStore.subscribe((state) => {
      bubbleNewEntries(state.ringingCalls)
    })
    // The ref above always forwards to the latest `workspaceId`/
    // `bubbleConversationToTop`, so neither needs to be a dependency of
    // THIS effect. It only ever needs to run once per mount, driven by the
    // module-level voip store rather than any prop.
  }, [])

  // The other direction of the same cross-boundary bridge: `WhatsappCallPanel`
  // (mounted OUTSIDE `ChatStoreProvider` — see `workspace-realtime-shell.tsx`)
  // cannot call `chatStore.openConversation` directly, so it sets
  // `pendingConversationOpen` on the module-level voip store instead — its
  // "Go to conversation" control, and the D6 navigate-on-answer flow while
  // already on the inbox. This component (rendered INSIDE
  // `ChatStoreProvider`) is the one place that can bridge it into a real
  // selection, syncing the `conversationId` URL param the same way
  // `ConversationList` does when the agent picks a row, so the panel never
  // needs a router of its own for the on-inbox case. See `openPendingRef`
  // below for why the callback is held in a ref rather than a dependency.
  // MEDIUM 6: the URL param is synced ONLY after `openConversation` actually
  // succeeds — syncing it eagerly (as this used to) raced a concurrent
  // `initActiveConversationFromUrl` bootstrap: `openConversation` used to
  // silently no-op while one was in flight, leaving the URL pointing at a
  // conversation the store never actually selected. `openConversation` now
  // waits that bootstrap out instead of no-oping (see `chat-store.ts`), and
  // resolves `true`/`false` so this can tell.
  const openPendingRef = useRef((conversationId: string) => {
    openConversation(workspaceId, conversationId)
      .then((succeeded) => {
        if (succeeded) {
          conversationIdParam.set(conversationId)
        }
      })
      .catch(() => undefined)
  })
  useEffect(() => {
    openPendingRef.current = (conversationId: string) => {
      openConversation(workspaceId, conversationId)
        .then((succeeded) => {
          if (succeeded) {
            conversationIdParam.set(conversationId)
          }
        })
        .catch(() => undefined)
    }
  }, [workspaceId, openConversation, conversationIdParam])

  useEffect(() => {
    // `consumePendingConversationOpen` atomically reads-and-clears (so a
    // duplicate notification, e.g. Strict Mode's synthetic double
    // setup/subscribe, can never consume the same request twice) and drops
    // — returns `null` for — a request older than
    // `PENDING_CONVERSATION_OPEN_MAX_AGE_MS`, so this can never reopen a
    // stale request left over from a transient routing mismatch (see the
    // store's doc comment on `pendingConversationOpen`).
    const consumeIfPending = () => {
      const conversationId = useWhatsappVoipCallStore
        .getState()
        .consumePendingConversationOpen()
      if (conversationId) {
        openPendingRef.current(conversationId)
      }
    }

    if (useWhatsappVoipCallStore.getState().pendingConversationOpen) {
      consumeIfPending()
    }
    return useWhatsappVoipCallStore.subscribe((state) => {
      if (state.pendingConversationOpen) {
        consumeIfPending()
      }
    })
    // Same reasoning as the ringing-basket effect above: the ref always
    // forwards to the latest workspaceId/openConversation/conversationIdParam,
    // so this only ever needs to run once per mount.
  }, [])

  const handlers: RealtimeHandlerMap = {
    messageCreated: (event) => {
      const message = event.data as MessageResourceWithRelations
      handleNewMessage(message)
      // A customer's call-permission reply (accept/reject) changes what
      // the VoIP call button should do, but `useOutboundCallMode` caches
      // its resolution per conversation (staleTime) and would otherwise
      // keep showing the pre-accept "request permission" affordance until
      // a remount. Invalidate that query so the button reflects the new
      // grant on the next render, live.
      if (getWhatsappCallPermissionReply(message.contentAttributes)) {
        invalidateOutboundCallMode(message.conversationId)
      }
    },
    messageDeleted: (event) => {
      markMessagesDeleted(event.data.messageIds)
    },
    messageIdAssigned: (event) => {
      assignMessageCommentId(event.data.messageId, event.data.commentId)
    },
    messageFailed: (event) => {
      markMessageFailed(
        event.data.messageId,
        event.data.clientId,
        event.data.error,
      )
    },
    messageUpdated: (event) => {
      const { data } = event
      updateMessageText(data.messageId, data.newText, {
        newAttachmentPath: data.newAttachmentPath ?? null,
        newAttachmentPublicUrl: data.newAttachmentPublicUrl ?? null,
        newAttachmentMimeType: data.newAttachmentMimeType ?? null,
        newAttachmentWidth: data.newAttachmentWidth,
        newAttachmentHeight: data.newAttachmentHeight,
        removedAttachment: data.removedAttachment ?? false,
      })
    },
    messageContentUpdated: (event) => {
      updateMessageContentAttributes(
        event.data.messageId,
        event.data.contentAttributes,
      )
    },
    contactBlocked: (event) => {
      updateContact(event.data.contactId, { blockedAt: new Date() })
    },
    contactUnblocked: (event) => {
      updateContact(event.data.contactId, { blockedAt: null })
    },
    conversationAssigned: (event) => {
      const { data } = event
      updateConversations(data.conversationIds, {
        assignedUserId: data.assignedUserId,
        assignedInboxTeamId: data.assignedInboxTeamId,
      })
    },
  }

  useWorkspaceRealtimeEvents(handlers)

  return <div />
}
