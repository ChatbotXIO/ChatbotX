import {
  appointmentExternalCalendarService,
  appointmentService,
} from "@chatbotx.io/business"
import { logProviderError } from "@chatbotx.io/business/error-log"
import { distributedLock } from "@chatbotx.io/redis"
import {
  type JobSyncExternalCalendarEventData,
  jobSyncExternalCalendarEventDataSchema,
} from "@chatbotx.io/worker-config"
import { type Job, UnrecoverableError } from "bullmq"
import { normalizeError } from "universal-error-normalizer"
import { isFinalAttempt } from "../../lib/job-attempts"
import { logger } from "../../lib/logger"
import { renderAppointmentExternalCalendarEventTemplate } from "../../services/appointment-external-calendar-event-template"
import {
  cancelGoogleCalendarEvent,
  createDeterministicGoogleEventId,
  createGoogleCalendarEvent,
} from "../../services/appointment-external-calendar-provider"

const LOCK_TIMEOUT_SECONDS = 240

export async function syncExternalCalendarEvent(
  rawData: JobSyncExternalCalendarEventData,
  job: Job,
) {
  const data = jobSyncExternalCalendarEventDataSchema.parse(rawData)
  return await distributedLock.runExclusive({
    key: `appointment-external-calendar:${data.appointmentId}`,
    timeoutInSeconds: LOCK_TIMEOUT_SECONDS,
    fn: async () => await syncWithLock(data, job),
  })
}

async function syncWithLock(
  data: JobSyncExternalCalendarEventData,
  job: Job,
): Promise<void> {
  const appointment = await appointmentService.findByOrFail({
    workspaceId: data.workspaceId,
    id: data.appointmentId,
    includeDeleted: true,
  })

  if (data.operation === "create" && appointment.status !== "scheduled") {
    return
  }
  if (data.operation === "cancel" && appointment.status !== "cancelled") {
    return
  }

  try {
    const destination = await resolveDestination({ appointment, data })
    if (!destination) {
      return
    }

    if (data.operation === "create") {
      if (!appointment.contactInboxId) {
        throw new Error("appointment_external_event_contact_inbox_missing")
      }
      const rendered = await renderAppointmentExternalCalendarEventTemplate({
        appointmentId: appointment.id,
        contactId: appointment.contactId,
        contactInboxId: appointment.contactInboxId,
        conversation: appointment.conversation,
        contact: appointment.contact,
        calendar: appointment.calendar,
      })
      const eventId = createDeterministicGoogleEventId(appointment.id)
      await createGoogleCalendarEvent({
        workspaceId: data.workspaceId,
        integrationId: destination.integrationId,
        calendarId: destination.providerCalendarId,
        eventId,
        summary: rendered.summary,
        description: rendered.description,
        location: appointment.locationDetail ?? undefined,
        startAt: appointment.startAt.toISOString(),
        endAt: appointment.endAt.toISOString(),
        timeZone: appointment.calendar.timezone,
        attendees: rendered.attendees,
      })
      const updated =
        await appointmentService.markExternalCreateSucceededIfScheduled({
          workspaceId: data.workspaceId,
          appointmentId: appointment.id,
          externalEventId: eventId,
        })
      if (!updated) {
        await cancelGoogleCalendarEvent({
          workspaceId: data.workspaceId,
          integrationId: destination.integrationId,
          calendarId: destination.providerCalendarId,
          eventId,
        })
      }
      return
    }

    const eventId =
      appointment.externalEventId ??
      createDeterministicGoogleEventId(appointment.id)
    await cancelGoogleCalendarEvent({
      workspaceId: data.workspaceId,
      integrationId: destination.integrationId,
      calendarId: destination.providerCalendarId,
      eventId,
    })
    await appointmentService.markExternalCancelSucceededIfCancelled({
      workspaceId: data.workspaceId,
      appointmentId: appointment.id,
    })
  } catch (error) {
    if (isTemplateValidationError(error)) {
      await markFailed(data)
      throw new UnrecoverableError(error.message)
    }
    await markFailed(data)
    logger.error(
      {
        err: normalizeError(error),
        workspaceId: data.workspaceId,
        appointmentId: data.appointmentId,
        operation: data.operation,
        reason: "appointmentExternalCalendarSyncFailed",
      },
      "External calendar event sync failed",
    )
    if (isFinalAttempt(job)) {
      await logProviderError({
        provider: "google-calendar",
        workspaceId: data.workspaceId,
        // `appointment` is loaded workspace-scoped, so its `contactId` is
        // already validated — pass it so the row is linkable in the builder
        // table rather than showing an empty Contact column.
        contactId: appointment.contactId,
        // Nullable: `contactInboxId` is absent for appointments that predate
        // the column, which the create path guards against but cancel does not.
        sourceId: appointment.contactInbox?.sourceId,
        error,
      })
    }
    throw error
  }
}

async function resolveDestination(input: {
  data: JobSyncExternalCalendarEventData
  appointment: Awaited<ReturnType<typeof appointmentService.findByOrFail>>
}): Promise<{ integrationId: string; providerCalendarId: string } | null> {
  const { appointment, data } = input
  if (
    appointment.externalEventIntegrationId &&
    appointment.externalEventProviderCalendarId
  ) {
    return {
      integrationId: appointment.externalEventIntegrationId,
      providerCalendarId: appointment.externalEventProviderCalendarId,
    }
  }

  const integrationId = appointment.calendar.externalConnectionId
  if (!integrationId) {
    return null
  }
  if (data.operation === "cancel" && !appointment.externalEventId) {
    throw new Error("appointment_external_calendar_legacy_cancel_missing_event")
  }
  const connection =
    await appointmentExternalCalendarService.getGoogleConnectionForProviderCall(
      {
        workspaceId: data.workspaceId,
        integrationId,
      },
    )
  if (data.operation === "create") {
    const persisted =
      await appointmentService.persistExternalDestinationIfScheduled({
        workspaceId: data.workspaceId,
        appointmentId: appointment.id,
        integrationId,
        providerCalendarId: connection.providerCalendarId,
      })
    if (!persisted) {
      return null
    }
  }
  return { integrationId, providerCalendarId: connection.providerCalendarId }
}

async function markFailed(data: JobSyncExternalCalendarEventData) {
  if (data.operation === "create") {
    await appointmentService.markExternalCreateFailedIfScheduled({
      workspaceId: data.workspaceId,
      appointmentId: data.appointmentId,
    })
    return
  }
  await appointmentService.markExternalCancelFailedIfCancelled({
    workspaceId: data.workspaceId,
    appointmentId: data.appointmentId,
  })
}

function isTemplateValidationError(error: unknown): error is Error {
  return (
    error instanceof Error &&
    error.message.startsWith("appointment_external_event_")
  )
}
