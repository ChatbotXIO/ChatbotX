import { WhatsappException } from "@chatbotx.io/integration-whatsapp/exception"
import { describe, expect, test } from "vitest"
import { isCallAnnouncementValidationError } from "@/features/integration-whatsapp/calling/actions/call-announcement-options"

const metaError = (httpStatusCode: number, code: number | string) =>
  new WhatsappException("(#error) meta rejected the call", httpStatusCode, code)

describe("isCallAnnouncementValidationError", () => {
  test("treats an undocumented Meta 4xx (e.g. invalid parameter) as a possible announcement rejection", () => {
    expect(isCallAnnouncementValidationError(metaError(400, 100))).toBe(true)
  })

  test.each([
    [138_003, "duplicate call"],
    [138_012, "business-initiated calls limit"],
    [138_013, "business-initiated calling unavailable"],
    [138_014, "calling temporarily disabled"],
    [138_001, "receiver uncallable"],
    [131_044, "no valid payment method"],
    [138_019, "call setup failed"],
  ])("never retries a documented calling error %i (%s)", (code) => {
    expect(isCallAnnouncementValidationError(metaError(400, code))).toBe(false)
  })

  test("matches a documented code delivered as a string", () => {
    expect(isCallAnnouncementValidationError(metaError(400, "138003"))).toBe(
      false,
    )
  })

  test.each([
    401, 403, 429,
  ])("never retries an auth or rate-limit status %i", (httpStatusCode) => {
    expect(
      isCallAnnouncementValidationError(metaError(httpStatusCode, 100)),
    ).toBe(false)
  })

  test("never retries the local purpose-too-long validation error", () => {
    expect(
      isCallAnnouncementValidationError(
        metaError(400, "whatsappCallAnnouncementPurposeTooLong"),
      ),
    ).toBe(false)
  })

  test.each([
    ["a 5xx", metaError(500, 138_004)],
    ["a non-WhatsApp error", new Error("boom")],
  ])("never retries %s", (_, error) => {
    expect(isCallAnnouncementValidationError(error)).toBe(false)
  })
})
