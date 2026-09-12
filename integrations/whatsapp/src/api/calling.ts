import ky from "ky"
import { API_URL, DEFAULT_API_VERSION } from "../constants"
import { rescue } from "../exception"
import type { WhatsappAuthValue } from "../schema"

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

export type WhatsappSipServer = {
  hostname: string
  port?: number | string
  request_uri_user_params?: Record<string, string>
  /**
   * Only present when the settings read is made with
   * `include_sip_credentials=true` (provisioning) — Meta's SIP
   * digest password for this business number
   * (`GET /{pnid}/settings?include_sip_credentials=true`). Never logged;
   * the provisioning service encrypts it (`encryptUtils`) immediately.
   */
  sip_user_password?: string
}

export type WhatsappSipSettings = {
  status: "ENABLED" | "DISABLED"
  /**
   * SIP mode disables the `calls` webhook field by default; ENABLED keeps
   * lifecycle webhooks flowing — required for the call log/inbox features.
   */
  webhook_delivery?: "ENABLED" | "DISABLED"
  servers?: WhatsappSipServer[]
}

export type WhatsappCallingAudioSettings = {
  /**
   * Extra codecs offered alongside Opus (Meta calling settings reference).
   * The FreeSWITCH gate sends `["PCMA", "PCMU"]` so a
   * non-Opus-capable leg still negotiates.
   */
  additional_codecs?: ("PCMA" | "PCMU")[]
}

export type WhatsappCallingSettings = {
  status: "ENABLED" | "DISABLED"
  call_icon_visibility?: "DEFAULT" | "DISABLE_ALL"
  callback_permission_status?: "ENABLED" | "DISABLED"
  call_hours?: WhatsappCallHours
  sip?: WhatsappSipSettings
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

export type GetCallingSettingsOptions = {
  /**
   * Requests `sip.servers[].sip_user_password` in the response (Meta:
   * `GET /{pnid}/settings?include_sip_credentials=true`). Only the
   * FreeSWITCH SIP-provisioning service needs this — every other caller
   * omits it so the digest password is never fetched (or logged)
   * incidentally.
   */
  includeSipCredentials?: boolean
}

export const getCallingSettings = (
  auth: WhatsappAuthValue,
  options?: GetCallingSettingsOptions,
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
          searchParams: options?.includeSipCredentials
            ? { include_sip_credentials: "true" }
            : undefined,
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
 * permissions API). `can_perform` on the `start_call` action is the gate
 * `startWhatsappCallAction` checks before dialing.
 */
export type WhatsappCallPermissionActionName =
  | "start_call"
  | "send_call_permission_request"

export type WhatsappCallPermissionAction = {
  action_name: WhatsappCallPermissionActionName
  can_perform: boolean
  reasons?: { code?: string; description?: string }[]
  limits?: { name?: string; value?: number }[]
}

export type WhatsappCallPermissionsResponse = {
  messaging_product: "whatsapp"
  permission: {
    status: "no_permission" | "temporary" | "permanent"
    expiration_time?: string
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

/** Finds a named action's `can_perform` flag in a call-permissions response. */
export const canPerformCallAction = (
  response: WhatsappCallPermissionsResponse,
  actionName: WhatsappCallPermissionActionName,
): boolean =>
  response.actions.find((action) => action.action_name === actionName)
    ?.can_perform === true

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
