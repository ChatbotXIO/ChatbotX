import { describe, expect, test } from "vitest"
import { FacebookAdsException, redactTokens, rescue } from "../src/exception"

const TOKEN = "EAAB-SECRET-TOKEN"

describe("rescue token redaction", () => {
  test("a non-HTTP error whose message carries the request URL never leaks the token", async () => {
    const message = `Request timed out: POST https://graph.facebook.com/v25.0/act_9/customaudiences?access_token=${TOKEN}&appsecret_proof=abc123&fields=id`
    const error = await rescue("/act_9/customaudiences", () =>
      Promise.reject(new Error(message)),
    ).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(FacebookAdsException)
    const text = (error as FacebookAdsException).message
    expect(text).not.toContain(TOKEN)
    expect(text).not.toContain("abc123")
    expect(text).toContain("access_token=[REDACTED]")
    expect(text).toContain("fields=id")
  })

  test("redactTokens leaves messages without tokens untouched", () => {
    expect(redactTokens("plain failure")).toBe("plain failure")
  })
})
