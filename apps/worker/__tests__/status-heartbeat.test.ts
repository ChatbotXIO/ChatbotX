import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const { envState, loggerError } = vi.hoisted(() => ({
  envState: { STATUS_HEARTBEAT_WORKER_URL: undefined as string | undefined },
  loggerError: vi.fn(),
}))

vi.mock("../src/env", () => ({ env: envState }))
vi.mock("../src/lib/logger", () => ({ logger: { error: loggerError } }))

const { sendStatusHeartbeat, STATUS_HEARTBEAT_TIMEOUT_MS } = await import(
  "../src/schedule/handlers/status-heartbeat"
)

const URL_WITH_TOKEN = "https://uptime.example/api/v1/heartbeat/s3cr3t-token"

const loggedText = () =>
  JSON.stringify(loggerError.mock.calls, (_, value) =>
    value instanceof Error
      ? { name: value.name, message: value.message }
      : value,
  )

describe("sendStatusHeartbeat", () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock)
    fetchMock.mockReset()
    loggerError.mockReset()
    envState.STATUS_HEARTBEAT_WORKER_URL = URL_WITH_TOKEN
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test("sends no request when the URL is unset (leftover queued job)", async () => {
    envState.STATUS_HEARTBEAT_WORKER_URL = undefined

    await sendStatusHeartbeat()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(loggerError).not.toHaveBeenCalled()
  })

  test("sends a GET with a 5-second abort and logs nothing on success", async () => {
    fetchMock.mockResolvedValue(new Response("ok", { status: 200 }))

    await sendStatusHeartbeat()

    expect(STATUS_HEARTBEAT_TIMEOUT_MS).toBe(5000)
    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(url).toBe(URL_WITH_TOKEN)
    expect(init?.method).toBe("GET")
    expect(init?.signal).toBeInstanceOf(AbortSignal)
    expect(loggerError).not.toHaveBeenCalled()
  })

  test("logs a non-2xx response without throwing", async () => {
    fetchMock.mockResolvedValue(new Response("nope", { status: 500 }))

    await expect(sendStatusHeartbeat()).resolves.toBeUndefined()

    expect(loggerError).toHaveBeenCalledWith(
      expect.objectContaining({ status: 500, err: expect.any(Error) }),
      "Status heartbeat was rejected",
    )
    expect(loggedText()).not.toContain("s3cr3t-token")
  })

  test("logs a network failure without the heartbeat URL", async () => {
    fetchMock.mockRejectedValue(
      new TypeError("fetch failed", {
        cause: new Error(`connect ECONNREFUSED for ${URL_WITH_TOKEN}`),
      }),
    )

    await expect(sendStatusHeartbeat()).resolves.toBeUndefined()

    expect(loggerError).toHaveBeenCalledWith(
      { err: expect.any(Error) },
      "Status heartbeat request failed",
    )
    const text = loggedText()
    expect(text).toContain("ECONNREFUSED")
    expect(text).not.toContain("s3cr3t-token")
  })

  test("logs a timeout without throwing", async () => {
    fetchMock.mockRejectedValue(
      new DOMException(
        "The operation was aborted due to timeout",
        "TimeoutError",
      ),
    )

    await expect(sendStatusHeartbeat()).resolves.toBeUndefined()

    expect(loggerError).toHaveBeenCalledWith(
      { err: expect.objectContaining({ name: "TimeoutError" }) },
      "Status heartbeat request failed",
    )
  })
})
