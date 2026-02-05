import { Queue } from "bullmq"
import {
  defaultJobOptions,
  fakeQueue,
  getRedisConnection,
} from "../../lib/connection"
import { queueName } from "../../lib/types"

export const AnalyticsJobData = {
  syncContact: "sync-contact",
  syncConversation: "sync-conversation",
  ingestContactEvents: "ingest-contact-events",
} as const

export type AnalyticsJob = {
  type:
    | typeof AnalyticsJobData.syncContact
    | typeof AnalyticsJobData.syncConversation
    | typeof AnalyticsJobData.ingestContactEvents
  data: {
    type: "contact_events"
  }
}

export type AnalyticsJobData = AnalyticsJob

export const analyticsQueue =
  process.env.NEXT_PHASE !== "phase-production-build"
    ? new Queue<AnalyticsJobData>(queueName.analytics, {
        connection: getRedisConnection(),
        defaultJobOptions,
      })
    : fakeQueue
