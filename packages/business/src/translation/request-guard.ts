import type {
  MessageForTranslation,
  MessageRef,
} from "@chatbotx.io/database/repositories"
import type { MessageTranslationModel } from "@chatbotx.io/database/types"
import { distributedStore } from "@chatbotx.io/redis"
import { isSameLanguage } from "./language-policy"
import { isNoiseText } from "./noise-filter"
import type { TranslationSkipReason } from "./skip-reasons"

/** One request carries at most this many messages. */
export const MAX_REQUEST_MESSAGES = 20
/** How long a claim on a message survives without being renewed. */
export const INFLIGHT_TTL_SECONDS = 180

/** Why translation cannot run at all, decided by the caller before the guard. */
export type TranslationAvailability = "ok" | "disabled" | "unavailable"

export type RequestDecision =
  | { id: string; accepted: true; ref: MessageRef }
  | { id: string; accepted: false; reason: TranslationSkipReason }

const skip = (id: string, reason: TranslationSkipReason): RequestDecision => ({
  id,
  accepted: false,
  reason,
})

/**
 * Sorts each requested message into "translate it" or "skip it, and why". Pure:
 * the caller loads the messages and existing rows, and claims the in-flight
 * markers for what this returns as accepted (`inFlight` is decided there).
 *
 * A message is translated when it has no row yet, its row is stale (an inbound
 * row written for another target language, `skipped` ones included, because the
 * workspace language changed since), or its row `failed` and the caller asked
 * to retry failures.
 */
export function classifyTranslationRequest(input: {
  conversationId: string
  refs: MessageRef[]
  messages: MessageForTranslation[]
  translations: MessageTranslationModel[]
  /** `Workspace.language`: the target language of inbound translation. */
  workspaceLanguage: string
  retryFailed: boolean
  availability: TranslationAvailability
}): RequestDecision[] {
  const messageById = new Map(input.messages.map((m) => [m.id, m]))
  const translationByMessageId = new Map(
    input.translations.map((t) => [t.messageId, t]),
  )
  const seen = new Set<string>()
  const decisions: RequestDecision[] = []

  for (const ref of input.refs) {
    if (seen.has(ref.id)) {
      continue
    }
    seen.add(ref.id)

    if (input.availability !== "ok") {
      decisions.push(skip(ref.id, input.availability))
      continue
    }

    const message = messageById.get(ref.id)
    if (
      !message ||
      message.deletedAt ||
      message.conversationId !== input.conversationId
    ) {
      decisions.push(skip(ref.id, "notFound"))
      continue
    }
    if (message.type !== "message" || message.contentType !== "text") {
      decisions.push(skip(ref.id, "notDirectText"))
      continue
    }
    if (message.direction !== "incoming") {
      decisions.push(skip(ref.id, "notInbound"))
      continue
    }
    if (isNoiseText(message.text)) {
      decisions.push(skip(ref.id, "noise"))
      continue
    }

    const existing = translationByMessageId.get(ref.id)
    if (!existing) {
      decisions.push({ id: ref.id, accepted: true, ref })
      continue
    }
    const stale =
      existing.direction === "inbound" &&
      !isSameLanguage(existing.targetLanguage, input.workspaceLanguage)
    if (stale) {
      decisions.push({ id: ref.id, accepted: true, ref })
    } else if (existing.status === "failed") {
      decisions.push(
        input.retryFailed
          ? { id: ref.id, accepted: true, ref }
          : skip(ref.id, "failed"),
      )
    } else {
      decisions.push(skip(ref.id, "alreadyTranslated"))
    }
  }

  return decisions
}

// ─── In-flight markers ─────────────────────────────────────────────────────────
//
// `inflight:<workspaceId>:<messageId>` = the `requestId` of the request that
// queued the message. It stops two tabs, two agents or a retry from queueing the
// same message twice. The TTL does not try to cover time spent waiting in the
// queue: if a job waits longer, the marker expires and a later request may claim
// it; whichever job runs second sees a marker or row owned by someone else and
// does nothing.

export const inflightKey = (workspaceId: string, messageId: string): string =>
  `inflight:${workspaceId}:${messageId}`

/** Takes the marker for `requestId`; `false` when another request holds it. */
export function claimInflight(
  workspaceId: string,
  messageId: string,
  requestId: string,
): Promise<boolean> {
  return distributedStore.claimKey(
    inflightKey(workspaceId, messageId),
    requestId,
    INFLIGHT_TTL_SECONDS,
  )
}

/**
 * For the job: the marker must be this request's. An expired one is claimed
 * again; one held by another request (or by an edit that cleared it and was
 * re-requested) means this job is a duplicate. Renews the TTL when it is ours.
 */
export async function ensureInflightOwned(
  workspaceId: string,
  messageId: string,
  requestId: string,
): Promise<boolean> {
  const key = inflightKey(workspaceId, messageId)
  const owner = await distributedStore.getKeyOwner(key)
  if (owner === null) {
    return await distributedStore.claimKey(key, requestId, INFLIGHT_TTL_SECONDS)
  }
  if (owner !== requestId) {
    return false
  }
  return await distributedStore.renewKeyIfOwner(
    key,
    requestId,
    INFLIGHT_TTL_SECONDS,
  )
}

/** Compare-and-delete: never frees a marker another request has since claimed. */
export function releaseInflight(
  workspaceId: string,
  messageId: string,
  requestId: string,
): Promise<boolean> {
  return distributedStore.releaseKeyIfOwner(
    inflightKey(workspaceId, messageId),
    requestId,
  )
}

/** Unconditional: the customer edited or unsent the message, so any claim is void. */
export function clearInflight(
  workspaceId: string,
  messageId: string,
): Promise<void> {
  return distributedStore.delete(inflightKey(workspaceId, messageId))
}
