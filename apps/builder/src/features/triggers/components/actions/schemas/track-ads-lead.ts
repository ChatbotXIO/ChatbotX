import { triggerActions } from "@chatbotx.io/database/partials"
import z from "zod"

// No config beyond the discriminant: attribution/dedup/channel are all
// resolved server-side by `adsConversionService.recordTriggerConversion`
// (see apps/worker/src/trigger/services/action-executor.ts).
export const trackAdsLead = z.object({
  type: z.literal(triggerActions.enum.trackAdsLead),
})
export type TrackAdsLead = z.infer<typeof trackAdsLead>

export const defaultFn = (): TrackAdsLead => ({
  type: triggerActions.enum.trackAdsLead,
})
