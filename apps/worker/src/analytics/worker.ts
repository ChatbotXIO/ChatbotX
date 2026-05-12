import { env } from "@chatbotx.io/analytics/key"
import { AnalyticsJobData, analyticsQueue } from "@chatbotx.io/worker-config"
import { Queue } from "bullmq"
import { createBullMQWorker } from "../lib/create-worker"
import { logger } from "../lib/logger"
import { ingestEvents } from "./handlers/ingest-events"
import { registerSchedules } from "./handlers/register-schedules"
import { syncEvents } from "./handlers/sync-events"

if (env.ANALYTICS_ENABLED) {
  if (analyticsQueue instanceof Queue) {
    registerSchedules().catch((err) => {
      logger.error(err, "Error registering schedules")
    })
  }

  await createBullMQWorker<AnalyticsJobData>({
    name: "analytics",
    label: "analytics",
    handlers: {
      [AnalyticsJobData.syncContact]: (_data, job) => syncEvents(job.data),
      [AnalyticsJobData.syncConversation]: (_data, job) => syncEvents(job.data),
      [AnalyticsJobData.syncBotMessage]: (_data, job) => syncEvents(job.data),
      [AnalyticsJobData.ingestContactEvents]: (_data, job) =>
        ingestEvents(job.data),
      [AnalyticsJobData.ingestBotMessageEvents]: (_data, job) =>
        ingestEvents(job.data),
      [AnalyticsJobData.ingestConversationEvents]: (_data, job) =>
        ingestEvents(job.data),
    },
  })
} else {
  logger.info("Analytics is disabled via ANALYTICS_ENABLED=false")
}
