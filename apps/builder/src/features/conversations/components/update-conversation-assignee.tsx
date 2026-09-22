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
  const [selectedAssigneeName, setSelectedAssigneeName] = useState<
    string | null
  >(null)

  const onSelectAssignee = useCallback(
    (assignee: ConversationAssignee) => {
      setSelectedId(assignee.id)
      setSelectedAssigneeName(assignee.name)
      onChange(assignee)
    },
    [onChange],
  )

  const agentLabel = useMemo(() => {
    if (selectedId?.startsWith("u_") && selectedAssigneeName) {
      if (selectedId === `u_${session?.user.id}`) {
        return t("assignAdmin.assignedToMe")
      }

      return t("assignAdmin.assignedTo", { name: selectedAssigneeName })
    }

    if (selectedId?.startsWith("t_") && selectedAssigneeName) {
      return t("assignAdmin.assignedTo", { name: selectedAssigneeName })
    }

    return t("assignAdmin.assignConversation")
  }, [selectedAssigneeName, selectedId, session, t])

  useEffect(() => {
    if (conversation.assignedUserId) {
      setSelectedId(`u_${conversation.assignedUserId}`)
      return
    }

    if (conversation.assignedInboxTeamId) {
      setSelectedId(`t_${conversation.assignedInboxTeamId}`)
      return
    }

    setSelectedId(null)
    setSelectedAssigneeName(null)
  }, [conversation.assignedUserId, conversation.assignedInboxTeamId])

  useEffect(() => {
    const assignedAssigneeName =
      conversation.assignedUser?.name ?? conversation.assignedInboxTeam?.name

    if (assignedAssigneeName) {
      setSelectedAssigneeName(assignedAssigneeName)
    }
  }, [conversation.assignedInboxTeam?.name, conversation.assignedUser?.name])

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
