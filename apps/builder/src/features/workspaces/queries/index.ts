import { notFoundException } from "@chatbotx.io/business/errors"
import { type DatabaseClient, db } from "@chatbotx.io/database/client"
import { workspaceMemberRoles } from "@chatbotx.io/database/partials"
import {
  workspaceMemberModel,
  workspaceModel,
  workspaceUsageModel,
} from "@chatbotx.io/database/schema"
import type {
  OrganizationModel,
  WorkspaceModel,
} from "@chatbotx.io/database/types"
import { withCache } from "@chatbotx.io/redis"
import { createId } from "@chatbotx.io/utils"
import { getTranslations } from "next-intl/server"

export const findWorkspaceOrFail = async (
  where: Record<string, unknown>,
): Promise<WorkspaceModel> => {
  const workspace = await db.query.workspaceModel.findFirst({
    where,
  })
  if (!workspace) {
    throw notFoundException("Workspace not found")
  }
  return workspace
}

type WorkspaceWhere = Partial<{ id: string; organizationId: string }>

export const workspaceService = {
  find: async (props: { where: WorkspaceWhere; tx?: DatabaseClient }) => {
    const { where, tx = db } = props
    return await tx.query.workspaceModel.findFirst({
      where,
    })
  },

  findOrFail: async (props: { where: WorkspaceWhere; tx?: DatabaseClient }) => {
    const t = await getTranslations()
    const workspace = await workspaceService.find(props)
    if (!workspace) {
      throw notFoundException(
        t("messages.featureNotFound", { feature: "Workspace" }),
      )
    }
    return workspace
  },

  findWithCache: async (props: {
    where: WorkspaceWhere
    tx?: DatabaseClient
  }) =>
    await withCache(
      `workspaces:${JSON.stringify(props.where)}`,
      async () => await workspaceService.find(props),
      {
        tags: ["workspaces"],
      },
    ),
  create: async (props: {
    data: typeof workspaceModel.$inferInsert
    organization: OrganizationModel
    createdBy: string
    tx?: DatabaseClient
  }): Promise<WorkspaceModel> => {
    const { data, tx = db } = props

    const [newWorkspace] = await tx
      .insert(workspaceModel)
      .values(data)
      .returning()

    // Create workspace usage
    await tx.insert(workspaceUsageModel).values({
      id: createId(),
      workspaceId: newWorkspace.id,
      maxContacts: props.organization.defaultMaxContacts,
    })

    // Create workspace member
    await tx.insert(workspaceMemberModel).values({
      id: createId(),
      userId: props.createdBy,
      workspaceId: newWorkspace.id,
      role: workspaceMemberRoles.enum.owner,
      permissions: {
        superAdmin: true,
        analytics: true,
        flows: true,
        contacts: true,
        onlyAssignedContacts: true,
        emailAndPhone: true,
        broadcast: true,
        ecommerce: true,
      },
      notificationTypes: {
        notifyAdmin: true,
        newMessageToHuman: true,
        newOrder: true,
      },
      notificationChannels: {
        messenger: true,
        email: true,
        telegram: true,
        browser: true,
      },
    })

    return newWorkspace
  },
}
