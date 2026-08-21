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

export type WhatsappCallingSettings = {
  status: "ENABLED" | "DISABLED"
  call_icon_visibility?: "DEFAULT" | "DISABLE_ALL"
  callback_permission_status?: "ENABLED" | "DISABLED"
  call_hours?: WhatsappCallHours
}

type PhoneNumberSettingsResponse = {
  calling?: WhatsappCallingSettings
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

    return result.calling ?? DISABLED_CALLING_SETTINGS
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
