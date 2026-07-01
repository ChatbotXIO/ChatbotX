import {
  type ButtonStepProps,
  buttonStepDefaultFn,
  buttonTypes,
  openWebsiteStepDefaultFn,
  type SendCardStepSchema,
  sendAudioStepDefaultFn,
  sendAudioStepSchema,
  sendCarouselStepDefaultFn,
  sendCarouselStepSchema,
  sendFileStepDefaultFn,
  sendFileStepSchema,
  sendImageStepDefaultFn,
  sendImageStepSchema,
  sendQuickReplyStepDefaultFn,
  sendQuickReplyStepSchema,
  sendTextStepDefaultFn,
  sendTextStepSchema,
  sendVideoStepDefaultFn,
  sendVideoStepSchema,
  uploadModes,
} from "@chatbotx.io/flow-config"
import { createId } from "@chatbotx.io/utils"
import {
  type BotResponseTrackingContext,
  ChatJobAction,
  chatQueue,
  type RichButtonPayloadEntry,
} from "@chatbotx.io/worker-config"
import { normalizeError } from "universal-error-normalizer"
import { logger } from "../../../lib/logger"
import type {
  RichMessengerMessage,
  RichResponseContext,
  RichResponseItem,
} from "."
import {
  buildRichButtonPayloadEntry,
  parseRichButtonPayload,
} from "./button-payload"
import { MAX_BUTTON_LABEL_LENGTH, MESSAGE_ORDER_DELAY_MS } from "./constants"

type ConvertedRichStep = {
  step:
    | ReturnType<typeof sendTextStepSchema.parse>
    | ReturnType<typeof sendQuickReplyStepSchema.parse>
    | ReturnType<typeof sendCarouselStepSchema.parse>
    | ReturnType<typeof sendImageStepSchema.parse>
    | ReturnType<typeof sendVideoStepSchema.parse>
    | ReturnType<typeof sendAudioStepSchema.parse>
    | ReturnType<typeof sendFileStepSchema.parse>
  buttonPayloads: Record<string, RichButtonPayloadEntry>
}

type RichButtonInput = {
  title: string
  type: "web_url" | "postback" | "phone_number"
  url?: string
  payload?: string
}

export async function sendRichMessages(
  items: RichResponseItem[],
  context: RichResponseContext,
  trackingContext?: BotResponseTrackingContext,
): Promise<{ enqueued: number; skipped: number }> {
  let cumulativeDelayMs = 0
  let lastMessageDelayMs = -MESSAGE_ORDER_DELAY_MS
  let messageIndex = 0
  let candidateMessages = 0

  const jobs: Parameters<typeof chatQueue.addBulk>[0] = []

  for (const item of items) {
    if (typeof item === "number") {
      cumulativeDelayMs += item * 1000
      continue
    }

    candidateMessages += 1
    const converted = convertToStep(item, context)
    if (!converted) {
      continue
    }

    const scheduledDelayMs = Math.max(
      cumulativeDelayMs,
      lastMessageDelayMs + MESSAGE_ORDER_DELAY_MS,
    )
    lastMessageDelayMs = scheduledDelayMs

    jobs.push({
      name: ChatJobAction.sendFlowMessage,
      data: {
        type: ChatJobAction.sendFlowMessage,
        data: {
          conversationId: context.conversationId,
          flowId: context.flowContextId,
          flowVersionId: context.flowVersionId,
          step: converted.step,
          trackingContext,
          richResponse: {
            executionId: context.executionId,
            buttonPayloads: converted.buttonPayloads,
          },
        },
      },
      opts: {
        delay: scheduledDelayMs,
        jobId: [
          "rich-response-message",
          context.conversationId,
          context.executionId,
          String(messageIndex),
        ].join("-"),
      },
    })
    messageIndex += 1
  }

  if (jobs.length > 0) {
    await chatQueue.addBulk(jobs)
  }

  return {
    enqueued: jobs.length,
    skipped: candidateMessages - jobs.length,
  }
}

function convertToStep(
  item: Exclude<RichResponseItem, number>,
  context: RichResponseContext,
): ConvertedRichStep | null {
  if ("messaging_product" in item) {
    logger.warn(
      {
        workspaceId: context.workspaceId,
        conversationId: context.conversationId,
        executionId: context.executionId,
        messageType: "whatsapp_native",
        reason: "unsupported_phase_1",
      },
      "[rich-response] skipped native WhatsApp message",
    )
    return null
  }

  try {
    return convertMessengerMessage(item.message, context)
  } catch (error) {
    logger.warn(
      {
        workspaceId: context.workspaceId,
        conversationId: context.conversationId,
        executionId: context.executionId,
        error: normalizeError(error),
      },
      "[rich-response] failed to convert message",
    )
    return null
  }
}

function convertMessengerMessage(
  message: RichMessengerMessage,
  context: RichResponseContext,
): ConvertedRichStep {
  if (message.quick_replies && message.quick_replies.length > 0) {
    const { buttons, buttonPayloads } = convertQuickReplies(
      message.quick_replies,
      context,
    )
    return {
      step: sendQuickReplyStepSchema.parse(
        sendQuickReplyStepDefaultFn({
          message: message.text ?? "Please select an option",
          buttons,
        }),
      ),
      buttonPayloads,
    }
  }

  if (message.attachment) {
    const attachment = message.attachment
    if (attachment.type === "template") {
      if (attachment.payload.template_type === "button") {
        const { buttons, buttonPayloads } = convertButtons(
          attachment.payload.buttons,
          context,
        )
        return {
          step: sendTextStepSchema.parse(
            sendTextStepDefaultFn({ text: attachment.payload.text, buttons }),
          ),
          buttonPayloads,
        }
      }

      const { cards, buttonPayloads } = convertElements(
        attachment.payload.elements,
        context,
      )
      return {
        step: sendCarouselStepSchema.parse({
          ...sendCarouselStepDefaultFn(),
          cards,
        }),
        buttonPayloads,
      }
    }

    const url = attachment.payload.url
    if (attachment.type === "image") {
      return {
        step: sendImageStepSchema.parse({
          ...sendImageStepDefaultFn(),
          mode: uploadModes.enum.url,
          url,
          buttons: [],
        }),
        buttonPayloads: {},
      }
    }
    if (attachment.type === "video") {
      return {
        step: sendVideoStepSchema.parse({
          ...sendVideoStepDefaultFn(),
          mode: uploadModes.enum.url,
          url,
          buttons: [],
        }),
        buttonPayloads: {},
      }
    }
    if (attachment.type === "audio") {
      return {
        step: sendAudioStepSchema.parse(
          sendAudioStepDefaultFn({
            mode: uploadModes.enum.url,
            url,
            buttons: [],
          }),
        ),
        buttonPayloads: {},
      }
    }
    return {
      step: sendFileStepSchema.parse({
        ...sendFileStepDefaultFn(),
        mode: uploadModes.enum.url,
        url,
        buttons: [],
      }),
      buttonPayloads: {},
    }
  }

  return {
    step: sendTextStepSchema.parse(
      sendTextStepDefaultFn({ text: message.text ?? "", buttons: [] }),
    ),
    buttonPayloads: {},
  }
}

function convertElements(
  elements: Array<{
    title: string
    subtitle?: string
    image_url?: string
    buttons: RichButtonInput[]
  }>,
  context: RichResponseContext,
): {
  cards: SendCardStepSchema[]
  buttonPayloads: Record<string, RichButtonPayloadEntry>
} {
  const allPayloads: Record<string, RichButtonPayloadEntry> = {}
  const cards = elements.map((element) => {
    const { buttons, buttonPayloads } = convertButtons(element.buttons, context)
    Object.assign(allPayloads, buttonPayloads)
    return {
      id: createId(),
      stepType: "sendCard" as const,
      title: element.title,
      subtitle: element.subtitle,
      image: element.image_url
        ? {
            ...sendImageStepDefaultFn(),
            mode: uploadModes.enum.url,
            url: element.image_url,
            buttons: [],
          }
        : undefined,
      buttons,
    } satisfies SendCardStepSchema
  })

  return { cards, buttonPayloads: allPayloads }
}

function convertButtons(
  buttons: RichButtonInput[],
  context: RichResponseContext,
): {
  buttons: ButtonStepProps[]
  buttonPayloads: Record<string, RichButtonPayloadEntry>
} {
  const converted: ButtonStepProps[] = []
  const buttonPayloads: Record<string, RichButtonPayloadEntry> = {}

  for (const button of buttons) {
    const label = normalizeButtonLabel(button.title)
    if (button.type === "web_url" && button.url) {
      converted.push({
        ...buttonStepDefaultFn({ label }),
        buttonType: buttonTypes.enum.openWebsite,
        beforeStep: openWebsiteStepDefaultFn(),
        steps: [],
      })
      const lastButton = converted.at(-1)
      if (lastButton?.buttonType === buttonTypes.enum.openWebsite) {
        lastButton.beforeStep.url = button.url
      }
      continue
    }

    if (button.type === "postback") {
      const payload = parseRichButtonPayload(button.payload)
      if (payload.type === "unsupported") {
        logger.warn(
          {
            workspaceId: context.workspaceId,
            conversationId: context.conversationId,
            executionId: context.executionId,
            reason: payload.reason,
          },
          "[rich-response] omitted unsupported button payload",
        )
        continue
      }

      const richButton = buttonStepDefaultFn({ label })
      converted.push(richButton)
      buttonPayloads[richButton.id] = buildRichButtonPayloadEntry({
        executionId: context.executionId,
        buttonId: richButton.id,
        payload,
      })
      continue
    }

    logger.warn(
      {
        workspaceId: context.workspaceId,
        conversationId: context.conversationId,
        executionId: context.executionId,
        reason: "unsupported_phone_number_button",
      },
      "[rich-response] omitted unsupported button",
    )
  }

  return { buttons: converted, buttonPayloads }
}

function convertQuickReplies(
  quickReplies: Array<{
    title: string
    payload?: string
  }>,
  context: RichResponseContext,
): {
  buttons: ButtonStepProps[]
  buttonPayloads: Record<string, RichButtonPayloadEntry>
} {
  const converted: ButtonStepProps[] = []
  const buttonPayloads: Record<string, RichButtonPayloadEntry> = {}

  for (const quickReply of quickReplies) {
    const richButton = buttonStepDefaultFn({
      label: normalizeButtonLabel(quickReply.title),
    })
    converted.push(richButton)

    const payload = parseRichButtonPayload(quickReply.payload)
    buttonPayloads[richButton.id] = buildRichButtonPayloadEntry({
      executionId: context.executionId,
      buttonId: richButton.id,
      payload:
        payload.type === "unsupported"
          ? {
              type: "text",
              text: quickReply.payload?.trim() || quickReply.title,
            }
          : payload,
    })
  }

  return { buttons: converted, buttonPayloads }
}

function normalizeButtonLabel(label: string): string {
  const trimmed = label.trim()
  return trimmed.length > MAX_BUTTON_LABEL_LENGTH
    ? trimmed.slice(0, MAX_BUTTON_LABEL_LENGTH)
    : trimmed
}
