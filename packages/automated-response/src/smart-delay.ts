import { isSmartResponseDelayOption } from "@chatbotx.io/database/partials"
import type { WorkspaceModel } from "@chatbotx.io/database/types"
import { env } from "./keys"

type AutomatedResponseTiming = {
  delaySeconds: number
  ttlSeconds: number
}

export type AutomatedResponseDelayEligibility = {
  workspaceDelay: unknown
  matchesKeyword: boolean
  hasAiAgent: boolean
}

export const isSmartDelayEligible = (
  input: AutomatedResponseDelayEligibility,
): boolean =>
  isSmartResponseDelayOption(input.workspaceDelay) &&
  !input.matchesKeyword &&
  input.hasAiAgent

export const resolveAutomatedResponseTiming = (
  workspace:
    | Pick<WorkspaceModel, "smartResponseDelaySeconds">
    | null
    | undefined,
): AutomatedResponseTiming => {
  const configuredDelaySeconds = workspace?.smartResponseDelaySeconds

  if (isSmartResponseDelayOption(configuredDelaySeconds)) {
    return {
      delaySeconds: configuredDelaySeconds,
      ttlSeconds: configuredDelaySeconds,
    }
  }

  // Preserve v1 behavior for None, unknown stored values, and lookup failures.
  return {
    delaySeconds: env.AUTOMATED_RESPONSE_DELAY_SECONDS,
    ttlSeconds: env.AUTOMATED_RESPONSE_TTL_SECONDS,
  }
}
