// @vitest-environment node

import { CREATABLE_CHANNELS } from "@chatbotx.io/database/partials"
import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// Threads was released to everyone once Meta approved the Threads API, so no
// channel sits behind the preview allowlist any more: every user — allowlisted
// or not — gets the full channel list and every Tools card. The allowlist
// mechanism stays in place for the next channel awaiting provider approval.
// ---------------------------------------------------------------------------

const { mockGetCurrentUser } = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn(),
}))

vi.mock("@/lib/auth/utils", () => ({
  getCurrentUser: mockGetCurrentUser,
}))

const { PREVIEW_CHANNELS, canSeePreviewChannels, filterPreviewChannels } =
  await import("../src/lib/workspace/preview-channels")
const { TOOLS_CONFIG, canShowPreviewTool } = await import(
  "../src/features/tools/tools-list"
)

const signInAs = (email: string | null) => {
  mockGetCurrentUser.mockResolvedValue(email ? { email } : null)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("preview channels", () => {
  test("no channel is pending approval", () => {
    expect(PREVIEW_CHANNELS).toEqual([])
  })

  test("a regular user sees threads", async () => {
    signInAs("member@example.com")

    await expect(filterPreviewChannels(CREATABLE_CHANNELS)).resolves.toEqual([
      ...CREATABLE_CHANNELS,
    ])
    expect(CREATABLE_CHANNELS).toContain("threads")
  })

  test("an anonymous request still sees threads", async () => {
    signInAs(null)

    expect(await canSeePreviewChannels()).toBe(false)
    await expect(filterPreviewChannels(["threads"])).resolves.toEqual([
      "threads",
    ])
  })

  test("the allowlist match ignores case and surrounding space", async () => {
    signInAs("  Support@AhaChat.com ")

    await expect(canSeePreviewChannels()).resolves.toBe(true)
  })

  test("filtering leaves the caller's array untouched", async () => {
    signInAs("member@example.com")
    const input = [...CREATABLE_CHANNELS]

    await filterPreviewChannels(input)

    expect(input).toEqual([...CREATABLE_CHANNELS])
  })
})

describe("tool cards", () => {
  test("the threads-comment card is listed", () => {
    expect(TOOLS_CONFIG.map((config) => config.id)).toContain("threads-comment")
  })

  test("no card is previewOnly", () => {
    const previewCards = TOOLS_CONFIG.filter(
      (config) => "previewOnly" in config,
    ).map((config) => config.id)

    expect(previewCards).toEqual([])
  })

  test("canShowPreviewTool still gates flagged cards", () => {
    expect(canShowPreviewTool(true, false)).toBe(false)
    expect(canShowPreviewTool(true, true)).toBe(true)
    expect(canShowPreviewTool(false, false)).toBe(true)
  })
})
