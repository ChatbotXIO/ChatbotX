"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  type AssignConversationResponse,
  assignConversationAction,
} from "@/features/conversations/actions/assign-conversation-action"
import {
  AssignedType,
  type Contact,
  type Conversation,
  type Team,
  type User,
} from "@ahachat.ai/database"
import { useTranslate } from "@tolgee/react"
import { UserIcon, Users } from "lucide-react"
import { useAction } from "next-safe-action/hooks"
import { type ReactNode, useMemo, useState } from "react"
import { toast } from "sonner"

interface MessagesHeadProps {
  children: ReactNode
  conversation: Conversation & { contact: Contact }
  users: User[]
  teams: Team[]
  onAssigned: (data: User | Team | null) => void
}

export default function ConversationAssignedPopover({
  children,
  conversation,
  users,
  teams,
  onAssigned,
}: MessagesHeadProps) {
  const { t } = useTranslate()
  const [assignerName, setAssignerName] = useState("")
  const [open, setOpen] = useState(false)
  const userOptions = useMemo(() => {
    return users.filter(
      (user) =>
        (conversation.contact.assignedType !== AssignedType.User ||
          conversation.contact.assignedId !== user.id) &&
        (!assignerName || user.name?.includes(assignerName)),
    )
  }, [users, assignerName, conversation])
  const teamOptions = useMemo(() => {
    return teams.filter(
      (team) =>
        (conversation.contact.assignedType !== AssignedType.Team ||
          conversation.contact.assignedId !== team.id) &&
        (!assignerName || team.name.includes(assignerName)),
    )
  }, [teams, assignerName, conversation])

  const { execute: executeAssignConversation } = useAction(
    assignConversationAction.bind(null, conversation.chatbotId),
    {
      onExecute: () => {
        setOpen(false)
      },
      onSuccess: ({ data }) => {
        // TODO update assigned text on parent component
        // TODO whisper socket to update list conversation
        onAssigned(data as AssignConversationResponse)
      },
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError.message ?? error.serverError)
        }
      },
    },
  )

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>{children}</PopoverTrigger>
        <PopoverContent className="p-0" align="center" side="right">
          <div className="flex flex-col gap-2 p-3">
            <Input
              placeholder={t("common.search")}
              className="border-0 focus-visible:ring-0 focus-visible:border-none"
              onChange={(event) => setAssignerName(event.target.value.trim())}
            />
            {userOptions.map((user) => (
              <Button
                variant="ghost"
                key={user.id}
                className="flex justify-start items-center gap-2 p-1 h-10"
                onClick={() =>
                  executeAssignConversation({
                    ids: [conversation.contactId],
                    assignedId: user.id,
                    assignedType: AssignedType.User,
                  })
                }
              >
                <Avatar className="w-8 h-8">
                  <AvatarImage src={user.image ?? ""} alt={user.name ?? ""} />
                  <AvatarFallback>
                    <UserIcon />
                  </AvatarFallback>
                </Avatar>
                {user.name}
              </Button>
            ))}
            {teamOptions.map((team) => (
              <Button
                variant="ghost"
                key={team.id}
                className="flex justify-start items-center gap-2 p-1 h-10"
                onClick={() =>
                  executeAssignConversation({
                    ids: [conversation.contactId],
                    assignedId: team.id,
                    assignedType: AssignedType.Team,
                  })
                }
              >
                <Avatar className="w-8 h-8">
                  <AvatarFallback>
                    <Users />
                  </AvatarFallback>
                </Avatar>
                {team.name}
              </Button>
            ))}
            <Button
              variant="ghost"
              className="border px-2"
              disabled={!conversation.contact.assignedId}
              onClick={() =>
                executeAssignConversation({
                  ids: [conversation.contactId],
                  assignedId: null,
                  assignedType: null,
                })
              }
            >
              {t("flows.ActionType.UnassignConversation")}
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </>
  )
}
