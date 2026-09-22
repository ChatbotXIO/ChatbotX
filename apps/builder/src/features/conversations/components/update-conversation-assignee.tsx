"use client"

import { Skeleton } from "@chatbotx.io/ui/components/ui/skeleton"
import { ChevronDownIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useContactAssigneeOptionsWithStatus } from "@/features/users/provider/user-hook"
import { authClient } from "@/lib/auth/auth-client"
import type { ListConversationItemResource } from "../schema/resource"
import AssignConversationDialog from "./assign-conversation-dialog"

type UpdateConversationAssigneeProps = {
  conversation: ListConversationItemResource
  onChange: (user: string | null) => void
}

export function UpdateConversationAssignee({
  conversation,
  onChange,
}: UpdateConversationAssigneeProps) {
  const t = useTranslations()

  const { data: session } = authClient.useSession()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const onSelectAssignee = useCallback(
    (value: string | null) => {
      setSelectedId(value)
      onChange(value)
    },
    [onChange],
  )

  // The store's `setAssignee` (an optimistic patch applied while the server
  // confirms an assignment) only ever writes the id fields, never the
  // `assignedUser`/`assignedInboxTeam` relation objects — so right after an
  // assignment, or a same-type reassignment (where the relation is left
  // pointing at the previous assignee), the relation is either missing or
  // stale. Trust it only when its own id agrees with the current id field;
  // otherwise fall back to the assignee option list below, which already has
  // the freshly selected name.
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
    selectedId !== null && relationLabel === null && !isSelfAssigned
  const {
    options: contactAssigneeOptions,
    isPending: isContactAssigneeOptionsPending,
  } = useContactAssigneeOptionsWithStatus({
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
      relationLabel ??
      contactAssigneeOptions.find((option) => option.value === selectedId)
        ?.label

    return label
      ? t("assignAdmin.assignedTo", { name: label })
      : t("assignAdmin.assignConversation")
  }, [contactAssigneeOptions, isSelfAssigned, relationLabel, selectedId, t])

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
            {needsOptionLookup && isContactAssigneeOptionsPending ? (
              <Skeleton className="h-3 w-24" />
            ) : (
              agentLabel
            )}
          </span>
          <ChevronDownIcon className="ms-1 inline-block size-4" />
        </div>
      }
    />
  )
}
