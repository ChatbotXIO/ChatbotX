import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import {
  errorStateDefaultFn,
  errorStateSchema,
  successStateDefaultFn,
  successStateSchema,
} from "../states"
import { stepTypes } from "./step-action"

/**
 * Flow-step counterpart of the Trigger automation action `trackAdsLead`
 * (`apps/builder/src/features/triggers/components/actions/schemas/
 * track-ads-lead.ts`) — same "no config beyond the discriminant" shape.
 * Attribution/dedup/channel are all resolved server-side by
 * `adsConversionService.recordFlowStepConversion`
 * (see `apps/worker/src/integration/handlers/ads-conversion/
 * track-ads-step-handler.ts`), keyed by the runtime `props.targetNodeId`,
 * NOT a field on this schema.
 */
export const trackAdsLeadSchema = z.object({
  id: zodBigintAsString(),
  stepType: z.literal(stepTypes.enum.trackAdsLead),
  states: z.tuple([successStateSchema, errorStateSchema]),
})
export type TrackAdsLeadSchema = z.infer<typeof trackAdsLeadSchema>

export const trackAdsLeadDefaultFn = (): TrackAdsLeadSchema => ({
  id: createId(),
  stepType: stepTypes.enum.trackAdsLead,
  states: [successStateDefaultFn(), errorStateDefaultFn()],
})
