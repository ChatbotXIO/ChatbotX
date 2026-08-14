import { createHash, timingSafeEqual } from "node:crypto"
import {
  createServer as createHttpServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http"
import {
  executeErrorResponseSchema,
  executeRequestSchema,
  JavascriptSandboxError,
  type JavascriptSandboxErrorCode,
  MAX_EXECUTION_RESULT_BYTES,
} from "@chatbotx.io/javascript-sandbox"
import { getChildLogger } from "@chatbotx.io/logger"
import { env } from "./env"
import { executeJavascript as executeJavascriptInSandbox } from "./sandbox"

const BODY_LIMIT_BYTES = 256 * 1024
const RESPONSE_ENVELOPE_BYTES = 1024
const MAX_RESPONSE_BYTES = MAX_EXECUTION_RESULT_BYTES + RESPONSE_ENVELOPE_BYTES
const logger = getChildLogger("javascript-executor")

type ExecuteJavascript = typeof executeJavascriptInSandbox

type CreateServerOptions = {
  executeJavascript?: ExecuteJavascript
  maxConcurrency?: number
  maxQueueSize?: number
  token?: string
}

class RequestBodyTooLargeError extends Error {}

export class ExecutionLimiter {
  private active = 0
  private readonly maxConcurrency: number
  private readonly maxQueueSize: number
  private readonly waiters: Array<() => void> = []

  constructor(maxConcurrency: number, maxQueueSize: number) {
    this.maxConcurrency = maxConcurrency
    this.maxQueueSize = maxQueueSize
  }

  async run<T>(task: () => Promise<T>): Promise<T | undefined> {
    const acquired = await this.acquire()
    if (!acquired) {
      return
    }

    try {
      return await task()
    } finally {
      this.release()
    }
  }

  private acquire(): boolean | Promise<true> {
    if (this.active < this.maxConcurrency) {
      this.active += 1
      return true
    }

    if (this.waiters.length >= this.maxQueueSize) {
      return false
    }

    return new Promise<true>((resolve) => {
      this.waiters.push(() => resolve(true))
    })
  }

  private release(): void {
    const next = this.waiters.shift()
    if (next) {
      next()
      return
    }

    this.active -= 1
  }
}

const tokenDigest = (token: string): Buffer =>
  createHash("sha256").update(token).digest()

const isAuthorized = (
  authorization: string | undefined,
  expectedTokenDigest: Buffer,
): boolean => {
  if (!authorization?.startsWith("Bearer ")) {
    return false
  }

  return timingSafeEqual(
    tokenDigest(authorization.slice("Bearer ".length)),
    expectedTokenDigest,
  )
}

const writeJson = (
  response: ServerResponse,
  status: number,
  payload: unknown,
): void => {
  let body = JSON.stringify(payload)
  let responseStatus = status
  if (Buffer.byteLength(body, "utf8") > MAX_RESPONSE_BYTES) {
    body = JSON.stringify(
      executeErrorResponseSchema.parse({
        error: {
          code: "javascriptOutputTooLarge",
          message: "JavaScript executor response is too large",
        },
      }),
    )
    responseStatus = 422
  }
  response.statusCode = responseStatus
  response.setHeader("Content-Type", "application/json; charset=utf-8")
  response.setHeader("Content-Length", Buffer.byteLength(body))
  response.end(body)
}

const writeError = (
  response: ServerResponse,
  status: number,
  message: string,
  code: JavascriptSandboxErrorCode = "javascriptExecutionFailed",
): void => {
  writeJson(
    response,
    status,
    executeErrorResponseSchema.parse({ error: { code, message } }),
  )
}

const executionOutputIsTooLarge = (value: unknown): boolean => {
  const body = JSON.stringify(value)
  return (
    body !== undefined &&
    Buffer.byteLength(body, "utf8") > MAX_EXECUTION_RESULT_BYTES
  )
}

const readJsonBody = async (request: IncomingMessage): Promise<unknown> =>
  await new Promise<unknown>((resolve, reject) => {
    const chunks: Buffer[] = []
    let totalBytes = 0
    let tooLarge = false

    request.on("data", (chunk: Buffer) => {
      totalBytes += chunk.length
      if (totalBytes > BODY_LIMIT_BYTES) {
        tooLarge = true
        chunks.length = 0
        request.pause()
        reject(new RequestBodyTooLargeError())
        return
      }
      chunks.push(chunk)
    })
    request.once("error", reject)
    request.once("end", () => {
      if (tooLarge) {
        reject(new Error("Request body is too large"))
        return
      }

      try {
        const body = Buffer.concat(chunks).toString("utf8")
        resolve(JSON.parse(body) as unknown)
      } catch (error) {
        reject(error)
      }
    })
  })

const rejectOversizedRequest = (
  request: IncomingMessage,
  response: ServerResponse,
): void => {
  request.pause()
  response.shouldKeepAlive = false
  response.setHeader("Connection", "close")
  response.once("finish", () => request.destroy())
  writeError(response, 413, "JavaScript execution request is too large")
}

const handleRequest = async (options: {
  executeJavascript: ExecuteJavascript
  expectedTokenDigest: Buffer
  limiter: ExecutionLimiter
  request: IncomingMessage
  response: ServerResponse
}): Promise<void> => {
  const { executeJavascript, expectedTokenDigest, limiter, request, response } =
    options
  const url = new URL(request.url ?? "", "http://localhost")

  if (request.method === "GET" && url.pathname === "/health") {
    writeJson(response, 200, {
      status: "healthy",
      service: "javascript-executor",
    })
    return
  }

  if (request.method !== "POST" || url.pathname !== "/execute") {
    writeError(response, 404, "Not found")
    return
  }

  const authorization = request.headers.authorization
  if (!isAuthorized(authorization, expectedTokenDigest)) {
    writeError(response, 401, "Unauthorized")
    return
  }

  const contentLength = Number(request.headers["content-length"])
  if (Number.isFinite(contentLength) && contentLength > BODY_LIMIT_BYTES) {
    rejectOversizedRequest(request, response)
    return
  }

  let payload: unknown
  try {
    payload = await readJsonBody(request)
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      rejectOversizedRequest(request, response)
      return
    }
    writeError(response, 400, "Invalid JavaScript execution request")
    return
  }

  const parsedRequest = executeRequestSchema.safeParse(payload)
  if (!parsedRequest.success) {
    writeError(response, 400, "Invalid JavaScript execution request")
    return
  }

  try {
    const result = await limiter.run(() =>
      executeJavascript(parsedRequest.data),
    )
    if (result === undefined) {
      writeError(response, 503, "JavaScript executor is at capacity")
      return
    }
    if (executionOutputIsTooLarge(result.value)) {
      writeError(
        response,
        422,
        "JavaScript execution output is too large",
        "javascriptOutputTooLarge",
      )
      return
    }
    writeJson(response, 200, result)
  } catch (error) {
    if (error instanceof JavascriptSandboxError) {
      writeError(response, 422, error.message, error.code)
      return
    }
    throw error
  }
}

export const createServer = (options: CreateServerOptions = {}): Server => {
  const token = options.token ?? env.JAVASCRIPT_EXECUTOR_TOKEN
  const maxConcurrency = options.maxConcurrency ?? env.MAX_CONCURRENCY
  const maxQueueSize = options.maxQueueSize ?? maxConcurrency
  const limiter = new ExecutionLimiter(maxConcurrency, maxQueueSize)
  const expectedTokenDigest = tokenDigest(token)
  const executeJavascript =
    options.executeJavascript ?? executeJavascriptInSandbox

  const server = createHttpServer((request, response) => {
    handleRequest({
      executeJavascript,
      expectedTokenDigest,
      limiter,
      request,
      response,
    }).catch((error: unknown) => {
      logger.error({ err: error }, "JavaScript executor request failed")
      if (!response.headersSent) {
        writeError(response, 500, "JavaScript execution failed")
        return
      }
      response.end()
    })
  })
  server.headersTimeout = 5000
  server.requestTimeout = 5000
  server.timeout = 5000
  server.keepAliveTimeout = 5000
  server.maxConnections = maxConcurrency + maxQueueSize + 16
  server.maxRequestsPerSocket = 100
  return server
}
