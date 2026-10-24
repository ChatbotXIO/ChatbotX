import { streamText } from "ai"
import { MockLanguageModelV4, simulateReadableStream } from "ai/test"
import { describe, expect, test } from "vitest"
import { aiTimeouts } from "../src/constants"

const finishChunk = {
  type: "finish",
  finishReason: { unified: "stop", raw: "stop" },
  usage: {
    inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 1, text: 1, reasoning: 0 },
  },
} as const

const readText = async (textStream: AsyncIterable<string>) => {
  let text = ""
  for await (const part of textStream) {
    text += part
  }
  return text
}

describe("first chunk timeout", () => {
  test("stays below the per-step budget", () => {
    expect(aiTimeouts.aiFirstChunk).toBeLessThan(aiTimeouts.aiStep)
  })

  test("aborts a step whose model never emits a first chunk", async () => {
    const model = new MockLanguageModelV4({
      doStream: async ({ abortSignal }) => ({
        stream: new ReadableStream({
          start(controller) {
            abortSignal?.addEventListener("abort", () => {
              controller.error(abortSignal.reason)
            })
          },
        }),
      }),
    })

    let aborted = false
    const startedAt = Date.now()
    const result = streamText({
      model,
      prompt: "hi",
      maxRetries: 0,
      timeout: { firstChunkMs: 50 },
      onAbort: () => {
        aborted = true
      },
    })

    const text = await readText(result.textStream).catch(() => "")
    expect(text).toBe("")
    expect(aborted).toBe(true)
    expect(Date.now() - startedAt).toBeLessThan(1000)
  })

  test("does not affect a stream that starts in time", async () => {
    const model = new MockLanguageModelV4({
      doStream: async () => ({
        stream: simulateReadableStream({
          chunks: [
            { type: "text-start", id: "t1" },
            { type: "text-delta", id: "t1", delta: "Hello" },
            { type: "text-end", id: "t1" },
            finishChunk,
          ],
        }),
      }),
    })

    const result = streamText({
      model,
      prompt: "hi",
      maxRetries: 0,
      timeout: { firstChunkMs: 1000 },
    })

    expect(await readText(result.textStream)).toBe("Hello")
  })
})
