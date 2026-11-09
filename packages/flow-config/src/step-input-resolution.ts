import { z } from "zod"
import { inputFailureReasons } from "./steps/get-user-data"

/**
 * A pending `type: "step"` conversation challenge can end without a typed
 * answer. The reason reuses the `lastInputFailure` vocabulary, so the step
 * handler records it as-is. Producers: the timeout timer and the Skip button.
 *
 * Dependency-free on purpose (zod + the reason constants only): `util.ts` and
 * `nodes/send-message.ts` both sit on import cycles with the node schemas.
 */
export const stepInputResolutionReasons = z.enum([
  inputFailureReasons.timeout,
  inputFailureReasons.userSkipped,
])
export type StepInputResolutionReason = z.infer<
  typeof stepInputResolutionReasons
>

export const STEP_INPUT_RESOLUTION_PAYLOAD_TYPE = "stepInputResolution"

// No ":" and a "|" (invalid base64), so `decodeButtonPayload` can never read
// it as a flow action.
const STEP_INPUT_SKIP_POSTBACK_PREFIX = "STEP_INPUT_SKIP|"

// A challenge id is a numeric snowflake that must fit a signed bigint.
const CHALLENGE_ID_REGEX = /^\d{1,19}$/
const MAX_SIGNED_BIGINT = 9223372036854775807n

const isValidChallengeId = (value: string): boolean =>
  CHALLENGE_ID_REGEX.test(value) && BigInt(value) <= MAX_SIGNED_BIGINT

/**
 * Postback carried by the Skip button. Only the challenge id travels: the
 * conversation's pending challenge already names the flow, node and step.
 * Stays far below Telegram's 64-byte `callback_data` limit.
 */
export function encodeStepInputSkipPostback(challengeId: string): string {
  return `${STEP_INPUT_SKIP_POSTBACK_PREFIX}${challengeId}`
}

/**
 * Strict inverse of {@link encodeStepInputSkipPostback}. Payloads arrive from
 * untrusted webhook content, so anything malformed returns null.
 */
export function decodeStepInputSkipPostback(
  payload: string | null | undefined,
): string | null {
  if (!payload?.startsWith(STEP_INPUT_SKIP_POSTBACK_PREFIX)) {
    return null
  }
  const challengeId = payload.slice(STEP_INPUT_SKIP_POSTBACK_PREFIX.length)
  return isValidChallengeId(challengeId) ? challengeId : null
}
