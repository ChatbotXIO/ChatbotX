import { db } from "@chatbotx.io/database/client"
import {
  collectReferencesByKind,
  type TemplateExport,
} from "@chatbotx.io/flow-config"

type PlaceCategoryManifest = TemplateExport["manifests"]["placeCategories"]

/**
 * Builds `manifests.placeCategories` for the Places Near Me categories the
 * exported flows filter by. Only names ship: a location is the publisher's own
 * address and never travels with a template.
 */
export const collectPlaceCategoryManifest = async (
  workspaceId: string,
  flows: readonly { nodes: readonly unknown[]; edges: readonly unknown[] }[],
): Promise<PlaceCategoryManifest> => {
  const ids = [
    ...new Set(
      flows.flatMap((flow) => [
        ...(collectReferencesByKind({ nodes: flow.nodes, edges: flow.edges }, [
          "placeCategory",
        ]).get("placeCategory") ?? []),
      ]),
    ),
  ]
  if (ids.length === 0) {
    return {}
  }
  const rows = await db.query.placeCategoryModel.findMany({
    where: { workspaceId, id: { in: ids } },
    columns: { id: true, name: true },
  })
  return Object.fromEntries(rows.map((row) => [row.id, { name: row.name }]))
}
