import { rootFolderId } from "@chatbotx.io/database/partials"
import type {
  FlowExportedFlow,
  TemplateFlowEntry,
  UnresolvedReference,
} from "@chatbotx.io/flow-config"
import {
  normalizeFlowGraphDecisionMappings,
  remapFlowGraphReferences,
  templateFlowNodeSchema,
} from "@chatbotx.io/flow-config"
import { z } from "zod"
import { decisionProfileService } from "../../../decision/profile-service"
import { assertFlowGraphPublishable } from "../../../flow-version/assert-publishable"
import {
  copyReferenceKinds,
  type ReferenceExistenceCache,
  sanitizeFlowGraphReferences,
} from "../../reference-sanitizer"
import { notYetReported, resolveFolderRef } from "../shared"
import type { TemplateInstallContext } from "../types"

type FlowGraph = {
  nodes: FlowExportedFlow["nodes"]
  edges: FlowExportedFlow["edges"]
}

/**
 * Whether the graph can be published in the installing workspace. Any throw
 * from the structural or decision-profile checks means "not publishable". The
 * normalized nodes are what a publish writes.
 */
export const checkPublishable = async (
  ctx: TemplateInstallContext,
  graph: { nodes: unknown[]; edges: unknown[] },
): Promise<{ ok: false } | { ok: true; nodes: FlowExportedFlow["nodes"] }> => {
  const nodes = normalizeFlowGraphDecisionMappings(
    graph.nodes as FlowExportedFlow["nodes"],
  )
  try {
    assertFlowGraphPublishable({
      nodes,
      edges: graph.edges as FlowExportedFlow["edges"],
    })
    await decisionProfileService.assertFlowReferencesPublishable({
      nodes,
      workspaceId: ctx.workspaceId,
    })
    return { ok: true, nodes }
  } catch {
    return { ok: false }
  }
}

/** A flow that ends up draft-only is always reported, keyed by the source id. */
export const warnFlowNotPublished = (
  ctx: TemplateInstallContext,
  sourceId: string,
): void => {
  ctx.warn({
    category: "flows",
    entityKind: "flowNotPublished",
    path: `flows.${sourceId}`,
    value: sourceId,
  })
}

export const resolveFlowFolder = (
  ctx: TemplateInstallContext,
  entry: TemplateFlowEntry,
): string | null =>
  resolveFolderRef(ctx, "flows", entry, { ignore: [rootFolderId] })

/** The assign steps' own slots: without someone in them the step does nothing. */
const ASSIGN_STEP_SLOT_PATTERN = /\.assignedIds?(\[\d+\])?$/

const isAssignStepSlot = (path: string): boolean =>
  ASSIGN_STEP_SLOT_PATTERN.test(path)

/**
 * Remaps a flow's references and sanitizes what no map resolved. Returns
 * `null` after warning when the flow cannot be installed: a required slot that
 * cannot be dropped with an element (`flowSkippedRequiredReference`), or a
 * graph that is not structurally valid (`flowInvalidStructure`).
 */
export const prepareFlowGraph = async (input: {
  ctx: TemplateInstallContext
  entry: TemplateFlowEntry
  kinds: readonly string[]
  cache: ReferenceExistenceCache
}): Promise<{ graph: FlowGraph; resolvedCompletely: boolean } | null> => {
  const { ctx, entry } = input
  const unresolved: UnresolvedReference[] = []
  const remapped = remapFlowGraphReferences(
    { nodes: entry.nodes, edges: entry.edges },
    ctx.idMaps,
    {
      kinds: input.kinds,
      onUnresolved: (ref) => unresolved.push(ref),
    },
  )
  // A reference no map resolved is never left pointing at the source
  // workspace's id: it is removed in the way its slot allows.
  const sanitized = await sanitizeFlowGraphReferences({
    workspaceId: ctx.workspaceId,
    graph: remapped,
    unresolved,
    tx: ctx.tx,
    cache: input.cache,
    // A shipped kind the install has already created cannot be left at the
    // source's id; one that resolves later (`flow`...) is judged by the patch.
    removeKinds: new Set(
      input.kinds.filter((kind) => copyReferenceKinds().has(kind)),
    ),
  })
  const removedPaths = [...sanitized.removed, ...sanitized.droppedElements]
  // A blocked reference keeps its own warning: it names the id that made the
  // flow be skipped, which `flowSkippedRequiredReference` does not.
  for (const ref of notYetReported(unresolved, removedPaths)) {
    ctx.warn({
      category: "flows",
      entityKind: isAssignStepSlot(ref.path)
        ? "assigneeRequired"
        : ref.entityKind,
      path: `flows.${entry.sourceId}.${ref.path}`,
      value: ref.value,
    })
  }
  if (sanitized.blocked.length > 0) {
    ctx.warn({
      category: "flows",
      entityKind: "flowSkippedRequiredReference",
      path: `flows.${entry.sourceId}.${sanitized.blocked[0]}`,
      value: entry.sourceId,
    })
    return null
  }
  for (const path of removedPaths) {
    ctx.warn({
      category: "flows",
      entityKind: isAssignStepSlot(path)
        ? "assigneeRequired"
        : "referenceRemoved",
      path: `flows.${entry.sourceId}.${path}`,
      value: entry.sourceId,
    })
  }
  // Structure only (D7): an incomplete step leaves the flow a draft with
  // `flowNotPublished`; only a graph that is not node-shaped is skipped.
  if (
    !z.array(templateFlowNodeSchema).safeParse(sanitized.value.nodes).success
  ) {
    ctx.warn({
      category: "flows",
      entityKind: "flowInvalidStructure",
      path: `flows.${entry.sourceId}`,
      value: entry.sourceId,
    })
    return null
  }
  return {
    graph: sanitized.value,
    resolvedCompletely: unresolved.length === 0,
  }
}
