import type {
  MmButton,
  MmContent,
  MmGenericElement,
  MmMediaRef,
  MmPostbackAction,
  MmQuickReply,
} from "@chatbotx.io/database/partials"
import { encodeButtonPayload } from "@chatbotx.io/flow-config"

const WEBVIEW_RATIO = { 40: "compact", 70: "tall", 100: "full" } as const

/**
 * Postback payload for a button / quick reply. An MM button id exists in no
 * flow, so it is never encoded: `startExternalFlow` carries `{ flowId }` (the
 * bare-flow branch of the worker, like persistent menus) and `startExternalNode`
 * carries `{ flowId, nodeId }`. Never carries `broadcastId`.
 */
function encodePostback(action: MmPostbackAction): string {
  return action.actionType === "startExternalNode"
    ? encodeButtonPayload({ flowId: action.flowId, nodeId: action.nodeId })
    : encodeButtonPayload({ flowId: action.flowId })
}

function convertButton(button: MmButton): Record<string, unknown> {
  if (button.actionType === "openWebsite") {
    return {
      type: "web_url",
      title: button.title,
      url: button.url,
      webview_height_ratio: WEBVIEW_RATIO[button.browserSize],
    }
  }
  return {
    type: "postback",
    title: button.title,
    payload: encodePostback(button),
  }
}

function convertQuickReply(qr: MmQuickReply): Record<string, unknown> {
  const payload = qr.action ? { payload: encodePostback(qr.action) } : {}
  if (qr.contentType === "text") {
    return { content_type: "text", title: qr.title, ...payload }
  }
  return { content_type: qr.contentType, ...payload }
}

function convertMedia(
  media: MmMediaRef,
): { attachment_id: string } | { url: string } {
  return media.attachmentId
    ? { attachment_id: media.attachmentId }
    : { url: media.url }
}

function convertElement(element: MmGenericElement): Record<string, unknown> {
  return {
    title: element.title,
    ...(element.subtitle ? { subtitle: element.subtitle } : {}),
    ...(element.image?.url ? { image_url: element.image.url } : {}),
    ...(element.buttons.length > 0
      ? { buttons: element.buttons.map(convertButton) }
      : {}),
  }
}

function withQuickReplies(
  message: Record<string, unknown>,
  quickReplies: MmQuickReply[],
): Record<string, unknown> {
  return quickReplies.length > 0
    ? { ...message, quick_replies: quickReplies.map(convertQuickReply) }
    : message
}

function templateAttachment(payload: Record<string, unknown>) {
  return { attachment: { type: "template", payload } }
}

export function buildMarketingMessagePayload(
  content: MmContent,
): Record<string, unknown> {
  switch (content.templateType) {
    case "text":
      return withQuickReplies({ text: content.text }, content.quickReplies)
    case "button":
      return withQuickReplies(
        templateAttachment({
          template_type: "button",
          text: content.text,
          buttons: content.buttons.map(convertButton),
        }),
        content.quickReplies,
      )
    case "media":
      return withQuickReplies(
        templateAttachment({
          template_type: "media",
          elements: [
            {
              media_type: content.mediaType,
              ...convertMedia(content.media),
              ...(content.buttons.length > 0
                ? { buttons: content.buttons.map(convertButton) }
                : {}),
            },
          ],
        }),
        content.quickReplies,
      )
    case "generic":
      return withQuickReplies(
        templateAttachment({
          template_type: "generic",
          ...(content.greeting ? { text: content.greeting } : {}),
          elements: content.elements.map(convertElement),
        }),
        content.quickReplies,
      )
    default: {
      const exhaustive: never = content
      return exhaustive
    }
  }
}

/** Text, greeting or first element title — used for the inbox message. */
export function summarizeMarketingMessage(content: MmContent): string {
  switch (content.templateType) {
    case "text":
    case "button":
      return content.text
    case "media":
      return ""
    case "generic":
      return content.greeting || content.elements[0]?.title || ""
    default:
      return ""
  }
}
