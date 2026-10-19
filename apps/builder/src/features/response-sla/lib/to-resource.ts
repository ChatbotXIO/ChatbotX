import type { ResponseSlaPolicyModel } from "@chatbotx.io/database/types"
import type { ResponseSlaResource } from "../schema/resource"

export const toResponseSlaResource = (
  row: ResponseSlaPolicyModel,
): ResponseSlaResource => ({
  enabled: row.enabled,
  firstResponseTargetSeconds: row.firstResponseTargetSeconds,
  nextResponseTargetSeconds: row.nextResponseTargetSeconds,
  breachingThresholdPercent: row.breachingThresholdPercent,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
})
