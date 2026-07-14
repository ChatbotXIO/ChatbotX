import {
  type ButtonStepProps,
  encodeButtonPayload,
  type SendCardStepSchema,
  sendMessageNodeSchema,
  stepTypes,
} from "@chatbotx.io/flow-config"
import { chunk } from "remeda"
import { getAttachmentTemplate } from "./handlers/message/outgoing-message/send-attachment"
import { convertFacebookButtons } from "./handlers/message/outgoing-message/send-button"
import type { FacebookMessage, FacebookQuickReply } from "./schema"

/**
 * Step types allowed inside the starting step when generating Messenger Ads
 * JSON. `sendCard` is intentionally absent: cards only ever live inside a
 * `sendCarousel`, never as a standalone node step.
 */
const ALLOWED_STEP_TYPES = new Set<string>([
  stepTypes.enum.sendText,
  stepTypes.enum.sendImage,
  stepTypes.enum.sendCarousel,
  stepTypes.enum.sendVideo,
  stepTypes.enum.sendAudio,
  stepTypes.enum.sendFile,
])

/** Only these variables survive; everything else is a Facebook limitation. */
const ALLOWED_VARIABLES = new Set(["first_name", "last_name", "full_name"])

/** Matches `{{ name }}` tolerating surrounding whitespace and any inner token. */
const VARIABLE_REGEX = /\{\{\s*([^}]+?)\s*\}\}/g

const MAX_QUICK_REPLIES = 13

/** Facebook caps a generic template at 10 elements; mirror the runtime. */
const MAX_CAROUSEL_ELEMENTS = 10

/** One element of the Messenger Ads opt-in payload array. */
export type MessengerAdsMessage = { message: FacebookMessage }

export type MessengerAdsJsonResult =
  | { status: "ok"; messages: MessengerAdsMessage[] }
  | { status: "error"; reason: "invalidStepType" | "invalidVariable" }

/**
 * Converts a flow's starting step into the array of Facebook Messenger message
 * objects used as a Messenger Ad opt-in payload. Pure and synchronous: media is
 * emitted as a direct-URL attachment (no upload), and postback buttons reuse the
 * platform's colon-delimited payload so ad-originated postbacks route normally.
 */
export function convertStartNodeToMessengerAdsJson(props: {
  startNode: unknown
  flowId: string
  flowVersionId?: string
}): MessengerAdsJsonResult {
  const { startNode, flowId, flowVersionId } = props

  const parsed = sendMessageNodeSchema.safeParse(startNode)
  if (!parsed.success) {
    // Not a Send Message node (e.g. landing page / start flow), so it can't
    // contain the allowed message content.
    return { status: "error", reason: "invalidStepType" }
  }

  const { steps, quickReplies } = parsed.data.data.details

  for (const step of steps) {
    if (!ALLOWED_STEP_TYPES.has(step.stepType)) {
      return { status: "error", reason: "invalidStepType" }
    }
  }

  let hasInvalidVariable = false

  /** Rewrites the 3 allowed variables and flags any other token. */
  const rewrite = (text: string): string =>
    text.replace(VARIABLE_REGEX, (_match, rawName: string) => {
      const name = rawName.trim()
      if (!ALLOWED_VARIABLES.has(name)) {
        hasInvalidVariable = true
        return `{{${name}}}`
      }
      return `{{user_${name}}}`
    })

  /**
   * Templates a step's buttons via the shared runtime helper so ad JSON and
   * live sends never diverge, applying the variable rewrite to each label.
   */
  const buildButtons = (buttons: ButtonStepProps[]) =>
    convertFacebookButtons({
      flowId,
      flowVersionId,
      buttons,
      transformLabel: rewrite,
    })

  const messages: MessengerAdsMessage[] = []

  for (const step of steps) {
    switch (step.stepType) {
      case stepTypes.enum.sendText: {
        const buttons = buildButtons(step.buttons)
        if (buttons) {
          messages.push({
            message: {
              attachment: {
                type: "template",
                payload: {
                  template_type: "button",
                  text: rewrite(step.text),
                  buttons,
                },
              },
            },
          })
        } else {
          messages.push({ message: { text: rewrite(step.text) } })
        }
        break
      }
      case stepTypes.enum.sendCarousel: {
        // Facebook rejects a generic template with more than 10 elements, so
        // chunk cards into one message per group of 10, mirroring the runtime
        // send path (send-carousel).
        for (const cards of chunk(step.cards, MAX_CAROUSEL_ELEMENTS)) {
          messages.push({
            message: {
              attachment: {
                type: "template",
                payload: {
                  template_type: "generic",
                  elements: cards.map((card: SendCardStepSchema) => ({
                    title: rewrite(card.title),
                    subtitle: card.subtitle
                      ? rewrite(card.subtitle)
                      : undefined,
                    image_url: card.image?.url || undefined,
                    buttons: buildButtons(card.buttons),
                  })),
                },
              },
            },
          })
        }
        break
      }
      case stepTypes.enum.sendImage:
      case stepTypes.enum.sendVideo:
      case stepTypes.enum.sendAudio:
      case stepTypes.enum.sendFile: {
        messages.push({
          message: {
            attachment: getAttachmentTemplate(
              step.url,
              mediaType(step.stepType),
            ),
          },
        })
        break
      }
      default:
        // Unreachable: filtered by ALLOWED_STEP_TYPES above.
        break
    }
  }

  // Node-level quick replies ride on the last message, mirroring the runtime.
  const lastMessage = messages.at(-1)
  if (lastMessage && quickReplies.length > 0) {
    lastMessage.message.quick_replies = quickReplies
      .filter((qr) => qr.buttonType !== null)
      .slice(0, MAX_QUICK_REPLIES)
      .map(
        (qr): FacebookQuickReply => ({
          content_type: "text",
          title: rewrite(qr.label),
          payload: encodeButtonPayload({
            flowId,
            flowVersionId,
            buttonId: qr.id,
          }),
        }),
      )
  }

  if (hasInvalidVariable) {
    return { status: "error", reason: "invalidVariable" }
  }

  return { status: "ok", messages }
}

function mediaType(stepType: string): "image" | "video" | "audio" | "file" {
  switch (stepType) {
    case stepTypes.enum.sendImage:
      return "image"
    case stepTypes.enum.sendVideo:
      return "video"
    case stepTypes.enum.sendAudio:
      return "audio"
    default:
      return "file"
  }
}
