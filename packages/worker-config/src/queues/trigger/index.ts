import { defineQueue } from "../../lib/define-queue"

export const TriggerJobAction = {
  executeTrigger: "executeTrigger",
  evaluateTriggers: "evaluateTriggers",
} as const

export type TriggerEvent = {
  workspaceId: string
  contactId: string
  eventType: string
  eventData: Record<string, unknown>
  timestamp: Date
  source?: string
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

export const triggerQueue = defineQueue<TriggerJobData>("trigger")
