import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { getAhachatPage } from "../src/apis"
import { AHACHAT_API_BASE_URL_ENV } from "../src/constants"
import { AhachatApiError } from "../src/error"

// A short deadline, so a stalled call fails within the test.
vi.mock("../src/constants", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/constants")>()),
  AHACHAT_HTTP_TIMEOUT_MS: 50,
}))

const HASH_KEY = btoa("s".repeat(32))
const API_KEY = btoa("a".repeat(32))
const SCOPE = {
  workspaceId: "11640681410281472",
  actor: { type: "user" as const, id: "u1" },
}
const PAGE = { channel: "messenger" as const, id: "1122334455" }

const captureError = async (promise: Promise<unknown>) => {
  const error = await promise.catch((caught: unknown) => caught)
  expect(error).toBeInstanceOf(AhachatApiError)
  return error as AhachatApiError
}

beforeEach(() => {
  vi.stubEnv(AHACHAT_API_BASE_URL_ENV, "https://chatbot.example.com/export/")
  vi.stubEnv("AHACHAT_API_KEY", API_KEY)
  vi.stubEnv("AHACHAT_HASH_KEY", HASH_KEY)
  vi.stubEnv("AHACHAT_KEY_ID", "k1")
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe("AhaChat client deadline and key safety", () => {
  test("a body that stalls after the headers ends at the deadline", async () => {
    // Like fetch: the body stream fails when the request's signal aborts.
    vi.stubGlobal(
      "fetch",
      vi.fn((request: Request) => {
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('{"data":'))
            request.signal.addEventListener("abort", () =>
              controller.error(request.signal.reason),
            )
          },
        })
        return Promise.resolve(new Response(body, { status: 200 }))
      }),
    )

    const error = await captureError(getAhachatPage(SCOPE, PAGE))

    expect(error.code).toBe("timeout")
  })

  test("an unexpected transport error is classified and its message dropped", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.reject(new TypeError(`invalid header value key ${API_KEY}`)),
      ),
    )

    const error = await captureError(getAhachatPage(SCOPE, PAGE))

    expect(error.code).toBe("network")
    expect(error.message).not.toContain(API_KEY)
    expect(error.cause).toBeUndefined()
  })
})
