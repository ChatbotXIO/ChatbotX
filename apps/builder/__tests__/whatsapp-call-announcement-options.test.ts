// @vitest-environment node

import { describe, expect, test } from "vitest"
import {
  buildCallAnnouncementOptions,
  type CallAnnouncementIntegration,
  DEFAULT_CALL_ANNOUNCEMENT_PURPOSE,
  hasCallAnnouncementOptions,
  isCallAnnouncementValidationError,
} from "../src/features/integration-whatsapp/calling/actions/call-announcement-options"

const baseIntegration: CallAnnouncementIntegration = {
  callRecordingEnabled: false,
  callTranscriptionEnabled: false,
  callRecordingMode: "metaNative",
  callTranscriptionMode: "metaNative",
  callAnnouncementLanguage: null,
  callRecordingPurpose: null,
}

describe("buildCallAnnouncementOptions", () => {
  test("returns an empty object when both toggles are off", () => {
    expect(buildCallAnnouncementOptions(baseIntegration)).toEqual({})
  })

  test("omits recording when the toggle is on but the mode is browserWhisper", () => {
    const result = buildCallAnnouncementOptions({
      ...baseIntegration,
      callRecordingEnabled: true,
      callRecordingMode: "browserWhisper",
    })
    expect(result).toEqual({})
  })

  test("omits transcription when the toggle is on but the mode is browserWhisper", () => {
    const result = buildCallAnnouncementOptions({
      ...baseIntegration,
      callTranscriptionEnabled: true,
      callTranscriptionMode: "browserWhisper",
    })
    expect(result).toEqual({})
  })

  test("attaches only recording when enabled+metaNative and transcription is off", () => {
    const result = buildCallAnnouncementOptions({
      ...baseIntegration,
      callRecordingEnabled: true,
    })
    expect(result.recording).toEqual({
      status: "ENABLED",
      purpose: DEFAULT_CALL_ANNOUNCEMENT_PURPOSE,
      announcementLanguage: "en_US",
    })
    expect(result.transcription).toBeUndefined()
  })

  test("attaches only transcription when enabled+metaNative and recording is off", () => {
    const result = buildCallAnnouncementOptions({
      ...baseIntegration,
      callTranscriptionEnabled: true,
    })
    expect(result.transcription).toEqual({
      status: "ENABLED",
      purpose: DEFAULT_CALL_ANNOUNCEMENT_PURPOSE,
      announcementLanguage: "en_US",
    })
    expect(result.recording).toBeUndefined()
  })

  test("attaches both with a single shared purpose/announcementLanguage when both are enabled+metaNative", () => {
    const result = buildCallAnnouncementOptions({
      ...baseIntegration,
      callRecordingEnabled: true,
      callTranscriptionEnabled: true,
      callAnnouncementLanguage: "fr",
      callRecordingPurpose: "Support quality review",
    })
    expect(result.recording).toEqual({
      status: "ENABLED",
      purpose: "Support quality review",
      announcementLanguage: "fr",
    })
    expect(result.transcription).toEqual(result.recording)
  })

  test("falls back to the contact locale when callAnnouncementLanguage is not configured", () => {
    const result = buildCallAnnouncementOptions(
      { ...baseIntegration, callRecordingEnabled: true },
      "es",
    )
    expect(result.recording?.announcementLanguage).toBe("es")
  })

  test("prefers the integration's configured announcement language over the contact locale", () => {
    const result = buildCallAnnouncementOptions(
      {
        ...baseIntegration,
        callRecordingEnabled: true,
        callAnnouncementLanguage: "vi",
      },
      "es",
    )
    expect(result.recording?.announcementLanguage).toBe("vi")
  })

  test("resolves an unsupported contact locale to the en_US fallback", () => {
    const result = buildCallAnnouncementOptions(
      { ...baseIntegration, callRecordingEnabled: true },
      "zz_ZZ",
    )
    expect(result.recording?.announcementLanguage).toBe("en_US")
  })

  test("falls back to the default purpose when callRecordingPurpose is null", () => {
    const result = buildCallAnnouncementOptions({
      ...baseIntegration,
      callRecordingEnabled: true,
      callRecordingPurpose: null,
    })
    expect(result.recording?.purpose).toBe(DEFAULT_CALL_ANNOUNCEMENT_PURPOSE)
  })
})

describe("hasCallAnnouncementOptions", () => {
  test("is false when both are undefined", () => {
    expect(hasCallAnnouncementOptions({})).toBe(false)
  })

  test("is true when either recording or transcription is set", () => {
    const announcement = {
      status: "ENABLED" as const,
      purpose: "p",
      announcementLanguage: "en_US",
    }
    expect(hasCallAnnouncementOptions({ recording: announcement })).toBe(true)
    expect(hasCallAnnouncementOptions({ transcription: announcement })).toBe(
      true,
    )
  })
})

describe("isCallAnnouncementValidationError", () => {
  class FakeWhatsappException extends Error {
    httpStatusCode: number
    constructor(httpStatusCode: number) {
      super("Meta rejected the call")
      this.httpStatusCode = httpStatusCode
    }
  }

  test("is true for a WhatsappException-shaped 4xx", async () => {
    const { WhatsappException } = await import(
      "@chatbotx.io/integration-whatsapp/exception"
    )
    const error = new WhatsappException("bad purpose", 400)
    expect(isCallAnnouncementValidationError(error)).toBe(true)
  })

  test("is false for a WhatsappException-shaped 5xx", async () => {
    const { WhatsappException } = await import(
      "@chatbotx.io/integration-whatsapp/exception"
    )
    const error = new WhatsappException("Meta is down", 502)
    expect(isCallAnnouncementValidationError(error)).toBe(false)
  })

  test("is false for a plain (non-WhatsappException) error, even with an httpStatusCode field", () => {
    expect(
      isCallAnnouncementValidationError(new FakeWhatsappException(400)),
    ).toBe(false)
  })

  test("is false for a non-Error value", () => {
    expect(isCallAnnouncementValidationError("boom")).toBe(false)
  })

  test.each([
    401, 403, 429,
  ])("is false for a WhatsappException with httpStatusCode %s (auth/permission/rate-limit, never announcement-related) (B1)", async (httpStatusCode) => {
    const { WhatsappException } = await import(
      "@chatbotx.io/integration-whatsapp/exception"
    )
    const error = new WhatsappException("rejected", httpStatusCode)
    expect(isCallAnnouncementValidationError(error)).toBe(false)
  })

  test("is false for the local whatsappCallAnnouncementPurposeTooLong validation error (B1)", async () => {
    const { WhatsappException } = await import(
      "@chatbotx.io/integration-whatsapp/exception"
    )
    const error = new WhatsappException(
      "purpose too long",
      400,
      "whatsappCallAnnouncementPurposeTooLong",
    )
    expect(isCallAnnouncementValidationError(error)).toBe(false)
  })

  test("is still true for an unrelated 400 error (e.g. bad SDP), so it retries once", async () => {
    const { WhatsappException } = await import(
      "@chatbotx.io/integration-whatsapp/exception"
    )
    const error = new WhatsappException("bad sdp", 400, "invalidParameter")
    expect(isCallAnnouncementValidationError(error)).toBe(true)
  })
})
