import type { AdsConversionJobEvaluateTemplateSent } from "@chatbotx.io/worker-config"

type EvaluateTemplateSentData = AdsConversionJobEvaluateTemplateSent["data"]

/**
 * 2026-09-24: the ads-conversion rule engine is hidden and unused, so this
 * handler is a deliberate no-op. The producer side is also disabled (see
 * `apps/worker/src/chat/handlers/enqueue-template-sent-evaluation.ts` and
 * its commented-out call sites); this keeps the jobs already queued from
 * each running an attribution lookup, so the backlog drains instantly.
 *
 * The original body is kept below, commented out, so the trigger can be
 * re-enabled if the rule engine ever ships again.
 */
export function handleEvaluateTemplateSent(
  _data: EvaluateTemplateSentData,
): Promise<void> {
  return Promise.resolve()
}

// import {
//   adsConversionService,
//   withBlockedOwnerGuard,
// } from "@chatbotx.io/business"
//
// export async function handleEvaluateTemplateSent(
//   data: EvaluateTemplateSentData,
// ): Promise<void> {
//   await withBlockedOwnerGuard(data.workspaceId, async () => {
//     await adsConversionService.evaluateTemplateSent(data)
//   })
// }
