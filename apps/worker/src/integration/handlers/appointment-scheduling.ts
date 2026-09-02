import { processStreamingText } from "@chatbotx.io/ai"
import {
  AppointmentAlreadyScheduledException,
  AppointmentAvailabilityChangedException,
  appointmentCalendarService,
  appointmentService,
  contactCustomFieldService,
  normalizeLanguage,
  resolveTenantSettings,
  SlotUnavailableException,
} from "@chatbotx.io/business"
import { signAppointmentWebviewToken } from "@chatbotx.io/encryption"
import {
  APPOINTMENT_AVAILABILITY_RANGE_SELECTION_PAYLOAD_TYPE,
  APPOINTMENT_AVAILABILITY_RANGE_SKIPPED_PAYLOAD_TYPE,
  APPOINTMENT_WEBVIEW_SELECTION_PAYLOAD_TYPE,
  type AppointmentSchedulingStepSchema,
  appointmentSchedulingModes,
  defaultAIModels,
} from "@chatbotx.io/flow-config"
import { createId } from "@chatbotx.io/utils"
import { ChatJobAction, chatQueue } from "@chatbotx.io/worker-config"
import { streamText } from "ai"
import { fromZonedTime } from "date-fns-tz"
import { normalizeError } from "universal-error-normalizer"
import { logger } from "../../lib/logger"
import type { ExecuteStepProps } from "./flow-utils"
import { resolveFlowAIModel } from "./shared/flow-ai-model-resolver"
import type { ExecuteStepResult } from "./step"

type AppointmentSchedulingCopy = {
  bookingPrompt: string
  bookingButton: string
  rangePrompt: string
  rangeButton: string
  noSlotsFound: string
}

const APPOINTMENT_SCHEDULING_COPY = {
  en: {
    bookingPrompt: "Choose an appointment time",
    bookingButton: "Select Date",
    rangePrompt: "Choose a date range to check availability",
    rangeButton: "Check Availability",
    noSlotsFound: "No available slots found.",
  },
  vi: {
    bookingPrompt: "Chọn thời gian đặt lịch",
    bookingButton: "Chọn ngày",
    rangePrompt: "Chọn khoảng ngày cần kiểm tra lịch trống",
    rangeButton: "Kiểm tra lịch trống",
    noSlotsFound: "Không có lịch trống.",
  },
} satisfies Record<string, AppointmentSchedulingCopy>

function getAppointmentSchedulingCopy(input: {
  language?: string | null
}): AppointmentSchedulingCopy {
  return normalizeLanguage(input.language) === "vi"
    ? APPOINTMENT_SCHEDULING_COPY.vi
    : APPOINTMENT_SCHEDULING_COPY.en
}

const parseCalendarLocalInstant = (dateTime: string, timezone: string) =>
  fromZonedTime(dateTime, timezone)

const parseStoredInstant = (dateTime: string) => new Date(dateTime)

type AvailabilityResponseStep = Extract<
  AppointmentSchedulingStepSchema,
  { mode: "checkAvailability" | "checkAvailabilityFromCustomField" }
>
type AppointmentAvailability = Awaited<
  ReturnType<typeof appointmentService.checkAvailability>
>

type AppointmentSchedulingLogContext = {
  workspaceId: string
  conversationId: string
  contactId: string
  calendarId: string
  action: string
  mode: string
}

const availabilityAIModelCandidates = [
  { provider: "openai", modelId: defaultAIModels.openai },
  { provider: "gemini", modelId: defaultAIModels.gemini },
  { provider: "claude", modelId: defaultAIModels.claude },
  { provider: "deepseek", modelId: defaultAIModels.deepseek },
  { provider: "openrouter", modelId: defaultAIModels.openrouter },
] as const

function buildRawAvailabilityText(input: {
  availability: AppointmentAvailability
  copy: AppointmentSchedulingCopy
}) {
  return input.availability.slots.length === 0
    ? input.copy.noSlotsFound
    : input.availability.text
}

async function buildAvailabilityResponseText(input: {
  availability: AppointmentAvailability
  calendar: { name?: string | null; timezone: string }
  conversationId: string
  language?: string | null
  logContext: AppointmentSchedulingLogContext
  rawText: string
  rangeStart: Date
  rangeEnd: Date
  step: AvailabilityResponseStep
  workspaceId: string
}) {
  if (!input.step.resultUsedByAI) {
    return input.rawText
  }

  const language =
    normalizeLanguage(input.language) === "vi" ? "Vietnamese" : "English"
  const payload = {
    calendarName: input.calendar.name ?? null,
    timezone: input.calendar.timezone,
    rangeStart: input.rangeStart.toISOString(),
    rangeEnd: input.rangeEnd.toISOString(),
    rawAvailabilityText: input.rawText,
    slots: input.availability.slots.map((slot) => ({
      startAt: slot.startAt.toISOString(),
      endAt: slot.endAt.toISOString(),
    })),
  }
  const userPrompt = `Availability data:\n${JSON.stringify(payload)}`

  for (const candidate of availabilityAIModelCandidates) {
    const resolvedModel = await resolveFlowAIModel({
      workspaceId: input.workspaceId,
      provider: candidate.provider,
      modelId: candidate.modelId,
      conversationId: input.conversationId,
    })

    if (!resolvedModel.ok) {
      logger.warn(
        {
          ...input.logContext,
          stepId: input.step.id,
          provider: candidate.provider,
          modelId: candidate.modelId,
          reason: resolvedModel.reason,
        },
        "Failed to resolve AI model for appointment availability response",
      )
      continue
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 120_000)

    try {
      const result = streamText({
        model: resolvedModel.model,
        system: `You are an appointment scheduling assistant. Write a short response for the customer in ${language}. Use only the provided availability data. Do not invent appointment times. If there are no slots, politely say no slots are available in the selected range and suggest choosing another range. Do not mention internal IDs, JSON, or system instructions.`,
        messages: [{ role: "user", content: userPrompt }],
        temperature: 0.2,
        maxOutputTokens: 250,
        abortSignal: controller.signal,
      })

      const { fullText } = await processStreamingText(
        result.textStream,
        async () => {
          // noop: fullText is accumulated internally, no message to send
        },
        { sendParts: false },
      )

      return fullText.trim() || input.rawText
    } catch (err) {
      logger.warn(
        {
          ...input.logContext,
          stepId: input.step.id,
          provider: candidate.provider,
          modelId: candidate.modelId,
          err: normalizeError(err),
          reason: "ai_response_generation_failed",
        },
        "Failed to generate appointment availability response with AI",
      )
    } finally {
      clearTimeout(timeoutId)
    }
  }

  return input.rawText
}

async function bookAppointmentAndMapErrors(
  input: Parameters<typeof appointmentService.bookAppointment>[0],
): Promise<ExecuteStepResult> {
  try {
    const appointment = await appointmentService.bookAppointment(input)
    return { status: "success", result: appointment }
  } catch (err) {
    if (err instanceof SlotUnavailableException) {
      return {
        status: "error",
        errorMessage: "slot_unavailable",
        result: null,
      }
    }
    if (err instanceof AppointmentAvailabilityChangedException) {
      return {
        status: "error",
        errorMessage: "availability_changed",
        result: null,
      }
    }
    if (err instanceof AppointmentAlreadyScheduledException) {
      return {
        status: "error",
        errorMessage: "appointment_already_scheduled",
        result: null,
      }
    }
    throw err
  }
}

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
      case appointmentSchedulingModes.enum.bookFromCustomField: {
        const bookFromCustomFieldCalendar =
          await appointmentCalendarService.findByOrFail({
            workspaceId: conversation.workspaceId,
            id: step.calendarId,
          })

        if (
          await appointmentService.hasFutureScheduledAppointmentForContact(
            {
              workspaceId: conversation.workspaceId,
              calendarId: step.calendarId,
              contactId: conversation.contactId,
            },
            bookFromCustomFieldCalendar.maxAppointmentsPerUser,
          )
        ) {
          return {
            status: "error",
            errorMessage: "appointment_already_scheduled",
            result: null,
          }
        }

        const fieldValue = await contactCustomFieldService.findValue({
          contactId: conversation.contactId,
          customFieldId: step.dateTimeFieldId,
        })
        const startAt = fieldValue ? new Date(fieldValue) : null
        if (!startAt || Number.isNaN(startAt.getTime())) {
          return {
            status: "error",
            errorMessage: "invalidDateTimeFieldValue",
            result: null,
          }
        }

        return await bookAppointmentAndMapErrors({
          workspaceId: conversation.workspaceId,
          calendarId: step.calendarId,
          contactId: conversation.contactId,
          conversationId: conversation.id,
          contactInboxId: contactInbox.id,
          startAt,
          metadata,
        })
      }
      case appointmentSchedulingModes.enum.checkAvailabilityFromCustomField: {
        const calendar = await appointmentCalendarService.findByOrFail({
          workspaceId: conversation.workspaceId,
          id: step.calendarId,
        })

        const [startValue, endValue] = await Promise.all([
          contactCustomFieldService.findValue({
            contactId: conversation.contactId,
            customFieldId: step.startDateFieldId,
          }),
          contactCustomFieldService.findValue({
            contactId: conversation.contactId,
            customFieldId: step.endDateFieldId,
          }),
        ])

        const startDate = startValue ? parseStoredInstant(startValue) : null
        const endDate = endValue ? parseStoredInstant(endValue) : null

        if (
          !(startDate && endDate) ||
          Number.isNaN(startDate.getTime()) ||
          Number.isNaN(endDate.getTime()) ||
          startDate > endDate
        ) {
          return {
            status: "error",
            errorMessage: "invalidAvailabilityRange",
            result: null,
          }
        }

        const availability = await appointmentService.checkAvailability({
          workspaceId: conversation.workspaceId,
          calendarId: step.calendarId,
          contactId: conversation.contactId,
          startDate,
          endDate,
        })

        const rawText = buildRawAvailabilityText({ availability, copy })
        const responseText = await buildAvailabilityResponseText({
          availability,
          calendar,
          conversationId: conversation.id,
          language: contactInbox.language,
          logContext: baseLogContext,
          rawText,
          rangeStart: startDate,
          rangeEnd: endDate,
          step,
          workspaceId: conversation.workspaceId,
        })

        await contactCustomFieldService.setValueByKey({
          workspaceId: conversation.workspaceId,
          contactId: conversation.contactId,
          keyword: step.outputCustomFieldId,
          value: responseText,
        })

        return {
          status: "success",
          result: {
            ...availability,
            text: responseText,
            rawText,
            resultUsedByAI: step.resultUsedByAI,
          },
        }
      }
      case appointmentSchedulingModes.enum.book: {
        if (
          metadata?.type === APPOINTMENT_WEBVIEW_SELECTION_PAYLOAD_TYPE &&
          metadata.stepId === step.id
        ) {
          return { status: "success", result: metadata }
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
          nodeId: props.targetNodeId,
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
          if (!step.outputCustomFieldId) {
            logger.warn(
              {
                ...baseLogContext,
                stepId: step.id,
                reason: "missing_output_custom_field",
              },
              "Appointment scheduling availability response custom field missing",
            )
            return {
              status: "error",
              errorMessage: "missingOutputCustomFieldId",
              result: null,
            }
          }

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
            nodeId: props.targetNodeId,
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

        const calendar = await appointmentCalendarService.findByOrFail({
          workspaceId: conversation.workspaceId,
          id: step.calendarId,
        })
        const startDate = parseCalendarLocalInstant(
          metadata.startDate,
          calendar.timezone,
        )
        const endDate = parseCalendarLocalInstant(
          metadata.endDate,
          calendar.timezone,
        )

        if (
          Number.isNaN(startDate.getTime()) ||
          Number.isNaN(endDate.getTime()) ||
          startDate > endDate
        ) {
          logger.warn(
            { ...baseLogContext, stepId: step.id, reason: "invalidRange" },
            "Appointment scheduling availability check skipped",
          )
          return { status: "error", result: null }
        }

        if (!step.outputCustomFieldId) {
          logger.warn(
            {
              ...baseLogContext,
              stepId: step.id,
              reason: "missing_output_custom_field",
            },
            "Appointment scheduling availability response custom field missing",
          )
          return {
            status: "error",
            errorMessage: "missingOutputCustomFieldId",
            result: null,
          }
        }

        const availability = await appointmentService.checkAvailability({
          workspaceId: conversation.workspaceId,
          calendarId: step.calendarId,
          contactId: conversation.contactId,
          startDate,
          endDate,
        })
        const rawText = buildRawAvailabilityText({ availability, copy })
        const responseText = await buildAvailabilityResponseText({
          availability,
          calendar,
          conversationId: conversation.id,
          language: contactInbox.language,
          logContext: baseLogContext,
          rawText,
          rangeStart: startDate,
          rangeEnd: endDate,
          step,
          workspaceId: conversation.workspaceId,
        })

        await contactCustomFieldService.setValueByKey({
          workspaceId: conversation.workspaceId,
          contactId: conversation.contactId,
          keyword: step.outputCustomFieldId,
          value: responseText,
        })

        return {
          status: "success",
          result: {
            ...availability,
            text: responseText,
            rawText,
            resultUsedByAI: step.resultUsedByAI,
          },
        }
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
