import type { SelectOption } from "@chatbotx.io/ui/components/form/select-field"
import type { MultiSelectGroup } from "@chatbotx.io/ui/components/ui/sersavan/multi-select"
import { useMemo } from "react"
import { useUserStore } from "./user-store-context"

export const useContactAssigneeOptions = (props?: {
  autoGroup?: boolean
  includeAll?: boolean
  includeUnassigned?: boolean
}): SelectOption[] => {
  const {
    autoGroup = true,
    includeAll = false,
    includeUnassigned = false,
  } = props || {}

  const { workspaceMembers, inboxTeams } = useUserStore((state) => state)

  return useMemo(() => {
    const result: SelectOption[] = [
      {
        label: "Agentes",
        value: "agents",
        children: workspaceMembers.map((v) => ({
          label: v.user?.name ?? "--",
          value: `u_${v.user?.id}`,
        })),
      },
      {
        label: "Times da Caixa de Entrada",
        value: "inbox-teams",
        children: inboxTeams.map((v) => ({
          label: v.name,
          value: `t_${v.id}`,
        })),
      },
    ]

    if (includeUnassigned) {
      result.unshift({
        label: "Não atribuído",
        value: "unassigned",
      })
    }

    if (includeAll) {
      result.unshift({
        label: "Todos",
        value: "all",
      })
    }
    if (autoGroup) {
      return result
    }

    return result
      .flatMap((v) => v.children ?? [])
      .filter(Boolean) as SelectOption[]
  }, [workspaceMembers, inboxTeams, autoGroup, includeAll, includeUnassigned])
}

export const useContactAssigneeMultiSelectOptions = (): MultiSelectGroup[] => {
  const { workspaceMembers, inboxTeams } = useUserStore((state) => state)

  return useMemo(
    () => [
      {
        heading: "Agentes",
        options: workspaceMembers.map((v) => ({
          label: v.user?.name ?? "--",
          value: `u_${v.user?.id}`,
        })),
      },
      {
        heading: "Times da Caixa de Entrada",
        options: inboxTeams.map((v) => ({
          label: v.name,
          value: `t_${v.id}`,
        })),
      },
    ],
    [workspaceMembers, inboxTeams],
  )
}
