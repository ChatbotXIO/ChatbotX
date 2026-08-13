import { appointmentReminderService } from "@chatbotx.io/business"
import { distributedLock } from "@chatbotx.io/redis"
import { scheduleJobScanAppointmentRemindersDataSchema } from "@chatbotx.io/worker-config"
import { logger } from "../../lib/logger"

const LOCK_TTL_SECONDS = 55

export async function scanAppointmentReminders(rawData: unknown = {}) {
  const data = scheduleJobScanAppointmentRemindersDataSchema.parse(rawData)

  return await distributedLock.runExclusive({
    key: "schedule:scan-appointment-reminders",
    timeoutInSeconds: LOCK_TTL_SECONDS,
    fn: async () => {
      const result = await appointmentReminderService.enqueueDuePending()

      if (result.enqueued > 0) {
        logger.info(
          { ...result, triggeredAt: data.triggeredAt },
          "Appointment reminder scanner enqueued due jobs",
        )
      }

      return result
    },
  })
}
