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
import { BaseService } from "../base.service"
import { notFoundException } from "../errors"
import { workspaceMemberService } from "../workspace-member/service"

type WorkspaceWhere = Partial<{ id: string; organizationId: string }>

class WorkspaceService extends BaseService {
  async findOrFail(props: {
    where: WorkspaceWhere
    tx?: DatabaseClient
  }): Promise<WorkspaceModel> {
    const workspace = await this.find(props)
    if (!workspace) {
      throw notFoundException("Workspace not found")
    }
    return workspace
  }

  async findById(id: string): Promise<WorkspaceModel> {
    return await this.findOrFail({ where: { id } })
  }

  async find(props: {
    where: WorkspaceWhere
    tx?: DatabaseClient
  }): Promise<WorkspaceModel | undefined> {
    const { where, tx = db } = props
    return await withCache(
      `workspaces:${JSON.stringify(props.where)}`,
      async () =>
        await tx.query.workspaceModel.findFirst({
          where,
        }),
      {
        tags: ["workspaces"],
      },
    )
  }

  async create(props: {
    data: typeof workspaceModel.$inferInsert
    organization: OrganizationModel
    createdBy: string
    tx?: DatabaseClient
  }): Promise<WorkspaceModel> {
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

    this.invalidateCacheTags([`users:${props.createdBy}:workspace-members`])

    return newWorkspace
  }
}

export const workspaceService = new WorkspaceService()
