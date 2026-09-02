// @vitest-environment node
import { afterEach, describe, expect, test, vi } from "vitest"

const ORIGINAL_VALUE = process.env.EXPO_PUSH_ENABLED

const importEnvWith = async (value: string | undefined) => {
  vi.resetModules()
  if (value === undefined) {
    delete process.env.EXPO_PUSH_ENABLED
  } else {
    process.env.EXPO_PUSH_ENABLED = value
  }
  const { env } = await import("../../src/env")
  return env
}

afterEach(() => {
  if (ORIGINAL_VALUE === undefined) {
    delete process.env.EXPO_PUSH_ENABLED
  } else {
    process.env.EXPO_PUSH_ENABLED = ORIGINAL_VALUE
  }
})

describe("EXPO_PUSH_ENABLED kill switch", () => {
  test('"false" disables push notifications', async () => {
    const env = await importEnvWith("false")
    expect(env.EXPO_PUSH_ENABLED).toBe(false)
  })

  test('"0" disables push notifications', async () => {
    const env = await importEnvWith("0")
    expect(env.EXPO_PUSH_ENABLED).toBe(false)
  })

  test('"true" enables push notifications', async () => {
    const env = await importEnvWith("true")
    expect(env.EXPO_PUSH_ENABLED).toBe(true)
  })

  test("unset defaults to enabled", async () => {
    const env = await importEnvWith(undefined)
    expect(env.EXPO_PUSH_ENABLED).toBe(true)
  })
})

describe("getExpoClient", () => {
  afterEach(() => {
    vi.doUnmock("../../src/env")
    vi.resetModules()
  })

  test("returns null when EXPO_PUSH_ENABLED is false", async () => {
    vi.resetModules()
    vi.doMock("../../src/env", () => ({
      env: { EXPO_PUSH_ENABLED: false, EXPO_ACCESS_TOKEN: undefined },
    }))
    vi.doMock("../../src/lib/logger", () => ({
      logger: { info: vi.fn() },
    }))

    const { getExpoClient } = await import("../../src/notification/lib/expo")

    expect(getExpoClient()).toBeNull()
  })
})
