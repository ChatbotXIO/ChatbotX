import type { TriggerEventType } from "@chatbotx.io/database/partials"
import { Queue } from "bullmq"
import {
  defaultJobOptions,
  fakeQueue,
  getRedisConnection,
} from "../../lib/connection"
import { queueNames } from "../../lib/types"

export const TriggerJobAction = {
  executeTrigger: "executeTrigger",
  evaluateTriggers: "evaluateTriggers",
} as const

export type TriggerEvent = {
  workspaceId: string
  contactId: string
  eventType: TriggerEventType
  eventData: Record<string, unknown>
  timestamp: Date
  source?: string
  channelOriginated?: boolean
}

export type TriggerJobExecute = {
  type: typeof TriggerJobAction.executeTrigger
  data: {
    triggerId: string
    contactId: string
    workspaceId: string
    eventData: Record<string, unknown>
  }
}

export type TriggerJobEvaluate = {
  type: typeof TriggerJobAction.evaluateTriggers
  data: TriggerEvent
}

export type TriggerJobData = TriggerJobExecute | TriggerJobEvaluate

export const triggerQueue =
  process.env.NEXT_PHASE === "phase-production-build"
    ? fakeQueue
    : new Queue<TriggerJobData>(queueNames.enum.trigger, {
        connection: getRedisConnection(),
        defaultJobOptions,
      })
