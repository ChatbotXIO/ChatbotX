"use server"

import { workspaceService } from "@chatbotx.io/business"
import { db } from "@chatbotx.io/database/client"

export type OrgWorkspaceRow = {
  id: string
  name: string
  createdAt: Date
  memberCount: number
}

export async function listOrgWorkspaces(props: {
  organizationId: string
}): Promise<OrgWorkspaceRow[]> {
  const workspaces = await workspaceService.listByOrganizationId({
    organizationId: props.organizationId,
  })

  if (workspaces.length === 0) {
    return []
  }

  const counts = await Promise.all(
    workspaces.map(async (w) => {
      const members = await db.query.workspaceMemberModel.findMany({
        where: { workspaceId: w.id },
        columns: { id: true },
      })
      return [w.id, members.length] as const
    }),
  )
  const countByWs = new Map(counts)

  return workspaces.map((w) => ({
    id: w.id,
    name: w.name,
    createdAt: w.createdAt,
    memberCount: countByWs.get(w.id) ?? 0,
  }))
}
