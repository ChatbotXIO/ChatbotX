import {
  resolveAnnouncementLanguage,
  type WhatsappCallAnnouncementOptions,
} from "@chatbotx.io/integration-whatsapp/api/calling"
import { WhatsappException } from "@chatbotx.io/integration-whatsapp/exception"
import { transcribesCalls } from "@chatbotx.io/utils/whatsapp-call"

/**
 * Fallback `purpose` (Meta requires this when `status:"ENABLED"`, capped at
 * `MAX_CALL_ANNOUNCEMENT_PURPOSE_CHARS`=250) used when the integration has
 * not configured `callRecordingPurpose` yet.
 */
export const DEFAULT_CALL_ANNOUNCEMENT_PURPOSE = "Quality assurance and support"

/**
 * The subset of `IntegrationWhatsapp` columns {@link buildCallAnnouncementOptions}
 * needs — kept minimal (rather than importing the full database row type)
 * so this module has no dependency on `@chatbotx.io/database`.
 */
export type CallAnnouncementIntegration = {
  callRecordingEnabled: boolean
  callTranscriptionEnabled: boolean
  callRecordingMode: "metaNative" | "browserWhisper"
  callTranscriptionMode: "metaNative" | "browserWhisper"
  callAnnouncementLanguage: string | null
  callRecordingPurpose: string | null
}

/**
 * Builds the Meta-native `recording`/`transcription` opt-in objects for a
 * `connect` (outbound) or `accept` (inbound) VoIP call action.
 *
 * - `recording` is present only when `callRecordingEnabled` AND
 *   `callRecordingMode === "metaNative"`.
 * - `transcription` is present only when the number transcribes calls
 *   (`transcribesCalls`: transcription on AND recording on) AND
 *   `callTranscriptionMode === "metaNative"`.
 * - Both objects share ONE `purpose`/`announcementLanguage` pair — when both
 *   are enabled, Meta plays a single combined announcement built from the
 *   `recording` object's values, so recording and transcription must never
 *   diverge here.
 * - `browserWhisper` mode (or the toggle off) omits the object entirely,
 *   leaving today's browser MediaRecorder+Whisper path untouched.
 */
export function buildCallAnnouncementOptions(
  integration: CallAnnouncementIntegration,
  contactLocale?: string,
): WhatsappCallAnnouncementOptions {
  const recordingNative =
    integration.callRecordingEnabled &&
    integration.callRecordingMode === "metaNative"
  const transcriptionNative =
    transcribesCalls(integration) &&
    integration.callTranscriptionMode === "metaNative"

  if (!(recordingNative || transcriptionNative)) {
    return {}
  }

  const purpose =
    integration.callRecordingPurpose ?? DEFAULT_CALL_ANNOUNCEMENT_PURPOSE
  const announcementLanguage = resolveAnnouncementLanguage(
    integration.callAnnouncementLanguage ?? contactLocale ?? undefined,
  )
  const announcement = {
    status: "ENABLED" as const,
    purpose,
    announcementLanguage,
  }

  return {
    ...(recordingNative ? { recording: announcement } : {}),
    ...(transcriptionNative ? { transcription: announcement } : {}),
  }
}

/** True when at least one of `recording`/`transcription` is set. */
export function hasCallAnnouncementOptions(
  options: WhatsappCallAnnouncementOptions,
): boolean {
  return options.recording !== undefined || options.transcription !== undefined
}

/**
 * HTTP statuses that are NEVER the `recording`/`transcription` announcement
 * objects being rejected — 401/403 are auth/permission failures and 429 is
 * rate-limiting, none of which have anything to do with a bad
 * `purpose`/`announcement_language`. Stripping the announcement options and
 * retrying on one of these would silently disable recording/transcription
 * for a call that was never going to succeed anyway.
 */
const NEVER_ANNOUNCEMENT_RELATED_HTTP_STATUSES = new Set([401, 403, 429])

/**
 * Meta's documented calling error codes. Each names a concrete cause that is
 * not a bad announcement (duplicate call, limits, permissions, payment,
 * media failures), so retrying without the announcement would only repeat a
 * request Meta already refused for another reason. Meta documents no code of
 * its own for an invalid `purpose`/`announcement_language`.
 *
 * developers.facebook.com/documentation/business-messaging/whatsapp/calling/troubleshooting
 */
const DOCUMENTED_CALLING_ERROR_CODES = new Set([
  613, 131_009, 131_030, 131_044, 131_055, 138_000, 138_001, 138_002, 138_003,
  138_004, 138_005, 138_006, 138_007, 138_009, 138_012, 138_013, 138_014,
  138_015, 138_017, 138_018, 138_019, 138_020, 138_021, 138_022, 138_023,
])

/**
 * True for a Meta 4xx that can plausibly be the `recording`/`transcription`
 * opt-in objects being rejected: an invalid `purpose`/`announcement_language`
 * makes Meta reject the whole connect/accept at request time. Meta returns no
 * dedicated error code for that validation, so a 4xx is retry-worthy ONLY when it
 * is not one of the statuses above, and not the local
 * `whatsappCallAnnouncementPurposeTooLong` validation error — a bad SDP,
 * an auth failure, or a rate limit must propagate untouched rather than
 * silently stripping recording/transcription and retrying. The caller only
 * invokes this check when announcement options were actually attached.
 */
export function isCallAnnouncementValidationError(error: unknown): boolean {
  if (!(error instanceof WhatsappException)) {
    return false
  }
  if (error.code === "whatsappCallAnnouncementPurposeTooLong") {
    return false
  }
  if (
    NEVER_ANNOUNCEMENT_RELATED_HTTP_STATUSES.has(error.httpStatusCode) ||
    DOCUMENTED_CALLING_ERROR_CODES.has(Number(error.code))
  ) {
    return false
  }
  return error.httpStatusCode >= 400 && error.httpStatusCode < 500
}
