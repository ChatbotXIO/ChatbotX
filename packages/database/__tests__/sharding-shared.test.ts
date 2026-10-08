import { afterEach, describe, expect, test, vi } from "vitest"

vi.mock("../src/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

import { envBool, envInt } from "../src/sharding/shared/env"
import { isConnectionError } from "../src/sharding/shared/errors"

function errWithCode(code: string): Error {
  return Object.assign(new Error(`fail: ${code}`), { code })
}

describe("envInt", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  test("returns the parsed value for a valid integer", () => {
    vi.stubEnv("TEST_SHARD_ENV", "1500")
    expect(envInt("TEST_SHARD_ENV", 60_000)).toBe(1500)
  })

  test("returns the fallback when the variable is unset", () => {
    expect(envInt("TEST_SHARD_ENV_UNSET", 60_000)).toBe(60_000)
  })

  test("returns the fallback for a non-numeric value (NaN guard)", () => {
    vi.stubEnv("TEST_SHARD_ENV", "abc")
    expect(envInt("TEST_SHARD_ENV", 60_000)).toBe(60_000)
  })

  test("returns the fallback for a negative value", () => {
    vi.stubEnv("TEST_SHARD_ENV", "-5")
    expect(envInt("TEST_SHARD_ENV", 60_000)).toBe(60_000)
  })

  test("returns the fallback for a non-integer value", () => {
    vi.stubEnv("TEST_SHARD_ENV", "1.5")
    expect(envInt("TEST_SHARD_ENV", 60_000)).toBe(60_000)
  })

  test("accepts zero by default", () => {
    vi.stubEnv("TEST_SHARD_ENV", "0")
    expect(envInt("TEST_SHARD_ENV", 60_000)).toBe(0)
  })

  test("returns the fallback when the value is below min (pool max must be positive)", () => {
    vi.stubEnv("TEST_SHARD_ENV", "0")
    expect(envInt("TEST_SHARD_ENV", 10, { min: 1 })).toBe(10)
  })

  test("accepts values at or above min", () => {
    vi.stubEnv("TEST_SHARD_ENV", "25")
    expect(envInt("TEST_SHARD_ENV", 10, { min: 1 })).toBe(25)
  })
})

describe("envBool", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  test("accepts true/1 as true", () => {
    vi.stubEnv("TEST_SHARD_BOOL", "true")
    expect(envBool("TEST_SHARD_BOOL", false)).toBe(true)
    vi.stubEnv("TEST_SHARD_BOOL", "1")
    expect(envBool("TEST_SHARD_BOOL", false)).toBe(true)
  })

  test("accepts false/0 as false", () => {
    vi.stubEnv("TEST_SHARD_BOOL", "false")
    expect(envBool("TEST_SHARD_BOOL", true)).toBe(false)
    vi.stubEnv("TEST_SHARD_BOOL", "0")
    expect(envBool("TEST_SHARD_BOOL", true)).toBe(false)
  })

  test("returns the fallback when the variable is unset or empty", () => {
    expect(envBool("TEST_SHARD_BOOL_UNSET", true)).toBe(true)
    vi.stubEnv("TEST_SHARD_BOOL", "")
    expect(envBool("TEST_SHARD_BOOL", true)).toBe(true)
  })

  test("returns the fallback and warns for an invalid value", () => {
    vi.stubEnv("TEST_SHARD_BOOL", "yes")
    expect(envBool("TEST_SHARD_BOOL", false)).toBe(false)
  })
})

describe("isConnectionError", () => {
  test.each([
    "ECONNREFUSED",
    "ECONNRESET",
    "ETIMEDOUT",
    "EPIPE",
    "ENOTFOUND",
    "EHOSTUNREACH",
    "EAI_AGAIN",
  ])("detects Node socket error code %s", (code) => {
    expect(isConnectionError(errWithCode(code))).toBe(true)
  })

  test.each([
    "57P01",
    "57P02",
    "57P03",
  ])("detects PostgreSQL operator-intervention SQLSTATE %s", (code) => {
    expect(isConnectionError(errWithCode(code))).toBe(true)
  })

  test("detects SQLSTATE class 08 (connection exception)", () => {
    expect(isConnectionError(errWithCode("08006"))).toBe(true)
  })

  test("detects pg 'Connection terminated unexpectedly' by message", () => {
    expect(
      isConnectionError(new Error("Connection terminated unexpectedly")),
    ).toBe(true)
  })

  test("detects pg connect timeout by message", () => {
    expect(
      isConnectionError(new Error("timeout exceeded when trying to connect")),
    ).toBe(true)
  })

  test("walks the cause chain", () => {
    const wrapped = new Error("Shard s1:read health check failed", {
      cause: errWithCode("ECONNREFUSED"),
    })
    expect(isConnectionError(wrapped)).toBe(true)
  })

  test("rejects SQL logic errors (undefined_column 42703)", () => {
    expect(isConnectionError(errWithCode("42703"))).toBe(false)
  })

  test("rejects unique violations (23505)", () => {
    expect(isConnectionError(errWithCode("23505"))).toBe(false)
  })

  test("rejects plain errors and non-errors", () => {
    expect(isConnectionError(new Error("syntax error at or near"))).toBe(false)
    expect(isConnectionError(null)).toBe(false)
    expect(isConnectionError("ECONNREFUSED")).toBe(false)
  })
})
