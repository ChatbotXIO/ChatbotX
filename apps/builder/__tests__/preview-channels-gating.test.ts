// @vitest-environment node

import { CREATABLE_CHANNELS } from "@chatbotx.io/database/partials"
import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// Threads ships behind a preview allowlist while Meta's Threads API approval
// is pending: every channel entry point (create picker, settings accordion +
// route, platform hidden-channels admin) and the Threads comment-automation
// tool card must stay hidden for everyone except the allowlisted accounts,
// and must come back in full for those accounts.
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
  test("threads is the pending-approval channel", () => {
    expect(PREVIEW_CHANNELS).toContain("threads")
  })

  test("a regular user loses threads from a channel list", async () => {
    signInAs("member@example.com")

    const channels = await filterPreviewChannels(CREATABLE_CHANNELS)

    expect(channels).not.toContain("threads")
    // Nothing else is dropped.
    expect(channels).toEqual(
      CREATABLE_CHANNELS.filter((channel) => channel !== "threads"),
    )
  })

  test("the allowlisted account keeps threads", async () => {
    signInAs("support@ahachat.com")

    await expect(filterPreviewChannels(CREATABLE_CHANNELS)).resolves.toEqual([
      ...CREATABLE_CHANNELS,
    ])
  })

  test("the allowlist match ignores case and surrounding space", async () => {
    signInAs("  Support@AhaChat.com ")

    await expect(canSeePreviewChannels()).resolves.toBe(true)
  })

  test("an anonymous request is fail-closed", async () => {
    signInAs(null)

    expect(await canSeePreviewChannels()).toBe(false)
    await expect(filterPreviewChannels(["threads"])).resolves.toEqual([])
  })

  test("filtering leaves the caller's array untouched", async () => {
    signInAs("member@example.com")
    const input = [...CREATABLE_CHANNELS]

    await filterPreviewChannels(input)

    expect(input).toEqual([...CREATABLE_CHANNELS])
  })
})

describe("threads-comment tool card", () => {
  const entry = TOOLS_CONFIG.find((config) => config.id === "threads-comment")

  test("is flagged previewOnly", () => {
    expect(entry && "previewOnly" in entry ? entry.previewOnly : false).toBe(
      true,
    )
  })

  test("is hidden without preview access and shown with it", () => {
    expect(canShowPreviewTool(true, false)).toBe(false)
    expect(canShowPreviewTool(true, true)).toBe(true)
  })

  test("cards without the flag are unaffected", () => {
    expect(canShowPreviewTool(false, false)).toBe(true)
  })

  test("threads-comment is the only previewOnly card", () => {
    const previewCards = TOOLS_CONFIG.filter(
      (config) => "previewOnly" in config,
    ).map((config) => config.id)

    expect(previewCards).toEqual(["threads-comment"])
  })
})
