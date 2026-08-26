import { describe, expect, test } from "vitest"
import {
  adBadgeLabelKey,
  selectAdBadge,
} from "@/features/conversations/utils/ad-badge"

type Inbox = { channel: string; adReferral: { adTitle: string | null } | null }

const inbox = (channel: string, adReferral: Inbox["adReferral"]): Inbox => ({
  channel,
  adReferral,
})

describe("selectAdBadge", () => {
  test("returns null when no inbox is ad-attributed", () => {
    expect(
      selectAdBadge([inbox("whatsapp", null), inbox("messenger", null)]),
    ).toBeNull()
  })

  test("returns null for empty / nullish contactInboxes", () => {
    expect(selectAdBadge([])).toBeNull()
    expect(selectAdBadge(null)).toBeNull()
    expect(selectAdBadge(undefined)).toBeNull()
  })

  test("shows the badge (title null) when the only ad inbox has no adTitle", () => {
    expect(
      selectAdBadge([
        inbox("whatsapp", { adTitle: null }),
        inbox("messenger", null),
      ]),
    ).toEqual({ channel: "whatsapp", adTitle: null })
  })

  test("carries the ad inbox channel for the label and its adTitle", () => {
    expect(
      selectAdBadge([
        inbox("messenger", null),
        inbox("messenger", { adTitle: "Summer Sale" }),
        inbox("whatsapp", null),
      ]),
    ).toEqual({ channel: "messenger", adTitle: "Summer Sale" })
  })

  test("picks the first NON-EMPTY adTitle independently of which inbox triggered the badge", () => {
    // The first ad inbox has a null title, a later one has a real title —
    // the tooltip must still surface the real title (the Codex finding).
    expect(
      selectAdBadge([
        inbox("instagram", { adTitle: null }),
        inbox("instagram", { adTitle: "Winter Promo" }),
      ]),
    ).toEqual({ channel: "instagram", adTitle: "Winter Promo" })
  })

  test("takes channel from the first ad inbox when multiple channels are ad-attributed", () => {
    expect(
      selectAdBadge([
        inbox("whatsapp", { adTitle: "First Ad" }),
        inbox("messenger", { adTitle: "Second Ad" }),
      ]),
    ).toEqual({ channel: "whatsapp", adTitle: "First Ad" })
  })
})

describe("adBadgeLabelKey", () => {
  test("maps each ad channel to its click-to-X label key", () => {
    expect(adBadgeLabelKey("whatsapp")).toBe("fields.adReferral.ctwa")
    expect(adBadgeLabelKey("messenger")).toBe("fields.adReferral.ctm")
    expect(adBadgeLabelKey("instagram")).toBe("fields.adReferral.ctid")
  })

  test("falls back to the generic Ads label for an unknown channel", () => {
    expect(adBadgeLabelKey("telegram")).toBe("fields.adReferral.label")
  })
})
