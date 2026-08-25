import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import type { PurchaseContentItem } from "@chatbotx.io/utils/meta-capi"
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

// Treat an empty/blank string (a cleared input field) as "unset", matching
// `send-meta-capi-event.ts`'s value/currency preprocessing.
const blankToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value

const MAX_ORDER_ID_LENGTH = 200

/**
 * Richer Purchase data (plan #4) — Purchase-only, static config shared by
 * both the `trackAdsPurchase` flow step and the Trigger automation action of
 * the same name.
 */
export const metaCapiOrderIdSchema = z.preprocess(
  blankToUndefined,
  z.string().trim().min(1).max(MAX_ORDER_ID_LENGTH).optional(),
)

export const metaCapiPurchaseContentItemSchema = z.object({
  id: z.string().trim().min(1),
  quantity: z.number().int().positive(),
  itemPrice: z.number().nonnegative(),
}) satisfies z.ZodType<PurchaseContentItem>
export type MetaCapiPurchaseContentItem = z.infer<
  typeof metaCapiPurchaseContentItemSchema
>

export const metaCapiContentsSchema = z
  .array(metaCapiPurchaseContentItemSchema)
  .min(1)
  .optional()

// Tolerance for float-multiplication drift (e.g. 3 * 0.1) when comparing a
// caller-supplied `value` against the sum of `contents` — not a business
// rounding rule, just enough slack to absorb IEEE-754 representation error.
const CONTENTS_VALUE_EPSILON = 1e-6

/**
 * When BOTH `value` and `contents` are supplied, they must agree — a
 * contradictory Purchase total (Codex #4) is rejected rather than silently
 * sent to Meta. Either field alone (or neither) always passes.
 */
export function assertPurchaseValueMatchesContents(input: {
  value?: string
  contents?: MetaCapiPurchaseContentItem[]
}): boolean {
  if (input.value === undefined || !input.contents?.length) {
    return true
  }
  const sum = input.contents.reduce(
    (total, item) => total + item.quantity * item.itemPrice,
    0,
  )
  return Math.abs(Number(input.value) - sum) < CONTENTS_VALUE_EPSILON
}

/**
 * Flow-step counterpart of the Trigger automation action `trackAdsPurchase`
 * (`apps/builder/src/features/triggers/components/actions/schemas/
 * track-ads-purchase.ts`) — reuses the same STATIC value/currency/orderId/
 * contents zod schemas as that action (no custom-field variable resolution).
 * Attribution/dedup/channel are all resolved server-side by
 * `adsConversionService.recordFlowStepConversion`
 * (see `apps/worker/src/integration/handlers/ads-conversion/
 * track-ads-step-handler.ts`), keyed by the runtime `props.targetNodeId`,
 * NOT a field on this schema.
 */
export const trackAdsPurchaseSchema = z
  .object({
    id: zodBigintAsString(),
    stepType: z.literal(stepTypes.enum.trackAdsPurchase),
    value: metaCapiValueSchema,
    currency: metaCapiCurrencySchema,
    orderId: metaCapiOrderIdSchema,
    contents: metaCapiContentsSchema,
    states: z.tuple([successStateSchema, errorStateSchema]),
  })
  .refine(assertPurchaseValueMatchesContents, {
    message: "value must equal the sum of contents (quantity × item_price)",
    path: ["value"],
  })
export type TrackAdsPurchaseSchema = z.infer<typeof trackAdsPurchaseSchema>

export const trackAdsPurchaseDefaultFn = (): TrackAdsPurchaseSchema => ({
  id: createId(),
  stepType: stepTypes.enum.trackAdsPurchase,
  value: undefined,
  currency: undefined,
  orderId: undefined,
  contents: undefined,
  states: [successStateDefaultFn(), errorStateDefaultFn()],
})
