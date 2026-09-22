"use client"

import { ChevronDownIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useContactAssigneeOptions } from "@/features/users/provider/user-hook"
import { authClient } from "@/lib/auth/auth-client"
import type { ListConversationItemResource } from "../schema/resource"
import type { ConversationAssignee } from "./assign-conversation-dialog"
import AssignConversationDialog from "./assign-conversation-dialog"

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
  const contactAssigneeOptions = useContactAssigneeOptions()
  const selectedAssigneeOptionName = useMemo(
    () =>
      contactAssigneeOptions
        .flatMap((option) => option.children ?? [option])
        .find((option) => option.value === selectedId)?.label ?? null,
    [contactAssigneeOptions, selectedId],
  )

  const onSelectAssignee = useCallback(
    (assignee: ConversationAssignee) => {
      setSelectedId(assignee.id)
      setSelectedAssigneeName(assignee.name)
      onChange(assignee)
    },
    [onChange],
  )

  const agentLabel = useMemo(() => {
    if (selectedId) {
      if (selectedId === `u_${session?.user.id}`) {
        return t("assignAdmin.assignedToMe")
      }
      if (selectedAssigneeName) {
        return t("assignAdmin.assignedTo", {
          name: selectedAssigneeName,
        })
      }
      const assignedUserId = conversation.assignedUserId
      if (assignedUserId && selectedId === `u_${assignedUserId}`) {
        return t("assignAdmin.assignedTo", {
          name:
            conversation.assignedUser?.name ??
            selectedAssigneeOptionName ??
            "--",
        })
      }
      const assignedInboxTeamId = conversation.assignedInboxTeamId
      if (assignedInboxTeamId && selectedId === `t_${assignedInboxTeamId}`) {
        return t("assignAdmin.assignedTo", {
          name:
            conversation.assignedInboxTeam?.name ??
            selectedAssigneeOptionName ??
            "--",
        })
      }
    }
    return t("assignAdmin.assignConversation")
  }, [
    conversation,
    selectedAssigneeName,
    selectedAssigneeOptionName,
    selectedId,
    t,
    session,
  ])

  useEffect(() => {
    setSelectedAssigneeName(null)
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
