"use client"

import { resolveMessageAuthorUserId } from "@chatbotx.io/database/partials"
import { getWhatsappCallPermissionReply } from "@chatbotx.io/sdk"
import { useQueryClient } from "@tanstack/react-query"
import { useContext, useEffect, useRef } from "react"
import { useShallow } from "zustand/react/shallow"
import type { RealtimeHandlerMap } from "@/features/realtime/types"
import { useWorkspaceRealtimeEvents } from "@/features/realtime/use-workspace-realtime-events"
import { useWorkspaceId } from "@/hooks/routing"
import { createBoundedSeenSet } from "@/lib/bounded-seen-set"
import { logger } from "@/lib/log"
import { client } from "@/lib/orpc/orpc"
import { orpc } from "@/lib/orpc/query"
import { useConversationIdParam } from "../conversations/hooks/use-conversation-id-param"
import { conversationParticipantsQueryOptions } from "../conversations/hooks/use-conversation-participants"
import { mergeParticipantReplyIntoPages } from "../conversations/lib/merge-participant-reply"
import {
  createTagPreviewRefresher,
  type TagPreviewRefresher,
} from "../conversations/lib/tag-preview-refresher"
import type { ConversationParticipantResource } from "../conversations/schema/resource"
import { outboundCallModeQueryKeys } from "../integration-whatsapp/calling/voip/outbound-call-mode-query-key"
import { useWhatsappVoipCallStore } from "../integration-whatsapp/calling/voip/voip-call-store"
import type { MessageResourceWithRelations } from "../messages/schema/resource"
import { useResponseSlaEnabled } from "../response-sla/provider/response-sla-hook"
import { useTranslationUiStore } from "../translation/store/translation-ui-store"
import {
  useWorkspaceMembers,
  workspaceMembersQueryOptions,
} from "../users/provider/user-hook"
import { ChatStoreContext, useChatStore } from "./store/chat-store-provider"

/** Cap for the bubble-to-top dedupe set below. */
const SEEN_WHATSAPP_CALL_IDS_CAPACITY = 500

/** Cap for the messages whose reply was applied to the participants. */
const COUNTED_REPLIES_CAPACITY = 500

/** A reply this tab applied: `reply` is set once the author is resolved. */
type CountedReply = {
  conversationId: string
  message: MessageResourceWithRelations
  reply?: ConversationParticipantResource
}

/** Inserts into an insertion-ordered Map, evicting the oldest past `capacity`. */
const setBounded = <TValue,>(
  map: Map<string, TValue>,
  key: string,
  value: TValue,
): void => {
  map.set(key, value)
  if (map.size > COUNTED_REPLIES_CAPACITY) {
    const oldest = map.keys().next()
    if (!oldest.done) {
      map.delete(oldest.value)
    }
  }
}

/** Registers this component's chat event handlers against the shared workspace realtime socket. */
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
    applyAgentLastReadAt,
    applyConversationParticipantReply,
    replaceConversationRecentParticipants,
    findLoadedMessage,
    applyMessageTranslations,
    assignMessageCommentId,
    bubbleConversationToTop,
    handleNewMessages,
    markMessagesDeleted,
    markMessageFailed,
    openConversation,
    patchContactInboxThreadControl,
    removeMessages,
    resumeConversationHeadRefresh,
    scheduleConversationHeadRefresh,
    settleSendResult,
    updateContact,
    updateConversations,
    updateMessageContentAttributes,
    updateMessageText,
  } = useChatStore(
    useShallow((state) => ({
      applyAgentLastReadAt: state.applyAgentLastReadAt,
      applyConversationParticipantReply:
        state.applyConversationParticipantReply,
      replaceConversationRecentParticipants:
        state.replaceConversationRecentParticipants,
      findLoadedMessage: state.findLoadedMessage,
      applyMessageTranslations: state.applyMessageTranslations,
      assignMessageCommentId: state.assignMessageCommentId,
      bubbleConversationToTop: state.bubbleConversationToTop,
      handleNewMessages: state.handleNewMessages,
      markMessagesDeleted: state.markMessagesDeleted,
      markMessageFailed: state.markMessageFailed,
      openConversation: state.openConversation,
      patchContactInboxThreadControl: state.patchContactInboxThreadControl,
      removeMessages: state.removeMessages,
      resumeConversationHeadRefresh: state.resumeConversationHeadRefresh,
      scheduleConversationHeadRefresh: state.scheduleConversationHeadRefresh,
      settleSendResult: state.settleSendResult,
      updateContact: state.updateContact,
      updateConversations: state.updateConversations,
      updateMessageContentAttributes: state.updateMessageContentAttributes,
      updateMessageText: state.updateMessageText,
    })),
  )
  // `contactTagsChanged` -> refresh the tag chips of the loaded rows. Not a
  // request per event: ids are intersected with the loaded rows, coalesced and
  // fetched one batch at a time (see `createTagPreviewRefresher`).
  const chatStoreApi = useContext(ChatStoreContext)
  const tagPreviewRefresherRef = useRef<TagPreviewRefresher | null>(null)
  const getActiveContactId = (): string | null => {
    const state = chatStoreApi?.getState()
    return (
      state?.conversations.find(
        (conversation) => conversation.id === state.activeConversationId,
      )?.contactId ?? null
    )
  }
  useEffect(() => {
    if (!chatStoreApi) {
      return
    }
    const refresher = createTagPreviewRefresher({
      isLoaded: (contactId) =>
        chatStoreApi
          .getState()
          .conversations.some(
            (conversation) => conversation.contactId === contactId,
          ),
      fetchBatch: async (contactIds) =>
        (
          await client.conversationsAPI.listContactTagPreviewsAuthenticatedAPI({
            workspaceId,
            contactIds,
          })
        ).data,
      apply: ({ contactId, tagCount, tagPreview }) =>
        chatStoreApi
          .getState()
          .updateContact(contactId, { tagCount, tagPreview }),
      onGiveUp: (contactIds, error) =>
        logger.warn(
          { err: error, contactCount: contactIds.length },
          "[chat-realtime] gave up refreshing contact tag previews",
        ),
    })
    tagPreviewRefresherRef.current = refresher
    return () => {
      refresher.dispose()
      tagPreviewRefresherRef.current = null
    }
  }, [chatStoreApi, workspaceId])
  const { data: members } = useWorkspaceMembers(workspaceId)
  const conversationIdParam = useConversationIdParam()
  const responseSlaEnabled = useResponseSlaEnabled()

  // The members' replies reuse `messageCreated`: its author is on the message
  // itself, so no extra event is needed. The server is the source of truth
  // (it records the reply once the channel accepted the message), so a message
  // that fails or is removed refetches that conversation's list. Replies this
  // tab counted that the worker has not recorded yet are merged back, so the
  // refetch can never drop them. Bounded: `messageId -> counted reply`.
  const countedRepliesRef = useRef(new Map<string, CountedReply>())
  // Messages that failed for good: a Resend that then succeeds only publishes a
  // success confirmation (no new `messageCreated`), so they are kept to count again.
  const failedRepliesRef = useRef(
    new Map<string, MessageResourceWithRelations>(),
  )
  const rememberCountedReply = (message: MessageResourceWithRelations) => {
    setBounded(countedRepliesRef.current, message.id, {
      conversationId: message.conversationId,
      message,
    })
  }
  const refetchParticipants = (conversationId: string): void => {
    queryClient
      .fetchInfiniteQuery({
        ...conversationParticipantsQueryOptions(workspaceId, conversationId),
        pages: 1,
        staleTime: 0,
      })
      .then((fetched) => {
        const stillCounted = [...countedRepliesRef.current.values()].flatMap(
          (counted) =>
            counted.reply && counted.conversationId === conversationId
              ? [counted.reply]
              : [],
        )
        const merged = stillCounted.reduce(
          mergeParticipantReplyIntoPages,
          fetched,
        )
        queryClient.setQueryData(
          conversationParticipantsQueryOptions(workspaceId, conversationId)
            .queryKey,
          merged,
        )
        replaceConversationRecentParticipants(
          conversationId,
          merged.pages[0]?.data ?? [],
        )
      })
      .catch((error: unknown) =>
        logger.warn({ err: error }, "participants refetch failed"),
      )
  }
  // A message that failed or was removed no longer counts. Only a message this
  // tab counted can have moved the header, so a failed automated send
  // (broadcasts can fail by the thousand) costs nothing.
  const uncountReplies = (
    messageIds: readonly string[],
    { keepForResend }: { keepForResend: boolean },
  ): void => {
    const conversationIds = new Set<string>()
    for (const messageId of messageIds) {
      const counted = countedRepliesRef.current.get(messageId)
      if (counted) {
        conversationIds.add(counted.conversationId)
        countedRepliesRef.current.delete(messageId)
        if (keepForResend) {
          setBounded(failedRepliesRef.current, messageId, counted.message)
        }
      }
    }
    for (const conversationId of conversationIds) {
      refetchParticipants(conversationId)
    }
  }
  // A send that went through: count the message locally if this tab has not
  // (the confirmation is published before the worker records it, so no
  // refetch). That is a Resend of a message this tab saw fail, or of one
  // loaded from the database after a reload; the Resend button clears the
  // message's `sendError` before it sends, so the loaded message is the signal,
  // not its error. A message this tab already counted is skipped, and counting
  // twice is harmless anyway (the merge is monotonic).
  const recountResentReply = (
    messageId: string,
    loadedMessage: MessageResourceWithRelations | undefined,
  ): void => {
    const failedMessage = failedRepliesRef.current.get(messageId)
    failedRepliesRef.current.delete(messageId)
    const message =
      failedMessage ??
      (countedRepliesRef.current.has(messageId) ? undefined : loadedMessage)
    if (message) {
      applyParticipantReply(message)
    }
  }

  const applyReply = (
    message: MessageResourceWithRelations,
    reply: ConversationParticipantResource,
  ): void => {
    const counted = countedRepliesRef.current.get(message.id)
    // Uncounted while the member lookup ran: it failed or was removed.
    if (!counted) {
      return
    }
    counted.reply = reply
    applyConversationParticipantReply(message.conversationId, reply)
    queryClient.setQueryData(
      conversationParticipantsQueryOptions(workspaceId, message.conversationId)
        .queryKey,
      (data) => data && mergeParticipantReplyIntoPages(data, reply),
    )
  }

  const applyParticipantReply = (message: MessageResourceWithRelations) => {
    const userId =
      message.messageType === "outgoing"
        ? resolveMessageAuthorUserId(message)
        : null
    const lastRepliedAt = new Date(message.createdAt)
    if (!userId || Number.isNaN(lastRepliedAt.getTime())) {
      return
    }
    rememberCountedReply(message)
    const toReply = (user: {
      name: string | null
      image: string | null
    }): ConversationParticipantResource => ({
      userId,
      name: user.name,
      image: user.image,
      lastRepliedAt,
    })
    const cachedUser = members?.find((member) => member.userId === userId)?.user
    if (cachedUser) {
      applyReply(message, toReply(cachedUser))
      return
    }
    // A member who joined after the cached list, or the list is not loaded
    // yet: read a fresh list rather than guess. A member still missing from it
    // was removed; the server's list is the answer then.
    queryClient
      .fetchQuery({
        ...workspaceMembersQueryOptions(workspaceId),
        staleTime: 0,
      })
      .then(({ data }) => {
        const freshUser = data.find((member) => member.userId === userId)?.user
        if (freshUser) {
          applyReply(message, toReply(freshUser))
          return
        }
        refetchParticipants(message.conversationId)
      })
      .catch((error: unknown) =>
        logger.warn({ err: error }, "members refetch failed"),
      )
  }

  const pendingCreatedMessagesRef = useRef<MessageResourceWithRelations[]>([])
  const isMessageFlushQueuedRef = useRef(false)
  const flushPendingCreatedMessages = (): void => {
    if (!isMessageFlushQueuedRef.current) {
      return
    }

    const messages = pendingCreatedMessagesRef.current
    pendingCreatedMessagesRef.current = []
    isMessageFlushQueuedRef.current = false
    handleNewMessages(messages)
    // A customer message can open an SLA window whose deadline only the server
    // computes: a loaded row picks it up with the next (throttled) head fetch.
    // Skipped while the SLA is off so ordinary traffic costs nothing extra.
    if (
      responseSlaEnabled &&
      messages.some((message) => message.messageType === "incoming")
    ) {
      scheduleConversationHeadRefresh(workspaceId)
    }
    for (const createdMessage of messages) {
      applyParticipantReply(createdMessage)
      if (getWhatsappCallPermissionReply(createdMessage.contentAttributes)) {
        invalidateOutboundCallMode(createdMessage.conversationId)
      }
    }
  }

  const queueCreatedMessage = (message: MessageResourceWithRelations): void => {
    pendingCreatedMessagesRef.current.push(message)
    if (isMessageFlushQueuedRef.current) {
      return
    }

    isMessageFlushQueuedRef.current = true
    queueMicrotask(flushPendingCreatedMessages)
  }

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        resumeConversationHeadRefresh(workspaceId)
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange)
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [resumeConversationHeadRefresh, workspaceId])

  // Dedupes newly-ringing calls so each bubbles the conversation to top only
  // once. Held in a ref (not created inside the effect) so Strict Mode's
  // double setup/cleanup doesn't reset it and re-bubble already-seen entries;
  // bounded because this component stays mounted for the whole inbox session.
  const seenWhatsappCallIdsRef = useRef(
    createBoundedSeenSet<string>(SEEN_WHATSAPP_CALL_IDS_CAPACITY),
  )
  // Held in a ref rather than useEffectEvent: the zustand subscribe callback
  // fires from the store, not React's effect commit phase.
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
    // Runs once per mount; the ref above always forwards to the latest values.
  }, [])

  // WhatsappCallPanel (mounted outside ChatStoreProvider) can't call
  // chatStore.openConversation directly, so it sets pendingConversationOpen on
  // the module-level voip store; this component bridges that into a real
  // selection and syncs the conversationId URL param. The param is synced only
  // after openConversation resolves true, since syncing eagerly can race a
  // concurrent initActiveConversationFromUrl bootstrap.
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
    // consumePendingConversationOpen atomically reads-and-clears (avoids a
    // duplicate consume under Strict Mode's double setup) and drops requests
    // older than PENDING_CONVERSATION_OPEN_MAX_AGE_MS.
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
    // forwards to the latest values, so this only needs to run once per mount.
  }, [])

  const handlers: RealtimeHandlerMap = {
    messageCreated: (event) => {
      queueCreatedMessage(event.data as MessageResourceWithRelations)
    },
    messageDeleted: (event) => {
      flushPendingCreatedMessages()
      markMessagesDeleted(event.data.messageIds)
    },
    messageRemoved: (event) => {
      flushPendingCreatedMessages()
      removeMessages(event.data.messageIds)
      uncountReplies(event.data.messageIds, { keepForResend: false })
    },
    messageIdAssigned: (event) => {
      flushPendingCreatedMessages()
      assignMessageCommentId(event.data.messageId, event.data.commentId)
    },
    messageFailed: (event) => {
      flushPendingCreatedMessages()
      const loadedMessage = event.data.error
        ? undefined
        : findLoadedMessage(event.data.messageId)
      markMessageFailed(
        event.data.messageId,
        event.data.clientId,
        event.data.error,
      )
      // The same event is the composer queue's answer for the message it sent.
      settleSendResult(event.data)
      // `error: null` is the composer queue's success confirmation, which the
      // worker publishes before it records the reply: only a failure uncounts.
      if (event.data.error) {
        uncountReplies([event.data.messageId], { keepForResend: true })
      } else {
        recountResentReply(event.data.messageId, loadedMessage)
      }
    },
    messageUpdated: (event) => {
      flushPendingCreatedMessages()
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
    messageTranslationUpdated: (event) => {
      flushPendingCreatedMessages()
      const {
        conversationId,
        items,
        conversationLanguage,
        conversationEnabledOverride,
      } = event.data
      applyMessageTranslations(
        conversationId,
        items,
        conversationLanguage,
        conversationEnabledOverride,
      )
      // The answer is in: drop "translating"/"still waiting" so a `failed` row
      // shows as failed (with Retry) and nothing keeps waiting for it.
      useTranslationUiStore
        .getState()
        .clear(items.map((item) => item.messageId))
    },
    messageContentUpdated: (event) => {
      flushPendingCreatedMessages()
      updateMessageContentAttributes(
        event.data.messageId,
        event.data.contentAttributes,
      )
    },
    contactTagsChanged: (event) => {
      tagPreviewRefresherRef.current?.notify(event.data.contactIds)
      // The composer grid reads the open contact's tags from its own query:
      // refresh that one contact only (never a query per loaded row). The
      // toggle hook's pending/held overlay keeps winning while a click of this
      // agent is in flight.
      const activeContactId = getActiveContactId()
      if (activeContactId && event.data.contactIds.includes(activeContactId)) {
        queryClient.invalidateQueries({
          queryKey: orpc.contactsAPIs.getContactAuthenticatedAPI.queryOptions({
            input: { workspaceId, contactId: activeContactId },
          }).queryKey,
        })
      }
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
        assignedUser: null,
        assignedInboxTeam: null,
      })
      // A new assignee can move the response-SLA deadline, which only the
      // server computes.
      if (responseSlaEnabled) {
        scheduleConversationHeadRefresh(workspaceId)
      }
    },
    contactInboxThreadControlUpdated: (event) => {
      const { conversationId, ...snapshot } = event.data
      patchContactInboxThreadControl(conversationId, snapshot)
    },
    conversationUpdated: (event) => {
      const { conversationIds, changes } = event.data
      // This channel only advances read state. Cross-tab mark-unread (null) is
      // intentionally unsupported, matching the existing behavior.
      if (!changes.agentLastReadAt) {
        return
      }
      const agentLastReadAt = new Date(changes.agentLastReadAt)
      if (Number.isNaN(agentLastReadAt.getTime())) {
        return
      }
      applyAgentLastReadAt(conversationIds, agentLastReadAt)
    },
  }

  useWorkspaceRealtimeEvents(handlers)

  return <div />
}
