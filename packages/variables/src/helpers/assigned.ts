import { workspaceMemberService } from "@chatbotx.io/services"

export const getAssignedAdminName = async (
  workspaceId: string,
): Promise<string | null> => {
  const workspaceMembers = await workspaceMemberService.listByWorkspaceId({
    workspaceId,
  })
  return (
    workspaceMembers.find((member) => member.role === "admin")?.user.name ||
    null
  )
}

export const getAssignedAdminEmail = async (
  workspaceId: string,
): Promise<string | null> => {
  const workspaceMembers = await workspaceMemberService.listByWorkspaceId({
    workspaceId,
  })
  return (
    workspaceMembers.find((member) => member.role === "admin")?.user.email ||
    null
  )
}

export const getAssignedAdminId = async (
  workspaceId: string,
): Promise<string | null> => {
  const workspaceMembers = await workspaceMemberService.listByWorkspaceId({
    workspaceId,
  })
  return (
    workspaceMembers.find((member) => member.role === "admin")?.user.id || null
  )
}
