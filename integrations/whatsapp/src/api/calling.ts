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

export type WhatsappCallingSettings = {
  status: "ENABLED" | "DISABLED"
  call_icon_visibility?: "DEFAULT" | "DISABLE_ALL"
  callback_permission_status?: "ENABLED" | "DISABLED"
  call_hours?: WhatsappCallHours
  sip?: WhatsappSipSettings
  srtp_key_exchange_protocol?: "DTLS" | "SDES"
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
