import { beforeEach, describe, expect, test, vi } from "vitest"

const mockNotFound = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("not found")
  }),
)

vi.mock("next/navigation", () => ({
  notFound: mockNotFound,
}))

const {
  MESSAGING_ADS_TOOL_CHANNEL_LABEL_KEY,
  MESSAGING_ADS_TOOL_CHANNELS,
  parseMessagingAdsToolChannel,
  resolveMessagingAdsToolRedirectChannel,
} = await import("@/features/ads-campaign/lib/tool-channels")

describe("MESSAGING_ADS_TOOL_CHANNELS", () => {
  test("is whatsapp, messenger, instagram in canonical display order", () => {
    expect(MESSAGING_ADS_TOOL_CHANNELS).toEqual([
      "whatsapp",
      "messenger",
      "instagram",
    ])
  })
})

describe("parseMessagingAdsToolChannel", () => {
  beforeEach(() => {
    mockNotFound.mockClear()
  })

  test.each([
    "whatsapp",
    "messenger",
    "instagram",
  ] as const)("returns %s unchanged for a valid channel segment", (channel) => {
    expect(parseMessagingAdsToolChannel(channel)).toBe(channel)
    expect(mockNotFound).not.toHaveBeenCalled()
  })

  test("calls notFound() for an unknown channel segment", () => {
    expect(() => parseMessagingAdsToolChannel("telegram")).toThrow("not found")
    expect(mockNotFound).toHaveBeenCalledTimes(1)
  })

  test("calls notFound() for an empty channel segment", () => {
    expect(() => parseMessagingAdsToolChannel("")).toThrow("not found")
    expect(mockNotFound).toHaveBeenCalledTimes(1)
  })
})

describe("resolveMessagingAdsToolRedirectChannel", () => {
  test.each([
    "whatsapp",
    "messenger",
    "instagram",
  ] as const)("returns %s when the ?channel= string is valid", (channel) => {
    expect(resolveMessagingAdsToolRedirectChannel(channel)).toBe(channel)
  })

  test("returns the first element when ?channel= is an array", () => {
    expect(
      resolveMessagingAdsToolRedirectChannel(["messenger", "whatsapp"]),
    ).toBe("messenger")
  })

  test("falls back to the default channel when the array's first element is invalid", () => {
    expect(resolveMessagingAdsToolRedirectChannel(["telegram"])).toBe(
      "whatsapp",
    )
  })

  test("falls back to the default channel for an invalid string", () => {
    expect(resolveMessagingAdsToolRedirectChannel("telegram")).toBe("whatsapp")
  })

  test("falls back to the default channel when undefined", () => {
    expect(resolveMessagingAdsToolRedirectChannel(undefined)).toBe("whatsapp")
  })
})

describe("MESSAGING_ADS_TOOL_CHANNEL_LABEL_KEY", () => {
  test("maps every channel to its exact fields.<channel>.label key", () => {
    expect(MESSAGING_ADS_TOOL_CHANNEL_LABEL_KEY).toEqual({
      whatsapp: "fields.whatsapp.label",
      messenger: "fields.messenger.label",
      instagram: "fields.instagram.label",
    })
  })
})
