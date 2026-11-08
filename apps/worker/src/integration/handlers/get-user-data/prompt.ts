import {
  contactService,
  normalizeLanguage,
  resolveTenantSettings,
  workspaceService,
} from "@chatbotx.io/business"
import { validateReplyInput } from "@chatbotx.io/business/get-user-data"
import { signUserDataWebviewToken } from "@chatbotx.io/encryption"
import {
  encodeContactHintQuickReplyPayload,
  encodeStepInputSkipPostback,
  type GetUserDataStepSchema,
  ReplyFormat,
  type SendTextStepSchema,
  stepTypes,
} from "@chatbotx.io/flow-config"
import {
  MESSENGER_NATIVE_QUICK_REPLY,
  type MessageButtonTemplate,
  NATIVE_LOCATION_REQUEST_CHANNELS,
  URL_QUICK_REPLY_CAPABLE_CHANNELS,
  WHATSAPP_NATIVE_LOCATION_REQUEST,
} from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import { ChatJobAction, chatQueue } from "@chatbotx.io/worker-config"
import { waitForChatJobCompletion } from "../../utils/message"
import type { ExecuteStepProps } from "../flow"
import { enqueueFlowStepMessage } from "../flow-utils"

import {
  resolveChallengeFlowVersionId,
  resolveChallengeNodeId,
} from "./challenge-cycle"

export function hasSkipButton(step: GetUserDataStepSchema): boolean {
  return step.skipButtonLabel.trim().length > 0
}

type DateTimeWebviewMode = "date" | "datetime"

// Maps the free-text replyFormat enum to the two formats that get a webview
// date/datetime picker instead of a plain text prompt (RF09/RF10). Every
// other replyFormat keeps the existing text-prompt behavior unchanged.
const DATE_TIME_WEBVIEW_MODE_BY_REPLY_FORMAT: Partial<
  Record<ReplyFormat, DateTimeWebviewMode>
> = {
  [ReplyFormat.date]: "date",
  [ReplyFormat.datetime]: "datetime",
}

type UserDataWebviewCopy = {
  selectDate: string
}

// Deliberate worker-side i18n exception (no next-intl in the worker runtime):
// mirrors the APPOINTMENT_SCHEDULING_COPY pattern in
// packages/business/src/appointment/copy.ts for the same reason.
const USER_DATA_WEBVIEW_COPY = {
  en: { selectDate: "Select Date" },
  vi: { selectDate: "Chọn ngày" },
} satisfies Record<string, UserDataWebviewCopy>

function getUserDataWebviewCopy(input: {
  language?: string | null
}): UserDataWebviewCopy {
  return normalizeLanguage(input.language) === "vi"
    ? USER_DATA_WEBVIEW_COPY.vi
    : USER_DATA_WEBVIEW_COPY.en
}

/**
 * The Skip button: a quick reply whose postback only carries the challenge id.
 * Channels cap the shown label, so it is shortened for display only.
 */
function buildSkipQuickReplies(
  step: GetUserDataStepSchema,
  challengeId: string,
): MessageButtonTemplate[] {
  if (!hasSkipButton(step)) {
    return []
  }
  return [
    {
      id: createId(),
      label: toQuickReplyTitle(step.skipButtonLabel.trim()),
      buttonType: "postback",
      postback: encodeStepInputSkipPostback(challengeId),
    },
  ]
}

/** Sends the step's question in the format its reply type and channel call for. */
export async function sendPrompt(
  props: ExecuteStepProps<GetUserDataStepSchema>,
  challengeId: string,
): Promise<void> {
  const { contactInbox, step } = props
  const skipQuickReplies = buildSkipQuickReplies(step, challengeId)

  // Only offer the webview picker on channels whose outgoing converter
  // actually renders a "url" quick reply as a real link-opening button
  // (see URL_QUICK_REPLY_CAPABLE_CHANNELS). Every other channel falls
  // through to the plain-text prompt below — typed date input still works
  // there, unchanged from before the webview picker existed.
  const webviewMode = DATE_TIME_WEBVIEW_MODE_BY_REPLY_FORMAT[step.replyFormat]
  if (
    webviewMode &&
    URL_QUICK_REPLY_CAPABLE_CHANNELS.has(contactInbox.channel)
  ) {
    await sendDateTimePrompt(
      props,
      step.message,
      {
        nodeId: resolveChallengeNodeId(props),
        flowVersionId: resolveChallengeFlowVersionId(props),
        challengeId,
        mode: webviewMode,
      },
      skipQuickReplies,
    )
    return
  }

  if (
    step.replyFormat === ReplyFormat.location &&
    NATIVE_LOCATION_REQUEST_CHANNELS.has(contactInbox.channel)
  ) {
    await sendWhatsappLocationRequestPrompt(props, step.message)
    // The native request carries no other control, so Skip follows as its own
    // message whose text is the author's own label.
    if (skipQuickReplies.length > 0) {
      await sendTextPrompt(props, step.skipButtonLabel.trim(), skipQuickReplies)
    }
    return
  }

  const contactHintQuickReplies = await buildContactHintQuickReplies(props)
  if (contactHintQuickReplies.length > 0) {
    await sendContactHintPrompt(props, step.message, [
      ...contactHintQuickReplies,
      ...skipQuickReplies,
    ])
    return
  }

  await sendTextPrompt(props, step.message, skipQuickReplies)
}

export async function sendTextPrompt(
  props: ExecuteStepProps<GetUserDataStepSchema>,
  text: string,
  presetQuickReplies: MessageButtonTemplate[],
): Promise<void> {
  const { conversation, contactInbox, flowVersion, step } = props

  const promptStep: SendTextStepSchema = {
    id: step.id,
    nodeId: resolveChallengeNodeId(props),
    stepType: stepTypes.enum.sendText,
    text,
    buttons: [],
  }

  await enqueueFlowStepMessage({
    conversationId: conversation.id,
    contactInboxId: contactInbox.id,
    flowId: flowVersion.flowId,
    flowVersionId: resolveChallengeFlowVersionId(props),
    step: promptStep,
    metadata: props.metadata,
    isBulkBroadcast: props.isBulkBroadcast,
    ...(presetQuickReplies.length > 0 ? { presetQuickReplies } : {}),
    ...(props.appointmentId ? { appointmentId: props.appointmentId } : {}),
    ...(props.sentByUserId ? { sentByUserId: props.sentByUserId } : {}),
    // The prompt is this step's outgoing message, so it carries the run's
    // comment anchor like any other message-producing step (see
    // MESSAGE_PRODUCING_STEP_TYPES). Unspent + `private`: the channel sends it
    // through the comment_id-anchored Send API, which is the only way a
    // question-first flow reaches a brand-new commenter. Spent: the channel
    // still needs it to recognise a comment-triggered run and fail with a
    // readable reason outside the 24-hour window. `public`: the prompt is
    // posted as a comment reply, where the contact's next comment resolves
    // back to this same conversation. Spread conditionally so a run that did
    // not start from a comment sends no `commentAnchor` key at all.
    ...(props.commentAnchor ? { commentAnchor: props.commentAnchor } : {}),
  })
}

/**
 * Sends the prompt for RF09 (date) / RF10 (datetime) with a URL quick reply
 * that opens the signed webview picker, mirroring appointment-scheduling.ts's
 * booking prompt. Callers must gate on URL_QUICK_REPLY_CAPABLE_CHANNELS —
 * channels outside that set degrade the "url" quick reply into a non-link
 * control (see the constant's doc), so they get the plain-text prompt
 * instead.
 */
async function sendDateTimePrompt(
  props: ExecuteStepProps<GetUserDataStepSchema>,
  text: string,
  context: {
    nodeId: string
    flowVersionId: string | undefined
    challengeId: string
    mode: DateTimeWebviewMode
  },
  skipQuickReplies: MessageButtonTemplate[],
): Promise<void> {
  const { conversation, contactInbox, flowVersion, step, metadata } = props

  const { appUrl } = await resolveTenantSettings({
    workspaceId: conversation.workspaceId,
  })
  const workspace = await workspaceService.findById({
    id: conversation.workspaceId,
  })
  const copy = getUserDataWebviewCopy({ language: workspace.language })

  const token = await signUserDataWebviewToken({
    workspaceId: conversation.workspaceId,
    conversationId: conversation.id,
    contactInboxId: contactInbox.id,
    contactId: conversation.contactId,
    channel: contactInbox.channel,
    flowId: flowVersion.flowId,
    flowVersionId: context.flowVersionId,
    stepId: step.id,
    nodeId: context.nodeId,
    challengeId: context.challengeId,
    outputFieldId: step.outputFieldId,
    replyFormat: context.mode,
  })

  const pickerUrl = new URL("/extensions/datetime-picker", appUrl)
  pickerUrl.searchParams.set("token", token)

  await chatQueue.add(ChatJobAction.sendChatMessage, {
    type: ChatJobAction.sendChatMessage,
    data: {
      conversation,
      contactInbox,
      text,
      quickReplies: [
        {
          id: createId(),
          label: copy.selectDate,
          buttonType: "url",
          url: pickerUrl.toString(),
          messengerExtensions: true,
        },
        ...skipQuickReplies,
      ],
      trackingContext: props.trackingContext,
      metadata,
      isBulkBroadcast: props.isBulkBroadcast,
    },
  })
}

const LOCATION_REQUEST_COPY = {
  en: { sendLocation: "Send location" },
  vi: { sendLocation: "Gửi vị trí" },
} satisfies Record<string, { sendLocation: string }>

function getLocationRequestCopy(input: { language?: string | null }): {
  sendLocation: string
} {
  return normalizeLanguage(input.language) === "vi"
    ? LOCATION_REQUEST_COPY.vi
    : LOCATION_REQUEST_COPY.en
}

/**
 * Sends getUserData RF08 on WhatsApp as Cloud API
 * `location_request_message` (native "Send location" button) via the
 * reserved {@link WHATSAPP_NATIVE_LOCATION_REQUEST} quick reply. The
 * WhatsApp outgoing converter swaps that marker for the Graph payload;
 * other channels never emit it (see {@link NATIVE_LOCATION_REQUEST_CHANNELS}).
 * Waits for delivery the same way the text-prompt path does, so the flow
 * does not return `wait` before the contact can tap the button.
 */
async function sendWhatsappLocationRequestPrompt(
  props: ExecuteStepProps<GetUserDataStepSchema>,
  text: string,
): Promise<void> {
  const { conversation, contactInbox, step, metadata } = props

  const workspace = await workspaceService.findById({
    id: conversation.workspaceId,
  })
  const copy = getLocationRequestCopy({ language: workspace.language })

  const job = await chatQueue.add(ChatJobAction.sendChatMessage, {
    type: ChatJobAction.sendChatMessage,
    data: {
      conversation,
      contactInbox,
      text,
      quickReplies: [
        {
          id: WHATSAPP_NATIVE_LOCATION_REQUEST,
          label: copy.sendLocation,
          buttonType: "postback",
          postback: WHATSAPP_NATIVE_LOCATION_REQUEST,
        },
      ],
      trackingContext: props.trackingContext,
      metadata,
      isBulkBroadcast: props.isBulkBroadcast,
    },
  })

  await waitForChatJobCompletion(job, {
    conversationId: conversation.id,
    stepId: step.id,
  })
}

/**
 * Channels whose outgoing converter renders `quickReplies` as real quick
 * replies (chips that send their text), not as buttons. Telegram (inline
 * keyboard), WhatsApp (reply buttons), Zalo/TikTok (merged into buttons) and
 * webchat (no quick replies) are deliberately left out.
 */
const CONTACT_HINT_QUICK_REPLY_CHANNELS = new Set(["messenger", "instagram"])

// Meta caps a text quick reply title at 20 characters. Longer values are
// shortened for display only; the payload carries the full value.
const QUICK_REPLY_TITLE_MAX_LENGTH = 20

function toQuickReplyTitle(value: string): string {
  // Count code points, so a shortened title never splits a surrogate pair.
  const characters = Array.from(value)
  return characters.length > QUICK_REPLY_TITLE_MAX_LENGTH
    ? `${characters.slice(0, QUICK_REPLY_TITLE_MAX_LENGTH - 1).join("")}…`
    : value
}

/**
 * Returns the stored phone/email only when it passes the step's own reply
 * validation; otherwise a tap would be rejected and the retry prompt would
 * offer the same unusable hint again until the step auto-skips.
 */
function resolveValidContactHintValue(
  replyFormat: GetUserDataStepSchema["replyFormat"],
  value: string | null | undefined,
): string | undefined {
  const trimmed = value?.trim()
  if (!trimmed) {
    return
  }
  const validation = validateReplyInput(replyFormat, {
    attachments: [],
    contentType: "text",
    text: trimmed,
  })
  return validation.ok ? trimmed : undefined
}

/**
 * Builds the "Show Hint" quick reply for phone/email reply formats from the
 * value stored on the contact (only when it passes the step's validation).
 * The full value travels in the payload (see
 * `encodeContactHintQuickReplyPayload`), so a shortened title still answers
 * with the whole value. When the contact has no stored value, Messenger falls
 * back to its native user_phone_number / user_email quick reply (Facebook
 * fills it from the contact's own account); Instagram has no such fallback.
 * Returns [] when the hint does not apply, so callers fall back to the plain
 * text prompt.
 */
async function buildContactHintQuickReplies(
  props: ExecuteStepProps<GetUserDataStepSchema>,
): Promise<MessageButtonTemplate[]> {
  const { conversation, contactInbox, step } = props
  const isPhone = step.replyFormat === ReplyFormat.phone
  const isEmail = step.replyFormat === ReplyFormat.email

  if (
    !(step.showHint && (isPhone || isEmail)) ||
    props.commentAnchor ||
    !CONTACT_HINT_QUICK_REPLY_CHANNELS.has(contactInbox.channel)
  ) {
    return []
  }

  const contact = await contactService.findById({
    workspaceId: conversation.workspaceId,
    id: conversation.contactId,
  })
  const value = resolveValidContactHintValue(
    step.replyFormat,
    isEmail ? contact?.email : contact?.phoneNumber,
  )
  if (value) {
    const payload = encodeContactHintQuickReplyPayload(value)
    return [
      {
        id: createId(),
        label: toQuickReplyTitle(value),
        buttonType: "postback",
        postback: payload,
      },
    ]
  }

  if (contactInbox.channel === "messenger") {
    const payload = isEmail
      ? MESSENGER_NATIVE_QUICK_REPLY.USER_EMAIL
      : MESSENGER_NATIVE_QUICK_REPLY.USER_PHONE_NUMBER
    // The converter swaps this for the native content_type, so the label is
    // only what the inbox shows for the sent quick reply.
    return [
      {
        id: payload,
        label: isEmail ? "Email" : "Phone",
        buttonType: "postback",
        postback: payload,
      },
    ]
  }

  return []
}

/**
 * Sends the getUserData prompt with the contact hint quick reply. Waits for
 * delivery like the text-prompt path, so the flow does not return `wait`
 * before the contact can tap the hint.
 */
async function sendContactHintPrompt(
  props: ExecuteStepProps<GetUserDataStepSchema>,
  text: string,
  quickReplies: MessageButtonTemplate[],
): Promise<void> {
  const { conversation, contactInbox, step, metadata } = props

  const job = await chatQueue.add(ChatJobAction.sendChatMessage, {
    type: ChatJobAction.sendChatMessage,
    data: {
      conversation,
      contactInbox,
      text,
      quickReplies,
      trackingContext: props.trackingContext,
      metadata,
      isBulkBroadcast: props.isBulkBroadcast,
    },
  })

  await waitForChatJobCompletion(job, {
    conversationId: conversation.id,
    stepId: step.id,
  })
}
