import {
  CONNECT_FAILURE_REASONS,
  CONNECT_ITEM_STATUSES,
  CONNECT_SESSION_ERROR_CODES,
  CONNECT_WARNINGS,
  type ConnectActionResult,
  MAX_CONNECT_DETAIL_LENGTH,
} from "@chatbotx.io/business/inbox/connect-outcome-types"
import { z } from "zod"

/**
 * Zod schemas built over the shared outcome vocabulary defined once in
 * `@chatbotx.io/business` (`packages/business/src/inbox/connect-outcome.ts`).
 * This file must never redefine those string values — it only wraps them for
 * request/response validation on the builder side.
 */

export const MAX_CONNECT_SELECTIONS = 20

export type UniqueIdsMessages = {
  min?: string
  max?: string
  duplicate?: string
}

/**
 * Callers on a form surface (`ConnectSelectionForm`) MUST pass translated
 * `messages` — without them zod's default English text (or the literal
 * `"duplicateSelection"` sentinel) leaks straight into `FormMessage`. The
 * default sentinel exists only for schema-only usage (server-side re-parse)
 * where the raw code, not display text, is what matters.
 */
export const uniqueIds = (
  max = MAX_CONNECT_SELECTIONS,
  messages?: UniqueIdsMessages,
) =>
  z
    .array(z.string().min(1))
    .min(1, messages?.min)
    .max(max, messages?.max)
    .refine((ids) => new Set(ids).size === ids.length, {
      message: messages?.duplicate ?? "duplicateSelection",
    })

export const connectOutcomeSchema = z.object({
  sourceId: z.string(),
  name: z.string(),
  status: z.enum(Object.values(CONNECT_ITEM_STATUSES)),
  reason: z.enum(Object.values(CONNECT_FAILURE_REASONS)).optional(),
  /**
   * The provider's own end-user sentence for a `providerRejected` row (Meta's
   * `error_user_msg`), attached by `toConnectItemFailure`. Bounded by the same
   * constant the mapper caps at, so a longer sentence can never fail the parse
   * — never a stack, token, or raw body.
   */
  detail: z.string().max(MAX_CONNECT_DETAIL_LENGTH).optional(),
  warning: z.enum(Object.values(CONNECT_WARNINGS)).optional(),
  integrationId: z.string().optional(),
  coexistEligible: z.boolean(),
})
export type ConnectOutcome = z.infer<typeof connectOutcomeSchema>

/**
 * Builds `ConnectActionResult<TOutcome>`'s wire schema for a specific
 * channel's outcome shape (e.g. WhatsApp's superset outcome). Every
 * single-account connect action returns this discriminated union — never a
 * thrown exception the client cannot classify.
 */
export function connectActionResultSchema<TOutcome extends z.ZodType>(
  outcomeSchema: TOutcome,
) {
  return z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("outcome"), outcome: outcomeSchema }),
    z.object({
      kind: z.literal("sessionError"),
      code: z.enum(Object.values(CONNECT_SESSION_ERROR_CODES)),
    }),
  ])
}

export const connectActionResultSchemaDefault =
  connectActionResultSchema(connectOutcomeSchema)
export type ConnectActionResultWire = z.infer<
  typeof connectActionResultSchemaDefault
>

/**
 * Compile-time pin: `ConnectActionResultWire` must stay assignable to (and
 * from) `ConnectActionResult<ConnectOutcome>`, the business-side type this
 * zod schema is meant to mirror. A drift between the two — e.g. a variant
 * added on one side and not the other — fails the `extends` constraint
 * below at compile time instead of a silent divergence nothing catches.
 * Pure type-level check: nothing here exists at runtime.
 */
type AssertExtends<TExpected, _TActual extends TExpected> = true
type _PinWireAssignableToBusinessType = AssertExtends<
  ConnectActionResult<ConnectOutcome>,
  ConnectActionResultWire
>
type _PinBusinessTypeAssignableToWire = AssertExtends<
  ConnectActionResultWire,
  ConnectActionResult<ConnectOutcome>
>
