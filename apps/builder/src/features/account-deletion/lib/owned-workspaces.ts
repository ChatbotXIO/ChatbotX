export type OwnedWorkspace = {
  id: string
  name: string
}

type WorkspaceMembership = {
  workspace: {
    id: string
    name: string
    ownerId: string
  }
}

export const getOwnedWorkspaces = (input: {
  allWorkspaceMembers: WorkspaceMembership[]
  userId: string
}): OwnedWorkspace[] =>
  input.allWorkspaceMembers
    .filter((member) => member.workspace.ownerId === input.userId)
    .map((member) => ({
      id: member.workspace.id,
      name: member.workspace.name,
    }))
