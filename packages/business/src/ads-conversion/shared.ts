import type { DatabaseClient } from "@chatbotx.io/database/client"
import {
  type AdEligibleInboxChannel,
  adsConversionEventRepository,
  integrationInstagramRepository,
  integrationMessengerRepository,
  integrationWhatsappRepository,
} from "@chatbotx.io/database/repositories"
import type { AdsConversionEventModel } from "@chatbotx.io/database/types"
import {
  enqueueIntegrationJob,
  IntegrationJobAction,
} from "@chatbotx.io/worker-config"

/**
 * Shared plumbing used by `service.ts` (rule-based evaluators). Kept in its
 * own module so the helpers here stay independent of any single evaluator's
 * imports.
 */

/**
 * Channel-aware "resolve the integration that owns this inbox" dispatch
 * (Phase 3): mirrors the resolver-map pattern used for CAPI sends
 * (`apps/worker/.../meta-conversions/send-meta-capi-event.ts`). Shared by
 * `enqueueTagAppliedEvaluationsForInbox`/`enqueueKeywordMatchedEvaluation`
 * (service.ts) — resolve+enqueue for a single, already-known contactInbox
 * instead of fanning out to every ad-eligible inbox the contact has.
 */
export const integrationByInboxResolvers: Record<
  AdEligibleInboxChannel,
  (input: {
    workspaceId: string
    inboxId: string
  }) => Promise<{ id: string } | null>
> = {
  whatsapp: (input) =>
    integrationWhatsappRepository.findWorkspaceIntegrationByInboxId(input),
  messenger: (input) =>
    integrationMessengerRepository.findWorkspaceIntegrationByInboxId(input),
  instagram: (input) =>
    integrationInstagramRepository.findWorkspaceIntegrationByInboxId(input),
}

/**
 * Enqueues the CAPI send job for a `pending` `AdsConversionEvent` row, keyed
 * by the deterministic `ads-conversion-send-${event.id}` jobId so re-enqueues
 * (the find-or-create recovery path in `evaluateConversionTriggerRule` and
 * `evaluateAdReferralTriggerRule`) are idempotent at the queue layer.
 */
export async function enqueueSendConversionEvent(
  event: Pick<AdsConversionEventModel, "id" | "workspaceId">,
): Promise<void> {
  await enqueueIntegrationJob(
    {
      type: IntegrationJobAction.sendConversionEvent,
      data: {
        adsConversionEventId: event.id,
        workspaceId: event.workspaceId,
      },
    },
    {
      jobId: `ads-conversion-send-${event.id}`,
    },
  )
}

/**
 * Shared find-or-create + re-enqueue-if-still-pending control flow used by
 * every conversion-trigger insert path (rule evaluators and templateSent
 * evaluators): `evaluateConversionTriggerRule`/`evaluateAdReferralTriggerRule`
 * (service.ts). Callers build the channel-specific insert and lookup value
 * objects; this helper owns only the insert → enqueue-or-recover control flow
 * so a fix to the recovery semantics (e.g. the "enqueue failed after insert
 * succeeded" gap) only has to change once.
 */
export async function insertConversionEventOrRecover(
  insertValues: Parameters<
    typeof adsConversionEventRepository.insertIgnoreDuplicate
  >[0],
  lookupValues: Parameters<
    typeof adsConversionEventRepository.findBySourceEventId
  >[0],
  tx?: DatabaseClient,
): Promise<AdsConversionEventModel | null> {
  const inserted = await adsConversionEventRepository.insertIgnoreDuplicate(
    insertValues,
    tx,
  )

  if (inserted) {
    await enqueueSendConversionEvent(inserted)
    return inserted
  }

  // Deduped: the event already exists (unique sourceEventId). Recover it and,
  // if its CAPI send never went out (still pending), re-enqueue — see the
  // doc comment on `enqueueSendConversionEvent`.
  const existing = await adsConversionEventRepository.findBySourceEventId(
    lookupValues,
    tx,
  )
  if (existing?.capiStatus === "pending") {
    await enqueueSendConversionEvent(existing)
  }

  return null
}
