"use client"

import { ChevronDownIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useContactAssigneeOptions } from "@/features/users/provider/user-hook"
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

  const relationLabel = useMemo(() => {
    const assignedUserId = conversation.assignedUserId
    const assignedUser = conversation.assignedUser
    if (
      assignedUserId &&
      assignedUser?.id === assignedUserId &&
      assignedUser.name
    ) {
      return assignedUser.name
    }

    const assignedInboxTeamId = conversation.assignedInboxTeamId
    const assignedInboxTeam = conversation.assignedInboxTeam
    if (
      assignedInboxTeamId &&
      assignedInboxTeam?.id === assignedInboxTeamId &&
      assignedInboxTeam.name
    ) {
      return assignedInboxTeam.name
    }

    return null
  }, [conversation])

  const isSelfAssigned = selectedId === `u_${session?.user.id}`
  const needsOptionLookup =
    selectedId !== null &&
    selectedAssigneeName === null &&
    relationLabel === null &&
    !isSelfAssigned
  const contactAssigneeOptions = useContactAssigneeOptions({
    autoGroup: false,
    enabled: needsOptionLookup,
  })

  const agentLabel = useMemo(() => {
    if (!selectedId) {
      return t("assignAdmin.assignConversation")
    }

    if (isSelfAssigned) {
      return t("assignAdmin.assignedToMe")
    }

    const label =
      selectedAssigneeName ??
      relationLabel ??
      contactAssigneeOptions.find((option) => option.value === selectedId)
        ?.label

    return label
      ? t("assignAdmin.assignedTo", { name: label })
      : t("assignAdmin.assignConversation")
  }, [
    contactAssigneeOptions,
    isSelfAssigned,
    relationLabel,
    selectedAssigneeName,
    selectedId,
    t,
  ])

  useEffect(() => {
    let nextSelectedId: string | null = null
    if (conversation.assignedUserId) {
      nextSelectedId = `u_${conversation.assignedUserId}`
    } else if (conversation.assignedInboxTeamId) {
      nextSelectedId = `t_${conversation.assignedInboxTeamId}`
    }
    const nextAssigneeName = relationLabel
    const nextAssignmentKey = `${conversation.id}:${nextSelectedId ?? ""}`
    const hasOptimisticNameForAssignment =
      selectedAssignmentKeyRef.current === nextAssignmentKey

    selectedAssignmentKeyRef.current = nextAssignmentKey
    setSelectedId(nextSelectedId)
    if (!hasOptimisticNameForAssignment || nextAssigneeName) {
      setSelectedAssigneeName(nextAssigneeName)
    }
  }, [
    conversation.assignedInboxTeamId,
    conversation.assignedUserId,
    conversation.id,
    relationLabel,
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
