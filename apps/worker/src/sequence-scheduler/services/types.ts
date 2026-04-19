import type { db } from "@chatbotx.io/database/client"

export interface ConsumerConfig {
  groupId: string
  heartbeatInterval: number
  maxProcess: number
  maxWaitTimeInMs: number
  sessionTimeout: number
}

type DispatchQueryResult = Awaited<
  ReturnType<
    typeof db.query.sequenceDispatchModel.findFirst<{
      with: { sequence: true; contact: true; enrollment: true }
    }>
  >
>

export type DispatchWithRelations = NonNullable<DispatchQueryResult>

export type DispatchMessage = {
  dispatchId: string
  claimedAt: number
  bucket: number
}

export type ValidationResult =
  | { valid: true }
  | { valid: false; reason: string }
