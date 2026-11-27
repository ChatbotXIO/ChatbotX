import {
  type ButtonStepProps,
  buttonTypes,
  encodeButtonPayload,
  type SendCardStepSchema,
  sendMessageNodeSchema,
  stepTypes,
} from "@chatbotx.io/flow-config"
import { containsVariablePlaceholder } from "@chatbotx.io/utils/variables"
import { chunk } from "remeda"
import { getAttachmentTemplate } from "./handlers/message/outgoing-message/send-attachment"
import { convertButtons } from "./handlers/message/outgoing-message/send-button"
import type { FacebookMessage, FacebookQuickReply } from "./schema"

/**
 * Step types allowed inside the starting step when generating Messenger Ads
 * JSON. `sendCard` is intentionally absent: cards only ever live inside a
 * `sendCarousel`, never as a standalone node step.
 */
const ALLOWED_STEP_TYPES = new Set<string>([
  stepTypes.enum.sendText,
  stepTypes.enum.sendImage,
  stepTypes.enum.sendMultipleImages,
  stepTypes.enum.sendCarousel,
  stepTypes.enum.sendVideo,
  stepTypes.enum.sendAudio,
  stepTypes.enum.sendFile,
])

/** Lenient mode also accepts GIFs (sent as an image attachment). */
const LENIENT_STEP_TYPES = new Set<string>([
  ...ALLOWED_STEP_TYPES,
  stepTypes.enum.sendGif,
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

export type MessengerAdsJsonMode = "strict" | "lenient"

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
  /**
   * `strict` (copy-JSON dialog): any unsupported step/variable is an error.
   * `lenient` (welcome message flow sync): unsupported steps are skipped,
   * unsupported variables are blanked, and the result is always `ok`.
   */
  mode?: MessengerAdsJsonMode
}): MessengerAdsJsonResult {
  const { startNode, flowId, flowVersionId, mode = "strict" } = props
  const lenient = mode === "lenient"

  const parsed = sendMessageNodeSchema.safeParse(
    lenient ? withLenientSteps(startNode) : startNode,
  )
  if (!parsed.success) {
    // Not a Send Message node (e.g. landing page / start flow), so it can't
    // contain the allowed message content.
    return lenient
      ? { status: "ok", messages: [] }
      : { status: "error", reason: "invalidStepType" }
  }

  const { steps, quickReplies } = parsed.data.data.details

  // Lenient mode already dropped unsupported steps in `withLenientSteps`.
  if (!lenient) {
    for (const step of steps) {
      if (!ALLOWED_STEP_TYPES.has(step.stepType)) {
        return { status: "error", reason: "invalidStepType" }
      }
    }
  }

  let hasInvalidVariable = false

  /** Rewrites the 3 allowed variables and flags any other token. */
  const rewrite = (text: string): string =>
    text.replace(VARIABLE_REGEX, (_match, rawName: string) => {
      const name = rawName.trim()
      if (!ALLOWED_VARIABLES.has(name)) {
        hasInvalidVariable = true
        return lenient ? "" : `{{${name}}}`
      }
      return `{{user_${name}}}`
    })

  /** Rewrites a title or label; lenient mode trims what stripping left. */
  const rewriteLabel = (label: string): string =>
    lenient ? rewrite(label).trim() : rewrite(label)

  /**
   * Lenient only: Meta rejects the whole flow over one empty title or label,
   * so a button, card or quick reply left blank by variable stripping is
   * dropped instead (strict mode already rejects the unknown variable).
   */
  const isBlankLabel = (label: string): boolean =>
    lenient && rewriteLabel(label) === ""

  /**
   * Ad JSON is static, so a Call Phone Number button whose number still holds
   * a `{{variable}}` can never become the `+<country><number>` Meta requires.
   * Strict mode reports it like any other unsupported variable; lenient mode
   * drops the button, as it does a blank one.
   */
  const shouldDropButton = (button: ButtonStepProps): boolean => {
    if (
      button.buttonType === buttonTypes.enum.callPhoneNumber &&
      containsVariablePlaceholder(button.beforeStep.phoneNumber)
    ) {
      hasInvalidVariable = true
      return lenient
    }
    return isBlankLabel(button.label)
  }

  /**
   * Templates a step's buttons via the shared runtime helper so ad JSON and
   * live sends never diverge, applying the variable rewrite to each label.
   * If every button is dropped the helper returns `undefined`, so a text
   * step falls back to a plain text message.
   */
  const buildButtons = (buttons: ButtonStepProps[]) =>
    convertButtons({
      flowId,
      flowVersionId,
      buttons: buttons.filter((button) => !shouldDropButton(button)),
      transformLabel: rewriteLabel,
    })

  const messages: MessengerAdsMessage[] = []

  for (const step of steps) {
    switch (step.stepType) {
      case stepTypes.enum.sendText: {
        const text = rewrite(step.text)
        // Meta rejects an empty text (or button template text); in lenient
        // mode a step left blank by variable stripping is dropped.
        if (lenient && text.trim() === "") {
          break
        }
        const buttons = buildButtons(step.buttons)
        if (buttons) {
          messages.push({
            message: {
              attachment: {
                type: "template",
                payload: {
                  template_type: "button",
                  text,
                  buttons,
                },
              },
            },
          })
        } else {
          messages.push({ message: { text } })
        }
        break
      }
      case stepTypes.enum.sendCarousel: {
        // Facebook rejects a generic template with more than 10 elements, so
        // chunk cards into one message per group of 10, mirroring the runtime
        // send path (send-carousel).
        const keptCards = step.cards.filter(
          (card: SendCardStepSchema) => !isBlankLabel(card.title),
        )
        for (const cards of chunk(keptCards, MAX_CAROUSEL_ELEMENTS)) {
          messages.push({
            message: {
              attachment: {
                type: "template",
                payload: {
                  template_type: "generic",
                  elements: cards.map((card: SendCardStepSchema) => ({
                    title: rewriteLabel(card.title),
                    subtitle: card.subtitle
                      ? rewriteLabel(card.subtitle) || undefined
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
      case stepTypes.enum.sendFile:
      case stepTypes.enum.sendGif: {
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
      case stepTypes.enum.sendMultipleImages: {
        // Schema caps this step at 10 images (same as Facebook's attachments[]
        // limit), so unlike sendCarousel's cards this never needs chunking.
        messages.push({
          message: {
            attachments: step.images.map((image) =>
              getAttachmentTemplate(image.url, "image"),
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
  const keptQuickReplies = quickReplies
    .filter((qr) => qr.buttonType !== null && !isBlankLabel(qr.label))
    .slice(0, MAX_QUICK_REPLIES)
  if (lastMessage && keptQuickReplies.length > 0) {
    lastMessage.message.quick_replies = keptQuickReplies.map(
      (qr): FacebookQuickReply => ({
        content_type: "text",
        title: rewriteLabel(qr.label),
        payload: encodeButtonPayload({
          flowId,
          flowVersionId,
          buttonId: qr.id,
        }),
      }),
    )
  }

  if (hasInvalidVariable && !lenient) {
    return { status: "error", reason: "invalidVariable" }
  }

  return { status: "ok", messages }
}

/**
 * Drops unsupported steps from the raw node before schema parsing, so a step
 * that lenient mode would skip anyway can't fail validation for the whole
 * node and take every supported message down with it.
 */
function withLenientSteps(startNode: unknown): unknown {
  const details = (startNode as { data?: { details?: { steps?: unknown } } })
    ?.data?.details
  if (!(details && Array.isArray(details.steps))) {
    return startNode
  }
  const node = startNode as { data: { details: Record<string, unknown> } }
  return {
    ...node,
    data: {
      ...node.data,
      details: {
        ...details,
        steps: details.steps.filter((step: unknown) =>
          LENIENT_STEP_TYPES.has(
            (step as { stepType?: string })?.stepType ?? "",
          ),
        ),
      },
    },
  }
}

function mediaType(stepType: string): "image" | "video" | "audio" | "file" {
  switch (stepType) {
    case stepTypes.enum.sendImage:
    case stepTypes.enum.sendGif:
      return "image"
    case stepTypes.enum.sendVideo:
      return "video"
    case stepTypes.enum.sendAudio:
      return "audio"
    default:
      return "file"
  }
}
