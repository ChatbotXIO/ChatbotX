import { type DatabaseClient, db } from "@chatbotx.io/database/client"
import { workspaceMemberRoles } from "@chatbotx.io/database/partials"
import {
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
import { notFoundException } from "@/lib/errors/exception"
import { workspaceMemberService } from "../workspace-members/workspace-member-service"

type WorkspaceWhere = Partial<{ id: string; organizationId: string }>

export const workspaceService = {
  findOrFail: async (props: {
    where: WorkspaceWhere
    tx?: DatabaseClient
  }): Promise<WorkspaceModel> => {
    const t = await getTranslations()
    const workspace = await workspaceService.find(props)
    if (!workspace) {
      throw notFoundException(
        t("messages.featureNotFound", { feature: "Workspace" }),
      )
    }
    return workspace
  },

  findById: (id: string): Promise<WorkspaceModel> =>
    workspaceService.findOrFail({ where: { id } }),

  find: (props: {
    where: WorkspaceWhere
    tx?: DatabaseClient
  }): Promise<WorkspaceModel | undefined> => {
    const { where, tx = db } = props
    return withCache(
      `workspaces:${JSON.stringify(props.where)}`,
      async () =>
        await tx.query.workspaceModel.findFirst({
          where,
        }),
      {
        tags: ["workspaces"],
      },
    )
  },

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
    await workspaceMemberService.create({
      tx,
      data: {
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
      },
    })

    return newWorkspace
  },
}
