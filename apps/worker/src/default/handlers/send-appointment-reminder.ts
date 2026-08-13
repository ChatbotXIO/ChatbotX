import { appointmentReminderService } from "@chatbotx.io/business"
import {
  type JobSendAppointmentReminderData,
  jobSendAppointmentReminderDataSchema,
} from "@chatbotx.io/worker-config"
import { normalizeError } from "universal-error-normalizer"
import { logger } from "../../lib/logger"

export async function sendAppointmentReminder(
  rawData: JobSendAppointmentReminderData,
) {
  const data = jobSendAppointmentReminderDataSchema.parse(rawData)

  try {
    return await appointmentReminderService.sendDispatch(data)
  } catch (error) {
    logger.error(
      {
        err: normalizeError(error),
        workspaceId: data.workspaceId,
        appointmentId: data.appointmentId,
        reminderDispatchId: data.reminderDispatchId,
        reminderConfigId: data.reminderConfigId,
      },
      "Appointment reminder dispatch failed",
    )
    throw error
  }
}
