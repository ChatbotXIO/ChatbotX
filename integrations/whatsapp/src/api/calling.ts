import ky from "ky"
import { API_URL, DEFAULT_API_VERSION } from "../constants"
import { parseOriginError, rescue, WhatsappException } from "../exception"
import {
  buildCallAnnouncementBody,
  type WhatsappCallAnnouncementBody,
  type WhatsappCallAnnouncementInput,
} from "../lib/calling-recording"
import { logger } from "../lib/logger"
import type { WhatsappAuthValue } from "../schema"

export {
  resolveAnnouncementLanguage,
  SUPPORTED_CALL_ANNOUNCEMENT_LANGUAGES,
  type WhatsappCallAnnouncementInput,
  type WhatsappCallAnnouncementLanguage,
} from "../lib/calling-recording"

/**
 * WhatsApp Business Calling settings on a phone number
 * (`/{phone-number-id}/settings`, `calling` object).
 *
 * Reference:
 * https://developers.facebook.com/documentation/business-messaging/whatsapp/calling/call-settings
 */

export type WhatsappCallingWeeklyHours = {
  day_of_week:
    | "MONDAY"
    | "TUESDAY"
    | "WEDNESDAY"
    | "THURSDAY"
    | "FRIDAY"
    | "SATURDAY"
    | "SUNDAY"
  open_time: string
  close_time: string
}

export type WhatsappCallingHolidaySchedule = {
  date: string
  start_time: string
  end_time: string
}

export type WhatsappCallHours = {
  status: "ENABLED" | "DISABLED"
  timezone_id: string
  weekly_operating_hours: WhatsappCallingWeeklyHours[]
  holiday_schedule?: WhatsappCallingHolidaySchedule[]
}

export type WhatsappCallingAudioSettings = {
  /** Extra codecs offered alongside Opus (Meta calling settings reference). */
  additional_codecs?: ("PCMA" | "PCMU")[]
}

export type WhatsappCallingSettings = {
  status: "ENABLED" | "DISABLED"
  call_icon_visibility?: "DEFAULT" | "DISABLE_ALL"
  callback_permission_status?: "ENABLED" | "DISABLED"
  call_hours?: WhatsappCallHours
  srtp_key_exchange_protocol?: "DTLS" | "SDES"
  audio?: WhatsappCallingAudioSettings
}

/**
 * The settings read has been observed in two envelope shapes across Graph
 * API versions/docs: a top-level `calling` object and a `data[0].calling`
 * wrapper (like `whatsapp_business_profile`). Both are accepted so a shape
 * change never silently renders the tab as "disabled".
 */
type PhoneNumberSettingsResponse = {
  calling?: WhatsappCallingSettings
  data?: { calling?: WhatsappCallingSettings }[]
}

const DISABLED_CALLING_SETTINGS: WhatsappCallingSettings = {
  status: "DISABLED",
}

export const getCallingSettings = (
  auth: WhatsappAuthValue,
): Promise<WhatsappCallingSettings> => {
  const { version = DEFAULT_API_VERSION } = auth

  return rescue(async () => {
    const result = await ky
      .get<PhoneNumberSettingsResponse>(
        `${API_URL}/${version}/${auth.metadata.phoneNumber.id}/settings`,
        {
          headers: {
            Authorization: `Bearer ${auth.tokens.accessToken}`,
          },
        },
      )
      .json()

    return (
      result.calling ?? result.data?.[0]?.calling ?? DISABLED_CALLING_SETTINGS
    )
  })
}

/**
 * Partially updates the `calling` settings object. Meta merges top-level
 * fields, but treats `call_hours` as full-replace — always send the complete
 * hours object when changing it.
 */
/**
 * One entry of `GET /{pnid}/call_permissions?user_wa_id=` (Meta calling
 * permissions API). Meta's live response key is `can_perform_action` (Meta's
 * own reference doc/example, confirmed against the docs during this change)
 * — `can_perform` was this codebase's original (incorrect) assumption. Both
 * are read here, `can_perform_action` preferred, so neither a doc-accurate
 * response nor a hypothetical legacy shape breaks the gate
 * `startWhatsappCallAction`/{@link canPerformCallAction} checks before
 * dialing.
 */
export type WhatsappCallPermissionActionName =
  | "start_call"
  | "send_call_permission_request"

/**
 * One rate-limit window reported alongside a permission action (Meta's
 * `time_period`/`max_allowed`/`current_usage`, plus `limit_expiration_time`
 * — present only once `current_usage` has reached `max_allowed` — so the UI
 * can show when the window resets).
 */
export type WhatsappCallPermissionLimit = {
  time_period?: string
  max_allowed?: number
  current_usage?: number
  limit_expiration_time?: number | string
}

export type WhatsappCallPermissionAction = {
  action_name: WhatsappCallPermissionActionName
  /** Meta's documented field. Preferred over `can_perform` when both are present. */
  can_perform_action?: boolean
  /** Legacy/fallback field — kept so neither shape breaks the gate. */
  can_perform?: boolean
  reasons?: { code?: string; description?: string }[]
  limits?: WhatsappCallPermissionLimit[]
}

export type WhatsappCallPermissionsResponse = {
  messaging_product: "whatsapp"
  permission: {
    status: "no_permission" | "temporary" | "permanent"
    /** Present while `status` is `temporary` or `permanent`. */
    expiration_time?: number | string
  }
  actions: WhatsappCallPermissionAction[]
}

/**
 * `GET /{pnid}/call_permissions?user_wa_id=<E164 digits>` — whether this
 * business number may start a call (or must request permission first) with
 * the given WhatsApp user, per Meta's calling-permissions reference.
 */
export const getCallPermissions = (
  auth: WhatsappAuthValue,
  userWaId: string,
): Promise<WhatsappCallPermissionsResponse> => {
  const { version = DEFAULT_API_VERSION } = auth

  return rescue(
    async () =>
      await ky
        .get<WhatsappCallPermissionsResponse>(
          `${API_URL}/${version}/${auth.metadata.phoneNumber.id}/call_permissions`,
          {
            headers: {
              Authorization: `Bearer ${auth.tokens.accessToken}`,
            },
            searchParams: { user_wa_id: userWaId },
          },
        )
        .json(),
  )
}

/**
 * Finds a named action's can-perform flag in a call-permissions response.
 * Reads Meta's documented `can_perform_action`, falling back to the legacy
 * `can_perform` key when only that is present — see the field comments on
 * {@link WhatsappCallPermissionAction}.
 */
export const canPerformCallAction = (
  response: WhatsappCallPermissionsResponse,
  actionName: WhatsappCallPermissionActionName,
): boolean => {
  const action = response.actions.find(
    (candidate) => candidate.action_name === actionName,
  )
  return (action?.can_perform_action ?? action?.can_perform) === true
}

export const updateCallingSettings = (
  auth: WhatsappAuthValue,
  calling: Partial<WhatsappCallingSettings>,
): Promise<void> => {
  const { version = DEFAULT_API_VERSION } = auth

  return rescue(async () => {
    await ky
      .post(`${API_URL}/${version}/${auth.metadata.phoneNumber.id}/settings`, {
        headers: {
          Authorization: `Bearer ${auth.tokens.accessToken}`,
        },
        json: { calling },
      })
      .json()
  })
}

/**
 * VoIP call control (`POST /{phone_number_id}/calls`), per Meta's calling
 * spec (`.../whatsapp/calling/user-initiated-calls`). The business answers a
 * SIP-less connect (one carrying `session.sdp_type:"offer"`) by returning an
 * SDP answer: `pre_accept` MUST be sent before `accept` (Meta rejects an
 * `accept` sent first) — `reject`/`terminate` never carry a session.
 *
 * Modeled as a const/enum (not scattered string literals) so every call site
 * and test references the same four values.
 */
export const WhatsappCallGraphAction = {
  preAccept: "pre_accept",
  accept: "accept",
  reject: "reject",
  terminate: "terminate",
  /**
   * Outbound (business-initiated) call placement — inverts the SDP
   * direction of every other action here: the business generates the
   * OFFER and Meta's response carries only the call id, never an SDP. See
   * {@link connectCall}.
   */
  connect: "connect",
} as const

export type WhatsappCallGraphAction =
  (typeof WhatsappCallGraphAction)[keyof typeof WhatsappCallGraphAction]

type WhatsappCallAnswerSession = {
  sdp_type: "answer"
  sdp: string
}

type WhatsappCallOfferSession = {
  sdp_type: "offer"
  sdp: string
}

/**
 * Every action except `connect` operates on an existing `call_id` and (for
 * pre_accept/accept) carries the business's SDP ANSWER.
 */
type WhatsappCallExistingCallActionBody = {
  messaging_product: "whatsapp"
  call_id: string
  action: Exclude<WhatsappCallGraphAction, "connect">
  session?: WhatsappCallAnswerSession
  /** Only ever set by {@link acceptCall} — never `pre_accept`/`reject`/`terminate`. */
  recording?: WhatsappCallAnnouncementBody
  /** Only ever set by {@link acceptCall} — never `pre_accept`/`reject`/`terminate`. */
  transcription?: WhatsappCallAnnouncementBody
}

/**
 * `connect` places a NEW outbound call: no `call_id` yet (Meta assigns one
 * in the response), a recipient `to` (bare digits, no leading `+`), the
 * business's SDP OFFER, and `biz_opaque_callback_data` (the attempt id) so
 * the async answer/status/terminate webhooks can be correlated back to this
 * attempt before the call id is known.
 */
type WhatsappCallConnectActionBody = {
  messaging_product: "whatsapp"
  to: string
  action: "connect"
  biz_opaque_callback_data: string
  session: WhatsappCallOfferSession
  recording?: WhatsappCallAnnouncementBody
  transcription?: WhatsappCallAnnouncementBody
}

type WhatsappCallActionRequestBody =
  | WhatsappCallExistingCallActionBody
  | WhatsappCallConnectActionBody

export type WhatsappCallActionResponse = {
  messaging_product: "whatsapp"
  calls: { id: string }[]
}

/**
 * `connect` has no `call_id` (only `to`, until Meta's response assigns one)
 * — the error context surfaces whichever identifier the failed action's
 * body actually carried, never both.
 */
type CallActionErrorContext = {
  action: WhatsappCallGraphAction
  callId?: string
  to?: string
}

/**
 * SDP-safe error path for the calling actions below. The request body these
 * actions send carries the SDP offer/answer, so the raw ky `HTTPError`
 * (whose `.options.json` echoes that body) must never reach a logger or an
 * exception payload — only `parseOriginError`'s already-narrowed fields
 * (Meta's response error, never our request) are logged/thrown. This is
 * deliberately NOT `rescue`, which logs the raw error object.
 */
const buildCallActionError = (
  error: unknown,
  context: CallActionErrorContext,
): WhatsappException => {
  const parsed = parseOriginError(error)

  logger.error(
    {
      callId: context.callId,
      to: context.to,
      action: context.action,
      httpStatus: parsed.httpStatusCode,
    },
    "WhatsApp call action failed",
  )

  return new WhatsappException(
    parsed.message ?? "WhatsApp call action failed",
    parsed.httpStatusCode,
    parsed.code,
    parsed.subCode,
    parsed.type,
    parsed,
  )
}

const postCallAction = async (
  auth: WhatsappAuthValue,
  body: WhatsappCallActionRequestBody,
): Promise<WhatsappCallActionResponse> => {
  const { version = DEFAULT_API_VERSION } = auth

  try {
    return await ky
      .post<WhatsappCallActionResponse>(
        `${API_URL}/${version}/${auth.metadata.phoneNumber.id}/calls`,
        {
          headers: {
            Authorization: `Bearer ${auth.tokens.accessToken}`,
          },
          json: body,
        },
      )
      .json()
  } catch (error) {
    throw buildCallActionError(error, {
      action: body.action,
      callId: "call_id" in body ? body.call_id : undefined,
      to: "to" in body ? body.to : undefined,
    })
  }
}

export type WhatsappCallSdpAnswerInput = {
  auth: WhatsappAuthValue
  callId: string
  sdpAnswer: string
}

/**
 * Optional Meta-native recording/transcription opt-in on `accept`/`connect`
 * (VoIP-only — NOT accepted by `pre_accept`). When both are provided, Meta
 * plays one combined announcement from `recording`'s `purpose`/
 * `announcementLanguage` — callers should pass the same values to both
 * rather than two different ones.
 */
export type WhatsappCallAnnouncementOptions = {
  recording?: WhatsappCallAnnouncementInput
  transcription?: WhatsappCallAnnouncementInput
}

export type WhatsappCallIdInput = {
  auth: WhatsappAuthValue
  callId: string
}

/**
 * `action:"pre_accept"` — required before `accept`; carries the SDP answer
 * so Meta can start ICE/DTLS while the business finalizes acceptance.
 */
export const preAcceptCall = ({
  auth,
  callId,
  sdpAnswer,
}: WhatsappCallSdpAnswerInput): Promise<WhatsappCallActionResponse> =>
  postCallAction(auth, {
    messaging_product: "whatsapp",
    call_id: callId,
    action: WhatsappCallGraphAction.preAccept,
    session: { sdp_type: "answer", sdp: sdpAnswer },
  })

/**
 * `action:"accept"` — same SDP answer as `pre_accept`; media flows only
 * after this returns 200. Optionally attaches Meta-native `recording`/
 * `transcription` opt-in objects (VoIP-only; never sent by `pre_accept`).
 * When both `recording` and `transcription` are omitted, the request body
 * is byte-for-byte identical to before this option existed.
 */
export const acceptCall = async ({
  auth,
  callId,
  sdpAnswer,
  recording,
  transcription,
}: WhatsappCallSdpAnswerInput &
  WhatsappCallAnnouncementOptions): Promise<WhatsappCallActionResponse> =>
  postCallAction(auth, {
    messaging_product: "whatsapp",
    call_id: callId,
    action: WhatsappCallGraphAction.accept,
    session: { sdp_type: "answer", sdp: sdpAnswer },
    ...(recording ? { recording: buildCallAnnouncementBody(recording) } : {}),
    ...(transcription
      ? { transcription: buildCallAnnouncementBody(transcription) }
      : {}),
  })

/** `action:"reject"` — no session; declines an incoming VoIP call. */
export const rejectCall = ({
  auth,
  callId,
}: WhatsappCallIdInput): Promise<WhatsappCallActionResponse> =>
  postCallAction(auth, {
    messaging_product: "whatsapp",
    call_id: callId,
    action: WhatsappCallGraphAction.reject,
  })

/** `action:"terminate"` — no session; ends an accepted or ringing call. */
export const terminateCall = ({
  auth,
  callId,
}: WhatsappCallIdInput): Promise<WhatsappCallActionResponse> =>
  postCallAction(auth, {
    messaging_product: "whatsapp",
    call_id: callId,
    action: WhatsappCallGraphAction.terminate,
  })

export type WhatsappConnectCallInput = {
  auth: WhatsappAuthValue
  /** Recipient WhatsApp id, bare digits — no leading `+` (Meta rejects one). */
  to: string
  sdpOffer: string
  /**
   * Round-trips as `biz_opaque_callback_data` so the async answer, status,
   * and terminate webhooks can be correlated back to this attempt before
   * `wacid` is known (see `WhatsappCallEventPayload`'s
   * `bizOpaqueCallbackData`).
   */
  attemptId: string
} & WhatsappCallAnnouncementOptions

/**
 * `action:"connect"` — places a NEW outbound (business-initiated) call.
 * Unlike every other action here, the business generates the SDP OFFER and
 * Meta's response carries ONLY the call id (`calls[0].id`) — never an SDP.
 * The user's SDP ANSWER arrives later, asynchronously, on the `calls`
 * webhook as a `connect` event with `direction:"BUSINESS_INITIATED"`.
 */
export const connectCall = async ({
  auth,
  to,
  sdpOffer,
  attemptId,
  recording,
  transcription,
}: WhatsappConnectCallInput): Promise<{ wacid: string }> => {
  const response = await postCallAction(auth, {
    messaging_product: "whatsapp",
    to,
    action: WhatsappCallGraphAction.connect,
    biz_opaque_callback_data: attemptId,
    session: { sdp_type: "offer", sdp: sdpOffer },
    ...(recording ? { recording: buildCallAnnouncementBody(recording) } : {}),
    ...(transcription
      ? { transcription: buildCallAnnouncementBody(transcription) }
      : {}),
  })

  const wacid = response.calls[0]?.id
  if (!wacid) {
    logger.error(
      { action: WhatsappCallGraphAction.connect },
      "WhatsApp connect call action returned no call id",
    )
    throw new WhatsappException(
      "WhatsApp connect call action returned no call id",
      502,
    )
  }

  return { wacid }
}
