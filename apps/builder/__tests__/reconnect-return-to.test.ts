// @vitest-environment node

import { describe, expect, test } from "vitest"
import {
  buildReconnectReferer,
  reconnectReturnToSchema,
} from "@/lib/channel-reconnect"

describe("reconnectReturnToSchema", () => {
  test("accepts only the postsConnect value (or none)", () => {
    expect(reconnectReturnToSchema.parse("postsConnect")).toBe("postsConnect")
    expect(reconnectReturnToSchema.optional().parse(undefined)).toBeUndefined()
  })

  test.each([
    "https://evil.example/phish",
    "//evil.example",
    "/space/1/settings",
    "postsconnect",
    "",
    42,
    null,
  ])("rejects %j", (value) => {
    expect(reconnectReturnToSchema.safeParse(value).success).toBe(false)
  })
})

describe("buildReconnectReferer", () => {
  const origin = "https://app.example.com"

  test("postsConnect lands on the Posts Connect tab of the workspace", () => {
    expect(
      buildReconnectReferer({
        channel: "messenger",
        origin,
        returnTo: "postsConnect",
        workspaceId: "42",
      }),
    ).toBe("https://app.example.com/space/42/posts/connect")
  })

  test.each([
    "messenger",
    "instagram",
    "threads",
  ] as const)("no returnTo keeps the %s channel settings page", (channel) => {
    expect(
      buildReconnectReferer({
        channel,
        origin,
        returnTo: undefined,
        workspaceId: "42",
      }),
    ).toBe(
      `https://app.example.com/space/42/settings/channels?channel=${channel}`,
    )
  })
})
