import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({ error: vi.fn(), warn: vi.fn() }))

vi.mock("../src/lib/logger", () => ({
  logger: { error: mocks.error, warn: mocks.warn },
}))

const { logChannelError } = await import("../src/lib/http-client")
const { parseOriginError } = await import("../src/exception")

const TIMEOUT_MESSAGE =
  "Request timed out: GET https://graph.facebook.com/v25.0/debug_token?input_token=PAGE-SECRET&access_token=APP-SECRET"

beforeEach(() => {
  vi.clearAllMocks()
})

describe("Instagram debug_token failures never carry the tokens", () => {
  test("the error message of a timeout or network error is scrubbed", () => {
    const source = parseOriginError(new Error(TIMEOUT_MESSAGE))

    expect(source.message).not.toContain("PAGE-SECRET")
    expect(source.message).not.toContain("APP-SECRET")
    expect(source.message).toContain("input_token=[redacted]")
  })

  test("the logged line carries neither token", () => {
    logChannelError(parseOriginError(new Error(TIMEOUT_MESSAGE)), {
      method: "GET",
      url: "https://graph.facebook.com/v25.0/debug_token?input_token=PAGE-SECRET&access_token=APP-SECRET",
    })

    const logged = JSON.stringify([
      ...mocks.error.mock.calls,
      ...mocks.warn.mock.calls,
    ])
    expect(logged).not.toContain("PAGE-SECRET")
    expect(logged).not.toContain("APP-SECRET")
  })
})
