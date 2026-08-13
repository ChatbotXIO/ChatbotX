import { systemFieldTypes } from "@chatbotx.io/database/partials"
import { describe, expect, test } from "vitest"
import enMessages from "../messages/en.json"
import viMessages from "../messages/vi.json"
import { reservedCustomFieldIds } from "../src/features/custom-fields/provider/custom-field-hook"

const expectedReservedSystemFieldIds = [
  systemFieldTypes.enum.first_name,
  systemFieldTypes.enum.last_name,
  systemFieldTypes.enum.full_name,
  systemFieldTypes.enum.email,
  systemFieldTypes.enum.phone,
  systemFieldTypes.enum.avatar,
  systemFieldTypes.enum.locale,
  systemFieldTypes.enum.gender,
  systemFieldTypes.enum.timezone,
  systemFieldTypes.enum.user_id,
  systemFieldTypes.enum.user_tags,
  systemFieldTypes.enum.workspace_name,
  systemFieldTypes.enum.workspace_id,
  systemFieldTypes.enum.page_user_name,
  systemFieldTypes.enum.last_input,
  systemFieldTypes.enum["ai.queued.messages"],
  systemFieldTypes.enum.current_time,
  systemFieldTypes.enum.booking_calendar,
  systemFieldTypes.enum.booking_date,
  systemFieldTypes.enum.last_seen,
  systemFieldTypes.enum.last_interaction,
  systemFieldTypes.enum.inbox_link,
  systemFieldTypes.enum.last_btn_title,
  systemFieldTypes.enum.fb_chat_link,
  systemFieldTypes.enum.last_fb_comment,
]

const getMessageValue = (
  messages: Record<string, unknown>,
  key: string,
): unknown => {
  let current: unknown = messages
  for (const part of key.split(".")) {
    if (!(current && typeof current === "object")) {
      return
    }
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

describe("reservedCustomFieldIds", () => {
  test("matches the ChatRace-compatible system field picker set", () => {
    expect(reservedCustomFieldIds.map((field) => field.id)).toEqual(
      expectedReservedSystemFieldIds,
    )
  })

  test("uses valid system field ids", () => {
    for (const field of reservedCustomFieldIds) {
      expect(systemFieldTypes.options).toContain(field.id)
    }
  })

  test("has English and Vietnamese labels for every picker field", () => {
    for (const field of reservedCustomFieldIds) {
      expect(getMessageValue(enMessages, field.labelKey)).toEqual(
        expect.any(String),
      )
      expect(getMessageValue(viMessages, field.labelKey)).toEqual(
        expect.any(String),
      )
    }
  })
})
