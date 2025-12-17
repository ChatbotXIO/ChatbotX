"use client"

import { Button } from "@aha.chat/ui/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@aha.chat/ui/components/ui/dropdown-menu"
import {
  ArchiveIcon,
  EllipsisVerticalIcon,
  MailIcon,
  StarIcon,
  TrashIcon,
  UserLockIcon,
} from "lucide-react"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { useChatStore } from "../chat/store/chat-store-provider"
import { blockContactAction } from "../contacts/actions/block-contact.action"
import { unblockContactAction } from "../contacts/actions/unblock-contact.action"
import DeleteContactDialog from "../contacts/components/remove-contact-dialog"
import { archiveConversationAction } from "./actions/archive-conversation.action"
import { followConversationAction } from "./actions/follow-conversation.action"
import { unarchiveConversationAction } from "./actions/unarchive-conversation.action"
import { unfollowConversationAction } from "./actions/unfollow-conversation.action"
import { unreadConversationAction } from "./actions/unread-conversation.action"
import type { ConversationResource } from "./schemas/resource"

type ConversationActionProps = {
  conversation: ConversationResource
}

export function ConversationAction({ conversation }: ConversationActionProps) {
  const t = useTranslations()
  const { chatbotId } = useParams<{ chatbotId: string }>()

  const {
    deleteConversation,
    followConversation,
    unfollowConversation,
    unreadConversation,
  } = useChatStore((state) => state)
  const [isFollowedUp, setIsFollowedUp] = useState(conversation.followed)
  const [isArchived, setIsArchived] = useState(!!conversation.archivedAt)
  const [isBlocked, setIsBlocked] = useState(!!conversation.contact?.blockedAt)

  const { execute: followUpFn, isExecuting: isFollowingUp } = useAction(
    followConversationAction.bind(null, chatbotId, conversation.id),
    {
      onSuccess: () => {
        followConversation(conversation.id)
        setIsFollowedUp(true)
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
      unfollowConversationAction.bind(null, chatbotId, conversation.id),
      {
        onSuccess: () => {
          unfollowConversation(conversation.id)
          setIsFollowedUp(false)
        },
        onError: ({ error }) => {
          if (error.serverError) {
            toast.error(error.serverError)
          }
        },
      },
    )

  const { execute: unReadFn, isExecuting: isMarkingUnread } = useAction(
    unreadConversationAction.bind(null, chatbotId, conversation.id),
    {
      onSuccess: () => {
        unreadConversation(conversation.id)
      },
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    },
  )

  const { execute: archiveFn, isExecuting: isArchiving } = useAction(
    archiveConversationAction.bind(null, chatbotId),
    {
      onSuccess: () => {
        deleteConversation(conversation.id)
      },
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    },
  )

  const { execute: unarchiveFn, isExecuting: isUnarchiving } = useAction(
    unarchiveConversationAction.bind(null, chatbotId),
    {
      onSuccess: () => {
        setIsArchived(false)
        deleteConversation(conversation.id)
      },
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    },
  )

  const { execute: blockContactFn, isExecuting: isBlockingContact } = useAction(
    blockContactAction.bind(null, chatbotId, conversation.contact?.id || ""),
    {
      onSuccess: () => {
        deleteConversation(conversation.id)
      },
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    },
  )

  const { execute: unblockContactFn } = useAction(
    unblockContactAction.bind(null, chatbotId, conversation.contact?.id || ""),
    {
      onSuccess: () => {
        setIsBlocked(false)
        deleteConversation(conversation.id)
      },
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    },
  )

  useEffect(() => {
    setIsFollowedUp(conversation.followed)
    setIsArchived(!!conversation.archivedAt)
    setIsBlocked(!!conversation.contact?.blockedAt)
  }, [
    conversation.followed,
    conversation.archivedAt,
    conversation.contact?.blockedAt,
  ])

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost">
          <EllipsisVerticalIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56">
        {isFollowedUp ? (
          <DropdownMenuItem
            disabled={isRemovingFollowUp}
            onSelect={() => removeFollowUpFn()}
          >
            <StarIcon />
            {t("actions.removeFromFollowUp")}
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            disabled={isFollowingUp}
            onSelect={() => followUpFn()}
          >
            <StarIcon />
            {t("actions.markAsFollowUp")}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          disabled={isMarkingUnread}
          onSelect={() => unReadFn()}
        >
          <MailIcon />
          {t("actions.markAsUnread")}
        </DropdownMenuItem>
        {isArchived ? (
          <DropdownMenuItem
            disabled={isUnarchiving}
            onSelect={() => unarchiveFn({ ids: [conversation.id] })}
          >
            <ArchiveIcon />
            {t("actions.unarchive")}
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            disabled={isArchiving}
            onSelect={() => archiveFn({ ids: [conversation.id] })}
          >
            <ArchiveIcon />
            {t("actions.archive")}
          </DropdownMenuItem>
        )}
        {isBlocked ? (
          <DropdownMenuItem onSelect={() => unblockContactFn()}>
            <UserLockIcon />
            {t("actions.unblockContact")}
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            disabled={isBlockingContact}
            onSelect={() => blockContactFn()}
          >
            <UserLockIcon />
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
              <TrashIcon className="text-destructive" />
              {t("actions.deleteContact")}
            </DropdownMenuItem>
          }
        />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
