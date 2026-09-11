import { type DatabaseClient, db, sql } from "@chatbotx.io/database/client"
import {
  type AppointmentListTab,
  appointmentRepository,
  contactInboxRepository,
} from "@chatbotx.io/database/repositories"
import {
  type AppointmentWebviewPayload,
  signAppointmentCancelToken,
  signAppointmentScheduleToken,
} from "@chatbotx.io/encryption"
import type { MetadataPayload } from "@chatbotx.io/flow-config"
import {
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
import { appointmentExternalCalendarService } from "../appointment-external-calendar"
import { appointmentReminderService } from "../appointment-reminder"
import { BaseService } from "../base.service"
import { contactService } from "../contact"
import { conversationService } from "../conversation"
import { ChatbotXException, notFoundException } from "../errors"
import { logger } from "../logger"
import { resolveTenantSettings } from "../platform/settings"

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
  metadata?: MetadataPayload
  appointmentId?: string
}

type CancelSideEffectsInput = {
  workspaceId: string
  appointmentId: string
  conversationId?: string | null
  contactInboxId?: string
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

  async findLatestForContact(
    input: { workspaceId: string; contactId: string },
    tx?: DatabaseClient,
  ) {
    return await appointmentRepository.findLatestForContact(input, tx)
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
    const appointments = await appointmentRepository.listByContact(input)
    const { appUrl } = await resolveTenantSettings({
      workspaceId: input.workspaceId,
    })

    // Appointments come sorted upcoming-first, then most-recent-past; drop
    // cancelled ones and keep only the most relevant appointment per
    // calendar (the first one encountered for each calendarId), so we don't
    // sign a schedule token for rows the UI would discard anyway.
    const relevantByCalendar = new Map<string, (typeof appointments)[number]>()
    for (const appointment of appointments) {
      if (
        appointment.status !== "cancelled" &&
        !relevantByCalendar.has(appointment.calendarId)
      ) {
        relevantByCalendar.set(appointment.calendarId, appointment)
      }
    }

    return await Promise.all(
      [...relevantByCalendar.values()].map(async (appointment) => {
        const token = await signAppointmentScheduleToken({
          appointmentId: appointment.id,
          workspaceId: appointment.workspaceId,
          contactId: appointment.contactId,
          conversationId: appointment.conversationId ?? undefined,
        })
        return {
          ...appointment,
          scheduleUrl: buildAppointmentUrl(appUrl, "/booking/schedule", token),
        }
      }),
    )
  }

  async hasFutureScheduledAppointmentForContact(
    input: { workspaceId: string; calendarId: string; contactId: string },
    maxAppointmentsPerUser: number | null,
    tx?: DatabaseClient,
  ) {
    if (maxAppointmentsPerUser == null) {
      return false
    }
    const appointments =
      await appointmentRepository.listFutureScheduledForContact(input, tx)
    return appointments.length >= maxAppointmentsPerUser
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
    metadata?: MetadataPayload
  }) {
    await contactService.findByIdOrFail({
      workspaceId: input.workspaceId,
      id: input.contactId,
    })
    if (input.conversationId != null) {
      await conversationService.findByOrFail({
        where: { workspaceId: input.workspaceId, id: input.conversationId },
      })
    }

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
      if (
        await this.hasFutureScheduledAppointmentForContact(
          input,
          calendar.maxAppointmentsPerUser,
          tx,
        )
      ) {
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

      if (input.contactInboxId) {
        const contactInbox = await contactInboxRepository.findByIdForContact(
          {
            id: input.contactInboxId,
            contactId: input.contactId,
            workspaceId: input.workspaceId,
          },
          tx,
        )
        if (!contactInbox) {
          throw new ChatbotXException(
            "Appointment contact inbox does not belong to the contact",
            "invalidAppointmentContactInbox",
            400,
          )
        }
      }

      const externalConnection = calendar.externalConnectionId
        ? await appointmentExternalCalendarService.getGoogleConnectionForProviderCall(
            {
              workspaceId: input.workspaceId,
              integrationId: calendar.externalConnectionId,
            },
            tx,
          )
        : null

      const appointment = await appointmentRepository.create(
        {
          workspaceId: input.workspaceId,
          calendarId: input.calendarId,
          contactId: input.contactId,
          conversationId: input.conversationId,
          contactInboxId: input.contactInboxId,
          startAt: slot.startAt,
          endAt: slot.endAt,
          inviteeTimezone: input.inviteeTimezone ?? calendar.timezone,
          locationType: calendar.locationType,
          locationDetail: calendar.locationDetail,
          externalSyncStatus: externalConnection ? "pending" : null,
          externalEventIntegrationId: calendar.externalConnectionId,
          externalEventProviderCalendarId:
            externalConnection?.providerCalendarId ?? null,
        },
        tx,
      )

      return { appointment, calendar }
    })

    await this.enqueueExternalSyncIfNeeded({
      workspaceId: input.workspaceId,
      appointmentId: appointment.id,
      operation: "create",
      externalConnectionId: appointment.externalEventIntegrationId,
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
      metadata: input.metadata,
      appointmentId: appointment.id,
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
      metadata: input.metadata,
      externalConnectionId:
        appointment.externalEventIntegrationId ??
        appointment.calendar.externalConnectionId,
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
        externalConnectionId:
          result.appointment.externalEventIntegrationId ??
          result.appointment.calendar.externalConnectionId,
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
      externalConnectionId:
        appointment.externalEventIntegrationId ??
        appointment.calendar.externalConnectionId,
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

  async persistExternalDestinationIfScheduled(input: {
    workspaceId: string
    appointmentId: string
    integrationId: string
    providerCalendarId: string
  }) {
    return await appointmentRepository.persistExternalDestinationIfScheduled({
      workspaceId: input.workspaceId,
      id: input.appointmentId,
      integrationId: input.integrationId,
      providerCalendarId: input.providerCalendarId,
    })
  }

  async markExternalCreateSucceededIfScheduled(input: {
    workspaceId: string
    appointmentId: string
    externalEventId: string
  }) {
    return await appointmentRepository.markExternalCreateSucceededIfScheduled({
      workspaceId: input.workspaceId,
      id: input.appointmentId,
      externalEventId: input.externalEventId,
    })
  }

  async markExternalCreateFailedIfScheduled(input: {
    workspaceId: string
    appointmentId: string
  }) {
    return await appointmentRepository.markExternalCreateFailedIfScheduled({
      workspaceId: input.workspaceId,
      id: input.appointmentId,
    })
  }

  async markExternalCancelSucceededIfCancelled(input: {
    workspaceId: string
    appointmentId: string
  }) {
    return await appointmentRepository.markExternalCancelSucceededIfCancelled({
      workspaceId: input.workspaceId,
      id: input.appointmentId,
    })
  }

  async markExternalCancelFailedIfCancelled(input: {
    workspaceId: string
    appointmentId: string
  }) {
    return await appointmentRepository.markExternalCancelFailedIfCancelled({
      workspaceId: input.workspaceId,
      id: input.appointmentId,
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
      // Known gap: not awaited, so this can race the caller's own next step
      // and arrive out of order in the channel. Accepted for now — see
      // enqueueCalendarFlowIfNeeded's callers for context; revisit once the
      // ordering fix lands without reintroducing worker self-starvation.
      await integrationQueue.add(IntegrationJobAction.sendFlow, {
        type: IntegrationJobAction.sendFlow,
        data: {
          conversationId: input.conversationId,
          contactInboxId: input.contactInboxId,
          flowId: input.flowId,
          metadata: input.metadata,
          appointmentId: input.appointmentId,
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
      metadata: input.metadata,
      appointmentId: input.appointmentId,
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

export function buildAppointmentUrl(
  appUrl: string,
  pathname: string,
  token: string,
) {
  const url = new URL(pathname, appUrl)
  url.searchParams.set("token", token)
  return url.toString()
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
  externalEventIntegrationId?: string | null
  calendar: { externalConnectionId?: string | null }
}) {
  return appointment.externalEventIntegrationId ||
    appointment.calendar.externalConnectionId
    ? "pending"
    : appointment.externalSyncStatus
}
