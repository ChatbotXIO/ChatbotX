import {
  and,
  type DatabaseClient,
  db,
  desc,
  eq,
  lte,
} from "@chatbotx.io/database/client"
import { flowModel, flowVersionModel } from "@chatbotx.io/database/schema"
import type { FlowVersionModel } from "@chatbotx.io/database/types"
import { normalizeFlowGraphDecisionMappings } from "@chatbotx.io/flow-config"
import { withCache } from "@chatbotx.io/redis"
import { createId } from "@chatbotx.io/utils"
import { BaseService } from "../base.service"
import { conversationService } from "../conversation/service"
import { decisionProfileService } from "../decision/profile-service"
import { notFoundException } from "../errors"
import { logger } from "../logger"
import { messengerWelcomeMessageFlowService } from "../messenger-welcome-message-flow/service"
import { smartDelayService } from "../smart-delay/service"
import { assertFlowGraphPublishable } from "./assert-publishable"

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

  /**
   * 1-based position of the live (`isLatest`) published version among the
   * flow's published versions, oldest first; 0 when nothing is published.
   * The `vN` in the Meta welcome flow name. A restore re-points `isLatest`
   * without inserting a row, so this follows it back to the restored
   * version's own number.
   */
  async publishedVersionNumber(input: {
    workspaceId: string
    flowId: string
  }): Promise<number> {
    const live = await this.findPublished(input)
    if (!live) {
      return 0
    }
    return await db.$count(
      flowVersionModel,
      and(
        eq(flowVersionModel.workspaceId, input.workspaceId),
        eq(flowVersionModel.flowId, input.flowId),
        eq(flowVersionModel.isDraft, false),
        // Snowflake ids grow with creation time: same order as the dialog.
        lte(flowVersionModel.id, live.id),
      ),
    )
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
    assertFlowGraphPublishable({ nodes: version.nodes, edges: version.edges })

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

    // Restoring changes what is published, so the Meta welcome message flows
    // must follow it exactly like a publish (fire-and-forget, never throws).
    await messengerWelcomeMessageFlowService.enqueueSync({
      workspaceId: version.workspaceId,
      flowId: version.flowId,
      reason: "publish",
    })
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
    fresh = false,
  }: {
    flowId: string
    workspaceId: string
    /**
     * Skip the cache. The welcome-message-flow sync job uses this: a reader
     * racing a publish can write the previous version back into the cache
     * after invalidation, and the job must never push stale content to Meta.
     */
    fresh?: boolean
  }): Promise<
    | {
        status: "ok"
        flowVersionId: string
        startNode: { id: string; [x: string]: unknown }
      }
    | { status: "notPublished" }
    | { status: "noStartNode" }
  > {
    const resolve = async () => {
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
    }

    if (fresh) {
      return await resolve()
    }

    return await withCache(
      `flows:${flowId}:messenger-ads-start-node`,
      resolve,
      {
        tags: [`flows:${flowId}:versions`],
      },
    )
  }

  /**
   * Updates a draft flow version's nodes/edges in place — used for autosave
   * while editing, distinct from `publish` which cuts a new immutable
   * version. Mirrors `publish`'s not-found handling: a missing/non-draft
   * version throws rather than silently no-op'ing.
   */
  async updateDraft(input: {
    workspaceId: string
    id: string
    nodes: FlowVersionModel["nodes"]
    edges: FlowVersionModel["edges"]
  }): Promise<void> {
    const nodes = normalizeFlowGraphDecisionMappings(input.nodes)
    const flowVersion = await db.query.flowVersionModel.findFirst({
      where: {
        id: input.id,
        workspaceId: input.workspaceId,
        isDraft: true,
      },
    })

    if (!flowVersion) {
      throw notFoundException("Draft flow version not found")
    }

    await db
      .update(flowVersionModel)
      .set({
        nodes,
        edges: input.edges,
      })
      .where(eq(flowVersionModel.id, flowVersion.id))
  }

  /**
   * Same as `updateDraft`, but resolves the draft version from a flow id
   * instead of a flow-version id — for callers (like the public API) that
   * only know the flow.
   */
  async updateDraftByFlowId(input: {
    workspaceId: string
    flowId: string
    nodes: FlowVersionModel["nodes"]
    edges: FlowVersionModel["edges"]
  }): Promise<void> {
    const nodes = normalizeFlowGraphDecisionMappings(input.nodes)
    const draftVersion = await this.findDraft({
      flowId: input.flowId,
      workspaceId: input.workspaceId,
    })

    if (!draftVersion) {
      throw notFoundException("Draft flow version not found")
    }

    await db
      .update(flowVersionModel)
      .set({
        nodes,
        edges: input.edges,
      })
      .where(eq(flowVersionModel.id, draftVersion.id))
  }

  async invalidateList(flowId: string): Promise<void> {
    await this.invalidateCacheTags(`flows:${flowId}:versions`)
  }

  /**
   * Version by explicit id, scoped only to workspace — no `flowId`, no
   * `isDraft` filter, and never throws. Matches the worker's
   * `detectFlowVersion` exact where-clause; do NOT reuse `findById` (which
   * requires `flowId`, forces `isDraft: false`, and throws).
   */
  async findByIdForWorkspace(props: {
    versionId: string
    workspaceId: string
    tx?: DatabaseClient
  }): Promise<FlowVersionModel | undefined> {
    const { versionId, workspaceId, tx = db } = props
    return await tx.query.flowVersionModel.findFirst({
      where: { id: versionId, workspaceId },
    })
  }

  /**
   * Publishes the flow's draft version as a new immutable version: resets
   * every other `isLatest` version for the flow, syncs the draft's
   * nodes/edges to what was just published, inserts the new published
   * version, and repoints `Flow.currentVersionId` at it — all in one
   * transaction, mirroring `publish-flow-action.ts` verbatim.
   */
  async publish(input: {
    workspaceId: string
    flowId: string
    nodes: FlowVersionModel["nodes"]
    edges: FlowVersionModel["edges"]
  }): Promise<void> {
    const nodes = normalizeFlowGraphDecisionMappings(input.nodes)
    assertFlowGraphPublishable({ nodes, edges: input.edges })
    await decisionProfileService.assertFlowReferencesPublishable({
      nodes,
      workspaceId: input.workspaceId,
    })

    const flow = await db.query.flowModel.findFirst({
      where: {
        id: input.flowId,
        workspaceId: input.workspaceId,
      },
      with: {
        flowVersions: {
          where: {
            isDraft: true,
          },
        },
      },
    })

    if (!flow || flow.flowVersions.length === 0) {
      throw notFoundException("Flow not found")
    }

    const draftVersion = flow.flowVersions[0]

    const newVersionId = createId()
    await db.transaction(async (tx) => {
      // Remove all other latest versions
      await tx
        .update(flowVersionModel)
        .set({
          isLatest: false,
        })
        .where(
          and(
            eq(flowVersionModel.flowId, flow.id),
            eq(flowVersionModel.isLatest, true),
          ),
        )

      await tx
        .update(flowVersionModel)
        .set({
          nodes,
          edges: input.edges,
        })
        .where(eq(flowVersionModel.id, draftVersion.id))

      await tx.insert(flowVersionModel).values({
        id: newVersionId,
        workspaceId: flow.workspaceId,
        flowId: flow.id,
        isDraft: false,
        isLatest: true,
        nodes,
        edges: input.edges,
        startNodeId: draftVersion.startNodeId,
      })

      await tx
        .update(flowModel)
        .set({
          currentVersionId: newVersionId,
        })
        .where(eq(flowModel.id, flow.id))
    })

    await this.invalidateCacheTags(`flows:${flow.id}:versions`)

    // Fire-and-forget, never throws: mirrors the start node to Meta welcome
    // message flows (Click-to-Messenger ads) on every Messenger page.
    await messengerWelcomeMessageFlowService.enqueueSync({
      workspaceId: input.workspaceId,
      flowId: flow.id,
      reason: "publish",
    })

    // Fire-and-forget: publishing must never fail or wait on cleanup;
    // stale state also resolves itself at the worker.
    Promise.all([
      smartDelayService.cancelQuickReplyFollowUpsForStaleVersion({
        workspaceId: input.workspaceId,
        flowId: flow.id,
        currentFlowVersionId: newVersionId,
      }),
      conversationService.clearQuickReplyChallengesForStaleVersion({
        workspaceId: input.workspaceId,
        flowId: flow.id,
        currentFlowVersionId: newVersionId,
      }),
    ]).catch((error) => {
      logger.warn(
        { err: error, flowId: flow.id },
        "publish: failed to clear pending quick reply state",
      )
    })

    await this.audit("publish", `published a flow (#${flow.id})`)
  }
}

export const flowVersionService = new FlowVersionService()
