import { workspaceMemberService } from "@chatbotx.io/services"

const getAssignedAdmin = async (workspaceId: string) => {
  const members = await workspaceMemberService.listByWorkspaceId({
    workspaceId,
  })
  return members.find((m) => m.role === "admin") ?? null
}

export const getAssignedAdminName = async (
  workspaceId: string,
): Promise<string | null> =>
  (await getAssignedAdmin(workspaceId))?.user.name ?? null

export const getAssignedAdminEmail = async (
  workspaceId: string,
): Promise<string | null> =>
  (await getAssignedAdmin(workspaceId))?.user.email ?? null

export const getAssignedAdminId = async (
  workspaceId: string,
): Promise<string | null> =>
  (await getAssignedAdmin(workspaceId))?.user.id ?? null
