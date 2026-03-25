import type { db } from "@aha.chat/database/client"

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

type StepQueryResult = Awaited<
  ReturnType<
    typeof db.query.sequenceStepModel.findFirst<{
      with: { flow: true }
    }>
  >
>

export type StepWithRelations = NonNullable<StepQueryResult>

export type DispatchMessage = {
  dispatchId: string
  claimedAt: number
  bucket: number
}

export type ValidationResult =
  | { valid: true }
  | { valid: false; reason: string }

export type SequenceEventType =
  | "dispatch_completed"
  | "dispatch_failed"
  | "dispatch_retry_scheduled"
