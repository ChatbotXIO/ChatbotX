import { anchoredPeriod, macRepository } from "@chatbotx.io/analytics"
import { type DatabaseClient, db, eq } from "@chatbotx.io/database/client"
import { workspaceMemberRoles } from "@chatbotx.io/database/partials"
import { ROOT_TENANT_ID, workspaceModel } from "@chatbotx.io/database/schema"
import type { WorkspaceModel } from "@chatbotx.io/database/types"
import { withCache } from "@chatbotx.io/redis"
import { BaseService } from "../base.service"
import { tenantService } from "../enterprise/tenant/service"
import { ChatbotXException, notFoundException } from "../errors"
import { logger } from "../logger"
import { userQuotaService } from "../user-quota/service"
import { workspaceMemberService } from "../workspace-member/service"

type WorkspaceWhere = Partial<{ id: string; ownerId: string; token: string }>

const stableKey = (where: WorkspaceWhere) =>
  JSON.stringify(Object.fromEntries(Object.entries(where).sort()))

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
      `workspaces:${stableKey(props.where)}`,
      async () =>
        await tx.query.workspaceModel.findFirst({
          where,
        }),
      {
        dynamicTags: (result) =>
          result ? [`workspaces:${result.id}`] : undefined,
      },
    )
  }

  async update(props: {
    id: string
    data: Partial<typeof workspaceModel.$inferInsert>
    tx?: DatabaseClient
  }): Promise<WorkspaceModel> {
    const { id, data, tx = db } = props
    const [updated] = await tx
      .update(workspaceModel)
      .set(data)
      .where(eq(workspaceModel.id, id))
      .returning()
    await this.invalidateCacheTags([`workspaces:${id}`])
    return updated
  }

  /**
   * Owner-derived tenant for a new workspace — never request/host-derived, so a
   * reseller's workspaces land in their tenant regardless of which host created
   * them. A sub-account inherits its own tenant; a reseller (a root user who owns
   * a tenant) gets that tenant; a plain platform user gets the root tenant.
   */
  async resolveTenantForOwner(creatorId: string): Promise<string> {
    const creator = await db.query.userModel.findFirst({
      where: { id: creatorId },
      columns: { tenantId: true },
    })
    if (creator && creator.tenantId !== ROOT_TENANT_ID) {
      return creator.tenantId
    }
    const owned = await tenantService.findByOwner(creatorId)
    return owned?.id ?? ROOT_TENANT_ID
  }

  async create(props: {
    data: typeof workspaceModel.$inferInsert
    createdBy: string
    tx?: DatabaseClient
  }): Promise<WorkspaceModel> {
    const { data, tx = db } = props

    const allowed = await userQuotaService.tryIncrement(
      props.createdBy,
      "workspaces",
    )
    if (!allowed) {
      throw new ChatbotXException("Workspace limit reached for this plan")
    }

    const tenantId =
      data.tenantId ?? (await this.resolveTenantForOwner(props.createdBy))
    const [newWorkspace] = await tx
      .insert(workspaceModel)
      .values({ ...data, tenantId })
      .returning()

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

    await this.ensureMacRollup({
      workspaceId: newWorkspace.id,
      userId: props.createdBy,
      tx,
    })

    this.invalidateCacheTags([`users:${props.createdBy}:workspace-members`])

    return newWorkspace
  }

  private async ensureMacRollup(props: {
    workspaceId: string
    userId: string
    tx: DatabaseClient
  }): Promise<void> {
    try {
      const quota = await userQuotaService.getForUser(props.userId)
      if (!quota?.periodStart) {
        return
      }

      const { start, end } = anchoredPeriod(new Date(), quota.periodStart)

      await macRepository.ensureWorkspaceMac(
        [
          {
            workspaceId: props.workspaceId,
            periodStart: start,
            periodEnd: end,
          },
        ],
        props.tx,
      )
    } catch (error) {
      logger.error(
        { err: error, workspaceId: props.workspaceId, userId: props.userId },
        "Failed to pre-provision WorkspaceMac",
      )
    }
  }
}

export const workspaceService = new WorkspaceService()
