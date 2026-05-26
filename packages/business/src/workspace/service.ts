import { type DatabaseClient, db, eq } from "@chatbotx.io/database/client"
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
      throw notFoundException("Workspace não encontrado")
    }
    return workspace
  }

  async findById(props: {
    id: string
    tx?: DatabaseClient
  }): Promise<WorkspaceModel> {
    return await this.findOrFail({ where: { id: props.id }, tx: props.tx })
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
          restrictDataExport: false,
          restrictContactDeletion: false,
          restrictWorkspaceSettings: false,
          restrictIntegrationSettings: false,
          contactVisibility: "all",
          restrictCalling: false,
          restrictWorkflows: false,
          maskPhoneAndEmail: false,
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

  async update(props: {
    id: string
    data: Partial<typeof workspaceModel.$inferInsert>
    tx?: DatabaseClient
  }): Promise<void> {
    const { id, data, tx = db } = props

    await tx.update(workspaceModel).set(data).where(eq(workspaceModel.id, id))

    // Busca todos os membros pra invalidar o cache de cada user
    // (listByUserId cacheia por usuário e é o que alimenta o sidebar)
    const members = await tx.query.workspaceMemberModel.findMany({
      where: { workspaceId: id },
    })

    await this.invalidateCacheTags([
      "workspaces",
      `workspaces:${id}`,
      `workspaces:${id}:workspace-members`,
      ...members.map((m) => `users:${m.userId}:workspace-members`),
    ])
  }

  async delete(props: { id: string; tx?: DatabaseClient }): Promise<void> {
    const { id, tx = db } = props

    const members = await tx.query.workspaceMemberModel.findMany({
      where: { workspaceId: id },
    })

    await tx.delete(workspaceModel).where(eq(workspaceModel.id, id))

    await this.invalidateCacheTags([
      "workspaces",
      `workspaces:${id}`,
      `workspaces:${id}:workspace-members`,
      ...members.map((m) => `users:${m.userId}:workspace-members`),
    ])
  }

  async listByOrganizationId(props: {
    organizationId: string
    tx?: DatabaseClient
  }): Promise<WorkspaceModel[]> {
    const { organizationId, tx = db } = props
    return await tx.query.workspaceModel.findMany({
      where: { organizationId },
      orderBy: { createdAt: "asc" },
    })
  }
}

export const workspaceService = new WorkspaceService()
