import { describe, expect, test } from "vitest"
import { listMessengerPagesPublicRequest } from "@/features/ads-campaign/schema/public"

describe("listMessengerPagesPublicRequest", () => {
  test("integrationId can be omitted", () => {
    expect(
      listMessengerPagesPublicRequest.safeParse({ channel: "whatsapp" })
        .success,
    ).toBe(true)
  })

  test("callers that still send a numeric integrationId keep working", () => {
    expect(
      listMessengerPagesPublicRequest.safeParse({
        channel: "whatsapp",
        integrationId: "123",
      }).success,
    ).toBe(true)
  })

  test("a malformed integrationId is still rejected", () => {
    expect(
      listMessengerPagesPublicRequest.safeParse({
        channel: "whatsapp",
        integrationId: "abc",
      }).success,
    ).toBe(false)
  })
})
