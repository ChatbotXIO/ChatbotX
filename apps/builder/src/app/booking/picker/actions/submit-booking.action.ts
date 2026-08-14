"use server"

import {
  AppointmentAlreadyScheduledException,
  AppointmentAvailabilityChangedException,
  appointmentCalendarService,
  appointmentService,
  contactCustomFieldService,
  SlotUnavailableException,
} from "@chatbotx.io/business"
import { verifyAppointmentWebviewToken } from "@chatbotx.io/encryption"
import { APPOINTMENT_WEBVIEW_SELECTION_PAYLOAD_TYPE } from "@chatbotx.io/flow-config"
import {
  IntegrationJobAction,
  integrationQueue,
} from "@chatbotx.io/worker-config"
import { normalizeError } from "universal-error-normalizer"
import type { z } from "zod"
import { submitBookingRequestSchema } from "@/features/booking-webview/schemas/action"
import { getOriginFromHeader } from "@/lib/domain"
import { logger } from "@/lib/log"
import { actionClient } from "@/lib/safe-action"

type AppointmentSubmissionResult = {
  appointment: { id: string } | null
  scheduleUrl: string | null
  cancelUrl: string | null
}
type SubmitBookingInput = z.infer<typeof submitBookingRequestSchema>

export const submitBookingAction = actionClient
  .inputSchema(submitBookingRequestSchema)
  .action(async ({ parsedInput }) => submitBooking(parsedInput))

export async function submitBooking(parsedInput: SubmitBookingInput) {
  const tokenPayload = await verifyAppointmentWebviewToken(parsedInput.token)
  const appUrl = await getOriginFromHeader()

  try {
    const selectedStartAt = new Date(parsedInput.selectedStartAt)
    let result: AppointmentSubmissionResult
    switch (tokenPayload.mode) {
      case "book":
        result = await appointmentService.completeWebviewBooking({
          tokenPayload,
          selectedStartAt,
          inviteeTimezone: parsedInput.inviteeTimezone,
          appUrl,
        })
        break
      case "selectAvailability":
        result = await completeAvailabilitySelection({
          tokenPayload,
          selectedStartAt,
        })
        break
      case "selectAvailabilityRange":
        throw new Error("Availability range tokens cannot book appointments")
      default:
        throw new Error("Unsupported appointment token mode")
    }
    try {
      if (tokenPayload.selectedDateCustomFieldId) {
        await contactCustomFieldService.setValueByKey({
          workspaceId: tokenPayload.workspaceId,
          contactId: tokenPayload.contactId,
          keyword: tokenPayload.selectedDateCustomFieldId,
          value: parsedInput.selectedStartAt,
        })
      }
    } catch (error) {
      logger.warn(
        {
          err: normalizeError(error),
          workspaceId: tokenPayload.workspaceId,
          conversationId: tokenPayload.conversationId,
          action: "submitBookingSideEffect",
          reason: "setSelectedDateCustomFieldFailed",
        },
        "Failed to persist selected appointment date custom field",
      )
    }

    try {
      if (tokenPayload.nodeId) {
        await integrationQueue.add(IntegrationJobAction.sendFlow, {
          type: IntegrationJobAction.sendFlow,
          data: {
            conversationId: tokenPayload.conversationId,
            contactInboxId: tokenPayload.contactInboxId,
            flowId: tokenPayload.flowId,
            flowVersionId: tokenPayload.flowVersionId,
            nodeId: tokenPayload.nodeId,
            startFromStepId: tokenPayload.stepId,
            appointmentId: result.appointment?.id,
            metadata: {
              type: APPOINTMENT_WEBVIEW_SELECTION_PAYLOAD_TYPE,
              stepId: tokenPayload.stepId,
              contactInboxId: tokenPayload.contactInboxId,
              selectedStartAt: parsedInput.selectedStartAt,
              appointmentId: result.appointment?.id,
            },
            origin: "channel",
          },
        })
      }
    } catch (error) {
      logger.warn(
        {
          err: normalizeError(error),
          workspaceId: tokenPayload.workspaceId,
          conversationId: tokenPayload.conversationId,
          action: "submitBookingSideEffect",
          reason: "resumeFlowAfterBookingFailed",
        },
        "Failed to resume flow after appointment booking",
      )
    }

    return { ...result, staleSlot: false, completed: true }
  } catch (error) {
    if (
      error instanceof SlotUnavailableException ||
      error instanceof AppointmentAlreadyScheduledException
    ) {
      return {
        staleSlot: true,
        availabilityChanged: false,
        completed: false,
        appointment: null,
        scheduleUrl: null,
        cancelUrl: null,
      }
    }
    if (error instanceof AppointmentAvailabilityChangedException) {
      return {
        staleSlot: false,
        availabilityChanged: true,
        completed: false,
        appointment: null,
        scheduleUrl: null,
        cancelUrl: null,
      }
    }
    throw error
  }
}

async function completeAvailabilitySelection(input: {
  tokenPayload: Awaited<ReturnType<typeof verifyAppointmentWebviewToken>>
  selectedStartAt: Date
}) {
  const startDate = input.tokenPayload.availabilityStartAt
    ? new Date(input.tokenPayload.availabilityStartAt)
    : input.selectedStartAt
  const endDate = input.tokenPayload.availabilityEndAt
    ? new Date(input.tokenPayload.availabilityEndAt)
    : input.selectedStartAt

  const slots =
    await appointmentCalendarService.resolveAvailableSlotsForListing({
      workspaceId: input.tokenPayload.workspaceId,
      calendarId: input.tokenPayload.calendarId,
      contactId: input.tokenPayload.contactId,
      startDate,
      endDate,
    })
  const slot = slots.find(
    (item) => item.startAt.getTime() === input.selectedStartAt.getTime(),
  )
  if (!slot) {
    throw new SlotUnavailableException()
  }

  return {
    appointment: null,
    scheduleUrl: null,
    cancelUrl: null,
  }
}
