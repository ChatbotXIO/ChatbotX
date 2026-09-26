import { beforeEach, describe, expect, test, vi } from "vitest"
import { resolveRealtimeBroadcastUrl } from "../src/platform/settings"

const mocks = vi.hoisted(() => ({
  env: {
    FORCE_PUBLIC_HTTPS: false,
    NEXT_PUBLIC_BUILDER_URL: "http://builder.example.com",
    REALTIME_BROADCAST_SECRET: "s".repeat(32),
    REALTIME_INTERNAL_URL: undefined as string | undefined,
  },
}))

vi.mock("../src/integration-context/keys", () => ({
  integrationContextEnv: () => mocks.env,
}))

beforeEach(() => {
  mocks.env.FORCE_PUBLIC_HTTPS = false
  mocks.env.NEXT_PUBLIC_BUILDER_URL = "http://builder.example.com"
  mocks.env.REALTIME_INTERNAL_URL = undefined
})

describe("resolveRealtimeBroadcastUrl", () => {
  test("uses the internal realtime URL ahead of the public builder URL", () => {
    mocks.env.REALTIME_INTERNAL_URL = "http://realtime:1999/ws"

    expect(resolveRealtimeBroadcastUrl()).toBe("http://realtime:1999/ws/")
  })

  test("falls back to the builder websocket URL with its realtime path", () => {
    expect(resolveRealtimeBroadcastUrl()).toBe("http://builder.example.com/ws/")
  })

  test("applies FORCE_PUBLIC_HTTPS to the builder URL fallback", () => {
    mocks.env.FORCE_PUBLIC_HTTPS = true

    expect(resolveRealtimeBroadcastUrl()).toBe(
      "https://builder.example.com/ws/",
    )
  })

  test("normalizes an internal realtime URL to a trailing slash", () => {
    mocks.env.REALTIME_INTERNAL_URL = "http://realtime:1999"

    expect(resolveRealtimeBroadcastUrl()).toBe("http://realtime:1999/")
  })
})
