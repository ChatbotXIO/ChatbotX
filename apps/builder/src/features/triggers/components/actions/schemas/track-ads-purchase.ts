import { triggerActions } from "@chatbotx.io/database/partials"
import {
  metaCapiCurrencySchema,
  metaCapiValueSchema,
} from "@chatbotx.io/flow-config"
import z from "zod"

// STATIC value/currency only — matches what `sendMetaCapiEvent` supports
// today (no custom-field variable resolution). Reuses the same value/
// currency zod schemas as sendMetaCapiEvent for identical validation
// (digits-only value, 3-letter uppercase currency code).
export const trackAdsPurchase = z.object({
  type: z.literal(triggerActions.enum.trackAdsPurchase),
  value: metaCapiValueSchema,
  currency: metaCapiCurrencySchema,
})
export type TrackAdsPurchase = z.infer<typeof trackAdsPurchase>

export const defaultFn = (): TrackAdsPurchase => ({
  type: triggerActions.enum.trackAdsPurchase,
  value: undefined,
  currency: undefined,
})
