import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import {
  errorStateDefaultFn,
  errorStateSchema,
  successStateDefaultFn,
  successStateSchema,
} from "../states"
import {
  metaCapiCurrencySchema,
  metaCapiValueSchema,
} from "./send-meta-capi-event"
import { stepTypes } from "./step-action"

/**
 * Flow-step counterpart of the Trigger automation action `trackAdsPurchase`
 * (`apps/builder/src/features/triggers/components/actions/schemas/
 * track-ads-purchase.ts`) — reuses the same STATIC value/currency zod
 * schemas as `sendMetaCapiEvent` (no custom-field variable resolution).
 * Attribution/dedup/channel are all resolved server-side by
 * `adsConversionService.recordFlowStepConversion`
 * (see `apps/worker/src/integration/handlers/ads-conversion/
 * track-ads-step-handler.ts`), keyed by the runtime `props.targetNodeId`,
 * NOT a field on this schema.
 */
export const trackAdsPurchaseSchema = z.object({
  id: zodBigintAsString(),
  stepType: z.literal(stepTypes.enum.trackAdsPurchase),
  value: metaCapiValueSchema,
  currency: metaCapiCurrencySchema,
  states: z.tuple([successStateSchema, errorStateSchema]),
})
export type TrackAdsPurchaseSchema = z.infer<typeof trackAdsPurchaseSchema>

export const trackAdsPurchaseDefaultFn = (): TrackAdsPurchaseSchema => ({
  id: createId(),
  stepType: stepTypes.enum.trackAdsPurchase,
  value: undefined,
  currency: undefined,
  states: [successStateDefaultFn(), errorStateDefaultFn()],
})
