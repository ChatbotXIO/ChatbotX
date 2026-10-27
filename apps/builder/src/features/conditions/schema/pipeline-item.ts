import { triggerEventTypes } from "@chatbotx.io/database/partials"
import { zodBigintAsString, zodBigintIdAsString } from "@chatbotx.io/utils"
import z from "zod"

const pipelineSourceId = z
  .union([zodBigintIdAsString(), z.literal("")])
  .nullish()
  .transform((pipelineId) => pipelineId || null)
  .describe(
    "Pipeline id (numeric string, from `pipelines.list`). Omit or null to fire for items of any pipeline.",
  )

const createPipelineItemCondition = <
  T extends (typeof pipelineItemEventTypes)[number],
>(
  type: T,
) =>
  z.object({
    id: zodBigintAsString()
      .optional()
      .describe(
        "Existing condition id (numeric string) when keeping a condition returned by `triggers.get`; omit for a new condition.",
      ),
    type: z.literal(type).describe(`Condition type "${type}".`),
    sourceId: pipelineSourceId,
  })

export const pipelineItemEventTypes = [
  triggerEventTypes.enum.pipelineItemCreated,
  triggerEventTypes.enum.pipelineItemMovedToStage,
  triggerEventTypes.enum.pipelineItemValueChanged,
  triggerEventTypes.enum.pipelineItemStatusChanged,
  triggerEventTypes.enum.pipelineItemPriorityChanged,
] as const

export type PipelineItemEventType = (typeof pipelineItemEventTypes)[number]

export const isPipelineItemEventType = (
  type: string | undefined,
): type is PipelineItemEventType =>
  type !== undefined &&
  (pipelineItemEventTypes as readonly string[]).includes(type)

export const pipelineItemCreated = createPipelineItemCondition(
  triggerEventTypes.enum.pipelineItemCreated,
)
export const pipelineItemValueChanged = createPipelineItemCondition(
  triggerEventTypes.enum.pipelineItemValueChanged,
)
export const pipelineItemStatusChanged = createPipelineItemCondition(
  triggerEventTypes.enum.pipelineItemStatusChanged,
)
export const pipelineItemPriorityChanged = createPipelineItemCondition(
  triggerEventTypes.enum.pipelineItemPriorityChanged,
)

/** Moved-to-stage may also be pinned to one destination stage via `value.stageId`. */
export const pipelineItemMovedToStage = createPipelineItemCondition(
  triggerEventTypes.enum.pipelineItemMovedToStage,
).extend({
  value: z
    .object({
      stageId: z
        .union([zodBigintIdAsString(), z.literal("")])
        .nullish()
        .transform((stageId) => stageId || null)
        .describe(
          "Destination stage id (from `pipelines.get`). Omit or null to fire for a move into any stage.",
        ),
    })
    .nullish()
    .describe("Optional destination-stage filter."),
})
