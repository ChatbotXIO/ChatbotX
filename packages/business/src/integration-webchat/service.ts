import type { DatabaseClient } from "@chatbotx.io/database/client"
import {
  db,
  eq,
  findOrFail,
  relationsFilterToSQL,
} from "@chatbotx.io/database/client"
import { integrationWebchatModel } from "@chatbotx.io/database/schema"
import type { IntegrationWebchatModel } from "@chatbotx.io/database/types"
import { parsePagination } from "@chatbotx.io/database/utils"
import { createId } from "@chatbotx.io/utils"
import { BaseService } from "../base.service"
import { inboxService } from "../inbox/service"
import { assertDeletable } from "../template/installed-resource.service"
import { workspaceService } from "../workspace"

export type UpdateWebchatData = Partial<{
  name: string
  enable: boolean
  authorizedDomains: string[]
  conversationStarters: unknown[]
  persistentMenus: unknown[]
  brandColor: string
  hideHeader: boolean
  showLogo: boolean
  hideMessageInput: boolean
  customCss: string | null
  welcomeFlowId: string | null
}>

export type CreateWebchatRequest = {
  name: string
  auth: Record<string, unknown>
  enable: boolean
  authorizedDomains: string[]
  conversationStarters: unknown[]
  persistentMenus: unknown[]
  brandColor: string
  hideHeader: boolean
  showLogo: boolean
  hideMessageInput: boolean
  customCss: string | null
  welcomeFlowId?: string | null
}

class IntegrationWebchatService extends BaseService {
  /**
   * Provisions a new Inbox + IntegrationWebchat row together, mirroring
   * `createWebchatAction` (`apps/builder/src/features/integration-webchat/
   * actions/create-webchat.action.ts`) — a pre-minted id doubles as both the
   * IntegrationWebchat row id and the Inbox's `sourceId`. Webchat is not
   * linked to an external platform, so unlike other channels there is no
   * real external id to dedup on; the self-referential id keeps `Inbox`'s
   * `(workspaceId, channel, sourceId)` unique constraint satisfied.
   *
   * Callers installing from a template MUST catch
   * `channelLimitReachedException` specifically (thrown by
   * `inboxService.create` when the target workspace's channel quota is
   * exhausted) and degrade to a per-webchat warn+skip — never let it abort
   * the whole install transaction.
   */
  async create(
    props: {
      workspaceId: string
      ownerId: string
      data: CreateWebchatRequest
    },
    tx: DatabaseClient,
  ): Promise<IntegrationWebchatModel> {
    const { workspaceId, ownerId, data } = props
    const webchatId = createId()

    const { inbox } = await inboxService.create({
      tx,
      ownerId,
      data: {
        id: webchatId,
        workspaceId,
        channel: "webchat",
        name: data.name,
        sourceId: webchatId,
      },
    })

    const [created] = await tx
      .insert(integrationWebchatModel)
      .values({
        id: webchatId,
        workspaceId,
        inboxId: inbox.id,
        auth: data.auth,
        name: data.name,
        enable: data.enable,
        authorizedDomains: data.authorizedDomains,
        conversationStarters: data.conversationStarters as never,
        persistentMenus: data.persistentMenus as never,
        brandColor: data.brandColor,
        hideHeader: data.hideHeader,
        showLogo: data.showLogo,
        hideMessageInput: data.hideMessageInput,
        customCss: data.customCss,
        welcomeFlowId: data.welcomeFlowId ?? null,
      })
      .returning()

    return created
  }

  async delete(input: { workspaceId: string; id: string }): Promise<void> {
    const [integrationWebchat, workspace] = await Promise.all([
      findOrFail({
        table: integrationWebchatModel,
        where: { workspaceId: input.workspaceId, id: input.id },
        message: "Integration Webchat not found",
      }),
      workspaceService.findById({ id: input.workspaceId }),
    ])

    await assertDeletable({
      workspaceId: input.workspaceId,
      resourceKind: "integrationWebchat",
      resourceIds: [input.id],
    })

    await db.transaction(async (tx) => {
      await tx
        .delete(integrationWebchatModel)
        .where(eq(integrationWebchatModel.id, integrationWebchat.id))

      await inboxService.disconnect({
        inboxId: integrationWebchat.inboxId,
        ownerId: workspace.ownerId,
        workspaceId: input.workspaceId,
        tx,
      })
    })

    await this.audit(
      "disconnect",
      `disconnected the Webchat channel (#${integrationWebchat.id})`,
    )
  }

  /**
   * Optionally provisions a workspace, then reuses `create` (above) inside
   * the same transaction to insert the Inbox + IntegrationWebchat row.
   */
  async createWithWorkspace(input: {
    workspaceId?: string
    createdBy: string
    workspaceName: string
    data: CreateWebchatRequest
  }): Promise<{
    workspaceId: string
    createdWorkspace: boolean
    webchatId: string
  }> {
    const { createdBy, workspaceName, data } = input
    let ownerId = createdBy

    const result = await db.transaction(async (tx) => {
      let workspaceId = input.workspaceId
      let createdWorkspace = false

      if (workspaceId) {
        const workspace = await workspaceService.findOrFail({
          where: { id: workspaceId },
        })
        ownerId = workspace.ownerId
      } else {
        const newWorkspace = await workspaceService.create({
          tx,
          createdBy,
          data: {
            name: workspaceName,
            timezone: "UTC",
            ownerId,
          },
        })
        workspaceId = newWorkspace.id
        createdWorkspace = true
      }

      const created = await this.create({ workspaceId, ownerId, data }, tx)

      return { workspaceId, createdWorkspace, webchatId: created.id }
    })

    return result
  }

  async findByIdForWorkspaceOrNull(props: {
    id: string
    workspaceId: string
  }): Promise<IntegrationWebchatModel | undefined> {
    return await db.query.integrationWebchatModel.findFirst({
      where: { id: props.id, workspaceId: props.workspaceId },
    })
  }

  async findByIdForWorkspace(props: {
    id: string
    workspaceId: string
  }): Promise<IntegrationWebchatModel> {
    return await findOrFail({
      table: integrationWebchatModel,
      where: { id: props.id, workspaceId: props.workspaceId },
      message: "Webchat integration not found",
    })
  }

  async list(input: {
    workspaceId: string
    page?: number
    perPage?: number
  }): Promise<{ data: IntegrationWebchatModel[]; pageCount: number }> {
    const where = {
      workspaceId: input.workspaceId,
    }

    const pagination = parsePagination(input)
    const [data, totalRows] = await Promise.all([
      db.query.integrationWebchatModel.findMany({
        where,
        orderBy: {
          createdAt: "desc",
        },
        ...pagination,
      }),
      pagination?.limit
        ? db.$count(
            integrationWebchatModel,
            relationsFilterToSQL(integrationWebchatModel, where),
          )
        : Promise.resolve(1),
    ])

    const pageCount = pagination?.limit
      ? Math.ceil(totalRows / pagination.limit)
      : 1
    return { data, pageCount }
  }

  async update(input: {
    workspaceId: string
    id: string
    data: UpdateWebchatData
    tx?: DatabaseClient
  }): Promise<void> {
    const { workspaceId, id, data, tx = db } = input

    await tx
      .update(integrationWebchatModel)
      .set({
        ...data,
        workspaceId,
        conversationStarters: data.conversationStarters as never,
        persistentMenus: data.persistentMenus as never,
      })
      .where(eq(integrationWebchatModel.id, id))
  }
}

export const integrationWebchatService = new IntegrationWebchatService()
