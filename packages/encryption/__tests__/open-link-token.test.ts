import { describe, expect, test } from "vitest"
import { signOpenLinkUrl, verifyOpenLinkUrl } from "../src/open-link-token"

const params = {
  workspaceId: "workspace-1",
  url: "https://zalo.me/g/owfqvp123",
}

describe("open link token", () => {
  test("signOpenLinkUrl is deterministic", () => {
    // The whole App Links story rests on this: a random-IV scheme would mint a
    // fresh /go URL per send, and Facebook's crawler would never have scraped
    // the one a contact taps.
    expect(signOpenLinkUrl(params)).toBe(signOpenLinkUrl(params))
  })

  test("a different destination produces a different signature", () => {
    expect(
      signOpenLinkUrl({ ...params, url: "https://zalo.me/g/other" }),
    ).not.toBe(signOpenLinkUrl(params))
  })

  test("verifyOpenLinkUrl accepts its own signature", () => {
    expect(verifyOpenLinkUrl(params, signOpenLinkUrl(params))).toBe(true)
  })

  test("verifyOpenLinkUrl rejects a tampered destination", () => {
    const signature = signOpenLinkUrl(params)

    expect(
      verifyOpenLinkUrl({ ...params, url: "https://evil.example/" }, signature),
    ).toBe(false)
  })

  test("verifyOpenLinkUrl rejects a signature minted for another workspace", () => {
    const signature = signOpenLinkUrl({ ...params, workspaceId: "workspace-2" })

    expect(verifyOpenLinkUrl(params, signature)).toBe(false)
  })

  test("verifyOpenLinkUrl rejects malformed input without throwing", () => {
    expect(verifyOpenLinkUrl(params, "abc")).toBe(false)
    expect(verifyOpenLinkUrl(params, "")).toBe(false)
    expect(verifyOpenLinkUrl(params, null)).toBe(false)
    expect(verifyOpenLinkUrl(params, undefined)).toBe(false)
  })
})
