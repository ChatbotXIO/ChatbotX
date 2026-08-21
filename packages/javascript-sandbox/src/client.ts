import {
  type ExecuteJavascriptRequest,
  type ExecuteJavascriptSuccessResponse,
  executeErrorResponseSchema,
  executeRequestSchema,
  executeSuccessResponseSchema,
  MAX_EXECUTION_RESULT_BYTES,
} from "./contract"
import { JavascriptSandboxError } from "./errors"

const REQUEST_TIMEOUT_MS = 3000
const RESPONSE_ENVELOPE_BYTES = 1024
const MAX_RESPONSE_BYTES = MAX_EXECUTION_RESULT_BYTES + RESPONSE_ENVELOPE_BYTES

const responseTooLargeError = (): JavascriptSandboxError =>
  new JavascriptSandboxError(
    "JavaScript executor response is too large",
    "javascriptOutputTooLarge",
  )

const readResponsePayload = async (response: Response): Promise<unknown> => {
  const contentLength = Number(response.headers.get("content-length"))
  if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
    await Promise.race([response.body?.cancel(), Promise.resolve(undefined)])
    throw responseTooLargeError()
  }

  if (!response.body) {
    throw new JavascriptSandboxError(
      "JavaScript executor returned an invalid response",
      "javascriptExecutionFailed",
    )
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }

      totalBytes += value.byteLength
      if (totalBytes > MAX_RESPONSE_BYTES) {
        await reader.cancel().catch(() => undefined)
        throw responseTooLargeError()
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  const body = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return JSON.parse(new TextDecoder().decode(body)) as unknown
}

export type JavascriptExecutorClient = {
  execute: (
    request: ExecuteJavascriptRequest,
  ) => Promise<ExecuteJavascriptSuccessResponse>
}

export const createJavascriptExecutorClient = (options: {
  url: string
  token: string
}): JavascriptExecutorClient => ({
  async execute(request) {
    try {
      const response = await fetch(new URL("/execute", options.url), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${options.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(executeRequestSchema.parse(request)),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })

      const payload = await readResponsePayload(response)
      if (response.status === 200) {
        const result = executeSuccessResponseSchema.safeParse(payload)
        if (result.success) {
          return result.data
        }
      } else {
        const result = executeErrorResponseSchema.safeParse(payload)
        if (result.success) {
          throw new JavascriptSandboxError(
            result.data.error.message,
            result.data.error.code,
          )
        }
      }

      throw new JavascriptSandboxError(
        "JavaScript executor returned an invalid response",
        "javascriptExecutionFailed",
      )
    } catch (error) {
      if (error instanceof JavascriptSandboxError) {
        throw error
      }

      const timedOut =
        error instanceof Error &&
        (error.name === "AbortError" || error.name === "TimeoutError")
      throw new JavascriptSandboxError(
        timedOut
          ? "JavaScript executor request timed out"
          : "JavaScript executor request failed",
        "javascriptExecutionFailed",
      )
    }
  },
})
