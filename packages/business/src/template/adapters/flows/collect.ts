import { db } from "@chatbotx.io/database/client"
import { flowVersionRepository } from "@chatbotx.io/database/repositories"
import type { FlowExportedFlow } from "@chatbotx.io/flow-config"
import { collectReferencesByKind } from "@chatbotx.io/flow-config"
import { isNumericId } from "@chatbotx.io/utils/id"
import { collectResourceDependencies } from "../../manifest-references"
import { makeCollector, scopedWhere } from "../shared"

/**
 * The product categories flows filter by (`sendCollection` category and
 * sub-category). Reported so the snapshot ships them in the
 * `productCategories` manifest: without that the install could never resolve
 * them, and the sanitizer would clear the filter, widening the step to the
 * whole store.
 */
const collectReferencedProductCategoryIds = (
  entries: readonly unknown[],
): string[] => {
  const ids = new Set<string>()
  for (const entry of entries) {
    for (const id of collectReferencesByKind(entry, ["productCategory"]).get(
      "productCategory",
    ) ?? []) {
      if (isNumericId(id)) {
        ids.add(id)
      }
    }
  }
  return [...ids]
}

/**
 * Builds one `flows` resource entry in the shape `flowsAdapter.insert`
 * expects. The snapshot carries the latest *published* graph, or the draft
 * when the flow was never published ("blocking a template on one unpublished
 * flow is hostile"); `published` records which, so the install can restore the
 * live state only when it is safe to.
 */
const buildFlowExportEntry = (
  flow: {
    id: string
    name: string
    active: boolean
    enableInInbox: boolean
    folderId: string | null
  },
  version: {
    startNodeId: string
    nodes: unknown
    edges: unknown
    isDraft: boolean
  },
): Record<string, unknown> & { sourceId: string } => ({
  sourceId: flow.id,
  // `findPreferredByFlowIds` returns the latest published version when there is
  // one and the draft otherwise, so a draft here means the flow was never live.
  published: !version.isDraft,
  name: flow.name,
  active: flow.active,
  enableInInbox: flow.enableInInbox,
  startNodeId: version.startNodeId,
  nodes: version.nodes as FlowExportedFlow["nodes"],
  edges: version.edges as FlowExportedFlow["edges"],
  folderId: flow.folderId,
})

export const flowCollector = makeCollector({
  findIds: (query) =>
    db.query.flowModel.findMany({
      where: scopedWhere(query),
      columns: { id: true },
      limit: query.limit,
    }),

  async collectRows(workspaceId, ids) {
    const rows = await db.query.flowModel.findMany({
      where: scopedWhere({ workspaceId, ids }),
      columns: {
        id: true,
        name: true,
        active: true,
        enableInInbox: true,
        folderId: true,
      },
    })
    // One query for every flow's published-or-draft version, not two per flow.
    const versions = await flowVersionRepository.findPreferredByFlowIds({
      workspaceId,
      flowIds: rows.map((flow) => flow.id),
    })
    const versionByFlowId = new Map(
      versions.map((version) => [version.flowId, version]),
    )
    const entries = rows.flatMap((flow) => {
      const version = versionByFlowId.get(flow.id)
      return version ? [buildFlowExportEntry(flow, version)] : []
    })

    // Account Fields a flow names (slots and `{{bot_field:<id>}}` tokens) are
    // collected for every category by `buildTemplateSnapshot`, not here.
    // A flow that subscribes a contact to a sequence, starts a questionnaire
    // or issues a coupon is useless without it, so what its steps name
    // travels with it.
    return {
      entries,
      folderIds: rows.flatMap((flow) => (flow.folderId ? [flow.folderId] : [])),
      productCategoryIds: collectReferencedProductCategoryIds(entries),
      hardDependencies: entries.flatMap((entry) =>
        collectResourceDependencies({
          nodes: entry.nodes,
          edges: entry.edges,
        }),
      ),
    }
  },
})
