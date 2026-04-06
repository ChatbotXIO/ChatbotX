"use server"

import { db, relationsFilterToSQL } from "@chatbotx.io/database/client"
import { workspaceMemberModel } from "@chatbotx.io/database/schema"
import { getPaginationWithDefaults } from "@chatbotx.io/database/utils"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type {
  ListWorkspaceMembersRequest,
  ListWorkspaceMembersResponse,
} from "../schema/query"
import type { WorkspaceMemberResource } from "../schema/resource"

export async function listWorkspaceMembers(
  input: ListWorkspaceMembersRequest,
): Promise<ListWorkspaceMembersResponse> {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  const pagination = getPaginationWithDefaults(input)

  const where = {
    workspaceId: input.workspaceId,
    user: input.keyword
      ? {
          name: {
            ilike: `%${input.keyword.toLowerCase()}%`,
          },
        }
      : undefined,
  }

  const [data, totalRows] = await Promise.all([
    db.query.workspaceMemberModel.findMany({
      ...pagination,
      where,
      with: {
        user: true,
      },
    }),
    db.$count(
      workspaceMemberModel,
      relationsFilterToSQL(workspaceMemberModel, where),
    ),
  ])
  const pageCount = Math.ceil(totalRows / pagination.limit)

  return { data, pageCount }
}

export const getAllWorkspaceMembers = async (userId: string) => {
  const workspaceMembers = await db.query.workspaceMemberModel.findMany({
    where: {
      userId,
    },
    with: {
      workspace: true,
    },
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
