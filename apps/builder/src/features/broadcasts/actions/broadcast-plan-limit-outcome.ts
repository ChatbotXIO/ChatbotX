import { broadcastPlanLimitDataSchema } from "@chatbotx.io/database/partials"
import { isBroadcastPlanLimitException } from "@/lib/errors/validation-exception"
import type { BroadcastPlanLimitOutcome } from "../lib/broadcast-plan-limit"

/** Turns a plan-limit exception into a typed outcome; all other errors keep propagating. */
export async function withBroadcastPlanLimitOutcome<T>(
  run: () => Promise<T>,
): Promise<T | BroadcastPlanLimitOutcome> {
  try {
    return await run()
  } catch (error) {
    if (!isBroadcastPlanLimitException(error)) {
      throw error
    }

    const parsed = broadcastPlanLimitDataSchema.safeParse(error.data)
    if (!parsed.success) {
      throw error
    }

    return { outcome: "planLimit", limit: parsed.data }
  }
}
