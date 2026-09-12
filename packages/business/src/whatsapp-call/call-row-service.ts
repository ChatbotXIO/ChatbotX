import { whatsappCallRepository } from "@chatbotx.io/database/repositories"
import type { WhatsappCallModel } from "@chatbotx.io/database/types"

/** The vars `ensureCallRow` needs — a narrow view of `FreeswitchEventVars` from `@chatbotx.io/worker-config`. */
export type CallRowVars = {
  sipFromUser?: string
  sipToUser?: string
  sipHeaders?: Record<string, string>
  rootUuid?: string
  attemptId?: string
}

export type ResolvedParticipants = {
  inbox: { id: string; workspaceId: string }
  contactInbox: { id: string }
  conversation: { id: string }
}

export type ResolveCallParticipants = (input: {
  integrationId: string
  from: string
  to: string
}) => Promise<ResolvedParticipants | null>

export type EnsureCallRowInput = {
  rootUuid: string
  integrationId: string
  vars: CallRowVars
  resolveParticipants: ResolveCallParticipants
}

/** Thrown when the enrichment lookup (inbox/contact/conversation) cannot resolve the caller. */
export class CallRowParticipantsUnresolvedError extends Error {
  constructor(integrationId: string) {
    super(
      `call-row-participants-unresolved: could not resolve participants for integration ${integrationId}`,
    )
    this.name = "CallRowParticipantsUnresolvedError"
  }
}

/**
 * Inbound branch: enrich via `resolveParticipants` (the
 * caller's `resolveCallParticipants`-based implementation, injected — this
 * file stays channel-agnostic and never imports worker-only helpers), then
 * `upsertInbound` — idempotent on `freeswitchUuid`, and reconciles onto a
 * webhook-created row by `wacid` when the `x-wa-meta-wacid` header is
 * present.
 */
const inboundCallRowStrategy = async (
  input: EnsureCallRowInput,
): Promise<WhatsappCallModel> => {
  const from = input.vars.sipFromUser ?? ""
  const to = input.vars.sipToUser ?? ""
  const participants = await input.resolveParticipants({
    integrationId: input.integrationId,
    from,
    to,
  })
  if (!participants) {
    throw new CallRowParticipantsUnresolvedError(input.integrationId)
  }

  const wacid = input.vars.sipHeaders?.["x-wa-meta-wacid"] ?? null

  return await whatsappCallRepository.upsertInbound({
    wacid,
    freeswitchUuid: input.rootUuid,
    attemptId: cuidLikeAttemptId(),
    workspaceId: participants.inbox.workspaceId,
    inboxId: participants.inbox.id,
    contactInboxId: participants.contactInbox.id,
    conversationId: participants.conversation.id,
    direction: "userInitiated",
    status: "ringing",
  })
}

/**
 * Outbound branch: the row already exists (the action created
 * it before dialing) — just attach this leg's uuid onto the row matching
 * `vars.attemptId`. Throws
 * `WhatsappCallOutboundAttemptUnknownError` (from the repository) when the
 * attempt is unknown or already bound elsewhere — `ensureCallRow` never
 * swallows that.
 */
const outboundCallRowStrategy = async (
  input: EnsureCallRowInput,
): Promise<WhatsappCallModel> => {
  const attemptId = input.vars.attemptId
  if (!attemptId) {
    throw new CallRowParticipantsUnresolvedError(input.integrationId)
  }
  return await whatsappCallRepository.attachFreeswitchUuid({
    attemptId,
    freeswitchUuid: input.rootUuid,
  })
}

/** cuid-shaped attempt id minted for every FreeSWITCH-created inbound row. */
const cuidLikeAttemptId = (): string =>
  `att_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`

/**
 * Strategy dispatch table (no branching chain): picked by the
 * presence of `vars.attemptId`, never a branching chain. The single entry
 * point used by `cbx::call`, `CHANNEL_ANSWER`, `CHANNEL_HANGUP_COMPLETE` and
 * the recording upload handler.
 */
const CALL_ROW_STRATEGIES: Record<
  "inbound" | "outbound",
  (input: EnsureCallRowInput) => Promise<WhatsappCallModel>
> = {
  inbound: inboundCallRowStrategy,
  outbound: outboundCallRowStrategy,
}

export const ensureCallRow = async (
  input: EnsureCallRowInput,
): Promise<WhatsappCallModel> => {
  const strategy = input.vars.attemptId ? "outbound" : "inbound"
  return await CALL_ROW_STRATEGIES[strategy](input)
}
