import type { Context } from "@chatbotx.io/sdk"
import { chunk } from "remeda"
import { lineFetch } from "../../../apis/client"
import { LineAPIException } from "../../../exception"
import { toChannelErrorUnlessAuth } from "../../../lib/error-mapper"
import { logger } from "../../../lib/logger"
import type { LineAuthValue } from "../../../schema"
import { replyTokenKey } from "../incoming-message"
import { LINE_LIMITS } from "./limits"
import { prepareLineMedia } from "./prepare-media"
import {
  putSendCheckpoint,
  sendCheckpointKey,
  takeSendCheckpoint,
} from "./send-checkpoint"

/** A LINE message object (text, image, flex, …), as sent to reply/push. */
export type LineMessage = Record<string, unknown> & { type: string }

const HTTP_BAD_REQUEST = 400
const INVALID_REPLY_TOKEN = "invalid reply token"

type SendResponse = { sentMessages?: Array<{ id?: string }> } | undefined

export type DispatchResult = { messageIds: string[]; sentCount: number }

/**
 * Sends `rawMessages` to one LINE user, in batches of 5, after `prepareLineMedia`
 * makes every image and video fit LINE's limits. Only the first batch can
 * use the reply token stashed at receive time (D1, D10); every other batch, and
 * the first one when no token is stashed, is pushed.
 *
 * A send of more than one batch that carries a `sendId` keeps a progress
 * checkpoint in the ephemeral store, keyed by the recipient, `sendId` and a
 * hash of `messages`: when a batch after the first fails, the batches already
 * delivered are recorded (short TTL) and the error is rethrown unchanged, so
 * the job's retry of the same send skips them instead of pushing them again.
 * The checkpoint is taken (deleted) when the retry starts and never written on
 * success. A store failure only logs: the send then behaves as if there were
 * no checkpoint.
 *
 * `sendId` must identify this send across its queue retries and nothing else
 * (the outgoing `Message` id). A caller whose failure is never retried passes
 * none: a checkpoint it wrote could only be picked up by a later, unrelated
 * send of the same content, which would then skip batches it never delivered.
 */
export async function dispatchLineMessages(
  ctx: Context<LineAuthValue>,
  to: string,
  rawMessages: LineMessage[],
  sendId?: string,
): Promise<DispatchResult> {
  // Before the checkpoint hash and any request: an image LINE would drop is
  // converted (deterministically, so a retry hashes the same) or fails here.
  const messages = await prepareLineMedia(ctx, rawMessages)
  const batches = chunk(messages, LINE_LIMITS.messagesPerRequest)
  const checkpointKey =
    sendId && batches.length > 1
      ? await sendCheckpointKey(to, sendId, messages)
      : null
  const resumed = checkpointKey
    ? await takeSendCheckpoint(
        ctx,
        checkpointKey,
        batches.length,
        LINE_LIMITS.messagesPerRequest,
      )
    : null
  const result: DispatchResult = {
    messageIds: [...(resumed?.messageIds ?? [])],
    sentCount: resumed?.sentCount ?? 0,
  }

  // A resumed send starts after batch 0, so it never takes the reply token and
  // leaves it for a later send.
  for (
    let index = resumed?.completedBatches ?? 0;
    index < batches.length;
    index++
  ) {
    const batch = batches[index] ?? []
    let response: SendResponse
    try {
      const replyToken = index === 0 ? await takeReplyToken(ctx, to) : null
      response = replyToken
        ? await replyOrPush(ctx, to, replyToken, batch)
        : await push(ctx, to, batch)
    } catch (error) {
      if (checkpointKey && index > 0) {
        await putSendCheckpoint(ctx, checkpointKey, {
          completedBatches: index,
          messageIds: result.messageIds,
          sentCount: result.sentCount,
        })
      }
      throw error
    }
    for (const sent of response?.sentMessages ?? []) {
      if (sent.id) {
        result.messageIds.push(sent.id)
      }
    }
    result.sentCount += batch.length
  }

  return result
}

const takeReplyToken = async (
  ctx: Context<LineAuthValue>,
  to: string,
): Promise<string | null> => {
  try {
    return (await ctx.ephemeral?.take(replyTokenKey(to))) ?? null
  } catch (error) {
    // Pushing costs quota but always delivers; a Redis hiccup must not fail the send.
    logger.warn({ err: error }, "LINE reply token lookup failed; pushing")
    return null
  }
}

const replyOrPush = async (
  ctx: Context<LineAuthValue>,
  to: string,
  replyToken: string,
  messages: LineMessage[],
): Promise<SendResponse> => {
  try {
    // No retry key: reply cannot be de-duplicated, so the client never retries it.
    return await lineFetch<SendResponse>(ctx.auth, {
      method: "POST",
      path: "/v2/bot/message/reply",
      body: { replyToken, messages },
    })
  } catch (error) {
    if (isInvalidReplyToken(error)) {
      // A rejected token means nothing was sent, so pushing cannot duplicate (D17).
      return push(ctx, to, messages)
    }
    // Timeout / 5xx: the outcome is unknown. Fail the send so the job's own
    // retry handles it; the token is already consumed, so that retry pushes.
    // (Logged once by the calling handler.)
    throw toChannelErrorUnlessAuth(error)
  }
}

const push = (
  ctx: Context<LineAuthValue>,
  to: string,
  messages: LineMessage[],
): Promise<SendResponse> =>
  lineFetch<SendResponse>(ctx.auth, {
    method: "POST",
    path: "/v2/bot/message/push",
    body: { to, messages },
    // One key per push request; the client re-sends it on its own retries.
    retryKey: crypto.randomUUID(),
  })

const isInvalidReplyToken = (error: unknown): boolean =>
  error instanceof LineAPIException &&
  error.httpStatusCode === HTTP_BAD_REQUEST &&
  error.message.toLowerCase().includes(INVALID_REPLY_TOKEN)
