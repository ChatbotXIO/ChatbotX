"use server"

import { workspaceMemberService } from "@chatbotx.io/business"
import type {
  GetWorkspaceMemberRequest,
  GetWorkspaceMemberResponse,
  ListWorkspaceMembersRequest,
  ListWorkspaceMembersResponse,
} from "../schema/query"
import type { WorkspaceMemberResource } from "../schema/resource"

export async function listWorkspaceMembers(
  input: ListWorkspaceMembersRequest,
): Promise<ListWorkspaceMembersResponse> {
  return await workspaceMemberService.listPaginated(input)
}

export async function getWorkspaceMember(
  input: GetWorkspaceMemberRequest,
): Promise<GetWorkspaceMemberResponse | undefined> {
  return await workspaceMemberService.findByIdWithUser({
    id: input.memberId,
    workspaceId: input.workspaceId,
  })
}

export const getAllWorkspaceMembers = async (userId: string) => {
  const workspaceMembers = await workspaceMemberService.listByUserIdUncached({
    userId,
  })

  const workspaces = workspaceMembers.map((member) => member.workspace)

  const workspaceIds = Array.from(
    new Set(workspaces.map((workspace) => workspace.id)),
  )

  return {
    workspaceMembers: workspaceMembers as WorkspaceMemberResource[],
    workspaces,
    workspaceIds,
  }
}
