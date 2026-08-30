import { describe, expect, it } from "vitest"
import { channelTypes } from "../src/channel"
import {
  errorLogProviderLabel,
  errorLogProviderLabels,
  errorLogProviders,
  errorLogProvidersMatchingLabel,
} from "../src/error-log"

describe("errorLogProviders", () => {
  it("accepts every connectable channel type", () => {
    for (const channel of channelTypes.options) {
      if (channel === "omnichannel") {
        continue
      }
      expect(errorLogProviders.safeParse(channel).success).toBe(true)
    }
  })

  it("rejects omnichannel, which is the unknown-channel fallback label", () => {
    expect(errorLogProviders.safeParse("omnichannel").success).toBe(false)
  })

  it("rejects a value that is not a known provider", () => {
    expect(errorLogProviders.safeParse("Messenger").success).toBe(false)
    expect(errorLogProviders.safeParse("fb").success).toBe(false)
    expect(errorLogProviders.safeParse("system").success).toBe(false)
    expect(errorLogProviders.safeParse("facebook-lead-ads").success).toBe(false)
  })

  // The Facebook-linked Instagram variant is an auth distinction, not a
  // separate destination — it logs under the one `instagram` label so a
  // Provider filter cannot split one integration's failures in two.
  it("rejects instagram-facebook, which collapses into instagram", () => {
    expect(errorLogProviders.safeParse("instagram-facebook").success).toBe(
      false,
    )
    expect(errorLogProviders.safeParse("instagram").success).toBe(true)
  })

  // Every AI step carries the vendor it ran against, so a Claude failure must
  // be attributable to Claude rather than folded into OpenAI.
  it("accepts every AI vendor an AI step can run against", () => {
    for (const provider of [
      "openai",
      "gemini",
      "claude",
      "deepseek",
      "openrouter",
      "openai-compatible",
    ]) {
      expect(errorLogProviders.safeParse(provider).success).toBe(true)
    }
  })

  it("accepts the non-channel third parties", () => {
    for (const provider of [
      "mailchimp",
      "openai",
      "google-sheets",
      "google-calendar",
      "meta-catalog",
    ]) {
      expect(errorLogProviders.safeParse(provider).success).toBe(true)
    }
  })
})

describe("errorLogProviderLabel", () => {
  it("labels every provider with a non-slug display name", () => {
    for (const provider of errorLogProviders.options) {
      const label = errorLogProviderLabels[provider]
      expect(label).toBeTruthy()
      expect(label).not.toContain("-")
    }
  })

  it("humanises the stored slug", () => {
    expect(errorLogProviderLabel("webchat")).toBe("Webchat")
    expect(errorLogProviderLabel("facebook-ads")).toBe("Facebook ads")
    expect(errorLogProviderLabel("google-calendar")).toBe("Google calendar")
    expect(errorLogProviderLabel("smtp")).toBe("Email")
  })

  // `ErrorLog.action` is a plain text column, so a row can outlive its label.
  it("falls back to the raw value for an unknown action", () => {
    expect(errorLogProviderLabel("some-removed-provider")).toBe(
      "some-removed-provider",
    )
  })
})

describe("errorLogProvidersMatchingLabel", () => {
  // The table renders the label while `action` stores the slug, so the search
  // has to bridge the two or the visible value is unsearchable.
  it("finds the provider behind a label that shares no text with its slug", () => {
    expect(errorLogProvidersMatchingLabel("Email")).toEqual(["smtp"])
  })

  it("is case-insensitive and matches on a fragment", () => {
    expect(errorLogProvidersMatchingLabel("meta")).toEqual([
      "meta-catalog",
      "meta-conversions",
    ])
  })

  it("returns nothing for a blank or unmatched keyword", () => {
    expect(errorLogProvidersMatchingLabel("   ")).toEqual([])
    expect(errorLogProvidersMatchingLabel("nothing here")).toEqual([])
  })
})
