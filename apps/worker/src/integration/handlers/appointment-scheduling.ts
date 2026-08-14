import {
  appointmentCalendarService,
  appointmentService,
  contactCustomFieldService,
  normalizeLanguage,
  resolveTenantSettings,
} from "@chatbotx.io/business"
import { signAppointmentWebviewToken } from "@chatbotx.io/encryption"
import {
  APPOINTMENT_AVAILABILITY_RANGE_SELECTION_PAYLOAD_TYPE,
  APPOINTMENT_AVAILABILITY_RANGE_SKIPPED_PAYLOAD_TYPE,
  APPOINTMENT_WEBVIEW_SELECTION_PAYLOAD_TYPE,
  type AppointmentSchedulingStepSchema,
  appointmentSchedulingModes,
} from "@chatbotx.io/flow-config"
import { createId } from "@chatbotx.io/utils"
import { TemporalInputParsing } from "@chatbotx.io/utils/datetime"
import { ChatJobAction, chatQueue } from "@chatbotx.io/worker-config"
import { fromZonedTime } from "date-fns-tz"
import { normalizeError } from "universal-error-normalizer"
import { logger } from "../../lib/logger"
import type { ExecuteStepProps } from "./flow-utils"
import type { ExecuteStepResult } from "./step"

type AppointmentSchedulingCopy = {
  bookingPrompt: string
  bookingButton: string
  rangePrompt: string
  rangeButton: string
}

const APPOINTMENT_SCHEDULING_COPY = {
  en: {
    bookingPrompt: "Choose an appointment time",
    bookingButton: "Select Date",
    rangePrompt: "Choose a date range to check availability",
    rangeButton: "Check Availability",
  },
  vi: {
    bookingPrompt: "Chọn thời gian đặt lịch",
    bookingButton: "Chọn ngày",
    rangePrompt: "Chọn khoảng ngày cần kiểm tra lịch trống",
    rangeButton: "Kiểm tra lịch trống",
  },
} satisfies Record<string, AppointmentSchedulingCopy>

function getAppointmentSchedulingCopy(input: {
  language?: string | null
}): AppointmentSchedulingCopy {
  return normalizeLanguage(input.language) === "vi"
    ? APPOINTMENT_SCHEDULING_COPY.vi
    : APPOINTMENT_SCHEDULING_COPY.en
}

const toInstant = (dateTime: string, timezone: string) =>
  fromZonedTime(dateTime, timezone)

export async function appointmentScheduling(
  props: ExecuteStepProps<AppointmentSchedulingStepSchema>,
): Promise<ExecuteStepResult> {
  const { conversation, contactInbox, flowVersion, metadata, step } = props
  const copy = getAppointmentSchedulingCopy(contactInbox)
  const baseLogContext = {
    workspaceId: conversation.workspaceId,
    conversationId: conversation.id,
    contactId: conversation.contactId,
    calendarId: step.calendarId,
    action: step.stepType,
    mode: step.mode,
  }

  try {
    switch (step.mode) {
      case appointmentSchedulingModes.enum.book: {
        if (
          metadata?.type === APPOINTMENT_WEBVIEW_SELECTION_PAYLOAD_TYPE &&
          metadata.stepId === step.id
        ) {
          return { status: "success", result: metadata }
        }

        if (
          await appointmentService.hasFutureScheduledAppointmentForContact({
            workspaceId: conversation.workspaceId,
            calendarId: step.calendarId,
            contactId: conversation.contactId,
          })
        ) {
          return {
            status: "error",
            errorMessage: "appointment_already_scheduled",
            result: null,
          }
        }

        const { appUrl } = await resolveTenantSettings({
          workspaceId: conversation.workspaceId,
        })
        const token = await signAppointmentWebviewToken({
          mode: "book",
          workspaceId: conversation.workspaceId,
          calendarId: step.calendarId,
          contactId: conversation.contactId,
          conversationId: conversation.id,
          contactInboxId: contactInbox.id,
          channel: contactInbox.channel,
          flowId: flowVersion.flowId,
          flowVersionId: flowVersion.id,
          stepId: step.id,
          nodeId: props.targetId,
          selectedDateCustomFieldId: step.dateTimeFieldId,
        })
        const pickerUrl = new URL("/booking/picker", appUrl)
        pickerUrl.searchParams.set("token", token)

        await chatQueue.add(ChatJobAction.sendChatMessage, {
          type: ChatJobAction.sendChatMessage,
          data: {
            conversation,
            contactInbox,
            text: copy.bookingPrompt,
            quickReplies: [
              {
                id: createId(),
                label: copy.bookingButton,
                buttonType: "url",
                url: pickerUrl.toString(),
                messengerExtensions: true,
              },
            ],
            trackingContext: props.trackingContext,
            metadata,
          },
        })

        return { status: "wait", result: null }
      }
      case appointmentSchedulingModes.enum.cancel: {
        const appointment = await appointmentService.cancelAppointment({
          workspaceId: conversation.workspaceId,
          calendarId: step.calendarId,
          contactId: conversation.contactId,
          conversationId: conversation.id,
          contactInboxId: contactInbox.id,
          flowVersionId: flowVersion.id,
          metadata,
        })

        return { status: "success", result: appointment }
      }
      case appointmentSchedulingModes.enum.checkAvailability: {
        if (
          metadata?.type ===
            APPOINTMENT_AVAILABILITY_RANGE_SKIPPED_PAYLOAD_TYPE &&
          metadata.stepId === step.id
        ) {
          logger.warn(
            { ...baseLogContext, stepId: step.id, reason: "range_skipped" },
            "Appointment scheduling availability range skipped",
          )
          return {
            status: "error",
            errorMessage: "range_skipped",
            result: null,
          }
        }

        if (
          metadata?.type !==
            APPOINTMENT_AVAILABILITY_RANGE_SELECTION_PAYLOAD_TYPE ||
          metadata.stepId !== step.id
        ) {
          const { appUrl } = await resolveTenantSettings({
            workspaceId: conversation.workspaceId,
          })
          const token = await signAppointmentWebviewToken({
            mode: "selectAvailabilityRange",
            workspaceId: conversation.workspaceId,
            calendarId: step.calendarId,
            contactId: conversation.contactId,
            conversationId: conversation.id,
            contactInboxId: contactInbox.id,
            channel: contactInbox.channel,
            flowId: flowVersion.flowId,
            flowVersionId: flowVersion.id,
            stepId: step.id,
            nodeId: props.targetId,
            startDateCustomFieldId: step.startDateFieldId,
            endDateCustomFieldId: step.endDateFieldId,
            resultCustomFieldId: step.outputCustomFieldId,
            resultUsedByAI: step.resultUsedByAI,
          })
          const pickerUrl = new URL("/booking/range-picker", appUrl)
          pickerUrl.searchParams.set("token", token)

          await chatQueue.add(ChatJobAction.sendChatMessage, {
            type: ChatJobAction.sendChatMessage,
            data: {
              conversation,
              contactInbox,
              text: copy.rangePrompt,
              quickReplies: [
                {
                  id: createId(),
                  label: copy.rangeButton,
                  buttonType: "url",
                  url: pickerUrl.toString(),
                  messengerExtensions: true,
                },
              ],
              trackingContext: props.trackingContext,
              metadata,
            },
          })

          return { status: "wait", result: null }
        }

        if (metadata.startDate > metadata.endDate) {
          logger.warn(
            { ...baseLogContext, stepId: step.id, reason: "invalidRange" },
            "Appointment scheduling availability check skipped",
          )
          return { status: "error", result: null }
        }

        const calendar = await appointmentCalendarService.findByOrFail({
          workspaceId: conversation.workspaceId,
          id: step.calendarId,
        })
        const startDate = toInstant(metadata.startDate, calendar.timezone)
        const endDate = toInstant(metadata.endDate, calendar.timezone)

        await contactCustomFieldService.setValues({
          workspaceId: conversation.workspaceId,
          contactId: conversation.contactId,
          fields: [
            {
              customFieldId: step.startDateFieldId,
              value: metadata.startDate,
            },
            {
              customFieldId: step.endDateFieldId,
              value: metadata.endDate,
            },
          ],
          sourceTimezoneOverride: calendar.timezone,
          temporalInputParsing: TemporalInputParsing.Lenient,
        })

        const availability = await appointmentService.checkAvailability({
          workspaceId: conversation.workspaceId,
          calendarId: step.calendarId,
          contactId: conversation.contactId,
          startDate,
          endDate,
        })

        await contactCustomFieldService.setValueByKey({
          workspaceId: conversation.workspaceId,
          contactId: conversation.contactId,
          keyword: step.outputCustomFieldId,
          value: availability.text,
        })

        if (availability.slots.length === 0) {
          logger.warn(
            { ...baseLogContext, stepId: step.id, reason: "noSlotsAvailable" },
            "Appointment scheduling availability check found no slots",
          )
          return { status: "error", result: availability }
        }

        return { status: "success", result: availability }
      }
      default:
        return { status: "error", result: null }
    }
  } catch (err) {
    logger.error(
      {
        err: normalizeError(err),
        ...baseLogContext,
      },
      "Appointment scheduling step failed",
    )
    return { status: "error", result: null }
  }
}
