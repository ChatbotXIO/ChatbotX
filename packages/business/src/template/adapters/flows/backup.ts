import type { TemplateFlowEntry } from "@chatbotx.io/flow-config"
import { z } from "zod"
import type { ReferenceExistenceCache } from "../../reference-sanitizer"
import { templateBackupNotRestorableException } from "../../template-errors"
import { assertBackupFormat } from "../shared"
import type { ResourceSyncHandler } from "../types"
import { readDraft, republish, writeDraft } from "./draft-store"
import { FLOW_ALL_KINDS } from "./kinds"
import {
  registerIdentityNodeIds,
  registerInstalledCopyNodeIds,
} from "./node-ids"
import { prepareFlowGraph } from "./prepare-graph"

/** The shape `serializeBackup` writes and `restoreBackup` reads. */
const BACKUP_FORMAT_VERSION = 1

/**
 * A backup is the installer's own draft, so it is checked for the structure a
 * restore could corrupt (ids, edge endpoints), not for publishability: an
 * unfinished graph is a legitimate thing to get back. Backups written before
 * the `published` flag was dropped still parse: unknown keys are ignored.
 */
const flowBackupSchema = z
  .object({
    name: z.string(),
    // Not checked against `nodes`: the column is set when the flow is created
    // and never re-synced (the `isStartNode` flag is what counts), so a copy
    // whose start node was reassigned legitimately carries a stale id.
    startNodeId: z.string(),
    nodes: z.array(z.looseObject({ id: z.string() })),
    edges: z.array(
      z.looseObject({ id: z.string(), source: z.string(), target: z.string() }),
    ),
  })
  .superRefine((backup, context) => {
    const nodeIds = new Set(backup.nodes.map((node) => node.id))
    if (nodeIds.size !== backup.nodes.length) {
      context.addIssue({ code: "custom", message: "Duplicate node id" })
    }
    const edgeIds = new Set(backup.edges.map((edge) => edge.id))
    if (edgeIds.size !== backup.edges.length) {
      context.addIssue({ code: "custom", message: "Duplicate edge id" })
    }
    for (const edge of backup.edges) {
      if (!(nodeIds.has(edge.source) && nodeIds.has(edge.target))) {
        context.addIssue({
          code: "custom",
          message: `Edge ${edge.id} points at a missing node`,
        })
      }
    }
  })

export const flowSyncHandler = {
  async project(tx, resourceId) {
    const flow = await tx.query.flowModel.findFirst({
      where: { id: resourceId },
      columns: { name: true },
    })
    const draft = await readDraft(tx, resourceId)
    if (!(flow && draft)) {
      return null
    }
    return {
      name: flow.name,
      startNodeId: draft.startNodeId,
      nodes: draft.nodes,
      edges: draft.edges,
    }
  },

  async serializeBackup(tx, resourceId) {
    const flow = await tx.query.flowModel.findFirst({
      where: { id: resourceId },
      columns: { name: true },
    })
    const draft = await readDraft(tx, resourceId)
    if (!(flow && draft)) {
      return null
    }
    return {
      formatVersion: BACKUP_FORMAT_VERSION,
      content: {
        name: flow.name,
        startNodeId: draft.startNodeId,
        nodes: draft.nodes,
        edges: draft.edges,
      },
    }
  },

  // Into the draft only, structurally checked: publishing stays a separate,
  // explicit action, so a restored incomplete graph can never go live.
  async restoreBackup(tx, resourceId, content, formatVersion) {
    assertBackupFormat(formatVersion, BACKUP_FORMAT_VERSION)
    const parsed = flowBackupSchema.safeParse(content)
    if (!parsed.success) {
      throw templateBackupNotRestorableException()
    }
    await writeDraft(tx, resourceId, parsed.data)
  },

  async update(ctx, pairs) {
    const existenceCache: ReferenceExistenceCache = new Map()
    // A jump into another updated flow resolves whatever order they go in.
    for (const { entry } of pairs) {
      registerIdentityNodeIds(ctx, entry)
    }
    // A flow this sync leaves alone (an edited copy it backs off from, a
    // detached one) keeps its nodes: a jump into one of them is valid.
    await registerInstalledCopyNodeIds(ctx)
    for (const { entry, resourceId } of pairs) {
      const prepared = await prepareFlowGraph({
        ctx,
        entry,
        kinds: FLOW_ALL_KINDS,
        cache: existenceCache,
      })
      if (!prepared) {
        continue
      }
      const { graph } = prepared
      const hadPublished = await writeDraft(ctx.tx, resourceId, {
        name: entry.name,
        startNodeId: entry.startNodeId,
        nodes: graph.nodes,
        edges: graph.edges,
      })
      if (hadPublished) {
        await republish(ctx, entry, resourceId, graph)
      }
    }
  },
} satisfies ResourceSyncHandler<TemplateFlowEntry>
