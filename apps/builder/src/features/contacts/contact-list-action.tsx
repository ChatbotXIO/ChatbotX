"use client"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { AssignConversationDialog } from "@/features/contacts/assign-conversation-dialog"
import { archiveConversationAction } from "@/features/conversations/actions/archive-conversation-action"
import { assignConversationAction } from "@/features/conversations/actions/assign-conversation-action"
import { enableLiveChatAction } from "@/features/conversations/actions/enable-live-chat-action"
import type { Team, User } from "@ahachat.ai/database/browser"
import type { RowModel } from "@tanstack/react-table"
import { useTranslate } from "@tolgee/react"
import {
  ArchiveIcon,
  BotIcon,
  MenuIcon,
  MessageCirclePlusIcon,
  UserIcon,
} from "lucide-react"
import { useAction } from "next-safe-action/hooks"
import { useRouter } from "next/navigation"
import type React from "react"
import { useMemo, useState } from "react"
import { toast } from "sonner"

interface ContactListActionProps<TData>
  extends React.HTMLAttributes<HTMLDivElement> {
  chatbotId: string
  users: User[]
  teams: Team[]
  rows: RowModel<TData>[]
  onUnsetAllRows: () => void
}

export function ContactListAction<TData>({
  chatbotId,
  users,
  teams,
  rows,
  onUnsetAllRows,
}: ContactListActionProps<TData>) {
  const { t } = useTranslate()
  const router = useRouter()
  const conversationIds = useMemo(() => {
    return rows
      .filter((row) => row.original.conversation?.id)
      .map((row) => row.original.conversation?.id)
  }, [rows])
  const contactIds = useMemo(() => {
    return rows.map((row) => row.original.id)
  }, [rows])
  const [openAssignConversation, setOpenAssignConversation] = useState(false)
  const {
    execute: executeAssignConversation,
    isExecuting: isExecutingAssignConversation,
  } = useAction(assignConversationAction.bind(null, chatbotId), {
    onSuccess: () => {
      // TODO update assigned text on parent component
      // TODO whisper socket to update list conversation
      toast.success("Assign conversation successfully")
      setOpenAssignConversation(false)
      router.refresh()
      onUnsetAllRows()
    },
    onError: ({ error }) => {
      if (error.serverError) {
        toast.error(error.serverError.message ?? error.serverError)
      }
    },
  })

  const {
    execute: executeEnableLiveChat,
    isExecuting: isExecutingEnableLivechat,
  } = useAction(enableLiveChatAction.bind(null, chatbotId), {
    onSuccess: () => {
      toast.success("Enable chat successfully")
      router.refresh()
      onUnsetAllRows()
    },
    onError: ({ error }) => {
      if (error.serverError) {
        toast.error(error.serverError.message ?? error.serverError)
      }
    },
  })

  const {
    execute: executeArchiveConversation,
    isExecuting: isExecutingArchiveConversation,
  } = useAction(archiveConversationAction.bind(null, chatbotId), {
    onSuccess: async () => {
      toast.success("Archive conversation successfully")
      router.refresh()
      onUnsetAllRows()
    },
    onError: ({ error }) => {
      if (error.serverError) {
        toast.error(error.serverError.message ?? error.serverError)
      }
    },
  })

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label="Action"
            variant="outline"
            size="sm"
            className="ml-auto hidden h-8 gap-2 focus:outline-none focus:ring-1 focus:ring-ring focus-visible:ring-0 lg:flex"
          >
            <MenuIcon size={24} />
            Action
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center">
          <DropdownMenuItem
            onSelect={() =>
              contactIds.length && setOpenAssignConversation(true)
            }
          >
            <Button
              size="sm"
              variant="ghost"
              disabled={!contactIds.length || isExecutingAssignConversation}
              className="flex items-center gap-3"
            >
              <MessageCirclePlusIcon size="20" />
              {t("flows.ActionType.AssignConversation")}
            </Button>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() =>
              conversationIds.length &&
              executeEnableLiveChat({
                ids: conversationIds,
                liveChatEnabled: true,
              })
            }
          >
            <Button
              size="sm"
              variant="ghost"
              disabled={!conversationIds.length || isExecutingEnableLivechat}
              className="flex items-center gap-3"
            >
              <UserIcon size="20" />
              {t("flows.ActionType.DisableBot")}
            </Button>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() =>
              conversationIds.length &&
              executeEnableLiveChat({
                ids: conversationIds,
                liveChatEnabled: false,
              })
            }
          >
            <Button
              size="sm"
              variant="ghost"
              disabled={!conversationIds.length || isExecutingEnableLivechat}
              className="flex items-center gap-3"
            >
              <BotIcon size="20" />
              {t("flows.ActionType.EnableBot")}
            </Button>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() =>
              conversationIds.length &&
              executeArchiveConversation({ ids: conversationIds })
            }
          >
            <Button
              size="sm"
              variant="ghost"
              disabled={
                !conversationIds.length || isExecutingArchiveConversation
              }
              className="flex items-center gap-3"
            >
              <ArchiveIcon size="20" />
              {t("flows.ActionType.ArchiveConversation")}
            </Button>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AssignConversationDialog
        chatbotId={chatbotId}
        teams={teams}
        users={users}
        open={openAssignConversation}
        onOpenChange={setOpenAssignConversation}
        onSubmit={(data) =>
          contactIds.length &&
          executeAssignConversation({ ...data, ids: contactIds })
        }
      />
    </>
  )
}
