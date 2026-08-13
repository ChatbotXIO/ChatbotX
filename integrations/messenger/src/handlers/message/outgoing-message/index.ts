import {
  type SendAudioStepSchema,
  type SendCarouselStepSchema,
  type SendFileStepSchema,
  type SendImageStepSchema,
  type SendMessengerTemplateMessageStepSchema,
  type SendQuickReplyStepSchema,
  type SendTextStepSchema,
  type SendVideoStepSchema,
  stepTypes,
} from "@chatbotx.io/flow-config"
import {
  ChannelError,
  ChannelErrorCategory,
  contentTypes,
  getCanonicalReplyPayload,
  MESSENGER_NATIVE_QUICK_REPLY,
  META_HUMAN_AGENT_WINDOW_MS,
  META_RESPONSE_WINDOW_MS,
  type MessageButtonTemplate,
  type MessageHandlers,
  normalizeLastIncomingMessageAt,
  type OutgoingContact,
  type OutgoingMessage,
  type SendFlowStepProps,
} from "@chatbotx.io/sdk"
import { sendPrivateReplyMessage } from "../../../apis/comment"
import { sendPageMessage } from "../../../apis/message"
import { ensureMessengerWhitelistedDomain } from "../../../apis/page"
import { mapToChannelError } from "../../../lib/error-mapper"
import { logger } from "../../../lib/logger"
import {
  type FacebookButton,
  type FacebookMessage,
  type FacebookMessageAttachmentPayload,
  type FacebookSendMessageRequest,
  MESSENGER_MESSAGE_METADATA,
  type MessengerAuthValue,
  type MessengerIntegrationDetail,
} from "../../../schema"
import { resolveMessengerPersonaId } from "./persona"
import { getAttachmentTemplate } from "./send-attachment"
import { convertFlowStepCarousel } from "./send-carousel"
import { convertFlowStepFile } from "./send-file"
import { convertFlowStepGif } from "./send-gif"
import { convertFlowStepMedia } from "./send-media"
import { buildMessengerTemplateSendRequest } from "./send-messenger-template"
import { convertCanonicalFacebookQuickReplies } from "./send-quick-replies"
import { convertFlowStepQuickReply } from "./send-quick-reply"
import { convertFlowStepText } from "./send-text"

type MessengerMessagingPolicy = {
  messagingType: "MESSAGE_TAG" | "RESPONSE"
  tag?: FacebookSendMessageRequest["tag"]
}

const MESSENGER_EXTENSION_DOMAIN_NOT_WHITELISTED_SUBCODE = 2_018_062
const ensuredMessengerExtensionDomains = new Set<string>()

const isMessengerExtensionDomainNotWhitelistedError = (error: unknown) =>
  mapToChannelError(error).subCode ===
  MESSENGER_EXTENSION_DOMAIN_NOT_WHITELISTED_SUBCODE

const getMessengerExtensionUrl = (
  payload: FacebookSendMessageRequest,
): string | undefined => {
  const attachmentPayload = payload.message?.attachment?.payload
  const button = attachmentPayload?.buttons?.find(
    (button) => button.messenger_extensions && button.url,
  )
  if (button?.url) {
    return button.url
  }

  for (const element of attachmentPayload?.elements ?? []) {
    const elementButton = element.buttons?.find(
      (button) => button.messenger_extensions && button.url,
    )
    if (elementButton?.url) {
      return elementButton.url
    }
  }
}

const ensureMessengerExtensionUrlDomain = async (
  ctx: SendFlowStepProps<MessengerAuthValue>["ctx"],
  url?: string,
) => {
  if (!url) {
    return
  }

  const domain = new URL(url).origin
  const cacheKey = `${ctx.auth.metadata.pageId}:${domain}`
  if (ensuredMessengerExtensionDomains.has(cacheKey)) {
    return
  }

  await ensureMessengerWhitelistedDomain({ ctx, appUrl: url })
  ensuredMessengerExtensionDomains.add(cacheKey)
}

const sendPageMessageWithMessengerExtensionWhitelistRetry = async (
  ctx: SendFlowStepProps<MessengerAuthValue>["ctx"],
  payload: FacebookSendMessageRequest,
) => {
  const messengerExtensionUrl = getMessengerExtensionUrl(payload)
  await ensureMessengerExtensionUrlDomain(ctx, messengerExtensionUrl)

  try {
    return await sendPageMessage(ctx.auth, payload)
  } catch (error) {
    if (!isMessengerExtensionDomainNotWhitelistedError(error)) {
      throw error
    }
    if (messengerExtensionUrl) {
      ensuredMessengerExtensionDomains.delete(
        `${ctx.auth.metadata.pageId}:${new URL(messengerExtensionUrl).origin}`,
      )
    }
    await ensureMessengerExtensionUrlDomain(ctx, messengerExtensionUrl)
    return await sendPageMessage(ctx.auth, payload)
  }
}

export const sendMessage: MessageHandlers<MessengerAuthValue>["sendMessage"] =
  async (props) => {
    const {
      ctx,
      data: { contact, message, quickReplies, sendFrom },
    } = props

    const messageIds: string[] = []
    try {
      const policy = resolveMessengerMessagingPolicy({ contact, sendFrom })
      const facebookMessages = [...convertMessageToFacebookMessage(message)]
      const lastMessage = facebookMessages.at(-1)
      const nativeQuickReplies = (quickReplies ?? []).filter(
        (button) => button.buttonType !== "url",
      )
      if (lastMessage && nativeQuickReplies.length > 0) {
        lastMessage.quick_replies =
          convertCanonicalFacebookQuickReplies(nativeQuickReplies)
      }
      for (const facebookMessage of facebookMessages) {
        const payload = buildMessagePayload({
          contact,
          message: facebookMessage,
          ...policy,
          personaId: resolveMessengerPersonaId(
            ctx.integrationDetail as MessengerIntegrationDetail,
            contact,
          ),
        })
        const response =
          await sendPageMessageWithMessengerExtensionWhitelistRetry(
            ctx,
            payload,
          )
        if (response.message_id) {
          messageIds.push(response.message_id)
        }
        logger.info(`Message sent for PSID: ${contact.sourceId}`)
      }
    } catch (error) {
      logger.error(error, "An error occurred while sending the message")
      throw mapToChannelError(error)
    }

    // Return the Send API message id(s). The worker persists messageIds[0] as
    // the Message row's sourceId; without it the channel's message_echo webhook
    // (coexist) cannot dedup the echo against this row and inserts a duplicate.
    return {
      messageIds,
    }
  }

export const sendFlowStep: MessageHandlers<MessengerAuthValue>["sendFlowStep"] =
  async (props: SendFlowStepProps<MessengerAuthValue>) => {
    const {
      ctx,
      data: { contact, sendFrom, step, commentAnchor },
    } = props
    const messageIds: string[] = []
    try {
      // Messenger utility templates must be sent as a complete Send API request
      // using message.template (name/language/components) — they cannot go through
      // the generic buildMessagePayload spread, which is for plain messages.
      // Known gap: a comment-anchored private reply whose first flow step is a
      // Messenger template is not covered — it falls back to the normal
      // (messaging-window-gated) send below, same as before this fix.
      if (step.stepType === stepTypes.enum.sendMessengerTemplateMessage) {
        const payload = buildMessengerTemplateSendRequest(
          props as SendFlowStepProps<
            MessengerAuthValue,
            SendMessengerTemplateMessageStepSchema
          >,
        )
        const response =
          await sendPageMessageWithMessengerExtensionWhitelistRetry(
            ctx,
            payload,
          )
        logger.info(`Messenger template sent for PSID: ${contact.sourceId}`)
        return {
          messageIds: response.message_id ? [response.message_id] : [],
        }
      }

      const policy = resolveMessengerMessagingPolicy({ contact, sendFrom })
      // Consumed by the first Facebook message yielded below, if a private
      // comment anchor is present — a single flow step can yield more than
      // one Facebook message (e.g. text + attachments), so only the very
      // first send uses the comment_id-anchored API; the rest use the normal
      // path (the private reply already opened a standard messaging window).
      // A "public" anchor is never honored here — it's delivered via the
      // comment channel's sendComment, not this message channel's
      // sendFlowStep (see send-flow-step.ts). This check is defense-in-depth
      // against a public anchor ever reaching this handler by mistake.
      let anchorCommentId =
        commentAnchor?.replyChannel === "private"
          ? commentAnchor.commentId
          : undefined
      for await (const facebookMessage of convertFlowStepToFacebookMessage(
        props,
      )) {
        const personaId = resolveMessengerPersonaId(
          ctx.integrationDetail as MessengerIntegrationDetail,
          contact,
        )
        const response = anchorCommentId
          ? await sendPrivateReplyMessage(
              ctx.auth,
              anchorCommentId,
              facebookMessage,
              personaId,
            )
          : await sendPageMessageWithMessengerExtensionWhitelistRetry(
              ctx,
              buildMessagePayload({
                contact,
                message: facebookMessage,
                ...policy,
                personaId,
              }),
            )
        anchorCommentId = undefined
        if (response.message_id) {
          messageIds.push(response.message_id)
        }
        logger.info(`Message sent for PSID: ${contact.sourceId}`)
      }
    } catch (error) {
      logger.error(error, "An error occurred while sending the message")
      throw mapToChannelError(error)
    }

    // Return the Send API message id(s) so the worker can persist messageIds[0]
    // as the Message row's sourceId (coexist echo dedup — see sendMessage).
    return {
      messageIds,
    }
  }

function* convertMessageToFacebookMessage(
  message: OutgoingMessage,
): Generator<FacebookMessage> {
  if (message.contentType === contentTypes.enum.text) {
    const templateButtons = getButtonTemplate(message)
    if (message.text && templateButtons.length > 0) {
      yield {
        attachment: {
          type: "template",
          payload: {
            template_type: "button",
            text: message.text,
            buttons: templateButtons,
          },
        },
      }
    } else if (message.text) {
      yield {
        text: message.text,
      }
    }
    for (const attachment of message.attachments || []) {
      switch (attachment.fileType) {
        case "image":
          yield {
            attachment: getAttachmentTemplate(
              attachment.url as string,
              "image",
            ),
          }
          continue
        case "video":
          yield {
            attachment: getAttachmentTemplate(
              attachment.url as string,
              "video",
            ),
          }
          continue
        case "audio":
          yield {
            attachment: getAttachmentTemplate(
              attachment.url as string,
              "audio",
            ),
          }
          continue
        default:
          yield {
            attachment: getAttachmentTemplate(attachment.url as string, "file"),
          }
          continue
      }
    }
  } else {
    yield {
      text: message.text ?? "not handled yet",
    }
  }
}

const getButtonTemplate = (message: OutgoingMessage): FacebookButton[] => {
  const attrs = message.contentAttributes
  if (!(attrs && typeof attrs === "object")) {
    return []
  }
  const record = attrs as {
    type?: unknown
    payload?: { templateType?: unknown; buttons?: unknown }
  }
  if (
    record.type !== "template" ||
    record.payload?.templateType !== "button" ||
    !Array.isArray(record.payload.buttons)
  ) {
    return []
  }

  const buttons = record.payload.buttons.filter(isMessageButtonTemplate)
  if (!buttons.some((button) => button.buttonType === "url")) {
    return []
  }

  return buttons
    .map(toFacebookButton)
    .filter((button): button is FacebookButton => Boolean(button))
}

const isMessageButtonTemplate = (
  value: unknown,
): value is MessageButtonTemplate => {
  if (!(value && typeof value === "object")) {
    return false
  }
  const button = value as Partial<MessageButtonTemplate>
  if (!(typeof button.id === "string" && typeof button.label === "string")) {
    return false
  }
  if (button.buttonType === "url") {
    return typeof button.url === "string"
  }
  if (
    !(button.buttonType === "postback" && typeof button.postback === "string")
  ) {
    return false
  }
  return !isMessengerNativeQuickReply(button as MessageButtonTemplate)
}

const messengerNativeQuickReplyPayloads = new Set<string>(
  Object.values(MESSENGER_NATIVE_QUICK_REPLY),
)

const isMessengerNativeQuickReply = (button: MessageButtonTemplate): boolean =>
  messengerNativeQuickReplyPayloads.has(getCanonicalReplyPayload(button))

const toFacebookButton = (
  button: MessageButtonTemplate,
): FacebookButton | null => {
  if (button.buttonType === "url") {
    return {
      type: "web_url",
      title: button.label,
      url: button.url,
      ...(button.messengerExtensions
        ? {
            messenger_extensions: true,
            webview_height_ratio: "full" as const,
          }
        : {}),
    }
  }
  return {
    type: "postback",
    title: button.label,
    payload: button.postback,
  }
}

const buildMessagePayload = (props: {
  contact: OutgoingContact
  message: FacebookMessageAttachmentPayload | FacebookMessage
  messagingType?: "MESSAGE_TAG" | "RESPONSE"
  tag?: FacebookSendMessageRequest["tag"]
  personaId?: string
}): FacebookSendMessageRequest => {
  const { contact, message, messagingType = "RESPONSE", personaId, tag } = props

  return {
    recipient: { id: contact.sourceId },
    message: {
      ...message,
      metadata: MESSENGER_MESSAGE_METADATA,
    },
    messaging_type: messagingType,
    tag,
    persona_id: personaId,
  }
}

export function resolveMessengerMessagingPolicy(props: {
  contact: OutgoingContact
  now?: Date | number
  sendFrom?: "inbox"
}): MessengerMessagingPolicy {
  const { contact, sendFrom } = props

  if (sendFrom !== "inbox") {
    return { messagingType: "RESPONSE" }
  }

  const lastIncomingMessageAt = normalizeLastIncomingMessageAt(
    contact.lastIncomingMessageAt,
  )

  if (!lastIncomingMessageAt) {
    return { messagingType: "RESPONSE" }
  }

  let nowMs = Date.now()
  if (props.now instanceof Date) {
    nowMs = props.now.getTime()
  } else if (typeof props.now === "number") {
    nowMs = props.now
  }
  const elapsedMs = nowMs - lastIncomingMessageAt.getTime()

  if (elapsedMs <= META_RESPONSE_WINDOW_MS) {
    return { messagingType: "RESPONSE" }
  }

  if (elapsedMs <= META_HUMAN_AGENT_WINDOW_MS) {
    return { messagingType: "MESSAGE_TAG", tag: "HUMAN_AGENT" }
  }

  throw new ChannelError(
    "Cannot send a Messenger inbox message more than 7 days after the last incoming message",
    ChannelErrorCategory.PAYLOAD_INVALID,
    { code: "messenger_human_agent_window_expired" },
  )
}

async function* convertFlowStepToFacebookMessage(
  props: SendFlowStepProps<MessengerAuthValue>,
): AsyncGenerator<FacebookMessageAttachmentPayload | FacebookMessage> {
  const {
    data: { step },
  } = props

  switch (step.stepType) {
    case stepTypes.enum.sendText:
      yield* convertFlowStepText(
        props as SendFlowStepProps<MessengerAuthValue, SendTextStepSchema>,
      ) as Generator<FacebookMessageAttachmentPayload | FacebookMessage>
      break
    case stepTypes.enum.sendImage:
    case stepTypes.enum.sendVideo:
      await (yield* convertFlowStepMedia(
        props as SendFlowStepProps<
          MessengerAuthValue,
          SendImageStepSchema | SendVideoStepSchema
        >,
      ))
      break
    case stepTypes.enum.sendAudio:
    case stepTypes.enum.sendFile:
      await (yield* convertFlowStepFile(
        props as SendFlowStepProps<
          MessengerAuthValue,
          SendAudioStepSchema | SendFileStepSchema
        >,
      ))
      break
    case stepTypes.enum.sendGif:
      yield* convertFlowStepGif(
        step.url,
        props.data.quickReplies ?? [],
      ) as Generator<FacebookMessage>
      break
    case stepTypes.enum.sendQuickReply:
      yield* convertFlowStepQuickReply(
        props as SendFlowStepProps<
          MessengerAuthValue,
          SendQuickReplyStepSchema
        >,
      ) as Generator<FacebookMessage>
      break
    case stepTypes.enum.sendCarousel:
      yield* convertFlowStepCarousel(
        props as SendFlowStepProps<MessengerAuthValue, SendCarouselStepSchema>,
      ) as Generator<FacebookMessage>
      break
    default:
      break
  }
}
