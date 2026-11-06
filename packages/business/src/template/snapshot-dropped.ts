import type { TemplateResourceCategory } from "@chatbotx.io/database/partials"
import type { collectPipelineManifest } from "./adapters/manifests/collect-pipelines"
import { countDroppedResourceReferences } from "./dropped-references"
import { allEntries, type CollectedByCategory } from "./snapshot-collect"
import {
  countRowsWithUnshippedReferences,
  type TriggerConditionRow,
} from "./trigger-conditions"

/** The category each tracked reference kind ships under, for the dropped count. */
const SHIPPED_KIND_CATEGORY = {
  flow: "flows",
  trigger: "triggers",
  sequence: "sequences",
  aiAgent: "aiAgents",
  aiFunction: "aiFunctions",
  aiFile: "aiFiles",
  aiMcpServer: "aiMcpServers",
  calendar: "calendars",
  questionnaire: "questionnaires",
  couponTopic: "couponTopics",
  botField: "settings",
} as const satisfies Record<string, TemplateResourceCategory>

type ShippedPipeline = {
  sourceId: string
  stages?: readonly { sourceId: string }[]
  fields?: readonly { sourceId: string }[]
}

/**
 * Step 4: what an included resource names that the payload does not carry,
 * which the install removes (and reports as `referenceRemoved`): manifest ids
 * that no longer exist, trigger condition rows, and any other reference.
 */
export const countDroppedReferences = (input: {
  results: CollectedByCategory
  referenced: { tagIds: string[]; customFieldIds: string[] }
  foundTagIds: ReadonlySet<string>
  foundCustomFieldIds: ReadonlySet<string>
  triggerConditions: TriggerConditionRow[]
  pipelineManifest: Awaited<ReturnType<typeof collectPipelineManifest>>
  productCategoryIds: ReadonlySet<string>
  placeCategoryIds: ReadonlySet<string>
}): number => {
  const { results, pipelineManifest } = input
  const sourceIdsOf = (category: TemplateResourceCategory) =>
    new Set((results[category]?.entries ?? []).map((entry) => entry.sourceId))
  // A pipeline ships as the selected resource or through the manifest.
  const selectedPipelines = (results.pipelines?.entries ??
    []) as readonly ShippedPipeline[]
  const pipelines: readonly Pick<ShippedPipeline, "stages" | "fields">[] = [
    ...Object.values(pipelineManifest),
    ...selectedPipelines,
  ]
  const pipeline = new Set([
    ...Object.keys(pipelineManifest),
    ...selectedPipelines.map((row) => row.sourceId),
  ])
  const pipelineStage = new Set(
    pipelines.flatMap((row) =>
      (row.stages ?? []).map((stage) => stage.sourceId),
    ),
  )
  const pipelineField = new Set(
    pipelines.flatMap((row) =>
      (row.fields ?? []).map((field) => field.sourceId),
    ),
  )

  const droppedManifest =
    new Set(input.referenced.tagIds.filter((id) => !input.foundTagIds.has(id)))
      .size +
    new Set(
      input.referenced.customFieldIds.filter(
        (id) => !input.foundCustomFieldIds.has(id),
      ),
    ).size
  // Tags and custom fields are left out: the manifest count already includes
  // the ones condition rows name.
  const droppedConditionRows = countRowsWithUnshippedReferences(
    input.triggerConditions,
    {
      sequence: sourceIdsOf("sequences"),
      product: sourceIdsOf("products"),
      productCategory: input.productCategoryIds,
      pipeline,
      pipelineStage,
    },
  )
  const droppedResources = countDroppedResourceReferences(
    allEntries(results).map((entry) =>
      "conditions" in entry ? { ...entry, conditions: undefined } : entry,
    ),
    {
      ...(Object.fromEntries(
        Object.entries(SHIPPED_KIND_CATEGORY).map(([kind, category]) => [
          kind,
          sourceIdsOf(category),
        ]),
      ) as Record<keyof typeof SHIPPED_KIND_CATEGORY, Set<string>>),
      pipeline,
      pipelineStage,
      pipelineField,
      productCategory: input.productCategoryIds,
      placeCategory: input.placeCategoryIds,
    },
  )
  return droppedManifest + droppedConditionRows + droppedResources
}
