import type { DatabaseClient } from "@chatbotx.io/database/client"
import {
  appointmentCalendarRepository,
  appointmentReminderDispatchRepository,
  appointmentRepository,
} from "@chatbotx.io/database/repositories"
import type { AppointmentReminderDispatchModel } from "@chatbotx.io/database/types"
import { distributedLock } from "@chatbotx.io/redis"
import {
  DefaultJobAction,
  defaultQueue,
  IntegrationJobAction,
  integrationQueue,
  sendAppointmentReminderJobId,
} from "@chatbotx.io/worker-config"
import { subDays } from "date-fns"
import { fromZonedTime, toZonedTime } from "date-fns-tz"
import { normalizeError } from "universal-error-normalizer"
import { BaseService } from "../base.service"
import { logger } from "../logger"

const TIMING_UNIT_MS = {
  minutes: 60 * 1000,
  hours: 60 * 60 * 1000,
} as const

const SEND_REMINDER_REMOVE_ON_FAIL = true
const SEND_REMINDER_REMOVE_ON_COMPLETE = { age: 24 * 60 * 60, count: 10_000 }
const DUE_REMINDER_BATCH_SIZE = 100
const DISPATCH_LOCK_TTL_SECONDS = 30

export const calculateSendAt = (input: {
  startAt: Date
  timingValue: number
  timingUnit: keyof typeof TIMING_UNIT_MS | "days"
  timezone: string
}) => {
  if (input.timingUnit === "days") {
    return fromZonedTime(
      subDays(toZonedTime(input.startAt, input.timezone), input.timingValue),
      input.timezone,
    )
  }

  return new Date(
    input.startAt.getTime() -
      input.timingValue * TIMING_UNIT_MS[input.timingUnit],
  )
}

const reminderFlowJobId = (dispatchId: string) =>
  `appt-reminder-flow-${dispatchId}`

const normalizeFailedReason = (error: unknown) => {
  if (error instanceof Error) {
    return error.message.slice(0, 500)
  }
  return String(error).slice(0, 500)
}

class AppointmentReminderService extends BaseService {
  async listDispatches(
    input: Parameters<typeof appointmentReminderDispatchRepository.list>[0],
    tx?: DatabaseClient,
  ) {
    return await appointmentReminderDispatchRepository.list(input, tx)
  }

  async listDuePending(
    input: Parameters<
      typeof appointmentReminderDispatchRepository.listDuePending
    >[0],
    tx?: DatabaseClient,
  ) {
    return await appointmentReminderDispatchRepository.listDuePending(input, tx)
  }

  async scheduleForAppointment(input: {
    workspaceId: string
    appointmentId: string
    calendarId: string
    contactInboxId?: string | null
  }) {
    const [calendar, appointment] = await Promise.all([
      findCalendarForEdit({
        workspaceId: input.workspaceId,
        id: input.calendarId,
      }),
      txFindAppointment(input),
    ])

    if (appointment.status !== "scheduled") {
      return []
    }

    const now = new Date()
    const scheduled: AppointmentReminderDispatchModel[] = []
    for (const reminder of calendar.reminders) {
      const sendAt = calculateSendAt({
        startAt: appointment.startAt,
        timingValue: reminder.timingValue,
        timingUnit: reminder.timingUnit,
        timezone: calendar.timezone,
      })

      if (sendAt <= now) {
        continue
      }

      const jobId = sendAppointmentReminderJobId(
        input.appointmentId,
        reminder.id,
      )
      const dispatch =
        await appointmentReminderDispatchRepository.createPending({
          workspaceId: input.workspaceId,
          appointmentId: input.appointmentId,
          reminderConfigId: reminder.id,
          contactInboxId: input.contactInboxId,
          sendAt,
          jobId,
        })

      if (!dispatch) {
        continue
      }

      await this.enqueueDispatch({
        workspaceId: input.workspaceId,
        appointmentId: input.appointmentId,
        reminderConfigId: reminder.id,
        reminderDispatchId: dispatch.id,
        sendAt,
        jobId,
      })
      scheduled.push(dispatch)
    }

    return scheduled
  }

  async rescheduleFutureForCalendar(input: {
    workspaceId: string
    calendarId: string
    staleJobIds?: string[]
    now?: Date
  }) {
    const staleJobIds = [...new Set(input.staleJobIds ?? [])]
    const removals = await Promise.allSettled(
      staleJobIds.map((jobId) => defaultQueue.remove(jobId)),
    )
    const failedRemovals = removals.filter(
      (removal) => removal.status === "rejected",
    ).length
    if (failedRemovals > 0) {
      logger.warn(
        {
          workspaceId: input.workspaceId,
          calendarId: input.calendarId,
          failedRemovals,
        },
        "Failed to remove some stale appointment reminder jobs",
      )
    }

    const appointments =
      await appointmentRepository.listFutureScheduledByCalendar({
        workspaceId: input.workspaceId,
        calendarId: input.calendarId,
        now: input.now,
      })

    let dispatchesCreated = 0
    for (const appointment of appointments) {
      try {
        const dispatches = await this.scheduleForAppointment({
          workspaceId: input.workspaceId,
          calendarId: input.calendarId,
          appointmentId: appointment.id,
        })
        dispatchesCreated += dispatches.length
      } catch (error) {
        logger.warn(
          {
            err: normalizeError(error),
            workspaceId: input.workspaceId,
            calendarId: input.calendarId,
            appointmentId: appointment.id,
          },
          "Failed to reschedule appointment reminders",
        )
      }
    }

    const jobsRemoved = removals.length - failedRemovals
    logger.info(
      {
        workspaceId: input.workspaceId,
        calendarId: input.calendarId,
        appointmentsScanned: appointments.length,
        dispatchesCreated,
        jobsRemoved,
        failedRemovals,
      },
      "Rescheduled future appointment reminders for calendar",
    )

    return {
      appointmentsScanned: appointments.length,
      dispatchesCreated,
      jobsRemoved,
      failedRemovals,
    }
  }

  async cancelPendingForAppointment(input: {
    workspaceId: string
    appointmentId: string
  }) {
    const rows =
      await appointmentReminderDispatchRepository.markCancelledByAppointment(
        input,
      )

    const removals = await Promise.allSettled(
      rows.map((row) => defaultQueue.remove(row.jobId)),
    )
    const failedRemovals = removals.filter(
      (removal) => removal.status === "rejected",
    ).length
    if (failedRemovals > 0) {
      logger.warn(
        { appointmentId: input.appointmentId, failedRemovals },
        "Failed to remove some appointment reminder jobs",
      )
    }

    return rows
  }

  async enqueueDuePending(input: { now?: Date; limit?: number } = {}) {
    const dueRows = await appointmentReminderDispatchRepository.listDuePending({
      now: input.now ?? new Date(),
      limit: input.limit ?? DUE_REMINDER_BATCH_SIZE,
    })

    let enqueued = 0
    for (const row of dueRows) {
      await this.enqueueDispatch({
        workspaceId: row.workspaceId,
        appointmentId: row.appointmentId,
        reminderDispatchId: row.id,
        reminderConfigId: row.reminderConfigId,
        sendAt: row.sendAt,
        jobId: row.jobId,
      })
      enqueued += 1
    }

    return { scanned: dueRows.length, enqueued }
  }

  async sendDispatch(input: {
    workspaceId: string
    appointmentId: string
    reminderDispatchId: string
    reminderConfigId: string
  }) {
    return await distributedLock.runExclusive({
      key: `appointment-reminder-dispatch:${input.reminderDispatchId}`,
      timeoutInSeconds: DISPATCH_LOCK_TTL_SECONDS,
      fn: async () => {
        const dispatch =
          await appointmentReminderDispatchRepository.findForSend({
            workspaceId: input.workspaceId,
            id: input.reminderDispatchId,
            appointmentId: input.appointmentId,
            reminderConfigId: input.reminderConfigId,
          })

        if (dispatch?.status !== "pending") {
          return { sent: false, reason: "notPending" as const }
        }

        const { appointment } = dispatch
        if (
          appointment.status !== "scheduled" ||
          appointment.startAt <= new Date()
        ) {
          await appointmentReminderDispatchRepository.markCancelledByAppointment(
            {
              workspaceId: input.workspaceId,
              appointmentId: appointment.id,
              dispatchIds: [dispatch.id],
            },
          )
          return { sent: false, reason: "staleAppointment" as const }
        }

        if (!appointment.conversation) {
          await appointmentReminderDispatchRepository.markFailedForRetry({
            workspaceId: input.workspaceId,
            id: dispatch.id,
            failedReason: "Appointment has no conversation for reminder flow",
          })
          return { sent: false, reason: "missingConversation" as const }
        }

        const contactInbox =
          dispatch.contactInbox ?? appointment.conversation.contactInboxes[0]
        if (!contactInbox) {
          await appointmentReminderDispatchRepository.markFailedForRetry({
            workspaceId: input.workspaceId,
            id: dispatch.id,
            failedReason: "Appointment contact has no contact inbox",
          })
          return { sent: false, reason: "missingContactInbox" as const }
        }

        try {
          await integrationQueue.add(
            IntegrationJobAction.sendFlow,
            {
              type: IntegrationJobAction.sendFlow,
              data: {
                conversationId: appointment.conversation.id,
                contactInboxId: contactInbox.id,
                flowId: dispatch.reminderConfig.flowId,
                origin: "channel",
                appointmentId: input.appointmentId,
              },
            },
            {
              jobId: reminderFlowJobId(dispatch.id),
            },
          )
        } catch (error) {
          logger.error(
            {
              err: normalizeError(error),
              workspaceId: input.workspaceId,
              appointmentId: input.appointmentId,
              reminderDispatchId: input.reminderDispatchId,
            },
            "Failed to enqueue appointment reminder flow",
          )
          throw error
        }

        await appointmentReminderDispatchRepository.markSent({
          workspaceId: input.workspaceId,
          id: dispatch.id,
        })
        return { sent: true, reason: "sent" as const }
      },
    })
  }

  async markFailed(input: { workspaceId: string; id: string; error: unknown }) {
    return await appointmentReminderDispatchRepository.markFailedForRetry({
      workspaceId: input.workspaceId,
      id: input.id,
      failedReason: normalizeFailedReason(input.error),
    })
  }

  private async enqueueDispatch(input: {
    workspaceId: string
    appointmentId: string
    reminderDispatchId: string
    reminderConfigId: string
    sendAt: Date
    jobId: string
  }) {
    try {
      await defaultQueue.add(
        DefaultJobAction.sendAppointmentReminder,
        {
          type: DefaultJobAction.sendAppointmentReminder,
          data: {
            workspaceId: input.workspaceId,
            appointmentId: input.appointmentId,
            reminderDispatchId: input.reminderDispatchId,
            reminderConfigId: input.reminderConfigId,
          },
        },
        {
          delay: Math.max(0, input.sendAt.getTime() - Date.now()),
          jobId: input.jobId,
          removeOnComplete: SEND_REMINDER_REMOVE_ON_COMPLETE,
          removeOnFail: SEND_REMINDER_REMOVE_ON_FAIL,
        },
      )
    } catch (error) {
      logger.warn(
        {
          err: normalizeError(error),
          workspaceId: input.workspaceId,
          appointmentId: input.appointmentId,
          reminderDispatchId: input.reminderDispatchId,
        },
        "Failed to enqueue appointment reminder job; scanner will retry",
      )
    }
  }
}

export const appointmentReminderService = new AppointmentReminderService()

async function txFindAppointment(input: {
  workspaceId: string
  appointmentId: string
}) {
  const appointment = await appointmentRepository.findBy({
    workspaceId: input.workspaceId,
    id: input.appointmentId,
  })
  if (!appointment) {
    throw new Error("Appointment not found")
  }
  return appointment
}

async function findCalendarForEdit(input: { workspaceId: string; id: string }) {
  const calendar = await appointmentCalendarRepository.getForEdit(input)
  if (!calendar) {
    throw new Error("Appointment calendar not found")
  }
  return calendar
}
