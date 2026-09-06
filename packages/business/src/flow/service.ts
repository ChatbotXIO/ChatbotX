import { type DatabaseClient, db, inArray } from "@chatbotx.io/database/client"
import {
  type CustomFieldType,
  rootFolderId,
} from "@chatbotx.io/database/partials"
import { flowRepository } from "@chatbotx.io/database/repositories"
import {
  flowAnalyticsSessionModel,
  flowModel,
  flowVersionModel,
} from "@chatbotx.io/database/schema"
import type { FlowModel, FlowVersionModel } from "@chatbotx.io/database/types"
import type {
  EdgeSchema,
  FlowExportBotField,
  FlowExportCustomField,
  FlowVersionSchema,
} from "@chatbotx.io/flow-config"
import {
  remapFlowGraphReferences,
  sendMessageNodeDefaultFn,
} from "@chatbotx.io/flow-config"
import { createId } from "@chatbotx.io/utils"
import { customFieldResolutionKey } from "@chatbotx.io/utils/custom-field"
import { BaseService } from "../base.service"
import { botFieldService } from "../bot-field/service"
import { customFieldService } from "../custom-field/service"
import { notFoundException } from "../errors"
import { flowVersionService } from "../flow-version"
import { folderService } from "../folder/service"
import { assertDeletable } from "../template/installed-resource.service"

type FieldManifestEntry = { name: string; type: CustomFieldType }

type ResolveFieldsByNameAndType = (props: {
  workspaceId: string
  fields: FieldManifestEntry[]
  tx?: DatabaseClient
}) => Promise<{ idMap: Map<string, string>; createdIds: string[] }>

/**
 * Resolves a `{ sourceId: manifestEntry }` import manifest (customField or
 * botField) against the target workspace via `resolve`, then rekeys the
 * result from `resolveByNameAndType`'s (name, type)-key map to the source ->
 * target id map `remapFlowGraphReferences` expects. Shared by
 * `importFlowExport`'s customField and botField branches, which are
 * otherwise identical apart from which service resolves the manifest.
 */
const resolveManifestIdMap = async (
  manifest: Record<string, FieldManifestEntry>,
  resolve: ResolveFieldsByNameAndType,
  workspaceId: string,
  tx: DatabaseClient,
): Promise<{ idMap: Map<string, string>; createdIds: string[] }> => {
  const entries = Object.entries(manifest)
  const { idMap: resolvedByKey, createdIds } = await resolve({
    workspaceId,
    fields: entries.map(([, field]) => field),
    tx,
  })

  const idMap = new Map(
    entries.flatMap(([sourceId, field]) => {
      const targetId = resolvedByKey.get(customFieldResolutionKey(field))
      return targetId ? [[sourceId, targetId] as const] : []
    }),
  )

  return { idMap, createdIds }
}

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

  /**
   * Inserts a flow, its analytics session, a draft version, and a published
   * version — all in the caller's transaction — then points
   * `flowModel.currentVersionId` at the published version. Second parallel
   * implementation of the "insert version isLatest:true + update
   * currentVersionId" logic in `publish-flow-action.ts` (builder layer can't
   * share it: that action doesn't accept an external `tx`). Callers must
   * invalidate `flowVersionService.invalidateList(flowId)` themselves after
   * their transaction commits.
   */
  async createPublishedDefault(
    tx: DatabaseClient,
    input: {
      name: string
      workspaceId: string
      folderId?: string | null
      startNodeId: string
      nodes: FlowVersionModel["nodes"]
      edges: FlowVersionModel["edges"]
    },
  ): Promise<{
    flowId: string
    draftVersionId: string
    publishedVersionId: string
  }> {
    const flowId = createId()
    const draftVersionId = createId()
    const publishedVersionId = createId()

    await tx.insert(flowModel).values({
      id: flowId,
      name: input.name,
      active: true,
      enableInInbox: false,
      workspaceId: input.workspaceId,
      folderId: input.folderId ?? null,
      currentVersionId: publishedVersionId,
      draftVersionId,
    })
    await tx.insert(flowAnalyticsSessionModel).values({
      id: createId(),
      flowId,
      workspaceId: input.workspaceId,
    })
    await tx.insert(flowVersionModel).values([
      {
        id: draftVersionId,
        workspaceId: input.workspaceId,
        flowId,
        nodes: input.nodes,
        edges: input.edges,
        isDraft: true,
        isLatest: false,
        startNodeId: input.startNodeId,
      },
      {
        id: publishedVersionId,
        workspaceId: input.workspaceId,
        flowId,
        nodes: input.nodes,
        edges: input.edges,
        isDraft: false,
        isLatest: true,
        startNodeId: input.startNodeId,
      },
    ])

    return { flowId, draftVersionId, publishedVersionId }
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
   *
   * Accepts an optional `tx` so the caller can share a transaction with
   * custom-field creation (flow-import handler) — without that, a failed flow
   * insert would leave orphan custom fields already committed in the target
   * workspace. Opens its own transaction when no `tx` is passed (e.g. tests).
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
    tx?: DatabaseClient
  }): Promise<string> {
    const run = (tx: DatabaseClient) =>
      this.insertFlowWithDraft(tx, {
        name: input.name,
        active: input.active,
        enableInInbox: input.enableInInbox,
        workspaceId: input.workspaceId,
        folderId: input.folderId ?? null,
        startNodeId: input.startNodeId,
        nodes: input.nodes,
        edges: input.edges,
      })
    return input.tx ? run(input.tx) : db.transaction(run)
  }

  /**
   * Full flow-import orchestration: resolves the export's custom-field AND
   * bot-field manifests against the target workspace, remaps `nodes`/`edges`
   * to the resolved ids, and inserts the flow — all inside one transaction,
   * so a failed flow insert cannot leave orphan custom/bot fields behind.
   *
   * Cache invalidation: `resolveByNameAndType` invalidates created fields
   * inside the transaction (best-effort — a concurrent reader can repopulate
   * Redis from a pre-commit snapshot), so the caller must STILL invalidate
   * once more after this resolves, using the returned
   * `createdCustomFieldIds`/`createdBotFieldIds`, to close that window.
   */
  async importFlowExport(input: {
    workspaceId: string
    name: string
    active: boolean
    enableInInbox: boolean
    startNodeId: string
    nodes: FlowVersionSchema[]
    edges: EdgeSchema[]
    customFields: Record<string, FlowExportCustomField>
    botFields: Record<string, FlowExportBotField>
    folderId?: string | null
  }): Promise<{
    flowId: string
    createdCustomFieldIds: string[]
    createdBotFieldIds: string[]
  }> {
    return await db.transaction(async (tx) => {
      const { idMap: customFieldIdMap, createdIds } =
        await resolveManifestIdMap(
          input.customFields,
          (props) => customFieldService.resolveByNameAndType(props),
          input.workspaceId,
          tx,
        )

      const { idMap: botFieldIdMap, createdIds: createdBotFieldIds } =
        await resolveManifestIdMap(
          input.botFields,
          (props) => botFieldService.resolveByNameAndType(props),
          input.workspaceId,
          tx,
        )

      const remapped = remapFlowGraphReferences(
        { nodes: input.nodes, edges: input.edges },
        { customField: customFieldIdMap, botField: botFieldIdMap },
        { kinds: ["customField", "botField"] },
      )

      const requestedFolderId =
        !input.folderId || input.folderId === rootFolderId
          ? null
          : input.folderId
      const folder = requestedFolderId
        ? await folderService.find({
            id: requestedFolderId,
            workspaceId: input.workspaceId,
            folderType: "flow",
            tx,
          })
        : undefined
      const resolvedFolderId = folder?.id ?? null

      const flowId = await this.createFromImport({
        workspaceId: input.workspaceId,
        name: input.name,
        active: input.active,
        enableInInbox: input.enableInInbox,
        startNodeId: input.startNodeId,
        nodes: remapped.nodes,
        edges: remapped.edges,
        folderId: resolvedFolderId,
        tx,
      })

      return {
        flowId,
        createdCustomFieldIds: createdIds,
        createdBotFieldIds,
      }
    })
  }

  /**
   * Deletes the given flows and soft-deletes their analytics sessions in one
   * transaction, scoped to `workspaceId` so a caller cannot delete a flow
   * belonging to another workspace by id alone.
   */
  async deleteMany(input: {
    workspaceId: string
    ids: string[]
  }): Promise<void> {
    const flows = await db.query.flowModel.findMany({
      where: { workspaceId: input.workspaceId, id: { in: input.ids } },
    })
    if (flows.length === 0) {
      return
    }
    const flowIds = flows.map((flow) => flow.id)

    await assertDeletable({
      workspaceId: input.workspaceId,
      resourceKind: "flow",
      resourceIds: flowIds,
    })

    await db.transaction(async (tx) => {
      await tx.delete(flowModel).where(inArray(flowModel.id, flowIds))
      await tx
        .update(flowAnalyticsSessionModel)
        .set({ deletedAt: new Date() })
        .where(inArray(flowAnalyticsSessionModel.flowId, flowIds))
    })

    await this.audit(
      "delete",
      `deleted flow${flows.length > 1 ? "s" : ""} (${flows.map((flow) => `#${flow.id}`).join(", ")})`,
    )
  }

  /**
   * Creates a flow, its analytics session, and a draft version with a
   * default `sendMessageNode` — the builder's "New flow" action. Kept
   * separate from `insertFlowWithDraft`: that private helper also sets
   * `draftVersionId`/`currentVersionId` on the flow row, which this action
   * historically has NOT done — preserved verbatim to avoid a behavior
   * change.
   */
  async createWithDefaultDraft(input: {
    workspaceId: string
    name: string
    active?: boolean
    enableInInbox?: boolean
    folderId?: string | null
  }): Promise<{ id: string }> {
    if (input.folderId) {
      await folderService.ensureExists({
        id: input.folderId,
        workspaceId: input.workspaceId,
        folderType: "flow",
      })
    }

    const defaultNode = sendMessageNodeDefaultFn({
      dataProps: {
        name: "Send Message #1",
        isStartNode: true,
      },
    })

    const flow = await db.transaction(async (tx) => {
      const flowId = createId()
      const insertedFlow = await tx
        .insert(flowModel)
        .values({
          name: input.name,
          active: input.active,
          enableInInbox: input.enableInInbox,
          folderId: input.folderId,
          id: flowId,
          workspaceId: input.workspaceId,
        })
        .returning()
        .then((result) => result[0])

      await tx.insert(flowAnalyticsSessionModel).values({
        id: createId(),
        workspaceId: input.workspaceId,
        flowId,
      })

      await tx.insert(flowVersionModel).values({
        id: createId(),
        workspaceId: input.workspaceId,
        flowId,
        // biome-ignore lint/suspicious/noExplicitAny: temporary any to bypass circular dependency between flow and flow version
        nodes: [defaultNode as any],
        edges: [],
        isDraft: true,
        startNodeId: defaultNode.id,
      })

      return insertedFlow
    })

    await this.audit("create", `created a new flow (#${flow.id})`)

    return { id: flow.id }
  }

  /** Existence check for a set of flow ids, scoped to the workspace. */
  async assertAllExist(input: {
    workspaceId: string
    flowIds: string[]
  }): Promise<void> {
    const ids = await flowRepository.listIdsByIds({
      workspaceId: input.workspaceId,
      ids: input.flowIds,
    })

    if (ids.length !== input.flowIds.length) {
      throw notFoundException("Flow does not exists.")
    }
  }
}

export const flowService = new FlowService()
