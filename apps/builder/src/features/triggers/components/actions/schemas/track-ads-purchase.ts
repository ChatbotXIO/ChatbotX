import { triggerActions } from "@chatbotx.io/database/partials"
import {
  assertPurchaseValueMatchesContents,
  metaCapiContentsSchema,
  metaCapiCurrencySchema,
  metaCapiOrderIdSchema,
  metaCapiValueSchema,
} from "@chatbotx.io/flow-config"
import z from "zod"

// STATIC value/currency/orderId/contents only — matches what
// `sendMetaCapiEvent`/the `trackAdsPurchase` flow step support (no
// custom-field variable resolution). Reuses the same zod schemas as the flow
// step for identical validation.
export const trackAdsPurchase = z
  .object({
    type: z.literal(triggerActions.enum.trackAdsPurchase),
    value: metaCapiValueSchema,
    currency: metaCapiCurrencySchema,
    orderId: metaCapiOrderIdSchema,
    contents: metaCapiContentsSchema,
  })
  .refine(assertPurchaseValueMatchesContents, {
    message: "value must equal the sum of contents (quantity × item_price)",
    path: ["value"],
  })
export type TrackAdsPurchase = z.infer<typeof trackAdsPurchase>

export const defaultFn = (): TrackAdsPurchase => ({
  type: triggerActions.enum.trackAdsPurchase,
  value: undefined,
  currency: undefined,
  orderId: undefined,
  contents: undefined,
})
