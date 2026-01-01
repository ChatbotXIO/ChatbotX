"use client"

import { ChevronDownIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useCallback, useEffect, useMemo, useState } from "react"
import { authClient } from "@/lib/auth/auth-client"
import { useContactAssigneeOptions } from "../../users/provider/user-hook"
import type { ConversationResource } from "../schemas/resource"
import AssignConversationDialog from "./assign-conversation-dialog"

type UpdateConversationAssigneeProps = {
  conversation: ConversationResource
  onChange: (user: string | null) => void
}

export function UpdateConversationAssignee({
  conversation,
  onChange,
}: UpdateConversationAssigneeProps) {
  const t = useTranslations()
  const options = useContactAssigneeOptions({ autoGroup: false })

  const { data: session } = authClient.useSession()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const onSelectAssignee = useCallback(
    (value: string | null) => {
      setSelectedId(value)
      onChange(value)
    },
    [onChange],
  )

  const agentLabel = useMemo(() => {
    if (selectedId) {
      if (selectedId === `u_${session?.user.id}`) {
        return t("assignAdmin.assignedToMe")
      }
      const selected = options.find((option) => option.value === selectedId)
      if (selected) {
        return t("assignAdmin.assignedTo", {
          name: selected.label,
        })
      }
    }
    return t("assignAdmin.assignConversation")
  }, [options, selectedId, t, session])

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
          <ChevronDownIcon className="ml-1 inline-block size-4" />
        </div>
      }
    />
  )
}
