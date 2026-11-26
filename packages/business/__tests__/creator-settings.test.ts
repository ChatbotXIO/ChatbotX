// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  publishingSettings: vi.fn(),
}))

vi.mock("../src/social-account/operations", () => ({
  socialAccountOperationService: {
    publishingSettings: mocks.publishingSettings,
  },
}))
vi.mock("../src/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn() },
}))

import { ChatbotXException } from "../src/errors"
import { creatorSettingsIssues } from "../src/social-post/creator-settings"

const target = (destinationId: string, privacyLevel = "SELF_ONLY") => ({
  destinationId,
  options: { privacyLevel },
})

describe("creatorSettingsIssues", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("a creator-info outage adds no issue", async () => {
    mocks.publishingSettings.mockRejectedValue(new Error("providerUnavailable"))

    expect(await creatorSettingsIssues("ws", [target("d1")])).toEqual([])
  })

  test("a creator who cannot post and a mismatched privacy level are issues", async () => {
    mocks.publishingSettings.mockImplementation(
      async ({ destinationId }: { destinationId: string }) =>
        destinationId === "d1"
          ? { canPostNow: false, cannotPostReason: "spam_risk_too_many_posts" }
          : {
              canPostNow: true,
              cannotPostReason: null,
              privacyLevelOptions: ["PUBLIC_TO_EVERYONE"],
            },
    )

    const issues = await creatorSettingsIssues("ws", [
      target("d1"),
      target("d2"),
    ])

    expect(issues.map((issue) => [issue.targetIndex, issue.code])).toEqual([
      [0, "destinationInactive"],
      [1, "optionsInvalid"],
    ])
  })

  test("reads each target from the shared settings read, with no cache of its own", async () => {
    mocks.publishingSettings.mockResolvedValue({
      canPostNow: true,
      cannotPostReason: null,
      privacyLevelOptions: ["SELF_ONLY"],
    })

    await creatorSettingsIssues("ws", [target("d1")])
    await creatorSettingsIssues("ws", [target("d1")])

    expect(mocks.publishingSettings).toHaveBeenCalledTimes(2)
  })

  test("a target without a privacy level is skipped whatever the other targets chose", async () => {
    mocks.publishingSettings.mockResolvedValue({
      canPostNow: false,
      cannotPostReason: "spam_risk_too_many_posts",
      privacyLevelOptions: [],
    })

    const issues = await creatorSettingsIssues("ws", [
      { destinationId: "d1" },
      target("d2"),
    ])

    expect(issues.map((issue) => issue.targetIndex)).toEqual([1])
    expect(mocks.publishingSettings).toHaveBeenCalledTimes(1)
  })

  test("a destination with no publishing settings (not TikTok) adds no issue", async () => {
    mocks.publishingSettings.mockRejectedValue(
      new ChatbotXException("no", "publishingSettingsNotSupported", 422),
    )

    expect(await creatorSettingsIssues("ws", [target("d1")])).toEqual([])
  })
})
