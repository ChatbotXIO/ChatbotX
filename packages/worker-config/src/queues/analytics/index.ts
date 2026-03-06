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
  syncBotMessage: "sync-bot-message",
  ingestContactEvents: "ingest-contact-events",
  ingestBotMessageEvents: "ingest-bot-message-events",
  ingestConversationEvents: "ingest-conversation-events",
} as const

export type AnalyticsJob = {
  type:
    | typeof AnalyticsJobData.syncContact
    | typeof AnalyticsJobData.syncConversation
    | typeof AnalyticsJobData.syncBotMessage
    | typeof AnalyticsJobData.ingestContactEvents
    | typeof AnalyticsJobData.ingestBotMessageEvents
    | typeof AnalyticsJobData.ingestConversationEvents
  data: {
    type: "contact_events" | "bot_message_events" | "conversation_events"
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
