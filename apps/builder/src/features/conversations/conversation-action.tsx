"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@chatbotx.io/ui/components/ui/dropdown-menu"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"
import { RespondIcon } from "@/components/respond-icon"
import { useWorkspaceId } from "@/hooks/routing"
import { useChatStore } from "../chat/store/chat-store-provider"
import { blockContactAction } from "../contacts/actions/block-contact.action"
import { unblockContactAction } from "../contacts/actions/unblock-contact.action"
import DeleteContactDialog from "../contacts/components/remove-contact-dialog"
import { followConversationAction } from "./actions/follow-conversation.action"
import { unfollowConversationAction } from "./actions/unfollow-conversation.action"
import { unreadConversationAction } from "./actions/unread-conversation.action"
import type { ListConversationItemResource } from "./schema/resource"

type ConversationActionProps = {
  conversation: ListConversationItemResource
}

export function ConversationAction({ conversation }: ConversationActionProps) {
  const t = useTranslations()
  const workspaceId = useWorkspaceId()

  const {
    deleteConversation,
    updateConversation,
    setActiveConversationId,
    resetState: resetConversationState,
    loadMoreConversations,
  } = useChatStore((state) => state)

  const { execute: followUpFn, isExecuting: isFollowingUp } = useAction(
    followConversationAction.bind(null, workspaceId, conversation.id),
    {
      onSuccess: () => {
        updateConversation(conversation.id, {
          followed: true,
        })
      },
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    },
  )

  const { execute: removeFollowUpFn, isExecuting: isRemovingFollowUp } =
    useAction(
      unfollowConversationAction.bind(null, workspaceId, conversation.id),
      {
        onSuccess: () => {
          updateConversation(conversation.id, {
            followed: false,
          })
        },
        onError: ({ error }) => {
          if (error.serverError) {
            toast.error(error.serverError)
          }
        },
      },
    )

  const { execute: unreadFn, isExecuting: isMarkingUnread } = useAction(
    unreadConversationAction.bind(null, workspaceId, conversation.id),
    {
      onSuccess: (result) => {
        // Pedro pediu 2026-05-25 — comportamento "marcar como não lido"
        // igual WhatsApp:
        // (1) backend retrocede `agentLastReadAt` pro penúltimo incoming
        // (2) frontend força `unreadCount = 1` na lista de conversas
        //     (pill azul aparece imediatamente no card SEM esperar polling)
        // (3) **SAI da conversa** (`setActiveConversationId(null)`) — senão
        //     o `useEffect` do ConversationItem dispara `read()` ao reabrir
        //     a conversa ativa e remarca como lida, escondendo a pill.
        const newReadAt = result.data?.agentLastReadAt
        updateConversation(conversation.id, {
          agentLastReadAt: newReadAt ? new Date(newReadAt) : null,
          unreadCount: 1,
        })
        setActiveConversationId(null)
        toast.success(t("actions.markAsUnread"))
      },
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    },
  )

  // Arquivar/desarquivar saiu daqui. Agora é botão primário no header
  // (CloseConversationButton em message-head.tsx), igual Respond.io.

  const { execute: blockContactFn, isExecuting: isBlockingContact } = useAction(
    blockContactAction.bind(null, workspaceId, conversation.contactId),
    {
      onSuccess: () => {
        // updateContact(conversation.contactId, {
        //   blockedAt: new Date(),
        // })

        // Reload conversation list
        resetConversationState()
        loadMoreConversations(workspaceId)
      },
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    },
  )

  const { execute: unblockContactFn } = useAction(
    unblockContactAction.bind(null, workspaceId, conversation.contactId),
    {
      onSuccess: () => {
        // updateContact(conversation.contactId, {
        //   blockedAt: null,
        // })

        // Reload conversation list
        resetConversationState()
        loadMoreConversations(workspaceId)
      },
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    },
  )

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className="size-8" size="icon" variant="ghost">
          <RespondIcon name="more" size="lg" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56">
        {conversation.followed ? (
          <DropdownMenuItem
            disabled={isRemovingFollowUp}
            onSelect={() => removeFollowUpFn()}
          >
            <RespondIcon name="star" size="md" />
            {t("actions.removeFromFollowUp")}
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            disabled={isFollowingUp}
            onSelect={() => followUpFn()}
          >
            <RespondIcon
              className="text-yellow-400"
              name="star-bold"
              size="md"
            />
            {t("actions.markAsFollowUp")}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          disabled={isMarkingUnread}
          onSelect={() => unreadFn()}
        >
          <RespondIcon name="email" size="md" />
          {t("actions.markAsUnread")}
        </DropdownMenuItem>
        {conversation.contact?.blockedAt ? (
          <DropdownMenuItem onSelect={() => unblockContactFn()}>
            <RespondIcon name="forbidden" size="md" />
            {t("actions.unblockContact")}
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            disabled={isBlockingContact}
            onSelect={() => blockContactFn()}
          >
            <RespondIcon name="forbidden" size="md" />
            {t("actions.blockContact")}
          </DropdownMenuItem>
        )}

        <DeleteContactDialog
          ids={[conversation.contact?.id || ""]}
          onSuccess={() => {
            deleteConversation(conversation.id)
          }}
          trigger={
            <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
              <RespondIcon
                className="text-destructive"
                name="trash"
                size="md"
              />
              {t("actions.deleteContact")}
            </DropdownMenuItem>
          }
        />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
