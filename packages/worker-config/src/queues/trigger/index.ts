import { Queue } from "bullmq"
import {
  defaultJobOptions,
  fakeQueue,
  getRedisConnection,
} from "../../lib/connection"
import { queueName } from "../../lib/types"

export const TriggerJobAction = {
  executeTrigger: "executeTrigger",
  evaluateTriggers: "evaluateTriggers",
} as const

export type TriggerEvent = {
  chatbotId: string
  contactId: string
  eventType: number
  eventData: Record<string, unknown>
  timestamp: Date
  source?: string
}

export type TriggerJobExecute = {
  type: typeof TriggerJobAction.executeTrigger
  data: {
    triggerId: string
    contactId: string
    chatbotId: string
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
    : new Queue<TriggerJobData>(queueName.trigger, {
        connection: getRedisConnection(),
        defaultJobOptions,
      })
