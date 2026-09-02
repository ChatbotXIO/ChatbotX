import {
  request as httpRequest,
  type RequestOptions,
  type Server,
} from "node:http"
import type { AddressInfo } from "node:net"
import {
  JavascriptSandboxError,
  MAX_EXECUTION_RESULT_BYTES,
} from "@chatbotx.io/javascript-sandbox"
import { afterEach, describe, expect, test, vi } from "vitest"
import { createServer, ExecutionLimiter } from "../src/server"

const EXECUTOR_TOKEN = "test-executor-token-at-least-32-chars"
const activeServers: Server[] = []

type JsonResponse = {
  body: unknown
  status: number
}

const listen = async (server: Server): Promise<void> => {
  activeServers.push(server)
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", resolve)
  })
}

const close = async (server: Server): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
}

const requestJson = async (
  server: Server,
  options: {
    body?: unknown
    chunked?: boolean
    method: "GET" | "POST"
    path: string
    rawBody?: string
    token?: string
  },
): Promise<JsonResponse> => {
  const address = server.address() as AddressInfo
  const rawBody =
    options.rawBody ??
    (options.body === undefined ? undefined : JSON.stringify(options.body))
  const requestOptions: RequestOptions = {
    hostname: "127.0.0.1",
    port: address.port,
    path: options.path,
    method: options.method,
    headers: {
      ...(rawBody && !options.chunked
        ? {
            "Content-Length": Buffer.byteLength(rawBody),
            "Content-Type": "application/json",
          }
        : {}),
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
  }

  return await new Promise<JsonResponse>((resolve, reject) => {
    const request = httpRequest(requestOptions, (response) => {
      const chunks: Buffer[] = []
      response.on("data", (chunk: Buffer) => chunks.push(chunk))
      response.on("end", () => {
        const rawResponse = Buffer.concat(chunks).toString("utf8")
        resolve({
          body: rawResponse.length > 0 ? JSON.parse(rawResponse) : undefined,
          status: response.statusCode ?? 0,
        })
      })
    })
    request.on("error", reject)
    request.end(rawBody)
  })
}

afterEach(async () => {
  await Promise.all(activeServers.splice(0).map(close))
})

describe("JavaScript executor server", () => {
  test("configures bounded HTTP connections", () => {
    const server = createServer({
      token: EXECUTOR_TOKEN,
      maxConcurrency: 2,
      maxQueueSize: 3,
    })

    expect(server.headersTimeout).toBe(5000)
    expect(server.requestTimeout).toBe(5000)
    expect(server.timeout).toBe(5000)
    expect(server.keepAliveTimeout).toBe(5000)
    expect(server.maxConnections).toBe(21)
    expect(server.maxRequestsPerSocket).toBe(100)
  })

  test("starts queued work after an execution slot is released", async () => {
    let releaseFirst: (() => void) | undefined
    const firstStarted = vi.fn()
    const secondStarted = vi.fn()
    const limiter = new ExecutionLimiter(1, 1)
    const first = limiter.run(async () => {
      firstStarted()
      await new Promise<void>((resolve) => {
        releaseFirst = resolve
      })
      return "first"
    })
    await vi.waitFor(() => expect(firstStarted).toHaveBeenCalledOnce())

    const second = limiter.run(() => {
      secondStarted()
      return Promise.resolve("second")
    })
    await new Promise<void>((resolve) => setImmediate(resolve))
    expect(secondStarted).not.toHaveBeenCalled()

    releaseFirst?.()
    await expect(first).resolves.toBe("first")
    await expect(second).resolves.toBe("second")
    expect(secondStarted).toHaveBeenCalledOnce()
  })

  test("drains back to an idle pool after queue saturation and handoff", async () => {
    const limiter = new ExecutionLimiter(1, 1)
    let releaseFirst: (() => void) | undefined
    const firstStarted = vi.fn()
    const secondStarted = vi.fn()
    const thirdStarted = vi.fn()

    const first = limiter.run(async () => {
      firstStarted()
      await new Promise<void>((resolve) => {
        releaseFirst = resolve
      })
      return "first"
    })
    await vi.waitFor(() => expect(firstStarted).toHaveBeenCalledOnce())

    const second = limiter.run(() => {
      secondStarted()
      return Promise.resolve("second")
    })

    releaseFirst?.()
    await expect(first).resolves.toBe("first")
    await expect(second).resolves.toBe("second")

    // If the pool didn't drain back to idle after the handoff, this third
    // acquisition would have to queue behind a phantom occupant instead of
    // starting immediately.
    const third = limiter.run(() => {
      thirdStarted()
      return Promise.resolve("third")
    })
    await expect(third).resolves.toBe("third")
    expect(thirdStarted).toHaveBeenCalledOnce()
  })

  test("reports health without authentication", async () => {
    const server = createServer({ token: EXECUTOR_TOKEN })
    await listen(server)

    await expect(
      requestJson(server, { method: "GET", path: "/health" }),
    ).resolves.toEqual({
      body: { service: "javascript-executor", status: "healthy" },
      status: 200,
    })
  })

  test("executes JavaScript with a valid bearer token", async () => {
    const server = createServer({ token: EXECUTOR_TOKEN })
    await listen(server)

    await expect(
      requestJson(server, {
        body: { code: "return input.a + 1", input: { a: 1 } },
        method: "POST",
        path: "/execute",
        token: EXECUTOR_TOKEN,
      }),
    ).resolves.toEqual({ body: { value: 2 }, status: 200 })
  })

  test("rejects requests without the configured bearer token", async () => {
    const server = createServer({ token: EXECUTOR_TOKEN })
    await listen(server)

    const response = await requestJson(server, {
      body: { code: "return 1", input: {} },
      method: "POST",
      path: "/execute",
    })

    expect(response.status).toBe(401)
    expect(response.body).toMatchObject({
      error: { code: "javascriptExecutionFailed" },
    })
  })

  test("rejects an incorrect bearer token", async () => {
    const server = createServer({ token: EXECUTOR_TOKEN })
    await listen(server)

    const response = await requestJson(server, {
      body: { code: "return 1", input: {} },
      method: "POST",
      path: "/execute",
      token: "incorrect-token-at-least-32-characters",
    })

    expect(response.status).toBe(401)
  })

  test("returns 404 for unknown routes", async () => {
    const server = createServer({ token: EXECUTOR_TOKEN })
    await listen(server)

    const response = await requestJson(server, {
      method: "GET",
      path: "/missing",
    })

    expect(response.status).toBe(404)
  })

  test("rejects invalid execution requests", async () => {
    const server = createServer({ token: EXECUTOR_TOKEN })
    await listen(server)

    const response = await requestJson(server, {
      body: { code: "", input: [] },
      method: "POST",
      path: "/execute",
      token: EXECUTOR_TOKEN,
    })

    expect(response.status).toBe(400)
    expect(response.body).toMatchObject({
      error: { code: "javascriptExecutionFailed" },
    })
  })

  test("rejects malformed JSON", async () => {
    const server = createServer({ token: EXECUTOR_TOKEN })
    await listen(server)

    const response = await requestJson(server, {
      method: "POST",
      path: "/execute",
      rawBody: "{",
      token: EXECUTOR_TOKEN,
    })

    expect(response.status).toBe(400)
  })

  test("stops reading chunked request bodies above the size limit", async () => {
    const server = createServer({ token: EXECUTOR_TOKEN })
    await listen(server)

    const response = await requestJson(server, {
      chunked: true,
      method: "POST",
      path: "/execute",
      rawBody: JSON.stringify({
        code: "return input.payload",
        input: { payload: "x".repeat(256 * 1024) },
      }),
      token: EXECUTOR_TOKEN,
    })

    expect(response.status).toBe(413)
  })

  test("rejects request bodies above the size limit", async () => {
    const server = createServer({ token: EXECUTOR_TOKEN })
    await listen(server)

    const response = await requestJson(server, {
      body: {
        code: "return input.payload",
        input: { payload: "x".repeat(256 * 1024) },
      },
      method: "POST",
      path: "/execute",
      token: EXECUTOR_TOKEN,
    })

    expect(response.status).toBe(413)
  })

  test("returns typed sandbox errors", async () => {
    const server = createServer({ token: EXECUTOR_TOKEN })
    await listen(server)

    const response = await requestJson(server, {
      body: { code: "while (true) {}", input: {} },
      method: "POST",
      path: "/execute",
      token: EXECUTOR_TOKEN,
    })

    expect(response.status).toBe(422)
    expect(response.body).toMatchObject({
      error: { code: "javascriptTimeout" },
    })
  })

  test("rejects execution output above the response limit", async () => {
    const server = createServer({
      token: EXECUTOR_TOKEN,
      executeJavascript: () =>
        Promise.resolve({ value: "x".repeat(MAX_EXECUTION_RESULT_BYTES + 1) }),
    })
    await listen(server)

    const response = await requestJson(server, {
      body: { code: "return input.payload", input: {} },
      method: "POST",
      path: "/execute",
      token: EXECUTOR_TOKEN,
    })

    expect(response).toEqual({
      body: {
        error: {
          code: "javascriptOutputTooLarge",
          message: "JavaScript execution output is too large",
        },
      },
      status: 422,
    })
  })

  test("bounds serialized executor error responses", async () => {
    const server = createServer({
      token: EXECUTOR_TOKEN,
      executeJavascript: () =>
        Promise.reject(
          new JavascriptSandboxError(
            "x".repeat(MAX_EXECUTION_RESULT_BYTES + 2048),
            "javascriptExecutionFailed",
          ),
        ),
    })
    await listen(server)

    const response = await requestJson(server, {
      body: { code: "throw new Error()", input: {} },
      method: "POST",
      path: "/execute",
      token: EXECUTOR_TOKEN,
    })

    expect(response).toEqual({
      body: {
        error: {
          code: "javascriptOutputTooLarge",
          message: "JavaScript executor response is too large",
        },
      },
      status: 422,
    })
  })

  test("returns 500 when the execution engine fails unexpectedly", async () => {
    const server = createServer({
      token: EXECUTOR_TOKEN,
      executeJavascript: () => Promise.reject(new Error("unexpected failure")),
    })
    await listen(server)

    const response = await requestJson(server, {
      body: { code: "return 1", input: {} },
      method: "POST",
      path: "/execute",
      token: EXECUTOR_TOKEN,
    })

    expect(response.status).toBe(500)
    expect(response.body).toMatchObject({
      error: { code: "javascriptExecutionFailed" },
    })
  })

  test("returns 503 when execution capacity is exhausted", async () => {
    let releaseExecution: (() => void) | undefined
    const executionStarted = vi.fn()
    const server = createServer({
      token: EXECUTOR_TOKEN,
      maxConcurrency: 1,
      maxQueueSize: 0,
      executeJavascript: async () => {
        executionStarted()
        await new Promise<void>((resolve) => {
          releaseExecution = resolve
        })
        return { value: "first" }
      },
    })
    await listen(server)

    const firstRequest = requestJson(server, {
      body: { code: "return 1", input: {} },
      method: "POST",
      path: "/execute",
      token: EXECUTOR_TOKEN,
    })
    await vi.waitFor(() => expect(executionStarted).toHaveBeenCalledOnce())

    const saturatedResponse = await requestJson(server, {
      body: { code: "return 2", input: {} },
      method: "POST",
      path: "/execute",
      token: EXECUTOR_TOKEN,
    })

    expect(saturatedResponse.status).toBe(503)
    expect(saturatedResponse.body).toMatchObject({
      error: { code: "javascriptExecutionFailed" },
    })

    releaseExecution?.()
    await expect(firstRequest).resolves.toEqual({
      body: { value: "first" },
      status: 200,
    })
  })

  test("does not run sandboxed execution once the client has disconnected", async () => {
    let releaseFirst: (() => void) | undefined
    const executionStarted = vi.fn()
    const queuedExecutionStarted = vi.fn()
    const server = createServer({
      token: EXECUTOR_TOKEN,
      maxConcurrency: 1,
      maxQueueSize: 1,
      executeJavascript: async () => {
        const callIndex = executionStarted.mock.calls.length
        executionStarted()
        if (callIndex === 1) {
          queuedExecutionStarted()
        }
        await new Promise<void>((resolve) => {
          releaseFirst = resolve
        })
        return { value: callIndex }
      },
    })
    await listen(server)
    const address = server.address() as AddressInfo

    const firstRequest = requestJson(server, {
      body: { code: "return 1", input: {} },
      method: "POST",
      path: "/execute",
      token: EXECUTOR_TOKEN,
    })
    await vi.waitFor(() => expect(executionStarted).toHaveBeenCalledOnce())

    // Queue a second request behind the first, then abandon it before the
    // first slot is released — this second request's socket is destroyed
    // client-side while it still sits in the limiter's queue.
    const abandonedRequest = httpRequest({
      hostname: "127.0.0.1",
      port: address.port,
      path: "/execute",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${EXECUTOR_TOKEN}`,
      },
    })
    const abandonedBody = JSON.stringify({ code: "return 2", input: {} })
    abandonedRequest.setHeader(
      "Content-Length",
      Buffer.byteLength(abandonedBody),
    )
    const abandonedSocketClosed = new Promise<void>((resolve) => {
      abandonedRequest.on("error", () => {
        // Expected once we destroy the socket below.
      })
      abandonedRequest.on("close", () => resolve())
    })
    abandonedRequest.end(abandonedBody)
    // Let the request body reach the server and queue behind the first
    // in-flight execution before abandoning it.
    await new Promise<void>((resolve) => setImmediate(resolve))
    abandonedRequest.destroy()
    await abandonedSocketClosed
    // Allow the server's response "close" event to propagate before the
    // first slot is released and the queue is serviced.
    await new Promise<void>((resolve) => setTimeout(resolve, 50))

    releaseFirst?.()
    await expect(firstRequest).resolves.toEqual({
      body: { value: 0 },
      status: 200,
    })

    // Give the queued task a chance to run if it incorrectly would.
    await new Promise<void>((resolve) => setImmediate(resolve))
    releaseFirst?.()
    expect(queuedExecutionStarted).not.toHaveBeenCalled()
  })
})
