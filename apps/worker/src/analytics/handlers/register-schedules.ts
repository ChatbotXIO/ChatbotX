import {
  BOT_MESSAGE_EVENTS_EVENT_TYPE,
  CONTACT_EVENTS_EVENT_TYPE,
  CONVERSATION_EVENTS_EVENT_TYPE,
} from "@aha.chat/analytics"
import { AnalyticsJobData, analyticsQueue } from "@aha.chat/worker-config"
import { Queue } from "bullmq"

export const registerSchedules = async () => {
  if (analyticsQueue instanceof Queue) {
    await analyticsQueue.upsertJobScheduler(
      AnalyticsJobData.syncContact,
      {
        every: 10_000,
      },
      {
        name: AnalyticsJobData.syncContact,
        data: {
          type: AnalyticsJobData.syncContact,
          data: {
            type: CONTACT_EVENTS_EVENT_TYPE,
          },
        },
      },
    )

    await analyticsQueue.upsertJobScheduler(
      AnalyticsJobData.syncBotMessage,
      {
        every: 10_000,
      },
      {
        name: AnalyticsJobData.syncBotMessage,
        data: {
          type: AnalyticsJobData.syncBotMessage,
          data: {
            type: BOT_MESSAGE_EVENTS_EVENT_TYPE,
          },
        },
      },
    )

    await analyticsQueue.upsertJobScheduler(
      AnalyticsJobData.ingestContactEvents,
      {
        every: 10_000,
      },
      {
        name: AnalyticsJobData.ingestContactEvents,
        data: {
          type: AnalyticsJobData.ingestContactEvents,
          data: {
            type: CONTACT_EVENTS_EVENT_TYPE,
          },
        },
      },
    )

    await analyticsQueue.upsertJobScheduler(
      AnalyticsJobData.ingestBotMessageEvents,
      {
        every: 10_000,
      },
      {
        name: AnalyticsJobData.ingestBotMessageEvents,
        data: {
          type: AnalyticsJobData.ingestBotMessageEvents,
          data: {
            type: BOT_MESSAGE_EVENTS_EVENT_TYPE,
          },
        },
      },
    )

    await analyticsQueue.upsertJobScheduler(
      AnalyticsJobData.syncConversation,
      {
        every: 10_000,
      },
      {
        name: AnalyticsJobData.syncConversation,
        data: {
          type: AnalyticsJobData.syncConversation,
          data: {
            type: CONVERSATION_EVENTS_EVENT_TYPE,
          },
        },
      },
    )

    await analyticsQueue.upsertJobScheduler(
      AnalyticsJobData.ingestConversationEvents,
      {
        every: 10_000,
      },
      {
        name: AnalyticsJobData.ingestConversationEvents,
        data: {
          type: AnalyticsJobData.ingestConversationEvents,
          data: {
            type: CONVERSATION_EVENTS_EVENT_TYPE,
          },
        },
      },
    )
  }
}
