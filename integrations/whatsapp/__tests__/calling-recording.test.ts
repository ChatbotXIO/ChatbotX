import { describe, expect, it } from "vitest"
import { WhatsappException } from "../src/exception"
import {
  buildCallAnnouncementBody,
  MAX_CALL_ANNOUNCEMENT_PURPOSE_CHARS,
  resolveAnnouncementLanguage,
  SUPPORTED_CALL_ANNOUNCEMENT_LANGUAGES,
} from "../src/lib/calling-recording"

describe("resolveAnnouncementLanguage", () => {
  it("returns a supported code unchanged", () => {
    expect(resolveAnnouncementLanguage("es")).toBe("es")
    expect(resolveAnnouncementLanguage("es_ES")).toBe("es_ES")
    expect(resolveAnnouncementLanguage("vi")).toBe("vi")
  })

  it("falls back to en_US for an unsupported language", () => {
    expect(resolveAnnouncementLanguage("zz_ZZ")).toBe("en_US")
    expect(resolveAnnouncementLanguage("xx")).toBe("en_US")
  })

  it("normalizes a region-tagged locale to a supported base language", () => {
    // A contact locale is often region-tagged while Meta lists many languages
    // bare — `vi_VN`/`vi-VN` must reach Vietnamese, not silently drop to en_US.
    expect(resolveAnnouncementLanguage("vi_VN")).toBe("vi")
    expect(resolveAnnouncementLanguage("vi-VN")).toBe("vi")
    expect(resolveAnnouncementLanguage("pt_BR")).toBe("pt")
  })

  it("falls back to en_US when undefined", () => {
    expect(resolveAnnouncementLanguage(undefined)).toBe("en_US")
  })

  it("every documented supported language round-trips unchanged", () => {
    for (const code of SUPPORTED_CALL_ANNOUNCEMENT_LANGUAGES) {
      expect(resolveAnnouncementLanguage(code)).toBe(code)
    }
  })
})

describe("buildCallAnnouncementBody", () => {
  it("serializes to Meta's snake_case wire shape", () => {
    expect(
      buildCallAnnouncementBody({
        status: "ENABLED",
        purpose: "quality assurance",
        announcementLanguage: "es",
      }),
    ).toEqual({
      status: "ENABLED",
      purpose: "quality assurance",
      announcement_language: "es",
    })
  })

  it("resolves an unsupported announcement language to the en_US fallback", () => {
    expect(
      buildCallAnnouncementBody({
        status: "ENABLED",
        purpose: "quality assurance",
        announcementLanguage: "not-a-real-code",
      }),
    ).toEqual({
      status: "ENABLED",
      purpose: "quality assurance",
      announcement_language: "en_US",
    })
  })

  it("throws a typed WhatsappException when purpose exceeds 250 characters", () => {
    const tooLong = "a".repeat(MAX_CALL_ANNOUNCEMENT_PURPOSE_CHARS + 1)

    expect(() =>
      buildCallAnnouncementBody({
        status: "ENABLED",
        purpose: tooLong,
        announcementLanguage: "en_US",
      }),
    ).toThrow(WhatsappException)
  })

  it("accepts purpose at exactly the 250-character limit", () => {
    const atLimit = "a".repeat(MAX_CALL_ANNOUNCEMENT_PURPOSE_CHARS)

    expect(
      buildCallAnnouncementBody({
        status: "ENABLED",
        purpose: atLimit,
        announcementLanguage: "en_US",
      }).purpose,
    ).toHaveLength(MAX_CALL_ANNOUNCEMENT_PURPOSE_CHARS)
  })
})
