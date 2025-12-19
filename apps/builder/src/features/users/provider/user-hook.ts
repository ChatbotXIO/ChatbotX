import type { SelectOption } from "@aha.chat/ui/components/form/select-field"
import type { MultiSelectGroup } from "@aha.chat/ui/components/ui/sersavan/multi-select"
import { useMemo } from "react"
import { useUserStore } from "./user-store-context"

export const useContactAssigneeOptions = (): SelectOption[] => {
  const { chatbotMembers, inboxTeams } = useUserStore((state) => state)

  return useMemo(
    () => [
      {
        label: "Agents",
        value: "agents",
        children: chatbotMembers.map((v) => ({
          label: v.user?.name ?? "--",
          value: `u_${v.user?.id}`,
        })),
      },
      {
        label: "Inbox Teams",
        value: "inbox-teams",
        children: inboxTeams.map((v) => ({
          label: v.name,
          value: `t_${v.id}`,
        })),
      },
    ],
    [chatbotMembers, inboxTeams],
  )
}
export const useContactAssigneeMultiSelectOptions = (): MultiSelectGroup[] => {
  const { chatbotMembers, inboxTeams } = useUserStore((state) => state)

  return useMemo(
    () => [
      {
        heading: "Agents",
        options: chatbotMembers.map((v) => ({
          label: v.user?.name ?? "--",
          value: `u_${v.user?.id}`,
        })),
      },
      {
        heading: "Inbox Teams",
        options: inboxTeams.map((v) => ({
          label: v.name,
          value: `t_${v.id}`,
        })),
      },
    ],
    [chatbotMembers, inboxTeams],
  )
}
