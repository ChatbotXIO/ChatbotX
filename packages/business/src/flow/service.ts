import { type DatabaseClient, db } from "@chatbotx.io/database/client"
import {
  flowAnalyticsSessionModel,
  flowModel,
  flowVersionModel,
} from "@chatbotx.io/database/schema"
import type { FlowModel, FlowVersionModel } from "@chatbotx.io/database/types"
import type { EdgeSchema, FlowVersionSchema } from "@chatbotx.io/flow-config"
import { createId } from "@chatbotx.io/utils"
import { BaseService } from "../base.service"
import { notFoundException } from "../errors"
import { flowVersionService } from "../flow-version"

class FlowService extends BaseService {
  async findBy(
    input: { workspaceId: string; id: string },
    tx?: DatabaseClient,
  ): Promise<FlowModel | undefined> {
    const client = tx ?? db
    return await client.query.flowModel.findFirst({
      where: { id: input.id, workspaceId: input.workspaceId },
    })
  }

  async exists(
    workspaceId: string,
    flowId: string,
    tx?: DatabaseClient,
  ): Promise<boolean> {
    const row = await this.findBy({ workspaceId, id: flowId }, tx)
    return Boolean(row)
  }

  /**
   * Inserts a flow, its analytics session, and a draft version in one
   * transaction — the write shape shared by `duplicate` and `createFromImport`.
   */
  private async insertFlowWithDraft(
    tx: DatabaseClient,
    input: {
      name: string
      active: boolean
      enableInInbox: boolean
      workspaceId: string
      folderId: string | null
      startNodeId: string
      nodes: FlowVersionModel["nodes"]
      edges: FlowVersionModel["edges"]
    },
  ): Promise<string> {
    const newFlowId = createId()
    const draftVersionId = createId()
    await tx.insert(flowModel).values({
      id: newFlowId,
      name: input.name,
      active: input.active,
      enableInInbox: input.enableInInbox,
      workspaceId: input.workspaceId,
      folderId: input.folderId,
      currentVersionId: null,
      draftVersionId,
    })
    await tx.insert(flowAnalyticsSessionModel).values({
      id: createId(),
      flowId: newFlowId,
      workspaceId: input.workspaceId,
    })
    await tx.insert(flowVersionModel).values({
      id: draftVersionId,
      workspaceId: input.workspaceId,
      flowId: newFlowId,
      nodes: input.nodes,
      edges: input.edges,
      isDraft: true,
      isLatest: false,
      startNodeId: input.startNodeId,
    })

    return newFlowId
  }

  duplicate(input: { workspaceId: string; id: string }): Promise<string> {
    return db.transaction(async (tx) => {
      const flow = await this.findBy(input, tx)
      if (!flow) {
        throw notFoundException("Flow not found")
      }

      const draftVersion = await flowVersionService.findDraft(
        {
          flowId: flow.id,
          workspaceId: flow.workspaceId,
        },
        tx,
      )
      if (!draftVersion) {
        throw notFoundException("Draft version not found")
      }

      return this.insertFlowWithDraft(tx, {
        name: `${flow.name} _copy`,
        active: flow.active,
        enableInInbox: flow.enableInInbox,
        workspaceId: flow.workspaceId,
        folderId: flow.folderId,
        startNodeId: draftVersion.startNodeId,
        nodes: draftVersion.nodes,
        edges: draftVersion.edges,
      })
    })
  }

  /**
   * Inserts an imported flow verbatim: node/step ids are reused as-is. Every
   * table that keys on a nodeId also scopes by flowId/analyticsId, and this
   * always mints a fresh flowId, so reused ids from the source workspace
   * cannot collide here — see docs/tenancy.md and the import/export plan.
   */
  createFromImport(input: {
    workspaceId: string
    name: string
    active: boolean
    enableInInbox: boolean
    startNodeId: string
    nodes: FlowVersionSchema[]
    edges: EdgeSchema[]
    folderId?: string | null
  }): Promise<string> {
    return db.transaction(async (tx) =>
      this.insertFlowWithDraft(tx, {
        name: input.name,
        active: input.active,
        enableInInbox: input.enableInInbox,
        workspaceId: input.workspaceId,
        folderId: input.folderId ?? null,
        startNodeId: input.startNodeId,
        nodes: input.nodes,
        edges: input.edges,
      }),
    )
  }
}

export const flowService = new FlowService()
