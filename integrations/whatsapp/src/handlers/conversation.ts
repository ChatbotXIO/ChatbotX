import {
  type ChannelError,
  type ConversationHandlers,
  type ThreadControlAction,
  type ThreadControlRole,
  ThreadControlTakeRefusedError,
  type ThreadControlWebhookResult,
  threadControlRoles,
} from "@chatbotx.io/sdk"
import { z } from "zod"
import {
  buildThreadControlBody,
  postThreadControl,
} from "../api/thread-control"
import { getWhatsappClient } from "../client"
import {
  parseHandoverEvent,
  type ThreadControlJobPayload,
  threadControlPayloadKinds,
} from "../lib/conversation-routing"
import {
  mapToChannelError,
  THREAD_CONTROL_NOT_ESCALATION_CODE,
} from "../lib/error-mapper"
import { logger } from "../lib/logger"
import { readWhatsappOriginErrorDetail } from "../lib/origin-error"
import { resolveRecipientParams } from "../lib/recipient"
import type { WhatsappAuthValue } from "../schema"

// WhatsApp has no standalone typing API: the indicator rides on marking a
// real inbound message read, so both handlers need that message's wamid.
const sendTyping: ConversationHandlers<WhatsappAuthValue>["sendTyping"] =
  async (props) => {
    const {
      ctx,
      data: { typing, messageSourceId },
    } = props

    if (!(typing && messageSourceId)) {
      return // no typing-off API; no anchor message to type on
    }

    const whatsappClient = getWhatsappClient(ctx.auth)

    await whatsappClient.markAsRead(
      ctx.auth.metadata.phoneNumber.id,
      messageSourceId,
      "text",
    )
  }

const agentMarkAsRead: ConversationHandlers<WhatsappAuthValue>["agentMarkAsRead"] =
  async (props) => {
    const {
      ctx,
      data: { messageSourceId },
    } = props

    if (!messageSourceId) {
      return
    }

    const whatsappClient = getWhatsappClient(ctx.auth)

    await whatsappClient.markAsRead(
      ctx.auth.metadata.phoneNumber.id,
      messageSourceId,
    )
  }

/**
 * The owner role after our own successful action, so the UI can name it:
 * - `take`: only the escalation partner may take (Meta error `2494191`
 *   otherwise), so after a take we ARE escalation — which is why the pass
 *   dialog then drops the escalation target: an untargeted pass by the
 *   escalation partner is refused (Meta E-7), a targeted one is valid;
 * - `pass`: the target (Meta's default is the escalation partner);
 * - `release`: the thread is idle and has no owner.
 */
const OWNER_ROLE_AFTER_ACTION: Record<
  ThreadControlAction,
  (targetRole?: ThreadControlRole) => ThreadControlRole | null
> = {
  take: () => threadControlRoles.enum.escalation,
  pass: (targetRole) => targetRole ?? threadControlRoles.enum.escalation,
  release: () => null,
}

const updateThreadControl: ConversationHandlers<WhatsappAuthValue>["updateThreadControl"] =
  async (props) => {
    const {
      ctx,
      data: { contact, action, targetRole, metadata },
    } = props

    const phoneNumberId = ctx.auth.metadata.phoneNumber.id
    try {
      const { requestId } = await postThreadControl(
        ctx.auth,
        buildThreadControlBody({
          recipient: resolveRecipientParams(contact),
          action,
          targetRole,
          metadata,
        }),
      )
      // Meta's request id is what its support asks for (Partner Testing
      // Guide §2.2 / §7): keep it on every successful call.
      logger.info(
        {
          action,
          targetRole,
          hasMetadata: Boolean(metadata),
          phoneNumberId,
          requestId,
        },
        "Whatsapp thread_control applied",
      )
    } catch (error) {
      const channelError = mapToChannelError(error)
      // Meta's fbtrace_id is what its support asks for on a failed call.
      logger.warn(
        {
          err: channelError,
          action,
          targetRole,
          phoneNumberId,
          code: channelError.code,
          fbtraceId: readWhatsappOriginErrorDetail(
            channelError.getOriginError(),
          ).fbtraceId,
        },
        "Whatsapp thread_control refused",
      )
      throw toThreadControlChannelError(action, channelError)
    }
    return { ownerRole: OWNER_ROLE_AFTER_ACTION[action](targetRole) }
  }

/**
 * Meta's `2494191` on a `take` means only the escalation partner may take the
 * thread: surfaced as the channel-agnostic `ThreadControlTakeRefusedError`
 * so the inbox can show its inline explanation. Every other error is kept.
 */
const toThreadControlChannelError = (
  action: ThreadControlAction,
  error: ChannelError,
): ChannelError =>
  action === "take" && Number(error.code) === THREAD_CONTROL_NOT_ESCALATION_CODE
    ? ThreadControlTakeRefusedError.fromChannelError(error)
    : error

/**
 * The `receiveMessage` shape, validated loosely: `whatsappWebhookEventSchema`
 * declares `message` as an empty `z.object()`, which would strip its content.
 */
const whatsappStandbyBodySchema = z.object({
  phoneID: z.string(),
  from: z.string(),
  message: z.record(z.string(), z.unknown()),
  name: z.string().optional(),
  raw: z.unknown().optional(),
})

/** Validates the job payload the webhook extractor enqueued. */
const threadControlJobPayloadSchema = z.object({
  kind: z.enum(threadControlPayloadKinds),
  body: z.unknown(),
}) satisfies z.ZodType<ThreadControlJobPayload>

/**
 * Turns a `threadControlEvent` job into a handover event or a standby message
 * for `receiveMessage`. Returns `null` (never throws) for anything malformed.
 */
const resolveThreadControlEvent = (
  payload: unknown,
): ThreadControlWebhookResult | null => {
  const job = threadControlJobPayloadSchema.safeParse(payload)
  if (!job.success) {
    logger.warn(
      { issues: job.error.issues },
      "Whatsapp threadControlEvent dropped: malformed job payload",
    )
    return null
  }

  if (job.data.kind === "handover") {
    const event = parseHandoverEvent(job.data.body)
    return event ? { kind: "handover", event } : null
  }

  // standbyMessage and standbyEcho: the body is the `receiveMessage` shape.
  const receivePayload = whatsappStandbyBodySchema.safeParse(job.data.body)
  if (!receivePayload.success) {
    logger.warn(
      { issues: receivePayload.error.issues },
      "Whatsapp standby item dropped: malformed body",
    )
    return null
  }
  return { kind: "standbyMessage", receivePayload: receivePayload.data }
}

const receiveThreadControlEvent: ConversationHandlers<WhatsappAuthValue>["receiveThreadControlEvent"] =
  (props) => Promise.resolve(resolveThreadControlEvent(props.data.payload))

export const conversationHandlers = {
  sendTyping,
  agentMarkAsRead,
  updateThreadControl,
  receiveThreadControlEvent,
}
