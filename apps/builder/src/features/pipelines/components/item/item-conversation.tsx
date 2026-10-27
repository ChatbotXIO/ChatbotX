"use client"

import type { ConversationAttributes } from "@chatbotx.io/database/partials"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { ArrowLeftIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useMemo, useState } from "react"
import {
  ContactDetailPane,
  MessageThreadPane,
  type PaneState,
} from "@/features/chat/chat-panes"
import { ChatRealtime } from "@/features/chat/chat-realtime"
import {
  ChatStoreProvider,
  useChatStore,
} from "@/features/chat/store/chat-store-provider"
import { useCallPlaybackStore } from "@/features/messages/store/call-playback-store"

type ItemConversationProps = {
  workspaceId: string
  conversationId: string
  /** Shown as the thread's back button on narrow screens, where the chat replaces the item. */
  onBack: () => void
}

/**
 * The inbox's conversation thread and contact panel, embedded beside an item
 * so an agent replies without leaving the board.
 * Its own chat store keeps it independent of the inbox page; the same panes
 * are reused, so sending, read tracking and realtime behave as in the inbox.
 */
export function ItemConversation(props: ItemConversationProps) {
  return (
    <ChatStoreProvider>
      <ChatRealtime />
      <ItemConversationPanes {...props} />
    </ChatStoreProvider>
  )
}

type OpenState = "loading" | "open" | "failed"

function ItemConversationPanes({
  workspaceId,
  conversationId,
  onBack,
}: ItemConversationProps) {
  const tc = useTranslations("actions")
  const openConversation = useChatStore((state) => state.openConversation)
  const activeConversationId = useChatStore(
    (state) => state.activeConversationId,
  )
  const conversations = useChatStore((state) => state.conversations)
  const [openState, setOpenState] = useState<OpenState>("loading")

  useEffect(() => {
    setOpenState("loading")
    openConversation(workspaceId, conversationId)
      .then((opened) => setOpenState(opened ? "open" : "failed"))
      .catch(() => setOpenState("failed"))
  }, [openConversation, workspaceId, conversationId])

  // The inbox's recording player is a module singleton; stop it with the
  // embedded chat, as the inbox layout does on unmount.
  useEffect(() => () => useCallPlaybackStore.getState().reset(), [])

  const activeConversation = useMemo(() => {
    const conversation = conversations.find(
      (candidate) => candidate.id === activeConversationId,
    )
    return conversation
      ? {
          ...conversation,
          additionalAttributes:
            conversation.additionalAttributes as ConversationAttributes,
        }
      : null
  }, [conversations, activeConversationId])

  // Thread actions (mark unread, archive, block) clear the selection; here
  // that closes the chat and returns to the item instead of spinning forever.
  const isClosedByAction = openState === "open" && !activeConversation
  useEffect(() => {
    if (isClosedByAction) {
      onBack()
    }
  }, [isClosedByAction, onBack])

  const paneState: PaneState = {
    activeConversation,
    isResolvingConversation: openState === "loading",
    shouldShowEmptyState: openState === "failed",
  }

  return (
    <>
      <section className="flex min-h-0 min-w-0 flex-1 flex-col border-s">
        {activeConversation ? null : (
          // The thread header (and its back button) only exists once loaded.
          <div className="flex h-12 shrink-0 items-center border-b px-2">
            <Button
              aria-label={tc("back")}
              onClick={onBack}
              size="icon"
              variant="ghost"
            >
              <ArrowLeftIcon />
            </Button>
          </div>
        )}
        <MessageThreadPane
          {...paneState}
          onBack={onBack}
          workspaceId={workspaceId}
        />
      </section>
      <aside className="hidden min-h-0 w-[22rem] shrink-0 overflow-y-auto border-s px-4 py-3 xl:block">
        <ContactDetailPane {...paneState} workspaceId={workspaceId} />
      </aside>
    </>
  )
}
