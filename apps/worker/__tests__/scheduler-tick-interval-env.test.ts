// @vitest-environment node
import { afterEach, describe, expect, test, vi } from "vitest"

const ORIGINAL_TICK_INTERVAL = process.env.SCHEDULER_TICK_INTERVAL_MS
const ORIGINAL_SKIP_ENV_CHECK = process.env.SKIP_ENV_CHECK

function restoreEnvVariable(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name]
  } else {
    process.env[name] = value
  }
}

async function importEnvWith(tickInterval: string | undefined) {
  vi.resetModules()
  // A developer shell may export SKIP_ENV_CHECK (builds do), which would
  // silently disable the validation these tests assert.
  delete process.env.SKIP_ENV_CHECK
  restoreEnvVariable("SCHEDULER_TICK_INTERVAL_MS", tickInterval)
  return await import("../src/env")
}

afterEach(() => {
  restoreEnvVariable("SCHEDULER_TICK_INTERVAL_MS", ORIGINAL_TICK_INTERVAL)
  restoreEnvVariable("SKIP_ENV_CHECK", ORIGINAL_SKIP_ENV_CHECK)
  vi.resetModules()
})

describe("SCHEDULER_TICK_INTERVAL_MS", () => {
  test("defaults to 5000 ms when unset", async () => {
    const { env, DEFAULT_SCHEDULER_TICK_INTERVAL_MS } =
      await importEnvWith(undefined)

    expect(env.SCHEDULER_TICK_INTERVAL_MS).toBe(5000)
    expect(DEFAULT_SCHEDULER_TICK_INTERVAL_MS).toBe(5000)
  })

  test("coerces a numeric string", async () => {
    const { env } = await importEnvWith("2500")

    expect(env.SCHEDULER_TICK_INTERVAL_MS).toBe(2500)
  })

  test.each(["100", "10000"])("accepts the bound %s", async (value) => {
    const { env } = await importEnvWith(value)

    expect(env.SCHEDULER_TICK_INTERVAL_MS).toBe(Number(value))
  })

  test.each([
    "99",
    "0",
    "-500",
    "10001",
    "abc",
    "1000.5",
  ])("rejects %s", async (value) => {
    await expect(importEnvWith(value)).rejects.toThrow()
  })
})
