"use client"

import { ChevronDownIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
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
  const selectedAssignmentKeyRef = useRef<string | null>(null)

  const onSelectAssignee = useCallback(
    (assignee: ConversationAssignee) => {
      selectedAssignmentKeyRef.current = `${conversation.id}:${assignee.id ?? ""}`
      setSelectedId(assignee.id)
      setSelectedAssigneeName(assignee.name)
      onChange(assignee)
    },
    [conversation.id, onChange],
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
    let nextSelectedId: string | null = null
    if (conversation.assignedUserId) {
      nextSelectedId = `u_${conversation.assignedUserId}`
    } else if (conversation.assignedInboxTeamId) {
      nextSelectedId = `t_${conversation.assignedInboxTeamId}`
    }
    const nextAssigneeName =
      conversation.assignedUser?.name ??
      conversation.assignedInboxTeam?.name ??
      null
    const nextAssignmentKey = `${conversation.id}:${nextSelectedId ?? ""}`
    const hasOptimisticNameForAssignment =
      selectedAssignmentKeyRef.current === nextAssignmentKey

    selectedAssignmentKeyRef.current = nextAssignmentKey
    setSelectedId(nextSelectedId)
    if (!hasOptimisticNameForAssignment || nextAssigneeName) {
      setSelectedAssigneeName(nextAssigneeName)
    }
  }, [
    conversation.assignedInboxTeam?.name,
    conversation.assignedInboxTeamId,
    conversation.assignedUser?.name,
    conversation.assignedUserId,
    conversation.id,
  ])

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
