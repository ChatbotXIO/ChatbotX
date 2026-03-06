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
  ArchiveXIcon,
  EllipsisVerticalIcon,
  MailIcon,
  StarIcon,
  StarOffIcon,
  TrashIcon,
  UserLockIcon,
} from "lucide-react"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
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
import type { ListConversationItemResource } from "./schemas/resource"

type ConversationActionProps = {
  conversation: ListConversationItemResource
}

export function ConversationAction({ conversation }: ConversationActionProps) {
  const t = useTranslations()
  const { chatbotId } = useParams<{ chatbotId: string }>()

  const { deleteConversation, updateConversation, updateContact } =
    useChatStore((state) => state)

  const { execute: followUpFn, isExecuting: isFollowingUp } = useAction(
    followConversationAction.bind(null, chatbotId, conversation.id),
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
      unfollowConversationAction.bind(null, chatbotId, conversation.id),
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
    unreadConversationAction.bind(null, chatbotId, conversation.id),
    {
      onSuccess: (result) => {
        updateConversation(conversation.id, {
          agentLastSeenAt: new Date(result.data?.agentLastSeenAt ?? new Date()),
        })
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
        updateConversation(conversation.id, {
          archivedAt: new Date(),
        })
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
        updateConversation(conversation.id, {
          archivedAt: null,
        })
      },
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    },
  )

  const { execute: blockContactFn, isExecuting: isBlockingContact } = useAction(
    blockContactAction.bind(null, chatbotId, conversation.contactId),
    {
      onSuccess: () => {
        updateContact(conversation.contactId, {
          blockedAt: new Date(),
        })
      },
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    },
  )

  const { execute: unblockContactFn } = useAction(
    unblockContactAction.bind(null, chatbotId, conversation.contactId),
    {
      onSuccess: () => {
        updateContact(conversation.contactId, {
          blockedAt: null,
        })
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
        <Button variant="ghost">
          <EllipsisVerticalIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56">
        {conversation.followed ? (
          <DropdownMenuItem
            disabled={isRemovingFollowUp}
            onSelect={() => removeFollowUpFn()}
          >
            <StarOffIcon />
            {t("actions.removeFromFollowUp")}
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            disabled={isFollowingUp}
            onSelect={() => followUpFn()}
          >
            <StarIcon className="fill-yellow-400 text-yellow-400" />
            {t("actions.markAsFollowUp")}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          disabled={isMarkingUnread}
          onSelect={() => unreadFn()}
        >
          <MailIcon />
          {t("actions.markAsUnread")}
        </DropdownMenuItem>
        {conversation.archivedAt ? (
          <DropdownMenuItem
            disabled={isUnarchiving}
            onSelect={() => unarchiveFn({ ids: [conversation.id] })}
          >
            <ArchiveXIcon />
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
        {conversation.contact?.blockedAt ? (
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
