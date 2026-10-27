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

/** The one label rule for a workspace member shown as an assignee. */
export const workspaceMemberLabel = (member: {
  user?: { name?: string | null } | null
}) => member.user?.name ?? "--"

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

type ContactAssigneeOptionsProps = {
  autoGroup?: boolean
  includeAll?: boolean
  includeUnassigned?: boolean
  enabled?: boolean
}

const useContactAssigneeOptionsState = (
  props?: ContactAssigneeOptionsProps,
) => {
  const {
    autoGroup = true,
    includeAll = false,
    includeUnassigned = false,
  } = props || {}

  const workspaceId = useWorkspaceId()
  const { data: workspaceMembers = [], isPending: isWorkspaceMembersPending } =
    useWorkspaceMembers(workspaceId, {
      enabled: props?.enabled,
    })
  const { data: inboxTeams = [], isPending: isInboxTeamsPending } =
    useInboxTeams(workspaceId, {
      enabled: props?.enabled,
    })
  const options = useMemo(() => {
    const result: SelectOption[] = [
      {
        label: "Agents",
        value: "agents",
        children: workspaceMembers.map((v) => ({
          label: workspaceMemberLabel(v),
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

  return {
    options,
    isPending: isWorkspaceMembersPending || isInboxTeamsPending,
  }
}

export const useContactAssigneeOptionsWithStatus = (
  props?: ContactAssigneeOptionsProps,
) => useContactAssigneeOptionsState(props)

export const useContactAssigneeOptions = (
  props?: ContactAssigneeOptionsProps,
) => useContactAssigneeOptionsState(props).options

export type ContactAssigneeMultiSelectConfig = {
  /** Translated group headings; defaults to the English "Agents" / "Inbox Teams". */
  groupLabels?: { agents: string; teams: string }
  /**
   * What an agent option's value carries after `u_`: the `User` id (default,
   * what contact assignment uses) or the `WorkspaceMember` id (what pipelines
   * store as assignees).
   */
  agentValue?: "userId" | "memberId"
}

export const useContactAssigneeMultiSelectOptions = ({
  groupLabels,
  agentValue = "userId",
}: ContactAssigneeMultiSelectConfig = {}): MultiSelectGroup[] => {
  const workspaceId = useWorkspaceId()
  const { data: workspaceMembers = [] } = useWorkspaceMembers(workspaceId)
  const { data: inboxTeams = [] } = useInboxTeams(workspaceId)
  const agentsHeading = groupLabels?.agents ?? "Agents"
  const teamsHeading = groupLabels?.teams ?? "Inbox Teams"
  return useMemo(
    () => [
      {
        heading: agentsHeading,
        options: workspaceMembers.map((v) => ({
          label: workspaceMemberLabel(v),
          value: `u_${agentValue === "memberId" ? v.id : v.user?.id}`,
        })),
      },
      {
        heading: teamsHeading,
        options: inboxTeams.map((v) => ({
          label: v.name,
          value: `t_${v.id}`,
        })),
      },
    ],
    [workspaceMembers, inboxTeams, agentsHeading, teamsHeading, agentValue],
  )
}
