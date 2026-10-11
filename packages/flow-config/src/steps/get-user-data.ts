import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import {
  skipStateDefaultFn,
  skipStateSchema,
  successStateDefaultFn,
  successStateSchema,
} from "../states"
import { stepTypes } from "./step-action"
import { waitStepDelayUnits } from "./wait"

export const ReplyFormat = {
  number: "RF01",
  text: "RF02",
  email: "RF03",
  phone: "RF04",
  image: "RF05",
  file: "RF06",
  link: "RF07",
  location: "RF08",
  date: "RF09",
  datetime: "RF10",
  anyInput: "RF11",
} as const
export type ReplyFormat = (typeof ReplyFormat)[keyof typeof ReplyFormat]

export const inputFailureReasons = {
  timeout: "timeout",
  userSkipped: "user_skipped",
  invalidInputAttempts: "invalid_input_attempts",
} as const
export type InputFailureReason =
  (typeof inputFailureReasons)[keyof typeof inputFailureReasons]

export const getUserDataStepSchema = z.object({
  id: zodBigintAsString().describe(
    "Step id (numeric string), unique within the flow.",
  ),
  stepType: z
    .literal(stepTypes.enum.getUserData)
    .describe('Step type discriminator: "getUserData".'),
  message: z.string().trim().min(1).max(255),
  replyFormat: z.string().pipe(z.enum(ReplyFormat)),
  outputFieldId: z.string().trim().min(1),
  retryMessage: z.string().trim().max(255),
  // Reserved for a future runtime skip-button event; currently schema-only.
  skipButtonLabel: z.string().trim().max(255),
  showHint: z
    .boolean()
    .optional()
    .describe(
      "Phone/email reply formats only: offer the contact's stored phone/email as a quick reply on Messenger and Instagram. With no stored value, Messenger falls back to its native phone/email quick reply. Other channels send the plain prompt.",
    ),
  autoSkip: z.boolean(),
  autoSkipTimeUnit: z.string().pipe(waitStepDelayUnits),
  autoSkipTimeValue: z.coerce.number().int().min(1).max(100),
  autoSkipFailAttempts: z.coerce.number().int().min(1).max(100),
  states: z.tuple([successStateSchema, skipStateSchema]),
})
export type GetUserDataStepSchema = z.infer<typeof getUserDataStepSchema>

// No ":" and a "|" (invalid base64), so `decodeButtonPayload` can never read
// it as a flow action.
const CONTACT_HINT_QUICK_REPLY_PREFIX = "GET_USER_DATA_CONTACT_HINT|"

/**
 * Quick reply payload for the "Show Hint" option: carries the contact's
 * stored phone/email in full, because Meta caps the visible title at 20
 * characters. The receiving side swaps the tapped (possibly shortened) title
 * for this value via {@link decodeContactHintQuickReplyPayload}.
 */
export function encodeContactHintQuickReplyPayload(value: string): string {
  return `${CONTACT_HINT_QUICK_REPLY_PREFIX}${value}`
}

export function decodeContactHintQuickReplyPayload(
  payload: string | null | undefined,
): string | null {
  if (!payload?.startsWith(CONTACT_HINT_QUICK_REPLY_PREFIX)) {
    return null
  }
  return payload.slice(CONTACT_HINT_QUICK_REPLY_PREFIX.length) || null
}

export const getUserDataStepDefaultFn = (): GetUserDataStepSchema => ({
  id: createId(),
  stepType: stepTypes.enum.getUserData,
  message: "",
  replyFormat: ReplyFormat.text,
  outputFieldId: "",
  retryMessage: "",
  skipButtonLabel: "",
  showHint: false,
  autoSkip: false,
  autoSkipTimeUnit: waitStepDelayUnits.enum.minutes,
  autoSkipTimeValue: 3,
  autoSkipFailAttempts: 3,
  states: [successStateDefaultFn(), skipStateDefaultFn()],
})
