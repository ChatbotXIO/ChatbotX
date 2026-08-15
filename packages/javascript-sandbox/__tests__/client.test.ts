import {
  delay,
  HttpResponse,
  http,
  server,
} from "@chatbotx.io/vitest-config/msw"
import { describe, expect, test } from "vitest"
import {
  createJavascriptExecutorClient,
  JavascriptSandboxError,
  MAX_EXECUTION_RESULT_BYTES,
} from "../src"

const EXECUTOR_URL = "http://javascript-executor.test:3210"
const EXECUTOR_TOKEN = "test-executor-token-at-least-32-chars"

const client = createJavascriptExecutorClient({
  url: EXECUTOR_URL,
  token: EXECUTOR_TOKEN,
})

describe("JavaScript executor client", () => {
  test("posts the request with bearer authentication", async () => {
    server.use(
      http.post(`${EXECUTOR_URL}/execute`, async ({ request }) => {
        expect(request.headers.get("authorization")).toBe(
          `Bearer ${EXECUTOR_TOKEN}`,
        )
        expect(request.headers.get("content-type")).toBe("application/json")
        await expect(request.json()).resolves.toEqual({
          code: "return input.answer",
          input: { answer: 42 },
        })
        return HttpResponse.json({ value: 42 })
      }),
    )

    await expect(
      client.execute({
        code: "return input.answer",
        input: { answer: 42 },
      }),
    ).resolves.toEqual({ value: 42 })
  })

  test("preserves recognized executor error codes", async () => {
    server.use(
      http.post(`${EXECUTOR_URL}/execute`, () =>
        HttpResponse.json(
          {
            error: {
              code: "javascriptTimeout",
              message: "JavaScript execution timed out",
            },
          },
          { status: 422 },
        ),
      ),
    )

    await expect(
      client.execute({ code: "while (true) {}", input: {} }),
    ).rejects.toMatchObject({
      code: "javascriptTimeout",
      message: "JavaScript execution timed out",
    })
  })

  test("maps transport failures to a typed execution error", async () => {
    server.use(http.post(`${EXECUTOR_URL}/execute`, () => HttpResponse.error()))

    const error = await client
      .execute({ code: "return 1", input: {} })
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(JavascriptSandboxError)
    expect(error).toMatchObject({ code: "javascriptExecutionFailed" })
  })

  test("maps executor timeouts to a typed execution error", async () => {
    server.use(
      http.post(`${EXECUTOR_URL}/execute`, async () => {
        await delay(3500)
        return HttpResponse.json({ value: 1 })
      }),
    )

    await expect(
      client.execute({ code: "return 1", input: {} }),
    ).rejects.toMatchObject({
      code: "javascriptExecutionFailed",
      message: "JavaScript executor request timed out",
    })
  })

  test("maps malformed responses to a typed execution error", async () => {
    server.use(
      http.post(
        `${EXECUTOR_URL}/execute`,
        () => new HttpResponse("not-json", { status: 502 }),
      ),
    )

    await expect(
      client.execute({ code: "return 1", input: {} }),
    ).rejects.toMatchObject({ code: "javascriptExecutionFailed" })
  })

  test("rejects a success response that violates the contract", async () => {
    server.use(
      http.post(`${EXECUTOR_URL}/execute`, () =>
        HttpResponse.json({ result: 1 }),
      ),
    )

    await expect(
      client.execute({ code: "return 1", input: {} }),
    ).rejects.toMatchObject({
      code: "javascriptExecutionFailed",
      message: "JavaScript executor returned an invalid response",
    })
  })

  test("stops reading an oversized executor response", async () => {
    server.use(
      http.post(`${EXECUTOR_URL}/execute`, () =>
        HttpResponse.json({
          value: "x".repeat(MAX_EXECUTION_RESULT_BYTES + 2048),
        }),
      ),
    )

    await expect(
      client.execute({ code: "return input.value", input: { value: 1 } }),
    ).rejects.toMatchObject({
      code: "javascriptOutputTooLarge",
      message: "JavaScript executor response is too large",
    })
  })
})
