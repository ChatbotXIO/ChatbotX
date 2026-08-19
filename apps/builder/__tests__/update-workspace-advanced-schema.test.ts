import { describe, expect, test } from "vitest"
import { updateWorkspaceAdvancedRequest } from "../src/features/workspaces/schema/update-workspace-schema"

const validBase = {
  defaultReply: null,
  targetCountry: "US",
  language: "en",
  timezone: "Africa/Abidjan",
  brandColor: "#016DFF",
  developmentMode: false,
}

describe("updateWorkspaceAdvancedRequest.defaultReplyFrequency", () => {
  test.each([
    "allTime",
    "oncePerHour",
    "oncePerDay",
  ] as const)("accepts '%s'", (defaultReplyFrequency) => {
    const result = updateWorkspaceAdvancedRequest.safeParse({
      ...validBase,
      defaultReplyFrequency,
    })

    expect(result.success).toBe(true)
    expect(result.data?.defaultReplyFrequency).toBe(defaultReplyFrequency)
  })

  test("rejects an invalid frequency string", () => {
    const result = updateWorkspaceAdvancedRequest.safeParse({
      ...validBase,
      defaultReplyFrequency: "everyMinute",
    })

    expect(result.success).toBe(false)
  })

  test("accepts a missing frequency (stale clients must keep the stored value untouched)", () => {
    // `validBase` itself has no `defaultReplyFrequency` key. A form rendered
    // before this field shipped submits without it; the parsed output must
    // carry `undefined` (which Drizzle's `.set()` skips) — never a concrete
    // default that would silently reset the workspace's configured frequency.
    const result = updateWorkspaceAdvancedRequest.safeParse(validBase)

    expect(result.success).toBe(true)
    expect(result.data?.defaultReplyFrequency).toBeUndefined()
  })
})
