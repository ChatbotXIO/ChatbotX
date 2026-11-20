import { miniAppRepository } from "@chatbotx.io/database/repositories"
import { isBigintId } from "@chatbotx.io/database/utils"
import { collectReferencesByKind } from "@chatbotx.io/flow-config"
import { collectResourceLinkDependencies } from "./resource-links"

/** A flow that names a Mini App the template leaves out because it is published to WhatsApp. */
export type MiniAppPublishedExclusion = {
  flowName: string
  miniAppName: string
}

type FlowLike = { sourceId: string; name?: unknown }

/** The Mini App ids a flow names: `miniAppId` slots and `mini-apps?id=` links. */
export const collectMiniAppIds = (flow: unknown): Set<string> => {
  const ids = new Set<string>(
    collectReferencesByKind(flow, ["miniApp"]).get("miniApp") ?? [],
  )
  for (const { category, sourceId } of collectResourceLinkDependencies(flow)) {
    if (category === "miniApps") {
      ids.add(sourceId)
    }
  }
  return new Set([...ids].filter(isBigintId))
}

/**
 * The flows that open or link a Mini App of this workspace which is left out
 * of the template because it is published to WhatsApp (such a Mini App is never
 * selectable nor pulled in). The install drops the reference, so the publisher
 * is told per flow and Mini App. One query for all of them.
 */
export const findMiniAppPublishedExclusions = async (
  workspaceId: string,
  flows: readonly FlowLike[],
  shippedMiniAppIds: ReadonlySet<string>,
): Promise<MiniAppPublishedExclusion[]> => {
  const idsByFlow = flows.map((flow) => ({
    flow,
    ids: [...collectMiniAppIds(flow)].filter(
      (id) => !shippedMiniAppIds.has(id),
    ),
  }))
  const allIds = [...new Set(idsByFlow.flatMap(({ ids }) => ids))]
  if (allIds.length === 0) {
    return []
  }
  const published = await miniAppRepository.listPublishedNamesByIds({
    workspaceId,
    ids: allIds,
  })
  const nameById = new Map(published.map((row) => [row.id, row.name]))
  return idsByFlow.flatMap(({ flow, ids }) =>
    ids.flatMap((id) => {
      const miniAppName = nameById.get(id)
      return miniAppName
        ? [
            {
              flowName:
                typeof flow.name === "string" ? flow.name : flow.sourceId,
              miniAppName,
            },
          ]
        : []
    }),
  )
}
