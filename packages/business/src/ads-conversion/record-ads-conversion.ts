import type { DatabaseClient } from "@chatbotx.io/database/client"
import {
  adsConversionEventRepository,
  contactInboxRepository,
} from "@chatbotx.io/database/repositories"
import type { AdsConversionEventModel } from "@chatbotx.io/database/types"
import { formatUtcDay } from "../lib/date"
import {
  type AdReferralChannel,
  isAdsEligibleChannel,
  perChannelIntegrationIds,
  perChannelIntegrationIdsOrNull,
} from "./channel-fields"
import {
  type RecordFlowStepConversionInput,
  type RecordTriggerConversionInput,
  recordFlowStepConversionInput,
  recordTriggerConversionInput,
} from "./schema"
import {
  insertConversionEventOrRecover,
  integrationByInboxResolvers,
} from "./shared"

/**
 * Backs `adsConversionService.recordTriggerConversion` (Trigger automation
 * actions, `apps/worker/src/trigger/services/action-executor.ts`) AND
 * `adsConversionService.recordFlowStepConversion` (Flow steps `trackAdsLead`/
 * `trackAdsPurchase`, dispatched from
 * `apps/worker/src/integration/handlers/meta-conversions/track-ads-step-handler.ts`).
 *
 * Both are user-configured automation that records a conversion for an
 * ALREADY-attributed contact — same attribution gate, same find-or-create +
 * re-enqueue-pending recovery semantics, same deterministic CAPI job id
 * (`enqueueSendConversionEvent`) as `evaluateConversionTriggerRule`/
 * `evaluateAdReferralTriggerRule` (service.ts). They differ only in WHERE the
 * automation is configured (a Trigger vs a Flow node), which is exactly what
 * `ConversionOrigin` captures: it namespaces the dedup key
 * (`trigger-...` vs `flowstep-...`, see `buildSourceEventId`) so a Trigger
 * action and a Flow step never collide, and so a single Trigger with both a
 * trackAdsLead and a trackAdsPurchase action (or an equivalent flow) still
 * produces two distinct events instead of one deduping the other.
 *
 * `recordAdsConversion` (below) is the private origin-aware core — NOT
 * exported. `recordTriggerConversion` and `recordFlowStepConversion` are
 * thin, origin-specific wrappers around it, each parsing its own zod input
 * shape and normalizing to `RecordAdsConversionCoreInput`. This keeps
 * `recordTriggerConversion`'s public signature byte-identical to its
 * pre-flow-step shape — the 2 production call sites in `action-executor.ts`
 * and the existing Trigger regression suite need zero changes.
 *
 * Non-attributed / non-eligible contacts are a cheap no-op: one indexed
 * lookup (`findByIdForWorkspace`, primary-key join) to resolve the channel,
 * then an early return — no rule-existence gate is needed since both
 * origins only ever run when a user explicitly configured them (on a
 * Trigger, or in a Flow).
 */

type ConversionOrigin =
  | { kind: "trigger"; id: string }
  | { kind: "flowStep"; id: string }

type RecordAdsConversionCoreInput = {
  origin: ConversionOrigin
  workspaceId: string
  contactInboxId: string
  eventType: RecordTriggerConversionInput["eventType"]
  value: RecordTriggerConversionInput["value"]
  currency: RecordTriggerConversionInput["currency"]
}

async function recordAdsConversion(
  input: RecordAdsConversionCoreInput,
  tx?: DatabaseClient,
): Promise<AdsConversionEventModel | null> {
  const contactInbox = await contactInboxRepository.findByIdForWorkspace(
    { id: input.contactInboxId, workspaceId: input.workspaceId },
    tx,
  )
  if (!contactInbox) {
    return null
  }
  if (!isAdsEligibleChannel(contactInbox.channel)) {
    return null
  }

  const channel = contactInbox.channel
  const resolveIntegration = integrationByInboxResolvers[channel]
  const integration = await resolveIntegration({
    workspaceId: input.workspaceId,
    inboxId: contactInbox.inboxId,
  })
  if (!integration) {
    return null
  }

  if (channel === "whatsapp") {
    return recordWhatsappAdsConversion({
      input,
      contactInboxId: contactInbox.id,
      integrationWhatsappId: integration.id,
      tx,
    })
  }

  return recordAdReferralAdsConversion({
    input,
    channel,
    contactInboxId: contactInbox.id,
    integrationId: integration.id,
    tx,
  })
}

function buildSourceEventId(input: {
  origin: ConversionOrigin
  eventType: RecordAdsConversionCoreInput["eventType"]
  contactInboxId: string
  now: Date
}): string {
  // `eventType` is REQUIRED in the key: a single automation origin can carry
  // both a trackAdsLead and a trackAdsPurchase action, and without the
  // discriminator the second insert would silently dedupe against the first
  // under the (workspaceId, integrationFk, source, sourceEventId) unique
  // index (see plan Design decision 3).
  //
  // The origin-kind prefix (`trigger-` vs `flowstep-`) is the FIRST token,
  // guaranteeing zero collision between a Trigger action and a Flow step
  // recording the same eventType for the same contact on the same day —
  // they intentionally produce two distinct events (different automation
  // origins), same "per-mechanism dedup" contract already documented for
  // rule-vs-trigger.
  const originPrefix = input.origin.kind === "trigger" ? "trigger" : "flowstep"
  return `${originPrefix}-${input.origin.id}-${input.eventType}-inbox-${input.contactInboxId}-${formatUtcDay(input.now)}`
}

async function recordWhatsappAdsConversion(input: {
  input: RecordAdsConversionCoreInput
  contactInboxId: string
  integrationWhatsappId: string
  tx?: DatabaseClient
}): Promise<AdsConversionEventModel | null> {
  const { input: coreInput } = input
  const attribution =
    await adsConversionEventRepository.findAttributionByContactInbox(
      {
        workspaceId: coreInput.workspaceId,
        integrationWhatsappId: input.integrationWhatsappId,
        contactInboxId: input.contactInboxId,
      },
      input.tx,
    )
  // Truthy gate (not just "present"): an empty-string ctwaClid passes the SQL
  // `IS NOT NULL` predicate in findAttributionByContactInbox but must still
  // no-op here (plan Phase 2 step 3).
  const ctwaClid = attribution?.referral?.ctwaClid
  if (!(attribution && ctwaClid)) {
    return null
  }

  const now = new Date()
  const sourceEventId = buildSourceEventId({
    origin: coreInput.origin,
    eventType: coreInput.eventType,
    contactInboxId: input.contactInboxId,
    now,
  })

  return await insertConversionEventOrRecover(
    {
      workspaceId: coreInput.workspaceId,
      channel: "whatsapp",
      integrationWhatsappId: input.integrationWhatsappId,
      wabaId: attribution.wabaId,
      source: "trigger",
      eventType: coreInput.eventType,
      ctwaClid,
      adId: attribution.referral?.adId ?? null,
      contactInboxId: input.contactInboxId,
      currency:
        coreInput.eventType === "purchase"
          ? (coreInput.currency ?? null)
          : null,
      value:
        coreInput.eventType === "purchase" ? (coreInput.value ?? null) : null,
      occurredAt: now,
      sourceEventId,
      capiStatus: "pending",
      capiSentAt: null,
    },
    {
      workspaceId: coreInput.workspaceId,
      integrationWhatsappId: input.integrationWhatsappId,
      source: "trigger",
      sourceEventId,
    },
    input.tx,
  )
}

async function recordAdReferralAdsConversion(input: {
  input: RecordAdsConversionCoreInput
  channel: AdReferralChannel
  contactInboxId: string
  integrationId: string
  tx?: DatabaseClient
}): Promise<AdsConversionEventModel | null> {
  const { input: coreInput, channel } = input
  const attribution =
    await adsConversionEventRepository.findAttributionByAdReferral(
      {
        workspaceId: coreInput.workspaceId,
        channel,
        ...perChannelIntegrationIds(channel, input.integrationId),
        contactInboxId: input.contactInboxId,
      },
      input.tx,
    )
  if (!attribution) {
    return null
  }

  const now = new Date()
  const sourceEventId = buildSourceEventId({
    origin: coreInput.origin,
    eventType: coreInput.eventType,
    contactInboxId: input.contactInboxId,
    now,
  })

  return await insertConversionEventOrRecover(
    {
      workspaceId: coreInput.workspaceId,
      channel,
      ...perChannelIntegrationIdsOrNull(channel, input.integrationId),
      source: "trigger",
      eventType: coreInput.eventType,
      adId: attribution.referral?.adId ?? null,
      contactInboxId: input.contactInboxId,
      currency:
        coreInput.eventType === "purchase"
          ? (coreInput.currency ?? null)
          : null,
      value:
        coreInput.eventType === "purchase" ? (coreInput.value ?? null) : null,
      occurredAt: now,
      sourceEventId,
      capiStatus: "pending",
      capiSentAt: null,
    },
    {
      workspaceId: coreInput.workspaceId,
      channel,
      ...perChannelIntegrationIds(channel, input.integrationId),
      source: "trigger",
      sourceEventId,
    },
    input.tx,
  )
}

/**
 * Public API kept byte-identical to its pre-flow-step shape (Codex finding
 * 2) — the 2 production call sites in
 * `apps/worker/src/trigger/services/action-executor.ts` and the existing
 * Trigger regression suite pass `{ triggerId, ... }` unchanged.
 */
export function recordTriggerConversion(
  input: RecordTriggerConversionInput,
  tx?: DatabaseClient,
): Promise<AdsConversionEventModel | null> {
  const parsed = recordTriggerConversionInput.parse(input)
  return recordAdsConversion(
    {
      origin: { kind: "trigger", id: parsed.triggerId },
      workspaceId: parsed.workspaceId,
      contactInboxId: parsed.contactInboxId,
      eventType: parsed.eventType,
      value: parsed.value,
      currency: parsed.currency,
    },
    tx,
  )
}

/**
 * Backs the Flow steps `trackAdsLead`/`trackAdsPurchase`
 * (`packages/flow-config/src/steps/track-ads-{lead,purchase}.ts`), dispatched
 * from the worker's flow-step handler with `flowNodeId` sourced from the
 * runtime handler prop `props.targetNodeId` (NOT a declared step-schema
 * field — see that handler's doc comment).
 */
export function recordFlowStepConversion(
  input: RecordFlowStepConversionInput,
  tx?: DatabaseClient,
): Promise<AdsConversionEventModel | null> {
  const parsed = recordFlowStepConversionInput.parse(input)
  return recordAdsConversion(
    {
      origin: { kind: "flowStep", id: parsed.flowNodeId },
      workspaceId: parsed.workspaceId,
      contactInboxId: parsed.contactInboxId,
      eventType: parsed.eventType,
      value: parsed.value,
      currency: parsed.currency,
    },
    tx,
  )
}
