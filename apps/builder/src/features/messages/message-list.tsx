"use client"

import { Skeleton } from "@chatbotx.io/ui/components/ui/skeleton"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useEffect, useRef, useState } from "react"
import { type GridComponents, Virtuoso } from "react-virtuoso"
import { toast } from "sonner"
import { useWorkspaceId } from "@/hooks/routing"
import { useChatStore } from "../chat/store/chat-store-provider"
import { ConversationInfo } from "../conversations/components/conversation-info"
import { changeMessageAttributesAction } from "./actions/change-message-attributes.action"
import { deleteMessageAction } from "./actions/delete-message.action"
import { editMessageAction } from "./actions/edit-message.action"
import { MessageItem } from "./components/message-item"
import type { MessageResourceWithRelations } from "./schema/resource"

const MESSAGE_LIST_PER_PAGE = 20
const START_INDEX = 100_000

export function MessageList() {
  const workspaceId = useWorkspaceId()
  const t = useTranslations()

  const {
    messages,
    loadMoreMessages,
    isLoadMoreMessage,
    hasNextMessagePage,
    activeConversationId,
    setReplyToMessage,
    markMessagesDeleted,
    markMessagesRestored,
    updateMessageText,
    updateMessageAttributes,
  } = useChatStore((state) => state)

  const { execute: deleteMessage } = useAction(
    deleteMessageAction.bind(null, workspaceId, activeConversationId ?? ""),
    {
      onSuccess: () => {
        toast.success(t("messages.deleteMessageSuccess"))
      },
      onError: ({ error, input }) => {
        markMessagesRestored([input.id])
        toast.error(error.serverError)
      },
    },
  )

  const { execute: editMessage } = useAction(
    editMessageAction.bind(null, workspaceId, activeConversationId ?? ""),
    {
      onSuccess: ({ data }) => {
        if (data?.messageId) {
          updateMessageText(data.messageId, data.newText, {
            newAttachmentPath: data.newAttachmentPath,
            newAttachmentPublicUrl: data.newAttachmentPublicUrl,
            newAttachmentMimeType: data.newAttachmentMimeType,
            newAttachmentWidth: data.newAttachmentWidth,
            newAttachmentHeight: data.newAttachmentHeight,
            removedAttachment: data.removedAttachment,
          })
        }
        toast.success(t("messages.editMessageSuccess"))
      },
      onError: ({ error }) => {
        toast.error(error.serverError)
      },
    },
  )

  const { execute: changeMessageAttributes } = useAction(
    changeMessageAttributesAction.bind(
      null,
      workspaceId,
      activeConversationId ?? "",
    ),
    {
      onSuccess: ({ data }) => {
        if (data?.messageId && data.attributes) {
          updateMessageAttributes(data.messageId, data.attributes)
        }
      },
      onError: ({ error }) => {
        toast.error(error.serverError)
      },
    },
  )

  const handleReplyComment = (comment: { commentId: string; text: string }) => {
    const message = messages.find((m) => m.sourceId === comment.commentId)
    if (message) {
      setReplyToMessage(message)
    }
  }

  const handleDeleteComment = ({
    id,
    createdAt,
  }: {
    id: string
    createdAt: Date
  }) => {
    markMessagesDeleted([id])
    deleteMessage({
      id,
      createdAt,
    })
  }

  const handleEditMessage = (message: {
    id: string
    createdAt: Date
    text: string
    newAttachmentPath?: string
    newAttachmentPublicUrl?: string
    newAttachmentMimeType?: string
    newAttachmentName?: string
    newAttachmentSize?: number
    removeAttachment?: boolean
  }) => {
    editMessage({
      messageId: message.id,
      createdAt: message.createdAt,
      newText: message.text,
      newAttachmentPath: message.newAttachmentPath,
      newAttachmentPublicUrl: message.newAttachmentPublicUrl,
      newAttachmentMimeType: message.newAttachmentMimeType,
      newAttachmentName: message.newAttachmentName,
      newAttachmentSize: message.newAttachmentSize,
      removeAttachment: message.removeAttachment,
    })
  }

  const handleChangeLikeState = (message: MessageResourceWithRelations) => {
    const current =
      (message.attributes as { liked?: boolean; hidden?: boolean } | null) ?? {}
    changeMessageAttributes({
      messageId: message.id,
      createdAt: message.createdAt,
      liked: !current.liked,
    })
  }

  const handleChangeHideState = (message: MessageResourceWithRelations) => {
    const current =
      (message.attributes as { liked?: boolean; hidden?: boolean } | null) ?? {}
    changeMessageAttributes({
      messageId: message.id,
      createdAt: message.createdAt,
      hidden: !current.hidden,
    })
  }

  const [firstItemIndex, setFirstItemIndex] = useState(START_INDEX)
  const prevLengthRef = useRef(0)
  const prependPendingRef = useRef(false)
  const didAutoSelectCommentRef = useRef(false)

  // biome-ignore lint/correctness/useExhaustiveDependencies: wip
  useEffect(() => {
    setFirstItemIndex(START_INDEX)
    prevLengthRef.current = 0
    prependPendingRef.current = false
    didAutoSelectCommentRef.current = false
    if (activeConversationId) {
      loadMoreMessages(workspaceId, MESSAGE_LIST_PER_PAGE)
    }
  }, [activeConversationId])

  // biome-ignore lint/correctness/useExhaustiveDependencies: only runs once per conversation activation
  useEffect(() => {
    if (didAutoSelectCommentRef.current) {
      return
    }
    if (messages.length === 0) {
      return
    }
    didAutoSelectCommentRef.current = true
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i]
      if (
        message.messageType === "incoming" &&
        message.type === "comment" &&
        message.deletedAt == null &&
        message.sourceId
      ) {
        setReplyToMessage(message)
        break
      }
    }
  }, [messages])

  useEffect(() => {
    const prevLength = prevLengthRef.current
    const delta = messages.length - prevLength
    if (delta > 0 && prependPendingRef.current) {
      setFirstItemIndex((idx) => idx - delta)
      prependPendingRef.current = false
    }
    prevLengthRef.current = messages.length
  }, [messages.length])

  const loadMoreItems = () => {
    if (isLoadMoreMessage || !hasNextMessagePage || messages.length === 0) {
      return
    }
    prependPendingRef.current = true
    loadMoreMessages(workspaceId, MESSAGE_LIST_PER_PAGE)
  }

  return (
    <div className="flex flex-1 flex-col px-3">
      <Virtuoso
        alignToBottom={true}
        components={{
          List: MessageComponentList,
          Header: MessageComponentHeader,
        }}
        data={messages}
        firstItemIndex={firstItemIndex}
        followOutput
        initialTopMostItemIndex={{ index: "LAST" }}
        itemContent={(_, message) => (
          <MessageItem
            key={message.id}
            message={message}
            onChangeHide={() => handleChangeHideState(message)}
            onChangeLike={() => handleChangeLikeState(message)}
            onDelete={() => {
              handleDeleteComment({
                id: message.id,
                createdAt: message.createdAt,
              })
            }}
            onEdit={handleEditMessage}
            onReply={handleReplyComment}
          />
        )}
        startReached={loadMoreItems}
      />
    </div>
  )
}

const MessageComponentHeader: GridComponents["Header"] = () => {
  const { isLoadMoreMessage } = useChatStore((state) => state)

  return (
    <>
      <ConversationInfo />
      {isLoadMoreMessage && (
        <div className="flex items-center space-x-2 px-3 py-2">
          <Skeleton className="h-8 w-3/5 rounded-xl" />
        </div>
      )}
    </>
  )
}

const MessageComponentList: GridComponents["List"] = ({
  children,
  ...props
}) => (
  <div
    {...props}
    className="virtuoso-item-list flex flex-col gap-1.5 [&>div:first-child]:mt-3"
  >
    {children}
  </div>
)
