import type { AdsConversionJobData } from "@chatbotx.io/worker-config"
import { handleEvaluateConversionTrigger } from "./evaluate-conversion-trigger"
import { handleEvaluateTemplateSent } from "./evaluate-template-sent"
import { handleSendConversionEvent } from "./send-conversion-event"
import { handleSyncRetargetAudience } from "./sync-retarget-audience"

// Mapped union: each action is bound to ITS OWN payload type, so a mis-wired
// handler (wrong data shape) fails tsc — not just a missing key.
type AdsConversionHandlers = {
  [K in AdsConversionJobData["type"]]: (
    data: Extract<AdsConversionJobData, { type: K }>["data"],
  ) => Promise<void>
}

const adsConversionHandlers: AdsConversionHandlers = {
  evaluateTemplateSent: handleEvaluateTemplateSent,
  evaluateConversionTrigger: handleEvaluateConversionTrigger,
  sendConversionEvent: handleSendConversionEvent,
  syncRetargetAudience: handleSyncRetargetAudience,
}

/**
 * Sub-registry delegated from the single `integration` queue's `switch` (see
 * `apps/worker/src/integration/worker.ts`) — the 4 ads-conversion actions
 * route here instead of growing the outer ~30-case switch. Unlike the
 * former standalone ads-conversion worker, an unrecognized job type cannot
 * occur here at runtime: the outer switch already matched one of the 4
 * `IntegrationJobAction` ads cases before calling this function, so the
 * `default` branch below is a compile-time exhaustiveness assertion only.
 */
export const dispatchAdsConversionJob = (
  job: AdsConversionJobData,
): Promise<void> => {
  switch (job.type) {
    case "evaluateTemplateSent":
      return adsConversionHandlers.evaluateTemplateSent(job.data)
    case "evaluateConversionTrigger":
      return adsConversionHandlers.evaluateConversionTrigger(job.data)
    case "sendConversionEvent":
      return adsConversionHandlers.sendConversionEvent(job.data)
    case "syncRetargetAudience":
      return adsConversionHandlers.syncRetargetAudience(job.data)
    default: {
      const _exhaustive: never = job
      return Promise.resolve(_exhaustive)
    }
  }
}
