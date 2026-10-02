import {
  ChannelError,
  ChannelErrorCategory,
  type ConversationHandlers,
  SdkException,
  type ThreadControlAction,
  ThreadControlTakeRefusedError,
  type ThreadControlUpdateResult,
  type ThreadControlWebhookEvent,
  type ThreadControlWebhookResult,
  type ThreadOwnerResult,
  threadControlRoles,
} from "@chatbotx.io/sdk"
import { z } from "zod"
import { sendMessage } from "../apis/message"
import {
  getThreadOwner as fetchThreadOwner,
  passThreadControl,
  takeThreadControl,
} from "../apis/thread-control"
import {
  parseRoutingJobBody,
  type ThreadControlJobPayload,
  threadControlPayloadKinds,
} from "../lib/conversation-routing"
import { mapToChannelError } from "../lib/error-mapper"
import { logger } from "../lib/logger"
import {
  readBusinessAiAppId,
  resolveOwnAppId,
} from "../lib/thread-control-config"
import type { MessengerAuthValue } from "../schema"
import {
  bulkThreadControlLimits,
  bulkUpdateThreadControl,
} from "./bulk-thread-control"

const sendTyping: ConversationHandlers<MessengerAuthValue>["sendTyping"] =
  async (props): Promise<void> => {
    const {
      ctx,
      data: { contact, typing },
    } = props

    const recipientId = contact.sourceId

    if (!recipientId) {
      throw new SdkException("Missing recipient ID in conversation")
    }

    await sendMessage(ctx.auth, {
      recipient: { id: recipientId },
      sender_action: typing ? "typing_on" : "typing_off",
    })
  }

const agentMarkAsRead: ConversationHandlers<MessengerAuthValue>["agentMarkAsRead"] =
  async (props): Promise<void> => {
    const {
      ctx,
      data: { contact },
    } = props

    const recipientId = contact.sourceId
    if (!recipientId) {
      throw new SdkException("Missing recipient ID in conversation")
    }

    await sendMessage(ctx.auth, {
      recipient: { id: recipientId },
      sender_action: "mark_seen",
    })
  }

// ---------------------------------------------------------------------------
// Conversation routing (Handover Protocol). Our app is the PRIMARY receiver:
// the owner is an APP ID (roles stay `null`), a take makes US the owner, and
// "return to bot" is a targeted pass to the Business-AI (return-target) app.
// ---------------------------------------------------------------------------

/** Code on the permanent error of an action Messenger has no equivalent for. */
export const THREAD_CONTROL_ACTION_UNSUPPORTED_CODE =
  "threadControlActionUnsupported"

const TAKE_REFUSED_MESSAGE =
  "Messenger did not let this app take the conversation. Make sure this app is the Page's primary receiver in the Page's Handover Protocol settings."

const permanentError = (message: string, code: string): ChannelError =>
  new ChannelError(message, ChannelErrorCategory.PAYLOAD_INVALID, { code })

/**
 * A refused `take` (this app is not the primary receiver / lacks the
 * permission) surfaces as the channel-agnostic `ThreadControlTakeRefusedError`
 * with Messenger wording, not the WhatsApp escalation sentence. Every other
 * error is kept unchanged.
 */
const toThreadControlChannelError = (
  action: ThreadControlAction,
  error: ChannelError,
): ChannelError =>
  action === "take" && error.category === ChannelErrorCategory.PERMISSION_DENIED
    ? new ThreadControlTakeRefusedError(TAKE_REFUSED_MESSAGE, error.category, {
        code: error.code,
        httpStatusCode: error.httpStatusCode,
        subCode: error.subCode ?? null,
        type: error.type,
      })
    : error

/** Meta answers a refused-but-200 call with `{ success: false }`. */
const assertAccepted = (response: { success?: boolean }): void => {
  if (response.success === false) {
    throw new ChannelError(
      "Messenger rejected the thread control request",
      ChannelErrorCategory.PERMISSION_DENIED,
    )
  }
}

const updateThreadControl: ConversationHandlers<MessengerAuthValue>["updateThreadControl"] =
  async (props): Promise<ThreadControlUpdateResult> => {
    const {
      ctx,
      data: { contact, action, metadata },
    } = props

    const psid = contact.sourceId
    if (!psid) {
      throw new SdkException("Missing recipient ID in conversation")
    }

    // `release` has no Messenger equivalent for a primary receiver (it would
    // simply keep the thread). Refused as a permanent error BEFORE any call,
    // so the stored state is never moved to `idle` while Meta still routes to
    // us; the archive auto-release job logs it and completes.
    if (action === "release") {
      throw permanentError(
        "Messenger conversations cannot be released; take over or return to the bot instead",
        THREAD_CONTROL_ACTION_UNSUPPORTED_CODE,
      )
    }

    // "Return to bot" always targets Meta's fixed Business-AI app id.
    const returnTargetAppId = action === "pass" ? readBusinessAiAppId() : null

    try {
      if (action === "take") {
        assertAccepted(await takeThreadControl(ctx.auth, { psid, metadata }))
      } else if (returnTargetAppId) {
        assertAccepted(
          await passThreadControl(ctx.auth, {
            psid,
            targetAppId: returnTargetAppId,
            metadata,
          }),
        )
      }
    } catch (error) {
      throw toThreadControlChannelError(action, mapToChannelError(error))
    }

    // The owner after the action, as an app id: a take makes US the owner, a
    // return-to-bot makes the target (the Business-AI app, an AI agent) the owner.
    return {
      ownerRole: action === "pass" ? threadControlRoles.enum.ai_agent : null,
      ownerAppId:
        action === "take" ? resolveOwnAppId(ctx.auth) : returnTargetAppId,
    }
  }

const getThreadOwner: ConversationHandlers<MessengerAuthValue>["getThreadOwner"] =
  async (props): Promise<ThreadOwnerResult> => {
    const {
      ctx,
      data: { contact },
    } = props

    const psid = contact.sourceId
    if (!psid) {
      throw new SdkException("Missing recipient ID in conversation")
    }

    try {
      const owner = await fetchThreadOwner(ctx.auth, { psid })
      // The identities ride along so shared code can classify the owner
      // without reading Messenger config.
      return {
        ...owner,
        ownAppId: resolveOwnAppId(ctx.auth),
        aiAgentAppId: readBusinessAiAppId(),
      }
    } catch (error) {
      throw mapToChannelError(error)
    }
  }

/** Validates the job payload the webhook extractor enqueued. */
const threadControlJobPayloadSchema = z.object({
  kind: z.enum(threadControlPayloadKinds),
  body: z.unknown(),
}) satisfies z.ZodType<ThreadControlJobPayload>

/**
 * Ownership direction from the app ids, not from the event name: a
 * `pass_thread_control` that names ANOTHER app as the new owner means someone
 * else holds the thread (`controlTaken`, standby), and a `take_thread_control`
 * that names US as the new owner means we hold it (`controlPassed`, owned).
 * Unchanged when our own app id is unknown or the payload names no new owner.
 */
const normalizeOwnershipDirection = (
  event: ThreadControlWebhookEvent,
  ownAppId: string | null,
): ThreadControlWebhookEvent => {
  if (!(ownAppId && event.newOwnerAppId)) {
    return event
  }
  const isNewOwnerUs = event.newOwnerAppId === ownAppId
  if (event.event === "controlPassed" && !isNewOwnerUs) {
    return { ...event, event: "controlTaken" }
  }
  if (event.event === "controlTaken" && isNewOwnerUs) {
    return { ...event, event: "controlPassed" }
  }
  return event
}

/**
 * The resume flow starts for a pass whose new owner is us. Our app is the
 * PRIMARY receiver, so ANY pass back to us is a hand-back worth resuming on,
 * whether it came from Business-AI or another partner app — matching the
 * WhatsApp channel, where every `control_passed` is resume-eligible.
 *
 * The previous owner is intentionally NOT gated: as the primary receiver, a
 * pass whose new owner is us can only come from a secondary receiver handing
 * control back, and Meta often omits `previous_owner_app_id` anyway. Never our
 * own take (it arrives as `controlTaken`), or when our own app id is unknown.
 */
export const isResumeEligibleHandover = (
  event: ThreadControlWebhookEvent,
  ids: { ownAppId: string | null },
): boolean =>
  event.event === "controlPassed" &&
  ids.ownAppId !== null &&
  event.newOwnerAppId === ids.ownAppId

const withHandoverDecisions = (
  result: ThreadControlWebhookResult,
  auth: MessengerAuthValue,
): ThreadControlWebhookResult => {
  if (result.kind !== "handover") {
    return result
  }
  const ownAppId = resolveOwnAppId(auth)
  // Eligibility is judged on the event AS DELIVERED: a `take` that direction
  // normalization turns into a `controlPassed` (we hold the thread) is still
  // our own take, never a hand-back.
  const isEligible = isResumeEligibleHandover(result.event, { ownAppId })
  const aiAgentAppId = readBusinessAiAppId()
  const normalized = normalizeOwnershipDirection(result.event, ownAppId)
  // The Business-AI app is an AI agent: its ownership shows the AI owner label,
  // on either side of the handover.
  const aiAgent = threadControlRoles.enum.ai_agent
  const event = {
    ...normalized,
    ...(normalized.newOwnerAppId === aiAgentAppId
      ? { newOwnerRole: aiAgent }
      : {}),
    ...(normalized.previousOwnerAppId === aiAgentAppId
      ? { previousOwnerRole: aiAgent }
      : {}),
    // Lets shared code recognise a hand-back FROM the AI agent without
    // knowing Messenger's config.
    aiAgentAppId,
  }
  return {
    kind: "handover",
    event: isEligible ? { ...event, resumeEligible: true } : event,
  }
}

const standbyBodySchema = z.object({
  entry: z.array(z.object({ standby: z.array(z.unknown()).min(1) })).min(1),
})

const hasStandbyItem = (body: unknown): boolean =>
  standbyBodySchema.safeParse(body).success

const standbyRewrapSchema = z.object({
  object: z.unknown(),
  entry: z
    .array(
      z.object({
        id: z.unknown(),
        time: z.unknown(),
        // Only a real message can be replayed: Meta strips the payload and
        // title from a standby postback, which the regular delivery schema
        // would reject.
        standby: z
          .array(
            z
              .object({ message: z.record(z.string(), z.unknown()) })
              .passthrough(),
          )
          .min(1),
      }),
    )
    .min(1),
})

/**
 * The stored standby rewrap as the regular `messaging` delivery Meta would have
 * sent had this app owned the thread, so the inbound pipeline treats a replay
 * as an owner delivery. The standby-only `hop_context` is dropped. `null` when
 * the body is not a usable standby rewrap or its item is not a message (a
 * stripped standby postback).
 */
const toOwnerDeliveryPayload = (body: unknown): unknown => {
  const parsed = standbyRewrapSchema.safeParse(body)
  if (!parsed.success) {
    return null
  }
  const { object, entry } = parsed.data
  const [first] = entry
  return {
    object,
    entry: [{ id: first.id, time: first.time, messaging: [first.standby[0]] }],
  }
}

/**
 * Turns a `threadControlEvent` job into a typed routing result. `null` (never
 * throws) for anything malformed or not yet handled.
 */
const resolveThreadControlEvent = (
  payload: unknown,
  auth: MessengerAuthValue,
): ThreadControlWebhookResult | null => {
  const job = threadControlJobPayloadSchema.safeParse(payload)
  if (!job.success) {
    logger.warn(
      { issues: job.error.issues },
      "Messenger threadControlEvent dropped: malformed job payload",
    )
    return null
  }

  if (job.data.kind === "standbyMessage") {
    // The stored body is the standby rewrap `{object, entry:[{id, time,
    // standby:[item]}]}`; `receiveMessage` classifies it as a standby
    // delivery. A body with no usable standby item is dropped here rather than
    // failing (and retrying) the job in the worker.
    if (!hasStandbyItem(job.data.body)) {
      logger.warn("Messenger standby message dropped: no standby item")
      return null
    }
    const ownerReplayPayload = toOwnerDeliveryPayload(job.data.body)
    return {
      kind: "standbyMessage",
      receivePayload: job.data.body,
      ...(ownerReplayPayload
        ? { ownerReplayPayload, aiAgentAppId: readBusinessAiAppId() }
        : {}),
    }
  }

  const result = parseRoutingJobBody(
    job.data.kind,
    job.data.body,
    new Date(),
    resolveOwnAppId(auth),
  )
  return result ? withHandoverDecisions(result, auth) : null
}

const receiveThreadControlEvent: ConversationHandlers<MessengerAuthValue>["receiveThreadControlEvent"] =
  (props) =>
    Promise.resolve(
      resolveThreadControlEvent(props.data.payload, props.ctx.auth),
    )

export const conversationHandlers = {
  sendTyping,
  agentMarkAsRead,
  updateThreadControl,
  bulkUpdateThreadControl,
  bulkThreadControlLimits,
  getThreadOwner,
  receiveThreadControlEvent,
}
