"use client"

import { ChevronDownIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useCallback, useEffect, useMemo, useState } from "react"
import { authClient } from "@/lib/auth/auth-client"
import type { ListConversationItemResource } from "../schema/resource"
import AssignConversationDialog, {
  type ConversationAssignee,
} from "./assign-conversation-dialog"

type UpdateConversationAssigneeProps = {
  conversation: ListConversationItemResource
  onChange: (assignee: ConversationAssignee) => void
}

export function UpdateConversationAssignee({
  conversation,
  onChange,
}: UpdateConversationAssigneeProps) {
  const t = useTranslations()

  const { data: session } = authClient.useSession()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const onSelectAssignee = useCallback(
    (assignee: ConversationAssignee) => {
      setSelectedId(assignee.id)
      onChange(assignee)
    },
    [onChange],
  )

  const agentLabel = useMemo(() => {
    const assignedUserId = conversation.assignedUserId
    const assignedUserName = conversation.assignedUser?.name
    if (
      assignedUserId &&
      assignedUserName &&
      selectedId === `u_${assignedUserId}`
    ) {
      if (selectedId === `u_${session?.user.id}`) {
        return t("assignAdmin.assignedToMe")
      }

      return t("assignAdmin.assignedTo", { name: assignedUserName })
    }

    const assignedInboxTeamId = conversation.assignedInboxTeamId
    const assignedInboxTeamName = conversation.assignedInboxTeam?.name
    if (
      assignedInboxTeamId &&
      assignedInboxTeamName &&
      selectedId === `t_${assignedInboxTeamId}`
    ) {
      return t("assignAdmin.assignedTo", { name: assignedInboxTeamName })
    }
    return t("assignAdmin.assignConversation")
  }, [conversation, selectedId, t, session])

  useEffect(() => {
    if (conversation.assignedUserId) {
      setSelectedId(`u_${conversation.assignedUserId}`)
    } else if (conversation.assignedInboxTeamId) {
      setSelectedId(`t_${conversation.assignedInboxTeamId}`)
    } else {
      setSelectedId(null)
    }
  }, [conversation.assignedUserId, conversation.assignedInboxTeamId])

  return (
    <AssignConversationDialog
      assignedId={selectedId ?? undefined}
      contactIds={[conversation.contactId]}
      onSuccess={onSelectAssignee}
      showRemove={true}
      trigger={
        <div className="flex items-center">
          <span className="cursor-pointer text-gray-500 text-xs">
            {agentLabel}
          </span>
          <ChevronDownIcon className="ms-1 inline-block size-4" />
        </div>
      }
    />
  )
}
