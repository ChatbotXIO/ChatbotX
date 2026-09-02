import {
  appointmentExternalCalendarService,
  appointmentService,
} from "@chatbotx.io/business"
import { logProviderError } from "@chatbotx.io/business/error-log"
import {
  type JobSyncExternalCalendarEventData,
  jobSyncExternalCalendarEventDataSchema,
} from "@chatbotx.io/worker-config"
import type { Job } from "bullmq"
import { normalizeError } from "universal-error-normalizer"
import { isFinalAttempt } from "../../lib/job-attempts"
import { logger } from "../../lib/logger"
import {
  cancelGoogleCalendarEvent,
  createGoogleCalendarEvent,
} from "../../services/appointment-external-calendar-provider"

const appointmentSummary = (input: { calendarName: string }) =>
  `Appointment: ${input.calendarName}`

export async function syncExternalCalendarEvent(
  rawData: JobSyncExternalCalendarEventData,
  job: Job,
) {
  const data = jobSyncExternalCalendarEventDataSchema.parse(rawData)
  const appointment = await appointmentService.findByOrFail({
    workspaceId: data.workspaceId,
    id: data.appointmentId,
    includeDeleted: true,
  })
  const externalConnectionId = appointment.calendar.externalConnectionId

  if (!externalConnectionId) {
    return
  }

  if (data.operation === "create" && appointment.status !== "scheduled") {
    await appointmentService.markExternalSyncSucceeded({
      workspaceId: data.workspaceId,
      appointmentId: data.appointmentId,
      externalEventId: appointment.externalEventId,
    })
    return
  }

  const connection =
    await appointmentExternalCalendarService.getGoogleConnectionForProviderCall(
      {
        workspaceId: data.workspaceId,
        integrationId: externalConnectionId,
      },
    )

  try {
    if (data.operation === "create") {
      const result = await createGoogleCalendarEvent({
        workspaceId: data.workspaceId,
        integrationId: externalConnectionId,
        calendarId: connection.providerCalendarId,
        summary: appointmentSummary({
          calendarName: appointment.calendar.name,
        }),
        location: appointment.locationDetail ?? undefined,
        startAt: appointment.startAt.toISOString(),
        endAt: appointment.endAt.toISOString(),
        timeZone: appointment.calendar.timezone,
        attendees: appointment.contact.email
          ? [{ email: appointment.contact.email }]
          : undefined,
      })

      await appointmentService.markExternalSyncSucceeded({
        workspaceId: data.workspaceId,
        appointmentId: data.appointmentId,
        externalEventId: result.eventId,
      })
      return
    }

    if (appointment.externalEventId) {
      await cancelGoogleCalendarEvent({
        workspaceId: data.workspaceId,
        integrationId: externalConnectionId,
        calendarId: connection.providerCalendarId,
        eventId: appointment.externalEventId,
      })
    }

    await appointmentService.markExternalSyncSucceeded({
      workspaceId: data.workspaceId,
      appointmentId: data.appointmentId,
      externalEventId: appointment.externalEventId,
    })
  } catch (error) {
    await appointmentService.markExternalSyncFailed({
      workspaceId: data.workspaceId,
      appointmentId: data.appointmentId,
    })
    logger.error(
      {
        err: normalizeError(error),
        workspaceId: data.workspaceId,
        appointmentId: data.appointmentId,
        operation: data.operation,
      },
      "External calendar event sync failed",
    )
    // Logged before the rethrow so BullMQ retry/dead-letter behaviour is
    // unchanged, and only once the retries are spent so one logical failure
    // does not write a row per attempt.
    if (isFinalAttempt(job)) {
      await logProviderError({
        provider: "google-calendar",
        workspaceId: data.workspaceId,
        error,
      })
    }
    throw error
  }
}
