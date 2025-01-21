"use client"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { archiveConversationAction } from "@/features/conversations/actions/archive-conversation-action"
import type { AssignConversationResponse } from "@/features/conversations/actions/assign-conversation-action"
import { blockContactAction } from "@/features/conversations/actions/block-contact-action"
import { enableLiveChatAction } from "@/features/conversations/actions/enable-live-chat-action"
import { followChatAction } from "@/features/conversations/actions/follow-chat-action"
import { unarchiveConversationAction } from "@/features/conversations/actions/unarchive-conversation-action"
import { unblockContactAction } from "@/features/conversations/actions/unblock-contact-action"
import ConversationAssignedPopover from "@/features/conversations/conversation-assigned-popover"
import type { ConversationResource } from "@/features/conversations/schemas/get-conversations-schema"
import {
  AssignedType,
  type Contact,
  type Conversation,
  type Team,
  type User,
} from "@ahachat.ai/database"
import { useTranslate } from "@tolgee/react"
import {
  ArchiveIcon,
  Bot,
  ChevronDown,
  EllipsisVerticalIcon,
  PackageOpenIcon,
  Star,
  StarOff,
  UserRoundMinusIcon,
  UserRoundPlusIcon,
} from "lucide-react"
import { useAction } from "next-safe-action/hooks"
import { parseAsString, useQueryState } from "nuqs"
import { toast } from "sonner"

interface MessagesHeadProps {
  conversation: ConversationResource
  users: User[]
  teams: Team[]
  onUpdateConversation: (data: object) => void
}

export default function MessageHead({
  conversation,
  users,
  teams,
  onUpdateConversation,
}: MessagesHeadProps) {
  const { t } = useTranslate()
  const [activeConversationId, setActiveConversationId] = useQueryState(
    "conversationId",
    parseAsString.withOptions({
      history: "replace",
      shallow: false,
    }),
  )

  const getFullName = (contact: Contact): string => {
    const { firstName, lastName, phoneNumber } = contact

    let fullName: string = [firstName, lastName].filter((v) => !!v).join(" ")
    if (!fullName) {
      fullName = phoneNumber || ""
    }

    return fullName
  }

  const {
    execute: executeEnableLiveChat,
    isExecuting: isExecutingEnableLiveChat,
  } = useAction(enableLiveChatAction.bind(null, conversation.chatbotId), {
    onSuccess: ({ input }) => {
      onUpdateConversation({ liveChatEnabled: input.liveChatEnabled })
    },
    onError: ({ error }) => {
      if (error.serverError) {
        toast.error(error.serverError.message ?? error.serverError)
      }
    },
  })

  const { execute: executeFollowChat, isExecuting: isExecutingFollowChat } =
    useAction(followChatAction.bind(null, conversation.chatbotId), {
      onSuccess: ({ input }) => {
        onUpdateConversation({ followed: input.followed })
      },
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError.message ?? error.serverError)
        }
      },
    })

  const { execute: executeArchiveConversation } = useAction(
    archiveConversationAction.bind(null, conversation.chatbotId),
    {
      onSuccess: async ({ data }) => {
        await setActiveConversationId(null)
      },
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError.message ?? error.serverError)
        }
      },
    },
  )

  const { execute: executeUnarchiveConversation } = useAction(
    unarchiveConversationAction.bind(null, conversation.chatbotId),
    {
      onSuccess: async () => {
        await setActiveConversationId(null)
      },
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError.message ?? error.serverError)
        }
      },
    },
  )

  const { execute: executeBlockContact } = useAction(
    blockContactAction.bind(null, conversation.chatbotId),
    {
      onSuccess: async () => {
        await setActiveConversationId(null)
      },
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError.message ?? error.serverError)
        }
      },
    },
  )

  const { execute: executeUnblockContact } = useAction(
    unblockContactAction.bind(null, conversation.chatbotId),
    {
      onSuccess: () => {
        onUpdateConversation({ blockedAt: null })
      },
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError.message ?? error.serverError)
        }
      },
    },
  )

  const updateAssigner = ({
    assignedId,
    assignedType,
    assigner,
  }: AssignConversationResponse) => {
    let data = {}
    if (assignedType === AssignedType.User) {
      data = {
        assignedUser: assigner,
        assignedTeam: null,
      }
    } else if (assignedType === AssignedType.Team) {
      data = {
        assignedUser: null,
        assignedTeam: assigner,
      }
    } else {
      data = {
        assignedUser: null,
        assignedTeam: null,
      }
    }

    onUpdateConversation({
      contact: { ...conversation.contact, assignedId, assignedType, ...data },
    })
  }

  return (
    <>
      <div>
        <div className="flex items-center gap-2 border-b p-3">
          <div className="flex-1">
            <div>{getFullName(conversation.contact)}</div>
            <div className="text-xs cursor-pointer">
              <ConversationAssignedPopover
                conversation={conversation}
                users={users}
                teams={teams}
                onAssigned={(data) =>
                  updateAssigner(data as AssignConversationResponse)
                }
              >
                <div className="flex gap-1 items-center w-fit">
                  {!conversation.contact.assignedId
                    ? t("flows.ActionType.AssignConversation")
                    : t("inboxes.assignedTo", {
                        name:
                          conversation.contact.assignedUser?.name ??
                          conversation.contact.assignedTeam?.name,
                      })}
                  <ChevronDown size={16} />
                </div>
              </ConversationAssignedPopover>
            </div>
          </div>
          {conversation.liveChatEnabled && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    className="flex-none"
                    disabled={isExecutingEnableLiveChat}
                    onClick={() =>
                      executeEnableLiveChat({
                        ids: [conversation.id],
                        liveChatEnabled: false,
                      })
                    }
                  >
                    <Bot size="24" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {t("flows.ActionType.enableBot")}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  className="flex-none"
                  disabled={isExecutingFollowChat}
                  onClick={() =>
                    executeFollowChat({
                      ids: [conversation.id],
                      followed: !conversation.followed,
                    })
                  }
                >
                  {conversation.followed ? (
                    <Star size="24" className="text-yellow-500" />
                  ) : (
                    <StarOff size="24" />
                  )}
                </Button>
              </TooltipTrigger>
              {conversation.followed ? (
                <TooltipContent>
                  {t("flows.ActionType.UnfollowConversation")}
                </TooltipContent>
              ) : (
                <TooltipContent>
                  {t("flows.ActionType.FollowConversation")}
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                aria-label="Open menu"
                variant="ghost"
                className="flex size-8 p-0 data-[state=open]:bg-muted"
              >
                <EllipsisVerticalIcon
                  size={24}
                  className="size-4"
                  aria-hidden="true"
                />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center">
              {!conversation.archivedAt ? (
                <DropdownMenuItem
                  onSelect={() =>
                    executeArchiveConversation({ ids: [conversation.id] })
                  }
                >
                  <div className="flex items-center gap-3">
                    <ArchiveIcon size="20" />
                    {t("flows.ActionType.ArchiveConversation")}
                  </div>
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  onSelect={() =>
                    executeUnarchiveConversation({ ids: [conversation.id] })
                  }
                >
                  <div className="flex items-center gap-3">
                    <PackageOpenIcon size="20" />
                    {t("flows.ActionType.UnArchiveConversation")}
                  </div>
                </DropdownMenuItem>
              )}
              {!conversation.blockedAt ? (
                <DropdownMenuItem
                  onSelect={() =>
                    executeBlockContact({ ids: [conversation.id] })
                  }
                >
                  <div className="flex items-center gap-3">
                    <UserRoundMinusIcon size="20" />
                    {t("flows.ActionType.BlockContact")}
                  </div>
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  onSelect={() =>
                    executeUnblockContact({ ids: [conversation.id] })
                  }
                >
                  <div className="flex items-center gap-3">
                    <UserRoundPlusIcon size="20" />
                    {t("inboxes.UnblockContact")}
                  </div>
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {!conversation.liveChatEnabled && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className="w-full flex items-center justify-center gap-2 bg-yellow-500 py-1 text-white cursor-pointer"
                onClick={() =>
                  !isExecutingEnableLiveChat &&
                  executeEnableLiveChat({
                    ids: [conversation.id],
                    liveChatEnabled: true,
                  })
                }
                onKeyDown={() => {}}
              >
                <Bot size="20" />
                {t("inboxes.bot.isActive")}
              </div>
            </TooltipTrigger>
            <TooltipContent>{t("flows.ActionType.disableBot")}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </>
  )
}
