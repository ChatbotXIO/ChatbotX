import { triggerEventTypes } from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import z from "zod"

/**
 * Lifecycle stage change condition.
 *
 * Semantics:
 *  - `sourceId` is the destination stage id.
 *    - empty string / undefined → any destination (fire on any stage change)
 *    - specific id → fire only when contact moves TO that stage
 *  - `value.fromStageId` (optional) is the origin stage id.
 *    - empty string / undefined → any origin
 *    - specific id → fire only when contact moved FROM that stage
 *
 * Combining both lets the user model "from X to Y", "from any to Y", "from X
 * to any", or "any change at all".
 */
export const lifecycleStageChanged = z.object({
  id: zodBigintAsString().optional(),
  type: z.literal(triggerEventTypes.enum.lifecycleStageChanged),
  sourceId: z.string().optional(),
  value: z
    .object({
      fromStageId: z.string().optional(),
    })
    .optional(),
})
export type LifecycleStageChanged = z.infer<typeof lifecycleStageChanged>

export const defaultFn = (): LifecycleStageChanged => ({
  type: triggerEventTypes.enum.lifecycleStageChanged,
  sourceId: "",
  value: { fromStageId: "" },
})
export type DefaultFn = typeof defaultFn
