import { useMemo } from "react"
import {
  useInboxTeams,
  useWorkspaceMembers,
  workspaceMemberLabel,
} from "@/features/users/provider/user-hook"

export type AssigneeOption = {
  /** `WorkspaceMember` id or `InboxTeam` id, the ids pipelines store. */
  id: string
  label: string
  kind: "member" | "team"
}

/** Workspace members and inbox teams an item can be assigned to. */
export function useAssigneeOptions(workspaceId: string) {
  const { data: members = [] } = useWorkspaceMembers(workspaceId)
  const { data: teams = [] } = useInboxTeams(workspaceId)
  return useMemo<AssigneeOption[]>(
    () => [
      ...members.map((member) => ({
        id: member.id,
        label: workspaceMemberLabel(member),
        kind: "member" as const,
      })),
      ...teams.map((team) => ({
        id: team.id,
        label: team.name,
        kind: "team" as const,
      })),
    ],
    [members, teams],
  )
}
