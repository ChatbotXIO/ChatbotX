import { type DatabaseClient, db, sql } from "@chatbotx.io/database/client"
import {
  type AppointmentListTab,
  appointmentRepository,
} from "@chatbotx.io/database/repositories"
import {
  type AppointmentWebviewPayload,
  signAppointmentCancelToken,
  signAppointmentScheduleToken,
} from "@chatbotx.io/encryption"
import type { MetadataPayload } from "@chatbotx.io/flow-config"
import type { MessageButtonTemplate } from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import {
  ChatJobAction,
  chatQueue,
  DefaultJobAction,
  defaultQueue,
  IntegrationJobAction,
  integrationQueue,
  syncExternalCalendarEventJobId,
} from "@chatbotx.io/worker-config"
import { formatInTimeZone } from "date-fns-tz"
import { normalizeError } from "universal-error-normalizer"
import {
  appointmentCalendarService,
  matchesAvailabilityFingerprint,
} from "../appointment-calendar"
import { appointmentReminderService } from "../appointment-reminder"
import { BaseService } from "../base.service"
import { contactInboxService } from "../contact-inbox/service"
import { normalizeLanguage } from "../contact-locale"
import { ChatbotXException, notFoundException } from "../errors"
import { logger } from "../logger"

export class SlotUnavailableException extends ChatbotXException {
  constructor() {
    super("Appointment slot is unavailable", "slotUnavailable", 409)
  }
}

export class AppointmentAvailabilityChangedException extends ChatbotXException {
  constructor() {
    super(
      "Appointment calendar availability changed. Please try again.",
      "appointmentAvailabilityChanged",
      409,
    )
  }
}

export class AppointmentAlreadyScheduledException extends ChatbotXException {
  constructor() {
    super(
      "Contact already has a scheduled appointment for this calendar",
      "appointmentAlreadyScheduled",
      409,
    )
  }
}

export class AmbiguousCancelException extends ChatbotXException {
  constructor(count: number) {
    super(
      `Expected exactly one future appointment to cancel, found ${count}`,
      "ambiguousAppointmentCancel",
      409,
    )
  }
}

type FlowContinuationInput = {
  contactInboxId?: string
  flowVersionId?: string
  metadata?: MetadataPayload
}

type CancelSideEffectsInput = {
  workspaceId: string
  appointmentId: string
  conversationId?: string | null
  contactInboxId?: string
  flowVersionId?: string
  metadata?: MetadataPayload
  externalConnectionId?: string | null
  cancellationFlowId?: string | null
}

const lockAppointmentSlot = async (
  tx: DatabaseClient,
  input: { workspaceId: string; calendarId: string; startAt: Date },
) => {
  const lockKey = `appointment:${input.workspaceId}:${input.calendarId}:${input.startAt.toISOString()}`
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`,
  )
}

const lockAppointmentCap = async (
  tx: DatabaseClient,
  input: { workspaceId: string; calendarId: string; contactId: string },
) => {
  const lockKey = `appointment-cap:${input.workspaceId}:${input.calendarId}:${input.contactId}`
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`,
  )
}

const lockAppointmentDay = async (
  tx: DatabaseClient,
  input: { workspaceId: string; calendarId: string; dateKey: string },
) => {
  const lockKey = `appointment-day:${input.workspaceId}:${input.calendarId}:${input.dateKey}`
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`,
  )
}

const isSameInstant = (left: Date, right: Date) =>
  left.getTime() === right.getTime()

const MAX_AVAILABILITY_SLOTS_IN_TEXT = 30

const formatAvailabilityText = (
  slots: { startAt: Date; endAt: Date }[],
  timezone: string,
) =>
  slots
    .slice(0, MAX_AVAILABILITY_SLOTS_IN_TEXT)
    .map((slot) =>
      formatInTimeZone(slot.startAt, timezone, "yyyy-MM-dd hh:mm:ss a"),
    )
    .join(", ")

class AppointmentService extends BaseService {
  async findBy(
    input: { workspaceId: string; id: string; includeDeleted?: boolean },
    tx?: DatabaseClient,
  ) {
    return await appointmentRepository.findBy(input, tx)
  }

  async list(
    input: {
      workspaceId: string
      calendarId?: string
      tab?: AppointmentListTab
      search?: string | null
      page?: number
      perPage?: number
      appUrl: string
    },
    tx?: DatabaseClient,
  ) {
    const now = new Date()
    const result = await appointmentRepository.list(
      {
        workspaceId: input.workspaceId,
        calendarId: input.calendarId,
        tab: input.tab ?? "next",
        search: input.search,
        page: input.page,
        perPage: input.perPage,
      },
      tx,
    )
    const data = await Promise.all(
      result.data.map(async (appointment) => {
        const scheduleToken = await signAppointmentScheduleToken({
          appointmentId: appointment.id,
          workspaceId: appointment.workspaceId,
          contactId: appointment.contactId,
          conversationId: appointment.conversationId ?? undefined,
        })
        const cancellable =
          appointment.status === "scheduled" && appointment.startAt > now

        return {
          ...appointment,
          contactName: getAppointmentContactName(appointment),
          scheduleUrl: buildAppointmentUrl(
            input.appUrl,
            "/booking/schedule",
            scheduleToken,
          ),
          cancellable,
          deletable: !cancellable,
        }
      }),
    )

    return {
      ...result,
      data,
    }
  }

  async listContactAppointments(input: {
    workspaceId: string
    contactId: string
    limit?: number
  }) {
    return await appointmentRepository.listByContact(input)
  }

  async hasFutureScheduledAppointmentForContact(
    input: { workspaceId: string; calendarId: string; contactId: string },
    tx?: DatabaseClient,
  ) {
    const appointments =
      await appointmentRepository.listFutureScheduledForContact(input, tx)
    return appointments.length > 0
  }

  async findByOrFail(
    input: { workspaceId: string; id: string; includeDeleted?: boolean },
    tx?: DatabaseClient,
  ) {
    const appointment = await this.findBy(input, tx)
    if (!appointment) {
      throw notFoundException("Appointment not found")
    }
    return appointment
  }

  async bookAppointment(input: {
    workspaceId: string
    calendarId: string
    contactId: string
    conversationId?: string | null
    contactInboxId?: string
    startAt: Date
    inviteeTimezone?: string
    flowVersionId?: string
    metadata?: MetadataPayload
  }) {
    const availabilityContext =
      await appointmentCalendarService.prepareAvailabilityContext({
        workspaceId: input.workspaceId,
        calendarId: input.calendarId,
        startDate: input.startAt,
        endDate: input.startAt,
        failurePolicy: "throw",
      })

    const { appointment, calendar } = await db.transaction(async (tx) => {
      await lockAppointmentSlot(tx, input)
      const calendar = await appointmentCalendarService.findByOrFail(
        {
          workspaceId: input.workspaceId,
          id: input.calendarId,
        },
        tx,
      )

      if (!calendar.active) {
        throw new SlotUnavailableException()
      }

      if (
        !matchesAvailabilityFingerprint(
          calendar,
          availabilityContext.calendarFingerprint,
        )
      ) {
        throw new AppointmentAvailabilityChangedException()
      }

      await lockAppointmentCap(tx, input)
      if (await this.hasFutureScheduledAppointmentForContact(input, tx)) {
        throw new AppointmentAlreadyScheduledException()
      }

      if (calendar.dailyLimitEnabled && calendar.maxPerDay != null) {
        // Keep multi-lock acquisition ordered: slot -> cap -> day.
        await lockAppointmentDay(tx, {
          workspaceId: input.workspaceId,
          calendarId: input.calendarId,
          dateKey: formatInTimeZone(
            input.startAt,
            calendar.timezone,
            "yyyy-MM-dd",
          ),
        })
      }

      const requestedSlotEndAt = new Date(
        input.startAt.getTime() + calendar.durationMinutes * 60 * 1000,
      )
      if (
        await appointmentCalendarService.hasExternalBusyConflictForSlot({
          workspaceId: input.workspaceId,
          calendarId: input.calendarId,
          externalConnectionId: calendar.externalConnectionId,
          startAt: input.startAt,
          endAt: requestedSlotEndAt,
        })
      ) {
        throw new SlotUnavailableException()
      }

      const slots = await appointmentCalendarService.generateAvailableSlots({
        workspaceId: input.workspaceId,
        calendarId: input.calendarId,
        contactId: input.contactId,
        startDate: input.startAt,
        endDate: input.startAt,
        externalBusyIntervals: availabilityContext.externalBusyIntervals,
        tx,
      })
      const slot = slots.find((item) =>
        isSameInstant(item.startAt, input.startAt),
      )
      if (!slot) {
        throw new SlotUnavailableException()
      }

      const appointment = await appointmentRepository.create(
        {
          workspaceId: input.workspaceId,
          calendarId: input.calendarId,
          contactId: input.contactId,
          conversationId: input.conversationId,
          startAt: slot.startAt,
          endAt: slot.endAt,
          inviteeTimezone: input.inviteeTimezone ?? calendar.timezone,
          locationType: calendar.locationType,
          locationDetail: calendar.locationDetail,
          externalSyncStatus: calendar.externalConnectionId ? "pending" : null,
        },
        tx,
      )

      return { appointment, calendar }
    })

    await this.enqueueExternalSyncIfNeeded({
      workspaceId: input.workspaceId,
      appointmentId: appointment.id,
      operation: "create",
      externalConnectionId: calendar.externalConnectionId,
    })
    try {
      await appointmentReminderService.scheduleForAppointment({
        workspaceId: input.workspaceId,
        appointmentId: appointment.id,
        calendarId: appointment.calendarId,
        contactInboxId: input.contactInboxId,
      })
    } catch (error) {
      logger.warn(
        {
          err: normalizeError(error),
          workspaceId: input.workspaceId,
          appointmentId: appointment.id,
          calendarId: appointment.calendarId,
        },
        "Failed to schedule appointment reminders",
      )
    }
    await this.enqueueCalendarFlowIfNeeded({
      workspaceId: input.workspaceId,
      conversationId: input.conversationId,
      contactInboxId: input.contactInboxId,
      flowId: calendar.confirmationFlowId,
      flowVersionId: input.flowVersionId,
      metadata: input.metadata,
    })

    return appointment
  }

  async completeWebviewBooking(input: {
    tokenPayload: AppointmentWebviewPayload
    selectedStartAt: Date
    inviteeTimezone: string
    appUrl: string
  }) {
    await this.assertSelectedSlotInTokenRange(input)

    const appointment = await this.bookAppointment({
      workspaceId: input.tokenPayload.workspaceId,
      calendarId: input.tokenPayload.calendarId,
      contactId: input.tokenPayload.contactId,
      conversationId: input.tokenPayload.conversationId,
      contactInboxId: input.tokenPayload.contactInboxId,
      startAt: input.selectedStartAt,
      inviteeTimezone: input.inviteeTimezone,
    })
    const fullAppointment = await this.findByOrFail({
      workspaceId: input.tokenPayload.workspaceId,
      id: appointment.id,
    })
    const tokenPayload = {
      appointmentId: fullAppointment.id,
      workspaceId: fullAppointment.workspaceId,
      contactId: fullAppointment.contactId,
      conversationId: fullAppointment.conversationId ?? undefined,
      contactInboxId: input.tokenPayload.contactInboxId,
      flowVersionId: input.tokenPayload.flowVersionId,
    }
    const [scheduleToken, cancelToken] = await Promise.all([
      signAppointmentScheduleToken(tokenPayload),
      signAppointmentCancelToken(tokenPayload),
    ])
    const scheduleUrl = buildAppointmentUrl(
      input.appUrl,
      "/booking/schedule",
      scheduleToken,
    )
    const cancelUrl = buildAppointmentUrl(
      input.appUrl,
      "/booking/cancel",
      cancelToken,
    )

    await this.enqueueWebviewBookingConfirmation({
      appointment: fullAppointment,
      contactInboxId: input.tokenPayload.contactInboxId,
      scheduleUrl,
    })

    return {
      appointment: fullAppointment,
      scheduleUrl,
      cancelUrl,
    }
  }

  private async assertSelectedSlotInTokenRange(input: {
    tokenPayload: AppointmentWebviewPayload
    selectedStartAt: Date
  }) {
    if (
      !(
        input.tokenPayload.availabilityStartAt &&
        input.tokenPayload.availabilityEndAt
      )
    ) {
      return
    }

    const calendar = await appointmentCalendarService.findByOrFail({
      workspaceId: input.tokenPayload.workspaceId,
      id: input.tokenPayload.calendarId,
    })
    const selectedEndAt = new Date(
      input.selectedStartAt.getTime() + calendar.durationMinutes * 60 * 1000,
    )
    const rangeStartAt = new Date(input.tokenPayload.availabilityStartAt)
    const rangeEndAt = new Date(input.tokenPayload.availabilityEndAt)

    if (input.selectedStartAt < rangeStartAt || selectedEndAt > rangeEndAt) {
      throw new SlotUnavailableException()
    }
  }

  async cancelAppointment(input: {
    workspaceId: string
    calendarId: string
    contactId: string
    conversationId?: string | null
    contactInboxId?: string
    flowVersionId?: string
    metadata?: MetadataPayload
  }) {
    const appointment = await db.transaction(async (tx) => {
      const rows = await appointmentRepository.listFutureScheduledForContact(
        input,
        tx,
      )

      if (rows.length !== 1) {
        throw new AmbiguousCancelException(rows.length)
      }

      const row = rows[0]
      const updated = await appointmentRepository.cancelScheduled(
        {
          workspaceId: input.workspaceId,
          id: row.id,
          cancelledAt: new Date(),
          externalSyncStatus: getCancellationExternalSyncStatus(row),
        },
        tx,
      )

      if (!updated) {
        throw notFoundException("Appointment not found")
      }

      return { ...updated, calendar: row.calendar }
    })

    await this.applyCancellationSideEffects({
      workspaceId: input.workspaceId,
      appointmentId: appointment.id,
      conversationId: input.conversationId,
      contactInboxId: input.contactInboxId,
      flowVersionId: input.flowVersionId,
      metadata: input.metadata,
      externalConnectionId: appointment.calendar.externalConnectionId,
      cancellationFlowId: appointment.calendar.cancellationFlowId,
    })

    return appointment
  }

  async getScheduleDetailByToken(input: {
    workspaceId: string
    appointmentId: string
    contactId: string
  }) {
    const appointment = await this.findOwnedAppointmentOrFail(input)
    const now = new Date()
    const nameFromParts = [
      appointment.contact.firstName,
      appointment.contact.lastName,
    ]
      .filter(Boolean)
      .join(" ")
    const contactName =
      (appointment.contact.fullName ?? nameFromParts) ||
      appointment.contact.email ||
      appointment.contact.phoneNumber ||
      null

    return {
      id: appointment.id,
      workspaceId: appointment.workspaceId,
      contactId: appointment.contactId,
      conversationId: appointment.conversationId,
      calendarName: appointment.calendar.name,
      contactName,
      startAt: appointment.startAt,
      endAt: appointment.endAt,
      inviteeTimezone: appointment.inviteeTimezone,
      status: appointment.status,
      locationType: appointment.locationType,
      locationDetail: appointment.locationDetail,
      confirmationMessage: appointment.calendar.confirmationMessage,
      cancellable:
        appointment.status === "scheduled" && appointment.startAt > now,
    }
  }

  async cancelAppointmentByToken(input: {
    workspaceId: string
    appointmentId: string
    contactId: string
    contactInboxId?: string
    flowVersionId?: string
  }) {
    const result = await db.transaction(async (tx) => {
      const appointment = await this.findOwnedAppointmentOrFail(input, tx)
      if (
        appointment.status !== "scheduled" ||
        appointment.startAt <= new Date()
      ) {
        return { cancellable: false, appointment }
      }

      const updated = await appointmentRepository.cancelScheduled(
        {
          workspaceId: input.workspaceId,
          id: input.appointmentId,
          cancelledAt: new Date(),
          externalSyncStatus: getCancellationExternalSyncStatus(appointment),
        },
        tx,
      )

      if (!updated) {
        return { cancellable: false, appointment }
      }

      return {
        cancellable: true,
        appointment: { ...updated, calendar: appointment.calendar },
      }
    })

    if (result.cancellable) {
      await this.applyCancellationSideEffects({
        workspaceId: input.workspaceId,
        appointmentId: result.appointment.id,
        conversationId: result.appointment.conversationId,
        contactInboxId: input.contactInboxId,
        flowVersionId: input.flowVersionId,
        externalConnectionId: result.appointment.calendar.externalConnectionId,
        cancellationFlowId: result.appointment.calendar.cancellationFlowId,
      })
    }

    return result
  }

  async cancelAppointmentById(input: {
    workspaceId: string
    appointmentId: string
  }) {
    const appointment = await db.transaction(async (tx) => {
      const row = await this.findByOrFail(
        {
          workspaceId: input.workspaceId,
          id: input.appointmentId,
        },
        tx,
      )
      if (row.status !== "scheduled" || row.startAt <= new Date()) {
        throw new ChatbotXException(
          "Appointment cannot be cancelled",
          "appointmentNotCancellable",
          409,
        )
      }

      const updated = await appointmentRepository.cancelScheduled(
        {
          workspaceId: input.workspaceId,
          id: input.appointmentId,
          cancelledAt: new Date(),
          externalSyncStatus: getCancellationExternalSyncStatus(row),
        },
        tx,
      )

      if (!updated) {
        throw notFoundException("Appointment not found")
      }

      return { ...updated, calendar: row.calendar }
    })

    await this.applyCancellationSideEffects({
      workspaceId: input.workspaceId,
      appointmentId: appointment.id,
      conversationId: appointment.conversationId,
      externalConnectionId: appointment.calendar.externalConnectionId,
      cancellationFlowId: appointment.calendar.cancellationFlowId,
    })

    return appointment
  }

  async deleteAppointmentById(input: {
    workspaceId: string
    appointmentId: string
  }) {
    return await db.transaction(async (tx) => {
      const appointment = await this.findByOrFail(
        {
          workspaceId: input.workspaceId,
          id: input.appointmentId,
        },
        tx,
      )
      if (
        appointment.status === "scheduled" &&
        appointment.startAt > new Date()
      ) {
        throw new ChatbotXException(
          "Cancel upcoming appointments before deleting them",
          "appointmentDeleteBlocked",
          409,
        )
      }

      const deleted = await appointmentRepository.softDelete(
        {
          workspaceId: input.workspaceId,
          id: input.appointmentId,
          deletedAt: new Date(),
        },
        tx,
      )

      if (!deleted) {
        throw notFoundException("Appointment not found")
      }

      return deleted
    })
  }

  async checkAvailability(input: {
    workspaceId: string
    calendarId: string
    contactId?: string
    startDate: Date
    endDate: Date
  }): Promise<{ text: string; slots: { startAt: Date; endAt: Date }[] }> {
    const calendar = await appointmentCalendarService.findByOrFail({
      workspaceId: input.workspaceId,
      id: input.calendarId,
    })
    const slots =
      await appointmentCalendarService.resolveAvailableSlotsForListing(input)

    return {
      text: formatAvailabilityText(slots, calendar.timezone),
      slots,
    }
  }

  async markExternalSyncSucceeded(input: {
    workspaceId: string
    appointmentId: string
    externalEventId?: string | null
  }) {
    return await appointmentRepository.update({
      workspaceId: input.workspaceId,
      id: input.appointmentId,
      externalEventId: input.externalEventId,
      externalSyncStatus: "synced",
    })
  }

  async markExternalSyncFailed(input: {
    workspaceId: string
    appointmentId: string
  }) {
    return await appointmentRepository.update({
      workspaceId: input.workspaceId,
      id: input.appointmentId,
      externalSyncStatus: "failed",
    })
  }

  private async enqueueExternalSyncIfNeeded(input: {
    workspaceId: string
    appointmentId: string
    operation: "create" | "cancel"
    externalConnectionId?: string | null
  }) {
    if (!input.externalConnectionId) {
      return
    }

    try {
      await defaultQueue.add(
        DefaultJobAction.syncExternalCalendarEvent,
        {
          type: DefaultJobAction.syncExternalCalendarEvent,
          data: {
            workspaceId: input.workspaceId,
            appointmentId: input.appointmentId,
            operation: input.operation,
          },
        },
        {
          jobId: syncExternalCalendarEventJobId(
            input.appointmentId,
            input.operation,
          ),
        },
      )
    } catch (error) {
      logger.warn(
        {
          err: normalizeError(error),
          workspaceId: input.workspaceId,
          appointmentId: input.appointmentId,
          operation: input.operation,
        },
        "Failed to enqueue external calendar sync",
      )
    }
  }

  private async enqueueCalendarFlowIfNeeded(
    input: {
      workspaceId: string
      conversationId?: string | null
      flowId?: string | null
    } & FlowContinuationInput,
  ) {
    if (!(input.flowId && input.conversationId && input.contactInboxId)) {
      return
    }

    try {
      await integrationQueue.add(IntegrationJobAction.sendFlow, {
        type: IntegrationJobAction.sendFlow,
        data: {
          conversationId: input.conversationId,
          contactInboxId: input.contactInboxId,
          flowId: input.flowId,
          flowVersionId: input.flowVersionId,
          metadata: input.metadata,
          origin: "channel",
        },
      })
    } catch (error) {
      logger.warn(
        {
          err: normalizeError(error),
          workspaceId: input.workspaceId,
          conversationId: input.conversationId,
          flowId: input.flowId,
        },
        "Failed to enqueue appointment follow-up flow",
      )
    }
  }

  private async enqueueWebviewBookingConfirmation(input: {
    appointment: Awaited<ReturnType<AppointmentService["findByOrFail"]>>
    contactInboxId: string
    scheduleUrl: string
  }) {
    if (!input.appointment.conversation) {
      return
    }
    const contactInbox = await contactInboxService.findByUncached({
      where: {
        id: input.contactInboxId,
        contactId: input.appointment.contactId,
      },
    })
    if (!contactInbox) {
      return
    }
    const copy = getAppointmentConfirmationCopy(input.appointment.contact)

    const buttons: MessageButtonTemplate[] = [
      {
        id: createId(),
        label: copy.moreInformation,
        buttonType: "url",
        url: input.scheduleUrl,
      },
    ]

    await chatQueue.add(ChatJobAction.sendChatMessage, {
      type: ChatJobAction.sendChatMessage,
      data: {
        conversation: input.appointment.conversation,
        contactInbox,
        text: buildBookingConfirmationText(input.appointment),
        quickReplies: buttons,
      },
    })
  }

  private async applyCancellationSideEffects(input: CancelSideEffectsInput) {
    await appointmentReminderService.cancelPendingForAppointment({
      workspaceId: input.workspaceId,
      appointmentId: input.appointmentId,
    })
    await this.enqueueExternalSyncIfNeeded({
      workspaceId: input.workspaceId,
      appointmentId: input.appointmentId,
      operation: "cancel",
      externalConnectionId: input.externalConnectionId,
    })
    await this.enqueueCalendarFlowIfNeeded({
      workspaceId: input.workspaceId,
      conversationId: input.conversationId,
      contactInboxId: input.contactInboxId,
      flowId: input.cancellationFlowId,
      flowVersionId: input.flowVersionId,
      metadata: input.metadata,
    })
  }

  private async findOwnedAppointmentOrFail(
    input: { workspaceId: string; appointmentId: string; contactId: string },
    tx?: DatabaseClient,
  ) {
    const appointment = await this.findBy(
      {
        workspaceId: input.workspaceId,
        id: input.appointmentId,
      },
      tx,
    )
    if (!appointment || appointment.contactId !== input.contactId) {
      throw notFoundException("Appointment not found")
    }
    return appointment
  }
}

export const appointmentService = new AppointmentService()

function buildAppointmentUrl(appUrl: string, pathname: string, token: string) {
  const url = new URL(pathname, appUrl)
  url.searchParams.set("token", token)
  return url.toString()
}

function buildBookingConfirmationText(
  appointment: Awaited<ReturnType<AppointmentService["findByOrFail"]>>,
) {
  return [
    `Appointment Confirmation - ${appointment.calendar.name}`,
    "",
    `Date: ${formatAppointmentConfirmationDate(
      appointment.startAt,
      appointment.inviteeTimezone,
    )}`,
  ].join("\n")
}

function formatAppointmentConfirmationDate(date: Date, timezone: string) {
  const dateParts = new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: timezone,
  }).formatToParts(date)
  const day = dateParts.find((part) => part.type === "day")?.value ?? ""
  const month = dateParts.find((part) => part.type === "month")?.value ?? ""
  const year = dateParts.find((part) => part.type === "year")?.value ?? ""
  const time = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: timezone,
  }).format(date)

  return `${day}/${month}/${year}\n${time}`
}

function getAppointmentContactName(contact: {
  contactFullName?: string | null
  contactFirstName?: string | null
  contactLastName?: string | null
}) {
  const nameFromParts = [contact.contactFirstName, contact.contactLastName]
    .filter(Boolean)
    .join(" ")
  return (contact.contactFullName ?? nameFromParts) || null
}

function getCancellationExternalSyncStatus(appointment: {
  externalSyncStatus?: "pending" | "synced" | "failed" | null
  calendar: { externalConnectionId?: string | null }
}) {
  return appointment.calendar.externalConnectionId
    ? "pending"
    : appointment.externalSyncStatus
}

type AppointmentConfirmationCopy = {
  moreInformation: string
}

const APPOINTMENT_CONFIRMATION_COPY = {
  en: {
    moreInformation: "More Information",
  },
  vi: {
    moreInformation: "Xem thêm",
  },
} satisfies Record<string, AppointmentConfirmationCopy>

function getAppointmentConfirmationCopy(contact: {
  language?: string | null
  locale?: string | null
}): AppointmentConfirmationCopy {
  const language =
    normalizeLanguage(contact.language) ?? normalizeLanguage(contact.locale)
  return language === "vi"
    ? APPOINTMENT_CONFIRMATION_COPY.vi
    : APPOINTMENT_CONFIRMATION_COPY.en
}
