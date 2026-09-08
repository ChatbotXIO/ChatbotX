import { whatsappRegistrationErrorSchema } from "@chatbotx.io/database/partials"
import { z } from "zod"
import {
  connectActionResultSchema,
  connectOutcomeSchema,
  MAX_CONNECT_SELECTIONS,
  type UniqueIdsMessages,
  uniqueIds,
} from "@/features/channel-connect/schema"

export const manualOnboardingResultSchema = z.object({
  integrationId: z.string(),
  workspaceId: z.string(),
  webhookUrl: z.string(),
  verifyToken: z.string(),
})
export type ManualOnboardingResult = z.infer<
  typeof manualOnboardingResultSchema
>

export type WhatsappPhoneNumberOption = {
  id: string
  label: string
  displayPhoneNumber: string
  /**
   * Not selectable (already connected elsewhere, …). The connect action
   * pre-filters those out today (`getAvailablePhoneNumbers`), so the picker
   * never receives one — the flag exists so the picker obeys the same
   * "no switch on a row you cannot pick" rule as every other channel if it
   * ever does.
   */
  disabled?: boolean
}

export const CONNECT_WHATSAPP_RESULT_TYPES = {
  CONNECTED: "connected",
  PHONE_NUMBER_SELECTION: "phoneNumberSelection",
  NO_PHONE_NUMBER_CANDIDATES: "noPhoneNumberCandidates",
  PHONE_NUMBERS_ALREADY_CONNECTED: "phoneNumbersAlreadyConnected",
} as const

/**
 * Extra, WhatsApp-specific detail carried on a `connected` outcome — folds
 * what used to be three separate result types (`REDIRECT` / `MANUAL_RESULT` /
 * `PHONE_NUMBER_VERIFICATION_REQUIRED`) into one. `manual` is only present on
 * the manual-connect path; `requiresPhoneVerification` and `manual` are not
 * mutually exclusive — a manual number can also need OTP verification.
 */
export const whatsappConnectExtraSchema = z.object({
  requiresPhoneVerification: z.boolean(),
  registrationError: whatsappRegistrationErrorSchema.nullable(),
  displayPhoneNumber: z.string(),
  verifiedName: z.string(),
  manual: manualOnboardingResultSchema.optional(),
})
export type WhatsappConnectExtra = z.infer<typeof whatsappConnectExtraSchema>

/**
 * `connectOutcomeSchema` (`@/features/channel-connect/schema`) plus the
 * WhatsApp-only `extra` — read by the dialog's extra steps (verification
 * queue / manual results) to decide which are applicable for a batch of
 * outcomes. `nullable().optional()` so a non-`connected` outcome (failed,
 * duplicated) carries no `extra` at all.
 */
export const whatsappConnectOutcomeSchema = connectOutcomeSchema.extend({
  extra: whatsappConnectExtraSchema.nullable().optional(),
})
export type WhatsappConnectOutcome = z.infer<
  typeof whatsappConnectOutcomeSchema
>

export const whatsappConnectedResultSchema = z.object({
  type: z.literal(CONNECT_WHATSAPP_RESULT_TYPES.CONNECTED),
  workspaceId: z.string(),
  isManual: z.boolean(),
  redirectUrl: z.string(),
  outcome: whatsappConnectOutcomeSchema,
})
// Not exported — only used internally to build `ConnectWhatsappResult` below.
type WhatsappConnectedResult = z.infer<typeof whatsappConnectedResultSchema>

/**
 * The shared `{ kind: "outcome" | "sessionError" }` wire shape
 * (`@/features/channel-connect/schema`), specialized to WhatsApp's outcome —
 * what a per-number partition failure (`notSelectable` / `duplicated`) and a
 * session-level failure come back as, whether the request came from the
 * single-number auto-select path or the multi-select picker's per-id fan-out.
 */
export const whatsappConnectActionResultSchema = connectActionResultSchema(
  whatsappConnectOutcomeSchema,
)
export type WhatsappConnectActionResultWire = z.infer<
  typeof whatsappConnectActionResultSchema
>

// The next three are not exported — only used internally to build
// `ConnectWhatsappResult` below.
type WhatsappPhoneNumberSelectionResult = {
  type: typeof CONNECT_WHATSAPP_RESULT_TYPES.PHONE_NUMBER_SELECTION
  signupSessionId: string
  phoneNumbers: WhatsappPhoneNumberOption[]
}

type WhatsappNoPhoneNumberCandidatesResult = {
  type: typeof CONNECT_WHATSAPP_RESULT_TYPES.NO_PHONE_NUMBER_CANDIDATES
}

type WhatsappPhoneNumbersAlreadyConnectedResult = {
  type: typeof CONNECT_WHATSAPP_RESULT_TYPES.PHONE_NUMBERS_ALREADY_CONNECTED
}

/**
 * Everything `connectWhatsappAction` can return. The action never throws a
 * user-visible error: a session-level failure (expired session, blocked
 * workspace owner, missing membership, missing credential, …) and a
 * per-number partition failure (not a candidate, already connected) both
 * come back through the shared `kind: "outcome" | "sessionError"` wire shape
 * (`WhatsappConnectActionResultWire`) — the same rule Messenger/Instagram
 * already follow (`@/features/channel-connect/lib/connect-action-outcomes`).
 * A successful connect is `{ type: "connected", ... }`. The three
 * selection-flow results (`phoneNumberSelection` / `noPhoneNumberCandidates`
 * / `phoneNumbersAlreadyConnected`) only ever come back from the very first,
 * no-`phoneNumberId` request that resolves the WABA's phone list — never from
 * the picker's per-id fan-out, which always supplies a concrete id.
 */
export type ConnectWhatsappResult =
  | WhatsappPhoneNumberSelectionResult
  | WhatsappNoPhoneNumberCandidatesResult
  | WhatsappPhoneNumbersAlreadyConnectedResult
  | WhatsappConnectedResult
  | WhatsappConnectActionResultWire

/**
 * The connect form schema. `messages` translates the multi-select picker's
 * validation copy for the client form (the server keeps zod's defaults — it
 * never surfaces them); without it a bare "Too small: expected array…" would
 * reach the operator.
 */
export const buildConnectWhatsappSchema = (messages?: UniqueIdsMessages) =>
  z
    .object({
      businessId: z.string().nullish(),
      // Optional for the OAuth dialog flow: only a `code` comes back and the
      // server derives wabaId/phoneNumberId/businessId from the token. Manual
      // connect supplies wabaId directly (enforced below).
      wabaId: z.string().nullish(),
      connectExisting: z.boolean(),
      transferPhoneNumber: z.boolean(),
      manualConnect: z.boolean(),
      marketingMessageLite: z.boolean(),
      // Session / OAuth-with-id path: exactly one id per action request — the
      // client fans out one call per id when the operator picks several.
      phoneNumberId: z.string().nullish(),
      // Manual path: a single scalar id — a radio can't bind to an array.
      manualPhoneNumberId: z.string().nullish(),
      // Multi-select picker form field only. Never read server-side — the
      // client fans out one action call per id (`phoneNumberId`) instead of
      // sending the array through.
      phoneNumberIds: uniqueIds(MAX_CONNECT_SELECTIONS, messages).nullish(),
      // Picker-only coexist opt-ins: the subset of `phoneNumberIds` whose row
      // switch asked to sync history, and the subset of THOSE whose second row
      // switch lets the AI read the synced history. Never read server-side
      // either — the client calls the coexist route per number once that number
      // has connected. Both are plain arrays (legitimately empty whenever no
      // row opted in), unlike the 1..max `phoneNumberIds`.
      coexistPhoneNumberIds: z.array(z.string()).nullish(),
      aiReadsSyncedHistoryPhoneNumberIds: z.array(z.string()).nullish(),
      workspaceId: z.string().nullish(),
      signupSessionId: z.string().nullish(),
      accessToken: z.string().nullish(),
      code: z.string().nullish(),
    })
    .superRefine((data, ctx) => {
      if (data.manualConnect) {
        if (!data.wabaId) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Required waba id",
            path: ["wabaId"],
          })
        }
        if (!data.manualPhoneNumberId) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Required phone number id",
            path: ["manualPhoneNumberId"],
          })
        }
        if (!data.accessToken) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Required access token",
            path: ["accessToken"],
          })
        }
        // A session already resolves its own workspace/credential — pairing it
        // with manual connect is nonsensical (the session branch below would
        // win server-side regardless, but the combo should never validate).
        if (data.signupSessionId) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Must not be sent with manual connect",
            path: ["signupSessionId"],
          })
        }
        return
      }

      if (data.signupSessionId) {
        if (!data.phoneNumberId) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Required phone number id",
            path: ["phoneNumberId"],
          })
        }
        // The session already carries the token/WABA/business/workspace —
        // the client must never send these alongside a session id (it would
        // let a forged/mismatched value reach the server unchecked).
        if (data.code) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Must not be sent with a signup session",
            path: ["code"],
          })
        }
        if (data.accessToken) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Must not be sent with a signup session",
            path: ["accessToken"],
          })
        }
        if (data.wabaId) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Must not be sent with a signup session",
            path: ["wabaId"],
          })
        }
        if (data.workspaceId) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Must not be sent with a signup session",
            path: ["workspaceId"],
          })
        }
        return
      }

      // OAuth dialog flow: the `code` is the only required input.
      if (!data.code) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Required code",
          path: ["code"],
        })
      }
    })
export const connectWhatsappSchema = buildConnectWhatsappSchema()
export type ConnectWhatsappSchema = z.infer<typeof connectWhatsappSchema>

/**
 * What that route answers with: a `connected` result, or the shared
 * `{ kind: "outcome" | "sessionError" }` wire shape. The three
 * selection-flow results cannot occur here — a concrete `phoneNumberId` is
 * always supplied — so they are deliberately absent from the contract.
 */
export const connectWhatsappViaSessionResponse = z.union([
  whatsappConnectedResultSchema,
  whatsappConnectActionResultSchema,
])
export type ConnectWhatsappViaSessionResponse = z.infer<
  typeof connectWhatsappViaSessionResponse
>

export const listPhoneNumbersRequest = z.object({
  wabaId: z.string(),
  accessToken: z.string(),
})

const whatsappPhoneNumberResource = z.object({
  verified_name: z.string(),
  code_verification_status: z.string(),
  name_status: z.string().optional(),
  display_phone_number: z.string(),
  quality_rating: z.string(),
  platform_type: z.string(),
  throughput: z.record(z.string(), z.unknown()),
  webhook_configuration: z.record(z.string(), z.unknown()),
  id: z.string(),
})

export const listPhoneNumbersResponse = z.object({
  data: z.array(whatsappPhoneNumberResource),
  paging: z.object({
    cursors: z.object({
      before: z.string(),
      after: z.string(),
    }),
    next: z.string().optional(),
  }),
})

export { connectWhatsappViaSessionRequest } from "./connect-via-session"
