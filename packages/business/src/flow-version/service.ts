import {
  and,
  type DatabaseClient,
  db,
  desc,
  eq,
} from "@chatbotx.io/database/client"
import { flowModel, flowVersionModel } from "@chatbotx.io/database/schema"
import type { FlowVersionModel } from "@chatbotx.io/database/types"
import type { EdgeSchema, FlowVersionSchema } from "@chatbotx.io/flow-config"
import { withCache } from "@chatbotx.io/redis"
import { createId } from "@chatbotx.io/utils"
import { BaseService } from "../base.service"
import { notFoundException } from "../errors"

class FlowVersionService extends BaseService {
  async findDraft(
    {
      flowId,
      workspaceId,
    }: {
      flowId: string
      workspaceId: string
    },
    tx?: DatabaseClient,
  ): Promise<FlowVersionModel | undefined> {
    const client = tx ?? db
    return await client.query.flowVersionModel.findFirst({
      where: { flowId, workspaceId, isDraft: true },
    })
  }

  async findPublished(
    {
      flowId,
      workspaceId,
    }: {
      flowId: string
      workspaceId: string
    },
    tx?: DatabaseClient,
  ): Promise<FlowVersionModel | undefined> {
    const client = tx ?? db
    return await client.query.flowVersionModel.findFirst({
      where: { flowId, workspaceId, isDraft: false, isLatest: true },
    })
  }

  async list({
    flowId,
    workspaceId,
  }: {
    flowId: string
    workspaceId: string
  }): Promise<FlowVersionModel[]> {
    return await withCache(
      `flows:${flowId}:versions`,
      () =>
        db.query.flowVersionModel.findMany({
          where: { flowId, workspaceId, isDraft: false },
          orderBy: (table) => [desc(table.isLatest), desc(table.createdAt)],
        }),
      { tags: [`flows:${flowId}:versions`] },
    )
  }

  /**
   * The version a tapped button belongs to.
   *
   * A button payload pins a version only when the run that sent it was pinned;
   * an unpinned run omits it (`useLatestFlowVersion` in
   * `apps/worker/src/integration/handlers/step.ts`), which is the common case,
   * so the flow's published version is the one that produced the message.
   *
   * Resolving both here rather than at each call site is deliberate: Drizzle
   * drops an `undefined` filter value instead of matching on it, so passing an
   * absent version id straight to `findFirst` silently widens the query from
   * "this version" to "any version in the workspace" and returns an unrelated
   * flow's nodes.
   *
   * Unlike the worker's `detectFlowVersion`, a paused flow still resolves: this
   * answers "which nodes did this button come from", which stays true whether or
   * not the flow is still running.
   */
  async findForButtonPayload({
    flowId,
    workspaceId,
    versionId,
  }: {
    flowId: string
    workspaceId: string
    versionId?: string
  }): Promise<FlowVersionModel | undefined> {
    if (versionId) {
      return await db.query.flowVersionModel.findFirst({
        where: { id: versionId, workspaceId },
      })
    }

    const flow = await db.query.flowModel.findFirst({
      where: { id: flowId, workspaceId },
    })
    if (!flow?.currentVersionId) {
      return
    }

    return await db.query.flowVersionModel.findFirst({
      where: { id: flow.currentVersionId, workspaceId },
    })
  }

  async findById({
    versionId,
    flowId,
    workspaceId,
  }: {
    versionId: string
    flowId: string
    workspaceId: string
  }): Promise<FlowVersionModel> {
    const version = await db.query.flowVersionModel.findFirst({
      where: { id: versionId, flowId, workspaceId, isDraft: false },
    })
    if (!version) {
      throw notFoundException("Flow version not found")
    }
    return version
  }

  async restore({ version }: { version: FlowVersionModel }): Promise<void> {
    await db.transaction(async (tx) => {
      await tx
        .update(flowVersionModel)
        .set({ isLatest: false })
        .where(
          and(
            eq(flowVersionModel.flowId, version.flowId),
            eq(flowVersionModel.isLatest, true),
          ),
        )

      await tx
        .update(flowVersionModel)
        .set({ isLatest: true })
        .where(eq(flowVersionModel.id, version.id))

      await tx
        .update(flowModel)
        .set({ currentVersionId: version.id })
        .where(eq(flowModel.id, version.flowId))

      // Update draft version
      await tx
        .update(flowVersionModel)
        .set({
          nodes: version.nodes,
          edges: version.edges,
          startNodeId: version.startNodeId,
        })
        .where(
          and(
            eq(flowVersionModel.flowId, version.flowId),
            eq(flowVersionModel.isDraft, true),
          ),
        )
    })

    await this.invalidateCacheTags(`flows:${version.flowId}:versions`)
  }

  async revertDraftToPublished({
    flowId,
    workspaceId,
  }: {
    flowId: string
    workspaceId: string
  }): Promise<Pick<FlowVersionModel, "nodes" | "edges">> {
    const publishedVersion = await db.query.flowVersionModel.findFirst({
      where: {
        flowId,
        workspaceId,
        isDraft: false,
        isLatest: true,
      },
    })

    if (!publishedVersion) {
      throw notFoundException("Flow version not found")
    }

    await db
      .update(flowVersionModel)
      .set({
        nodes: publishedVersion.nodes,
        edges: publishedVersion.edges,
        startNodeId: publishedVersion.startNodeId,
      })
      .where(
        and(
          eq(flowVersionModel.flowId, flowId),
          eq(flowVersionModel.workspaceId, workspaceId),
          eq(flowVersionModel.isDraft, true),
        ),
      )

    return {
      nodes: publishedVersion.nodes,
      edges: publishedVersion.edges,
    }
  }

  /**
   * Loads the published start node for Messenger Ads JSON generation.
   *
   * Distinguishes the two failure modes the caller must report differently:
   * `notPublished` (the flow has never been published) versus `noStartNode`
   * (it is published but no node is resolvable as the start node — e.g. a stale
   * `startNodeId` pointing at a deleted node). Collapsing both into one signal
   * would tell an already-published user to "publish and try again", a loop
   * that never fixes the real problem.
   *
   * Detecting *unpublished changes* is the client's job (it toasts before
   * calling this). Cached under the versions tag, which publish/revert/restore
   * already invalidate.
   */
  async getMessengerAdsStartNode({
    flowId,
    workspaceId,
  }: {
    flowId: string
    workspaceId: string
  }): Promise<
    | {
        status: "ok"
        flowVersionId: string
        startNode: { id: string; [x: string]: unknown }
      }
    | { status: "notPublished" }
    | { status: "noStartNode" }
  > {
    return await withCache(
      `flows:${flowId}:messenger-ads-start-node`,
      async () => {
        const publishedVersion = await db.query.flowVersionModel.findFirst({
          where: { flowId, workspaceId, isDraft: false, isLatest: true },
        })
        if (!publishedVersion) {
          return { status: "notPublished" as const }
        }

        // The authoritative start node is the one flagged `isStartNode` in the
        // canvas — `startNodeId` is set at creation and is NOT re-synced when
        // the start node is reassigned, so it can be stale or point to a deleted
        // node. Fall back to the column only if no node carries the flag.
        const isStartNode = (node: {
          id: string
          [x: string]: unknown
        }): boolean => {
          const data = node.data
          return (
            typeof data === "object" &&
            data !== null &&
            (data as { isStartNode?: unknown }).isStartNode === true
          )
        }

        const startNode =
          publishedVersion.nodes.find(isStartNode) ??
          publishedVersion.nodes.find(
            (node) => node.id === publishedVersion.startNodeId,
          )

        if (!startNode) {
          return { status: "noStartNode" as const }
        }

        return {
          status: "ok" as const,
          flowVersionId: publishedVersion.id,
          startNode,
        }
      },
      { tags: [`flows:${flowId}:versions`] },
    )
  }

  async invalidateList(flowId: string): Promise<void> {
    await this.invalidateCacheTags(`flows:${flowId}:versions`)
  }

  async updateDraft(props: {
    workspaceId: string
    id: string
    data: { nodes: FlowVersionSchema[]; edges: EdgeSchema[] }
  }): Promise<void> {
    const { workspaceId, id, data } = props

    const updated = await db
      .update(flowVersionModel)
      .set({ nodes: data.nodes, edges: data.edges })
      .where(
        and(
          eq(flowVersionModel.id, id),
          eq(flowVersionModel.workspaceId, workspaceId),
          eq(flowVersionModel.isDraft, true),
        ),
      )
      .returning({ id: flowVersionModel.id })

    if (updated.length === 0) {
      throw notFoundException("Draft flow version not found")
    }
  }

  /**
   * Publishes the workspace's current draft: snapshots the submitted
   * nodes/edges onto the draft row, demotes the previous `isLatest` published
   * version, and inserts a new published version pointed at by
   * `flowModel.currentVersionId` — all in one transaction. Mirrors the
   * "insert version isLatest:true + update currentVersionId" shape in
   * `FlowService.createPublishedDefault`.
   */
  async publish(props: {
    workspaceId: string
    id: string
    data: { nodes: FlowVersionSchema[]; edges: EdgeSchema[] }
  }): Promise<void> {
    const { workspaceId, id, data } = props

    const flow = await db.query.flowModel.findFirst({
      where: { id, workspaceId },
      with: {
        flowVersions: {
          where: { isDraft: true },
        },
      },
    })
    if (!flow || flow.flowVersions.length === 0) {
      throw notFoundException("Flow not found")
    }

    const draftVersion = flow.flowVersions[0]

    await db.transaction(async (tx) => {
      await tx
        .update(flowVersionModel)
        .set({ isLatest: false })
        .where(
          and(
            eq(flowVersionModel.flowId, flow.id),
            eq(flowVersionModel.isLatest, true),
          ),
        )

      await tx
        .update(flowVersionModel)
        .set({ nodes: data.nodes, edges: data.edges })
        .where(eq(flowVersionModel.id, draftVersion.id))

      const newVersionId = createId()
      await tx.insert(flowVersionModel).values({
        id: newVersionId,
        workspaceId: flow.workspaceId,
        flowId: flow.id,
        isDraft: false,
        isLatest: true,
        ...data,
        startNodeId: draftVersion.startNodeId,
      })

      await tx
        .update(flowModel)
        .set({ currentVersionId: newVersionId })
        .where(eq(flowModel.id, flow.id))
    })

    await this.invalidateList(flow.id)
    await this.audit("publish", `published a flow (#${flow.id})`)
  }
}

export const flowVersionService = new FlowVersionService()
