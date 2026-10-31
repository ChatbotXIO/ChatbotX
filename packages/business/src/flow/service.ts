import {
  and,
  type DatabaseClient,
  db,
  eq,
  inArray,
  isNull,
} from "@chatbotx.io/database/client"
import {
  type CustomFieldType,
  rootFolderId,
} from "@chatbotx.io/database/partials"
import {
  type FlowListInput,
  flowRepository,
  integrationWhatsappRepository,
  reflinkRepository,
  whatsappMessageTemplateRepository,
} from "@chatbotx.io/database/repositories"
import {
  flowAnalyticsSessionModel,
  flowModel,
  flowVersionModel,
} from "@chatbotx.io/database/schema"
import type { FlowModel, FlowVersionModel } from "@chatbotx.io/database/types"
import { parsePagination } from "@chatbotx.io/database/utils"
import {
  collectFieldReferences,
  type EdgeSchema,
  FLOW_EXPORT_FORMAT_VERSION,
  type FlowExportBotField,
  type FlowExportCustomField,
  type FlowVersionSchema,
  flowExportSchema,
  referenceKindsWithPolicy,
  remapFlowGraphReferences,
  STRIP_UNRESOLVED_ARRAY_REFERENCE_KINDS,
  sendMessageNodeDefaultFn,
  stepTypes,
  type UnresolvedReference,
} from "@chatbotx.io/flow-config"
import { createId } from "@chatbotx.io/utils"
import { customFieldResolutionKey } from "@chatbotx.io/utils/custom-field"
import { BaseService } from "../base.service"
import { botFieldService } from "../bot-field/service"
import {
  customFieldService,
  type ResolvedCustomField,
} from "../custom-field/service"
import { notFoundException, validationException } from "../errors"
import { assertFlowGraphPublishable, flowVersionService } from "../flow-version"
import { folderService } from "../folder/service"
import { copyNamePrefix, freeCopyNames } from "../lib/copy-name"
import { messengerWelcomeMessageFlowService } from "../messenger-welcome-message-flow/service"
import { type IdLabel, selectLabelsByIds } from "../select-labels-by-ids"
import {
  computeCustomFieldNameBindings,
  rewriteBotFieldTokensDeep,
  rewriteFieldTokensDeep,
} from "../template/field-token-binder"
import {
  assertResourceEditable,
  withDeleteGuard,
} from "../template/installed-resource.service"
import { sanitizeUnresolvedReferences } from "../template/reference-sanitizer"
import { withTemplateLockedTransaction } from "../template/template-resource-locks"
import {
  type FlowWithNodeVersions,
  filterFlowsByStartStepType,
  filterFlowsByTemplateIds,
} from "./filters"

type FieldManifestEntry = { name: string; type: CustomFieldType }

type ResolveFieldsByNameAndType = (props: {
  workspaceId: string
  fields: FieldManifestEntry[]
  tx?: DatabaseClient
}) => Promise<{
  idMap: Map<string, string>
  createdIds: string[]
  /** Present for custom fields: the exact target name each field resolved to. */
  resolved?: Map<string, ResolvedCustomField>
}>

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
): Promise<{
  idMap: Map<string, string>
  createdIds: string[]
  resolved: Map<string, ResolvedCustomField> | undefined
}> => {
  const entries = Object.entries(manifest)
  const {
    idMap: resolvedByKey,
    createdIds,
    resolved,
  } = await resolve({
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

  return { idMap, createdIds, resolved }
}

/**
 * What a single-flow import remaps or reports. Manifest kinds are resolved from
 * the file's own field manifests; members and teams are always stripped; every
 * `verifyInTarget` kind is reported so the sanitizer keeps only the ids that
 * exist in the importing workspace, and so are the natural-key kinds with no
 * manifest here (tags, pipelines, folders, product categories).
 */
/**
 * Natural-key kinds a single-flow import has no manifest for. Their ids are
 * verified against the importing workspace instead of being left as the file
 * wrote them (a foreign tag id would otherwise travel into the new flow).
 */
const FLOW_IMPORT_VERIFIED_KINDS: ReadonlySet<string> = new Set([
  "tag",
  "pipeline",
  "folder",
  "productCategory",
])

const flowImportReferenceKinds = (): string[] => [
  "customField",
  "botField",
  ...FLOW_IMPORT_VERIFIED_KINDS,
  ...STRIP_UNRESOLVED_ARRAY_REFERENCE_KINDS,
  ...referenceKindsWithPolicy("verifyInTarget"),
]

/** `flows.create`'s default content when no `spec`/`nodes` is supplied: today's single "Send Message" start node. */
const defaultDraftGraph = (): {
  nodes: FlowVersionModel["nodes"]
  edges: FlowVersionModel["edges"]
  startNodeId: string
} => {
  const defaultNode = sendMessageNodeDefaultFn({
    dataProps: {
      name: "Send Message #1",
      isStartNode: true,
    },
  })
  return {
    // biome-ignore lint/suspicious/noExplicitAny: temporary any to bypass circular dependency between flow and flow version
    nodes: [defaultNode as any],
    edges: [],
    startNodeId: defaultNode.id,
  }
}

export type FlowNodeSummary = {
  flowId: string
  nodeId: string
  label: string
  nodeType: string | null
}

const readNodeLabel = (node: { id: string; data?: unknown }): string => {
  const data = node.data
  if (data && typeof data === "object" && "name" in data) {
    const name = data.name
    if (typeof name === "string" && name.trim() !== "") {
      return name
    }
  }
  return node.id
}

/** Flow copies are named `<name> _copy`, `<name> _copy 2`, … (names are not unique, but copies stay distinguishable). */
const FLOW_COPY_NAME = { style: "underscore", maxLength: 255 } as const

const toExportFileName = (name: string): string => {
  const slug =
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "flow"
  return `${slug}.chatbotx-flow.json`
}

class FlowService extends BaseService {
  async listPublishedOptions(input: {
    workspaceId: string
  }): Promise<Array<{ id: string; name: string }>> {
    return await flowRepository.listPublishedOptions(input)
  }

  async findBy(
    input: { workspaceId: string; id: string },
    tx?: DatabaseClient,
  ): Promise<FlowModel | undefined> {
    const client = tx ?? db
    return await client.query.flowModel.findFirst({
      where: { id: input.id, workspaceId: input.workspaceId },
    })
  }

  /**
   * Paginated flow list with draft/latest versions attached. `startType`
   * filters by the start node's step type (and, for WhatsApp template steps,
   * by `integrationWhatsappId`'s bound template ids). That filter reads the
   * version graphs, so it runs in memory over every flow matching the SQL
   * filters and the page is cut afterwards — `pageCount` then counts the
   * filtered set. An `integrationWhatsappId` outside the workspace is a 404.
   */
  async list(
    input: FlowListInput & {
      page?: number | null
      perPage?: number | null
      startType?: string | null
      integrationWhatsappId?: string | null
    },
  ): Promise<{
    data: Awaited<ReturnType<typeof flowRepository.listWithVersions>>
    pageCount: number
    limit?: number
    offset?: number
  }> {
    const pagination = parsePagination(input)

    if (!input.startType) {
      const [data, total] = await Promise.all([
        flowRepository.listWithVersions(input),
        flowRepository.count(input),
      ])
      const pageCount = pagination?.limit
        ? Math.ceil(total / pagination.limit)
        : 1
      return { data, pageCount, ...pagination }
    }

    const filtered = await this.filterByStartType({
      flows: await flowRepository.listWithVersions({
        ...input,
        page: null,
        perPage: null,
      }),
      workspaceId: input.workspaceId,
      startType: input.startType,
      integrationWhatsappId: input.integrationWhatsappId,
    })

    if (!pagination?.limit) {
      return { data: filtered, pageCount: 1 }
    }
    return {
      data: filtered.slice(
        pagination.offset,
        pagination.offset + pagination.limit,
      ),
      pageCount: Math.ceil(filtered.length / pagination.limit),
      ...pagination,
    }
  }

  private async filterByStartType<T extends FlowWithNodeVersions>(input: {
    flows: T[]
    workspaceId: string
    startType: string
    integrationWhatsappId?: string | null
  }): Promise<T[]> {
    const byStep = filterFlowsByStartStepType(input.flows, input.startType)
    if (input.startType !== stepTypes.enum.sendWaTemplateMessage) {
      return byStep
    }
    if (!input.integrationWhatsappId) {
      return []
    }
    const integration =
      await integrationWhatsappRepository.findByIdForWorkspace({
        id: input.integrationWhatsappId,
        workspaceId: input.workspaceId,
      })
    if (!integration) {
      throw notFoundException("WhatsApp channel not found")
    }
    const templateIds =
      await whatsappMessageTemplateRepository.listIdsByIntegration({
        integrationWhatsappId: input.integrationWhatsappId,
      })
    return filterFlowsByTemplateIds(byStep, templateIds)
  }

  /**
   * The nodes of a flow's published version, for pickers and agents that need
   * a node id (the "Executed Step" filter). A flow that was never published
   * has none.
   */
  async listNodes(input: {
    workspaceId: string
    flowId: string
  }): Promise<FlowNodeSummary[]> {
    const nodes = await flowRepository.findCurrentVersionNodes(input)
    if (!nodes) {
      throw notFoundException("Flow does not exists.")
    }

    return nodes.map((node) => ({
      flowId: input.flowId,
      nodeId: node.id,
      label: readNodeLabel(node),
      nodeType: typeof node.type === "string" ? node.type : null,
    }))
  }

  /** Existing rows only — `id`s absent from the result no longer exist. */
  async listLabelsByIds(input: {
    workspaceId: string
    ids: string[]
  }): Promise<IdLabel[]> {
    return await selectLabelsByIds(flowModel, input)
  }

  /**
   * Labels for `{flowId}:{nodeId}` references ("Executed Step"), as
   * `Flow name · Node name`. A reference whose flow or node is gone from the
   * published version is absent, so callers can show it as deleted.
   */
  async listNodeLabelsByIds(input: {
    workspaceId: string
    ids: string[]
  }): Promise<IdLabel[]> {
    const references = input.ids.flatMap((id) => {
      const [flowId, nodeId] = id.split(":")
      return flowId && nodeId ? [{ flowId, id, nodeId }] : []
    })
    const flows = await flowRepository.listCurrentVersionNodesByFlowIds({
      workspaceId: input.workspaceId,
      flowIds: [...new Set(references.map((reference) => reference.flowId))],
    })
    const flowById = new Map(flows.map((flow) => [flow.flowId, flow]))

    return references.flatMap((reference) => {
      const flow = flowById.get(reference.flowId)
      const node = flow?.nodes.find(
        (candidate) => candidate.id === reference.nodeId,
      )
      return flow && node
        ? [
            {
              id: reference.id,
              name: `${flow.flowName} · ${readNodeLabel(node)}`,
            },
          ]
        : []
    })
  }

  /** Unguarded flow detail with all versions — callers enforce access. */
  async findById(input: {
    workspaceId: string
    id: string
  }): Promise<
    NonNullable<Awaited<ReturnType<typeof flowRepository.findWithVersions>>>
  > {
    const flow = await flowRepository.findWithVersions(input)
    if (!flow) {
      throw notFoundException("Flow does not exists.")
    }
    return flow
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
      /** Minted when absent; a duplicate needs it before inserting to remap self-references. */
      id?: string
      name: string
      active: boolean
      enableInInbox: boolean
      workspaceId: string
      folderId: string | null
      startNodeId: string
      nodes: FlowVersionModel["nodes"]
      edges: FlowVersionModel["edges"]
      /** When set, a published version with this graph is stored next to the draft. */
      published?: {
        startNodeId: string
        nodes: FlowVersionModel["nodes"]
        edges: FlowVersionModel["edges"]
      }
    },
  ): Promise<string> {
    const newFlowId = input.id ?? createId()
    const draftVersionId = createId()
    const publishedVersionId = input.published ? createId() : null
    await tx.insert(flowModel).values({
      id: newFlowId,
      name: input.name,
      active: input.active,
      enableInInbox: input.enableInInbox,
      workspaceId: input.workspaceId,
      folderId: input.folderId,
      currentVersionId: publishedVersionId,
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
    if (input.published && publishedVersionId) {
      await tx.insert(flowVersionModel).values({
        id: publishedVersionId,
        workspaceId: input.workspaceId,
        flowId: newFlowId,
        nodes: input.published.nodes,
        edges: input.published.edges,
        isDraft: false,
        isLatest: true,
        startNodeId: input.published.startNodeId,
      })
    }

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

  /**
   * The builder create-flow form's flow, and the public `flows.create`
   * API's default: a single new (unpublished) draft version. With no
   * `graph`, it's seeded with one default "Send Message" start node
   * (`defaultDraftGraph`); the public API passes a pre-resolved `graph`
   * (compiled from `spec`, or normalized from a raw `nodes`/`edges` body)
   * to seed the draft with caller-supplied content instead. Unlike
   * `createPublishedDefault` (template install: draft + published version
   * pair, external `tx`), this owns its own transaction and audits the
   * result.
   */
  async createDraft(input: {
    workspaceId: string
    data: { name: string; folderId?: string | null }
    graph?: {
      nodes: FlowVersionModel["nodes"]
      edges: FlowVersionModel["edges"]
      startNodeId: string
    }
  }): Promise<{ id: string }> {
    const { workspaceId, data } = input

    if (data.folderId) {
      await folderService.ensureExists({
        id: data.folderId,
        workspaceId,
        folderType: "flow",
      })
    }

    const graph = input.graph ?? defaultDraftGraph()

    const flow = await db.transaction(async (tx) => {
      const flowId = createId()
      const [created] = await tx
        .insert(flowModel)
        .values({
          ...data,
          id: flowId,
          workspaceId,
        })
        .returning()

      await tx.insert(flowAnalyticsSessionModel).values({
        id: createId(),
        workspaceId,
        flowId,
      })

      await tx.insert(flowVersionModel).values({
        id: createId(),
        workspaceId,
        flowId,
        nodes: graph.nodes,
        edges: graph.edges,
        isDraft: true,
        startNodeId: graph.startNodeId,
      })

      return created
    })

    await this.audit("create", `created a new flow (#${flow.id})`)

    return { id: flow.id }
  }

  /**
   * The public `flows.create` API's `publish: true` path: inserts the flow,
   * its analytics session, a draft version, and a published version — all in
   * one transaction via `createPublishedDefault` — so a downstream failure
   * (a DB error, a constraint, the cache invalidation) never leaves behind
   * an orphaned, invisible, unpublished flow the caller was never told the
   * id of. Runs the same folder guard `createDraft` runs before opening the
   * transaction, and invalidates/audits after it commits, matching
   * `createPublishedDefault`'s doc-comment contract.
   */
  async createPublished(input: {
    workspaceId: string
    data: { name: string; folderId?: string | null }
    graph: {
      nodes: FlowVersionModel["nodes"]
      edges: FlowVersionModel["edges"]
      startNodeId: string
    }
  }): Promise<{ id: string }> {
    const { workspaceId, data, graph } = input
    assertFlowGraphPublishable(graph)

    if (data.folderId) {
      await folderService.ensureExists({
        id: data.folderId,
        workspaceId,
        folderType: "flow",
      })
    }

    const { flowId } = await db.transaction((tx) =>
      this.createPublishedDefault(tx, {
        workspaceId,
        name: data.name,
        folderId: data.folderId,
        startNodeId: graph.startNodeId,
        nodes: graph.nodes,
        edges: graph.edges,
      }),
    )

    await flowVersionService.invalidateList(flowId)
    await messengerWelcomeMessageFlowService.enqueueSync({
      workspaceId,
      flowId,
      reason: "publish",
    })
    await this.audit("create", `created a new flow (#${flowId})`)

    return { id: flowId }
  }

  /**
   * Partial update of a flow's name/active/enableInInbox. No-ops (and skips
   * the audit record) when every field matches the current row, mirroring
   * the guard the old `update-flow-action.ts` implementation had.
   */
  async update(
    ctx: { workspaceId: string; id: string },
    data: { name?: string; active?: boolean; enableInInbox?: boolean },
  ): Promise<void> {
    // The flow is locked before its stored row is read, so the diff that
    // decides the guard is computed under the lock.
    const { flow, updated } = await withTemplateLockedTransaction(
      async (tx) => {
        const current = await this.findBy(ctx, tx)
        if (!current) {
          throw notFoundException("Flow not found")
        }

        const changedKeys = Object.keys(data).filter(
          (key) =>
            current[key as keyof typeof data] !==
            data[key as keyof typeof data],
        )
        if (changedKeys.length === 0) {
          return { flow: current, updated: [] as { id: string }[] }
        }

        await assertResourceEditable({
          workspaceId: ctx.workspaceId,
          resourceKind: "flow",
          resourceIds: [current.id],
          changedKeys,
          tx,
        })
        const rows = await tx
          .update(flowModel)
          .set(data)
          .where(eq(flowModel.id, current.id))
          .returning({ id: flowModel.id })
        return { flow: current, updated: rows }
      },
      {
        workspaceId: ctx.workspaceId,
        initialKeys: [{ kind: "flow", resourceId: ctx.id }],
      },
    )

    if (updated.length === 0) {
      return
    }

    if (data.name !== undefined && data.name !== flow.name) {
      await messengerWelcomeMessageFlowService.enqueueSync({
        workspaceId: ctx.workspaceId,
        flowId: flow.id,
        reason: "rename",
      })
    }

    await this.audit("update", `updated a flow (#${flow.id})`)
  }

  /**
   * Copies a flow inside its workspace. The copy's draft is the source's
   * draft; when the source has a published version the copy gets one too (and
   * keeps `active`), otherwise it is a draft-only flow that starts inactive.
   * References a graph holds to the source flow itself point at the copy.
   * The name is the first free `<name> _copy`, `<name> _copy 2`, … .
   */
  async duplicate(input: { workspaceId: string; id: string }): Promise<string> {
    const { newFlowId, isPublished } = await db.transaction(async (tx) => {
      const flow = await this.findBy(input, tx)
      if (!flow) {
        throw notFoundException("Flow not found")
      }

      const ref = { flowId: flow.id, workspaceId: flow.workspaceId }
      const [draftVersion, publishedVersion] = await Promise.all([
        flowVersionService.findDraft(ref, tx),
        flowVersionService.findPublished(ref, tx),
      ])
      if (!draftVersion) {
        throw notFoundException("Draft version not found")
      }

      const taken = new Set(
        await flowRepository.listNamesWithPrefix(
          {
            workspaceId: flow.workspaceId,
            prefix: copyNamePrefix(flow.name, FLOW_COPY_NAME),
          },
          tx,
        ),
      )
      const name = freeCopyNames(flow.name, taken, FLOW_COPY_NAME)[0]
      if (!name) {
        throw validationException("name", "Name is already taken")
      }

      const id = createId()
      const pointAtCopy = <T extends { nodes: unknown; edges: unknown }>(
        graph: T,
      ): T =>
        remapFlowGraphReferences(
          graph,
          { flow: new Map([[flow.id, id]]) },
          { kinds: ["flow"] },
        )
      const draft = pointAtCopy({
        nodes: draftVersion.nodes,
        edges: draftVersion.edges,
      })
      const published = publishedVersion
        ? pointAtCopy({
            nodes: publishedVersion.nodes,
            edges: publishedVersion.edges,
          })
        : undefined

      const createdId = await this.insertFlowWithDraft(tx, {
        id,
        name,
        active: publishedVersion ? flow.active : false,
        enableInInbox: flow.enableInInbox,
        workspaceId: flow.workspaceId,
        folderId: flow.folderId,
        startNodeId: draftVersion.startNodeId,
        nodes: draft.nodes,
        edges: draft.edges,
        published:
          publishedVersion && published
            ? {
                startNodeId: publishedVersion.startNodeId,
                nodes: published.nodes,
                edges: published.edges,
              }
            : undefined,
      })
      return { newFlowId: createdId, isPublished: Boolean(publishedVersion) }
    })
    // The copy may carry a published version the versions list cached as empty.
    await flowVersionService.invalidateList(newFlowId)
    // Only a published copy is live: its welcome-message flows sync like any
    // publish. A draft-only copy has nothing to sync.
    if (isPublished) {
      await messengerWelcomeMessageFlowService.enqueueSync({
        workspaceId: input.workspaceId,
        flowId: newFlowId,
        reason: "publish",
      })
    }
    await this.audit(
      "create",
      `duplicated a flow (#${input.id} → #${newFlowId})`,
    )
    return newFlowId
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
    validatePublishable?: boolean
    /** Also stores a published version with the same graph (the caller has checked it is publishable). */
    publishedToo?: boolean
  }): Promise<string> {
    if (input.validatePublishable ?? true) {
      assertFlowGraphPublishable({ nodes: input.nodes, edges: input.edges })
    }

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
        published: input.publishedToo
          ? {
              startNodeId: input.startNodeId,
              nodes: input.nodes,
              edges: input.edges,
            }
          : undefined,
      })
    return input.tx ? run(input.tx) : db.transaction(run)
  }

  /**
   * The portable export of one flow: its published graph (or the draft, with
   * `version: "draft"`) plus the name and type of every custom and bot field
   * it references, so another workspace can bind them by name. Shared by the
   * download route and the public API.
   *
   * `notPublished` means the flow has no published version to export;
   * `notFound` that the flow is not in the workspace.
   */
  async buildExport(input: {
    workspaceId: string
    id: string
    version?: "published" | "draft"
  }): Promise<
    | { ok: true; fileName: string; envelope: Record<string, unknown> }
    | { ok: false; reason: "notFound" | "notPublished" | "noDraft" }
  > {
    const flow = await this.findBy({
      workspaceId: input.workspaceId,
      id: input.id,
    })
    if (!flow) {
      return { ok: false, reason: "notFound" }
    }
    const ref = { flowId: flow.id, workspaceId: flow.workspaceId }
    const version =
      input.version === "draft"
        ? await flowVersionService.findDraft(ref)
        : await flowVersionService.findPublished(ref)
    if (!version) {
      return {
        ok: false,
        reason: input.version === "draft" ? "noDraft" : "notPublished",
      }
    }

    const { customFieldIds, botFieldIds } = collectFieldReferences({
      nodes: version.nodes,
      edges: version.edges,
    })
    const [customFieldRows, botFieldRows] = await Promise.all([
      customFieldService.findManyByIds({
        workspaceId: flow.workspaceId,
        ids: customFieldIds,
      }),
      botFieldService.findManyByIds({
        workspaceId: flow.workspaceId,
        ids: botFieldIds,
      }),
    ])
    const envelope = {
      formatVersion: FLOW_EXPORT_FORMAT_VERSION,
      exportedAt: new Date().toISOString(),
      source: { workspaceId: flow.workspaceId, flowId: flow.id },
      flows: [
        {
          name: flow.name,
          active: flow.active,
          enableInInbox: flow.enableInInbox,
          startNodeId: version.startNodeId,
          nodes: version.nodes,
          edges: version.edges,
        },
      ],
      customFields: Object.fromEntries(
        customFieldRows.map((row): [string, FlowExportCustomField] => [
          row.id,
          { name: row.name, type: row.type },
        ]),
      ),
      botFields: Object.fromEntries(
        botFieldRows.map((row): [string, FlowExportBotField] => [
          row.id,
          { name: row.name, type: row.type },
        ]),
      ),
    }
    // Never emit a payload the importer would reject.
    flowExportSchema.parse(envelope)
    return { ok: true, fileName: toExportFileName(flow.name), envelope }
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
    /** Custom fields created under another name because their own was taken by another type. */
    renamedCustomFields: { from: string; to: string; type: string }[]
    /** Bot fields created under another name because their own was taken by another type. */
    renamedBotFields: { from: string; to: string; type: string }[]
  }> {
    return await db.transaction(async (tx) => {
      const {
        idMap: customFieldIdMap,
        createdIds,
        resolved: resolvedCustomFields,
      } = await resolveManifestIdMap(
        input.customFields,
        (props) => customFieldService.resolveByNameAndType(props),
        input.workspaceId,
        tx,
      )

      const {
        idMap: botFieldIdMap,
        createdIds: createdBotFieldIds,
        resolved: resolvedBotFields,
      } = await resolveManifestIdMap(
        input.botFields,
        (props) => botFieldService.resolveByNameAndType(props),
        input.workspaceId,
        tx,
      )

      // Workspace members and teams never travel between workspaces, and the
      // file's own `source.workspaceId` is forgeable, so it is never used to
      // decide that they may stay: they are always reported and stripped.
      // A field reused under another spelling, or created under a renamed
      // name, is addressed by `{{name}}` in the flow's text: the tokens follow.
      const { bindings, renamed } = computeCustomFieldNameBindings(
        Object.entries(input.customFields).map(([sourceId, field]) => ({
          sourceId,
          name: field.name,
          type: field.type,
          target: resolvedCustomFields?.get(customFieldResolutionKey(field)),
        })),
      )
      const unresolved: UnresolvedReference[] = []
      const remapped = remapFlowGraphReferences(
        // `{{bot_field:<id>}}` names the field by its id in the exporting
        // workspace, so the token follows the field it resolved to.
        rewriteBotFieldTokensDeep(
          rewriteFieldTokensDeep(
            { nodes: input.nodes, edges: input.edges },
            bindings,
          ),
          botFieldIdMap,
        ),
        { customField: customFieldIdMap, botField: botFieldIdMap },
        {
          kinds: flowImportReferenceKinds(),
          onUnresolved: (ref) => unresolved.push(ref),
        },
      )
      // A reference no map resolved is never left pointing at another
      // workspace's id, whatever the uploaded file claims.
      const graph = await sanitizeUnresolvedReferences({
        workspaceId: input.workspaceId,
        graph: remapped,
        unresolved,
        tx,
        verifyKinds: FLOW_IMPORT_VERIFIED_KINDS,
      })

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
        nodes: graph.nodes,
        edges: graph.edges,
        folderId: resolvedFolderId,
        tx,
      })

      return {
        flowId,
        createdCustomFieldIds: createdIds,
        createdBotFieldIds,
        renamedCustomFields: renamed.map(({ from, to, type }) => ({
          from,
          to,
          type,
        })),
        renamedBotFields: Object.values(input.botFields).flatMap((field) => {
          const target = resolvedBotFields?.get(customFieldResolutionKey(field))
          return target?.renamed
            ? [{ from: field.name, to: target.name, type: field.type }]
            : []
        }),
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

    // Deleting a flow cascades to the ref links and QR codes pointing at it.
    const cascadedReflinkIds = await reflinkRepository.listIdsByFlowIds({
      workspaceId: input.workspaceId,
      flowIds,
    })

    await withDeleteGuard(
      {
        workspaceId: input.workspaceId,
        targets: [
          { resourceKind: "flow", resourceIds: flowIds },
          { resourceKind: "reflink", resourceIds: cascadedReflinkIds },
        ],
      },
      (tx) =>
        this.deleteInTx(tx, { workspaceId: input.workspaceId, ids: flowIds }),
    )

    await messengerWelcomeMessageFlowService.enqueueDelete({
      workspaceId: input.workspaceId,
      flowIds,
    })

    await this.audit(
      "delete",
      `deleted flow${flows.length > 1 ? "s" : ""} (${flows.map((flow) => `#${flow.id}`).join(", ")})`,
    )
  }

  /**
   * The delete core (flow rows + soft-deleted analytics sessions), shared with
   * the template uninstall so there is one implementation. Returns the ids
   * actually deleted.
   */
  async deleteInTx(
    tx: DatabaseClient,
    input: { workspaceId: string; ids: string[] },
  ): Promise<string[]> {
    const rows = await tx
      .delete(flowModel)
      .where(
        and(
          eq(flowModel.workspaceId, input.workspaceId),
          inArray(flowModel.id, input.ids),
        ),
      )
      .returning({ id: flowModel.id })
    const deleted = rows.map((row) => String(row.id))
    if (deleted.length > 0) {
      // Live sessions only: already-deleted history keeps its stamp, and the
      // uninstall (which drained them in bounded batches first) touches none.
      await tx
        .update(flowAnalyticsSessionModel)
        .set({ deletedAt: new Date() })
        .where(
          and(
            eq(flowAnalyticsSessionModel.workspaceId, input.workspaceId),
            inArray(flowAnalyticsSessionModel.flowId, deleted),
            isNull(flowAnalyticsSessionModel.deletedAt),
          ),
        )
    }
    return deleted
  }

  /**
   * Active flow by id, scoped to workspace. Used by worker's
   * `detectFlowVersion` to resolve the current version off `currentVersionId`,
   * and by `trigger/services/action-executor.ts` startAnotherFlow.
   */
  async findActiveById(props: {
    id: string
    workspaceId: string
    tx?: DatabaseClient
  }): Promise<FlowModel | undefined> {
    const { id, workspaceId, tx = db } = props
    return await tx.query.flowModel.findFirst({
      where: { id, workspaceId, active: true },
    })
  }

  /**
   * Any active flow in the workspace, with NO ordering — used only as
   * button-encoding context (e.g. `send-messenger-template.ts`). The
   * "no ordering" behavior is intentional; do not add an `orderBy`.
   */
  async findAnyActive(props: {
    workspaceId: string
    tx?: DatabaseClient
  }): Promise<FlowModel | undefined> {
    const { workspaceId, tx = db } = props
    return await tx.query.flowModel.findFirst({
      where: { workspaceId, active: true },
    })
  }

  /** Existence check for a set of flow ids, scoped to the workspace. */
  async assertAllExist(
    input: {
      workspaceId: string
      flowIds: string[]
    },
    tx?: DatabaseClient,
  ): Promise<void> {
    const ids = await flowRepository.listIdsByIds(
      {
        workspaceId: input.workspaceId,
        ids: input.flowIds,
      },
      tx,
    )

    if (ids.length !== input.flowIds.length) {
      throw notFoundException("Flow does not exists.")
    }
  }
}

export const flowService = new FlowService()
