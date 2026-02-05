import { CONTACT_EVENTS_EVENT_TYPE } from "@aha.chat/analytics"
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
  }
}
