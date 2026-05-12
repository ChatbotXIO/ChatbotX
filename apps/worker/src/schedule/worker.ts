import { ScheduleJobData, scheduleQueue } from "@chatbotx.io/worker-config"
import { Queue } from "bullmq"
import { createBullMQWorker } from "../lib/create-worker"
import { logger } from "../lib/logger"
import {
  cleanupTriggerExecutions,
  scanDateTimeTriggers,
} from "../trigger/datetime-trigger-scanner"
import { enqueueBroadcast } from "./handlers/enqueue-broadcast"
import { finalizeBroadcasts } from "./handlers/finalize-broadcasts"
import { prepareBroadcast } from "./handlers/prepare-broadcast"
import { processBroadcastContacts } from "./handlers/process-broadcast-contacts"
import { registerSchedules } from "./handlers/register-schedules"

if (scheduleQueue instanceof Queue) {
  registerSchedules()
    .then(() => {
      logger.info("Schedules registered")
    })
    .catch((err) => {
      logger.error(err, "Error registering schedules")
    })
}

await createBullMQWorker<ScheduleJobData>({
  name: "schedule",
  label: "schedule",
  handlers: {
    [ScheduleJobData.enqueueBroadcast]: () => enqueueBroadcast(),
    [ScheduleJobData.prepareBroadcast]: (data) =>
      prepareBroadcast(data.broadcastId),
    [ScheduleJobData.sendBroadcast]: () => processBroadcastContacts(),
    [ScheduleJobData.finalizeBroadcasts]: () => finalizeBroadcasts(),
    [ScheduleJobData.evaluateTriggers]: () => scanDateTimeTriggers(),
    [ScheduleJobData.cleanupTriggers]: () => cleanupTriggerExecutions(),
  },
})
