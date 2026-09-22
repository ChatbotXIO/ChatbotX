import type { SelectOption } from "@chatbotx.io/ui/components/form/select-field"
import type { MultiSelectGroup } from "@chatbotx.io/ui/components/ui/sersavan/multi-select"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback, useMemo } from "react"
import { useWorkspaceId } from "@/hooks/routing"
import { orpc } from "@/lib/orpc/query"
import { maxPerPage } from "@/lib/shared-request"

export const useWorkspaceMembers = (
  workspaceId: string | undefined,
  options?: { enabled?: boolean },
) =>
  useQuery(
    orpc.workspaceMembersAPI.listWorkspaceMembersAuthenticatedAPI.queryOptions({
      input: { workspaceId: workspaceId ?? "", perPage: maxPerPage },
      enabled: Boolean(workspaceId) && (options?.enabled ?? true),
      select: (res) => res.data,
    }),
  )

export const useInboxTeams = (
  workspaceId: string | undefined,
  options?: { enabled?: boolean },
) =>
  useQuery(
    orpc.inboxTeamsAPI.listInboxTeamsAuthenticatedAPI.queryOptions({
      input: { workspaceId: workspaceId ?? "" },
      enabled: Boolean(workspaceId) && (options?.enabled ?? true),
      select: (res) => res.data,
    }),
  )

export const useInvalidateUsers = () => {
  const queryClient = useQueryClient()

  return useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey:
            orpc.workspaceMembersAPI.listWorkspaceMembersAuthenticatedAPI.key(),
        }),
        queryClient.invalidateQueries({
          queryKey: orpc.inboxTeamsAPI.listInboxTeamsAuthenticatedAPI.key(),
        }),
      ]),
    [queryClient],
  )
}

export const useContactAssigneeOptions = (props?: {
  autoGroup?: boolean
  includeAll?: boolean
  includeUnassigned?: boolean
  enabled?: boolean
}): SelectOption[] => {
  const {
    autoGroup = true,
    includeAll = false,
    includeUnassigned = false,
  } = props || {}

  const workspaceId = useWorkspaceId()
  const { data: workspaceMembers = [] } = useWorkspaceMembers(workspaceId, {
    enabled: props?.enabled,
  })
  const { data: inboxTeams = [] } = useInboxTeams(workspaceId, {
    enabled: props?.enabled,
  })
  return useMemo(() => {
    const result: SelectOption[] = [
      {
        label: "Agents",
        value: "agents",
        children: workspaceMembers.map((v) => ({
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
    ]

    if (includeUnassigned) {
      result.unshift({
        label: "Unassigned",
        value: "unassigned",
      })
    }

    if (includeAll) {
      result.unshift({
        label: "All",
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
  const workspaceId = useWorkspaceId()
  const { data: workspaceMembers = [] } = useWorkspaceMembers(workspaceId)
  const { data: inboxTeams = [] } = useInboxTeams(workspaceId)
  return useMemo(
    () => [
      {
        heading: "Agents",
        options: workspaceMembers.map((v) => ({
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
    [workspaceMembers, inboxTeams],
  )
}
