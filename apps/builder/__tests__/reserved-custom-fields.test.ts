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
  systemFieldTypes.enum.locale2,
  systemFieldTypes.enum.gender,
  systemFieldTypes.enum.timezone,
  systemFieldTypes.enum.timezone_name,
  systemFieldTypes.enum.subscribed_date,
  systemFieldTypes.enum.user_source,
  systemFieldTypes.enum.user_id,
  systemFieldTypes.enum.user_tags,
  systemFieldTypes.enum.last_user_note,
  systemFieldTypes.enum.workspace_name,
  systemFieldTypes.enum.workspace_id,
  systemFieldTypes.enum.page_user_name,
  systemFieldTypes.enum.last_input,
  systemFieldTypes.enum.last_user_input_type,
  systemFieldTypes.enum.last_opportunity_id,
  systemFieldTypes.enum.last_text_input,
  systemFieldTypes.enum.last_call_recorded,
  systemFieldTypes.enum.last_call_transcript,
  systemFieldTypes.enum["ai.queued.messages"],
  systemFieldTypes.enum.current_time,
  systemFieldTypes.enum.booking_calendar,
  systemFieldTypes.enum.booking_date,
  systemFieldTypes.enum.booking_link,
  systemFieldTypes.enum.last_seen,
  systemFieldTypes.enum.last_interaction,
  systemFieldTypes.enum.last_outbound_message_at,
  systemFieldTypes.enum.chat_history,
  systemFieldTypes.enum.chat_history_large,
  systemFieldTypes.enum.chat_history_details,
  systemFieldTypes.enum.chat_history_details_large,
  systemFieldTypes.enum.inbox_link,
  systemFieldTypes.enum.last_btn_title,
  systemFieldTypes.enum.fb_chat_link,
  systemFieldTypes.enum.last_fb_comment,
  systemFieldTypes.enum.last_post_id,
  systemFieldTypes.enum.last_comment_id,
  systemFieldTypes.enum.last_commented_post_text,
  systemFieldTypes.enum.total_tagged,
  systemFieldTypes.enum.total_new_tagged,
  systemFieldTypes.enum.admin_name,
  systemFieldTypes.enum.admin_team_name,
  systemFieldTypes.enum.booking_id,
  systemFieldTypes.enum.last_points,
  systemFieldTypes.enum.last_input_failure,
  systemFieldTypes.enum.last_error_log,
  systemFieldTypes.enum.last_ad_headline,
  systemFieldTypes.enum.last_ad,
  systemFieldTypes.enum.last_ad_source_url,
  systemFieldTypes.enum.last_ad_source_platform,
  systemFieldTypes.enum.ad_ids,
  systemFieldTypes.enum.ad_id,
  systemFieldTypes.enum.last_ad_body,
  systemFieldTypes.enum.last_story_id,
  systemFieldTypes.enum.last_lead_id,
  systemFieldTypes.enum.last_form_id,
  systemFieldTypes.enum.last_form_name,
  systemFieldTypes.enum.last_adgroup_id,
  systemFieldTypes.enum.last_ad_name,
  systemFieldTypes.enum.last_adset_id,
  systemFieldTypes.enum.last_adset_name,
  systemFieldTypes.enum.last_campaign_id,
  systemFieldTypes.enum.last_campaign_name,
  systemFieldTypes.enum.referral_name,
  systemFieldTypes.enum.empty,
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
  test("matches the import-compatible system field picker set", () => {
    expect(reservedCustomFieldIds.map((field) => field.id)).toEqual(
      expectedReservedSystemFieldIds,
    )
  })

  test("only offers channel-specific fields on the channels that can produce them", () => {
    const channelsOf = (id: string) =>
      reservedCustomFieldIds.find((field) => field.id === id)?.channels

    expect(channelsOf(systemFieldTypes.enum.last_story_id)).toEqual([
      "instagram",
    ])
    expect(channelsOf(systemFieldTypes.enum.last_lead_id)).toEqual([
      "messenger",
    ])
    expect(channelsOf(systemFieldTypes.enum.last_form_id)).toEqual([
      "messenger",
    ])
    expect(channelsOf(systemFieldTypes.enum.last_form_name)).toEqual([
      "messenger",
    ])
    expect(channelsOf(systemFieldTypes.enum.last_adgroup_id)).toEqual([
      "messenger",
    ])
    for (const leadAdField of [
      systemFieldTypes.enum.last_ad_name,
      systemFieldTypes.enum.last_adset_id,
      systemFieldTypes.enum.last_adset_name,
      systemFieldTypes.enum.last_campaign_id,
      systemFieldTypes.enum.last_campaign_name,
      systemFieldTypes.enum.total_tagged,
      systemFieldTypes.enum.total_new_tagged,
    ]) {
      expect(channelsOf(leadAdField)).toEqual(["messenger"])
    }
    for (const commentField of [
      systemFieldTypes.enum.last_post_id,
      systemFieldTypes.enum.last_comment_id,
      systemFieldTypes.enum.last_commented_post_text,
    ]) {
      expect(channelsOf(commentField)).toEqual(["messenger", "instagram"])
    }
    // Only WhatsApp Click-to-WhatsApp referrals carry an ad body.
    expect(channelsOf(systemFieldTypes.enum.last_ad_body)).toEqual(["whatsapp"])
    // Every channel that records an ad touch (Zalo through a Google click).
    expect(channelsOf(systemFieldTypes.enum.ad_ids)).toEqual([
      "messenger",
      "instagram",
      "whatsapp",
      "zalo",
    ])
    expect(channelsOf(systemFieldTypes.enum.ad_id)).toEqual(
      channelsOf(systemFieldTypes.enum.ad_ids),
    )
    expect(channelsOf(systemFieldTypes.enum.last_ad_headline)).toEqual([
      "messenger",
      "instagram",
      "whatsapp",
    ])
  })

  test("does not offer the legacy spelling alias beside the canonical field", () => {
    expect(reservedCustomFieldIds.map((field) => field.id)).not.toContain(
      systemFieldTypes.enum.last_btt_title,
    )
    expect(reservedCustomFieldIds.map((field) => field.id)).not.toContain(
      systemFieldTypes.enum.last_input_type,
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
